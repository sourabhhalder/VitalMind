"""
VitalMind Flask API — ML Stress Prediction Backend
Endpoints:
  POST /predict  - Predict stress level from biometric inputs
  GET  /health   - Health check
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import os
import sqlite3
from predict import predict_stress
from ml_model import train_model

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
DB_PATH = os.path.join(ROOT_DIR, "frontend", "dist", "database", "health.db")

app = Flask(__name__)
CORS(app)  # Allow requests from Vite dev server (localhost:5173)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS website_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_user_id TEXT UNIQUE NOT NULL,
            email TEXT,
            name TEXT,
            profession TEXT DEFAULT 'Nothing',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    columns = [row["name"] for row in cur.execute("PRAGMA table_info(website_users)").fetchall()]
    if "profession" not in columns:
        cur.execute("ALTER TABLE website_users ADD COLUMN profession TEXT DEFAULT 'Nothing'")
    conn.commit()
    conn.close()


def get_or_create_user_id(conn, body):
    auth_user_id = str(body.get("auth_user_id") or body.get("website_user_id") or "").strip()
    email = (body.get("email") or "").strip() or None
    name = (body.get("name") or "").strip() or None
    profession = (body.get("profession") or "Nothing").strip() or "Nothing"

    if not auth_user_id:
        explicit_user_id = body.get("user_id")
        if explicit_user_id not in (None, ""):
            return int(explicit_user_id)
        raise ValueError("Missing auth_user_id for logged-in user")

    cur = conn.cursor()
    existing = cur.execute(
        "SELECT id FROM website_users WHERE auth_user_id = ?",
        (auth_user_id,),
    ).fetchone()

    if existing:
        cur.execute(
            "UPDATE website_users SET email = COALESCE(?, email), name = COALESCE(?, name), profession = COALESCE(?, profession) WHERE id = ?",
            (email, name, profession, existing["id"]),
        )
        return existing["id"]

    cur.execute(
        "SELECT COALESCE(MAX(user_id), 0) FROM daily_logs"
    )
    max_daily_user_id = cur.fetchone()[0] or 0

    cur.execute(
        "SELECT COALESCE(MAX(id), 0) FROM website_users"
    )
    max_website_user_id = cur.fetchone()[0] or 0

    new_user_id = max(max_daily_user_id, max_website_user_id, 1000) + 1

    cur.execute(
        "INSERT INTO website_users (id, auth_user_id, email, name, profession) VALUES (?, ?, ?, ?, ?)",
        (new_user_id, auth_user_id, email, name, profession),
    )
    return new_user_id


# ─── HEALTH CHECK ────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "VitalMind ML API v1.0"})


# ─── PREDICT STRESS ──────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    """
    Expected JSON body:
    {
        "heart_rate": 90,
        "systolic_bp": 130,
        "diastolic_bp": 85,
        "temperature": 36.8,
        "sleep_hours": 5.5,
        "workout_hours": 0.5   (optional)
    }

    Returns:
    {
        "stress_level": "High",
        "stress_index": 2,
        "confidence": { "low": 0.1, "medium": 0.2, "high": 0.7 },
        "ai_schedule": [ { "time": "...", "task": "...", "type": "...", "icon": "..." } ]
    }
    """
    try:
        body = request.get_json()

        if not body:
            return jsonify({"error": "No JSON body provided"}), 400

        # Validate required fields
        required = ["heart_rate", "systolic_bp", "diastolic_bp", "temperature", "sleep_hours"]
        missing = [f for f in required if f not in body]
        if missing:
            return jsonify({"error": f"Missing fields: {missing}"}), 400

        # Enforce numeric types
        data = {
            "heart_rate":    float(body["heart_rate"]),
            "systolic_bp":   float(body["systolic_bp"]),
            "diastolic_bp":  float(body["diastolic_bp"]),
            "temperature":   float(body["temperature"]),
            "sleep_hours":   float(body["sleep_hours"]),
            "workout_hours": float(body.get("workout_hours", 0)),
            "profession":    str(body.get("profession", "Nothing"))
        }

        result = predict_stress(data)
        return jsonify(result), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {e}"}), 500


# ─── SAVE HEALTH LOG ─────────────────────────────────────────────────────────
@app.route("/save_log", methods=["POST"])
def save_log():
    try:
        init_db()
        body = request.get_json()
        if not body:
            return jsonify({"error": "No JSON body provided"}), 400

        # Optional fields will be None if missing
        heart_rate = float(body.get("pulse", body.get("heart_rate", 0)) or 0) or None
        systolic_bp = float(body.get("bpSys", body.get("systolic_bp", 0)) or 0) or None
        diastolic_bp = float(body.get("bpDia", body.get("diastolic_bp", 0)) or 0) or None
        temperature = float(body.get("temp", body.get("temperature", 36.8)) or 36.8) or None
        sleep_hours = float(body.get("sleepHours", body.get("sleep_hours", 0)) or 0) or None
        workout_hours = float(body.get("exerciseTime", body.get("workout_hours", 0)) or 0) or None
        study_hours = float(body.get("studyHours", body.get("study_hours", 0)) or 0) or None
        spo2 = float(body.get("spo2", 0) or 0) or None
        calories = int(float(body.get("calories", 0) or 0)) or None
        timestamp = body.get("timestamp") or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        conn = get_db_connection()
        cur = conn.cursor()
        user_id = get_or_create_user_id(conn, body)

        cur.execute("""
            INSERT INTO daily_logs 
            (user_id, heart_rate, systolic_bp, diastolic_bp, spo2, temperature, sleep_hours, study_hours, workout_hours, calories, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            heart_rate,
            systolic_bp,
            diastolic_bp,
            spo2,
            temperature,
            sleep_hours,
            study_hours,
            workout_hours,
            calories,
            timestamp,
        ))

        log_id = cur.lastrowid
        conn.commit()
        conn.close()

        retrain_requested = bool(body.get("retrain_model"))
        retrain_result = None
        retrain_error = None
        if retrain_requested:
            try:
                retrain_result = train_model()
            except Exception as retrain_exc:
                retrain_error = str(retrain_exc)

        return jsonify({
            "status": "success",
            "message": "Log saved to SQLite",
            "log_id": log_id,
            "user_id": user_id,
            "retrained": retrain_result is not None,
            "retrain_details": retrain_result,
            "retrain_error": retrain_error,
        }), 201

    except Exception as e:
        return jsonify({"error": f"Failed to save log: {e}"}), 500


# ─── RETRAIN MODEL ───────────────────────────────────────────────────────────
@app.route("/retrain", methods=["POST"])
def retrain():
    try:
        result = train_model()
        return jsonify({"status": "success", "message": "Model retrained", "details": result}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrain model: {e}"}), 500


if __name__ == "__main__":
    init_db()
    print("🧠 VitalMind ML API starting on http://localhost:5000")
    print("   Model: stress_model.pkl  |  Scaler: scaler.pkl")
    app.run(host="0.0.0.0", port=5000, debug=False)
