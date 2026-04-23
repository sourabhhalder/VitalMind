import sqlite3
import os

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT_DIR, "frontend", "dist", "database", "health.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cur.fetchall()
print('Tables:', tables)

for table in tables:
    tname = table[0]
    print(f'\n--- Table: {tname} ---')
    cur.execute(f'PRAGMA table_info({tname})')
    cols = cur.fetchall()
    print('Columns:', cols)
    cur.execute(f'SELECT * FROM {tname} LIMIT 3')
    rows = cur.fetchall()
    print('Sample rows:', rows)

conn.close()
