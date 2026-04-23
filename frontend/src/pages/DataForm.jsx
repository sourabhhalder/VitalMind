import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateInsights } from '../utils/logicEngine';
import { predictStress } from '../utils/stressPredictor';
import {
  User, Calendar, Weight, MapPin, Activity, Heart, Thermometer,
  Moon, Dumbbell, Clock, ChevronRight, ChevronLeft, BrainCircuit,
  Sparkles, ShieldCheck, NotebookPen, Flame, Briefcase
} from 'lucide-react';
import './DataForm.css';

const DataForm = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'Male',
    profession: 'Nothing',
    weight: '',
    location: '',
    temp: '36.8',
    spo2: '98',
    pulse: '72',
    bpSys: '120',
    bpDia: '80',
    workoutType: 'None',
    exerciseTime: '0',
    sleepHours: '7',
    foodChoice: 'Veg',
    meals: '3',
    studyHours: '0',
    calories: '2200',
    healthIssues: 'None'
  });

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('vitalMindUser') || '{}');
    if (!storedUser) return;

    setFormData((prev) => ({
      ...prev,
      name: storedUser.name || prev.name,
      age: storedUser.age || prev.age,
      gender: storedUser.gender || prev.gender,
      profession: storedUser.profession || prev.profession,
      weight: storedUser.weight || prev.weight,
      location: storedUser.location || prev.location,
    }));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }

    if (submitError) setSubmitError('');
  };

  const validateStep = (currentStep) => {
    const newErrors = {};

    if (currentStep === 1) {
      if (!formData.name.trim()) newErrors.name = 'Name is required';
      if (!formData.age) newErrors.age = 'Age is required';
      if (!formData.weight) newErrors.weight = 'Weight is required';
      if (!formData.location.trim()) newErrors.location = 'Location is required';
    } else if (currentStep === 2) {
      if (!formData.temp) newErrors.temp = 'Temperature is required';
      if (!formData.spo2) newErrors.spo2 = 'SpO2 is required';
      if (!formData.pulse) newErrors.pulse = 'Pulse is required';
      if (!formData.bpSys) newErrors.bpSys = 'Systolic BP is required';
      if (!formData.bpDia) newErrors.bpDia = 'Diastolic BP is required';
    } else if (currentStep === 3) {
      if (!formData.sleepHours) newErrors.sleepHours = 'Sleep hours required';
      if (formData.exerciseTime === '') newErrors.exerciseTime = 'Exercise time required';
      if (formData.studyHours === '') newErrors.studyHours = 'Study hours required';
      if (!formData.calories) newErrors.calories = 'Calories are required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setStep((prev) => prev - 1);
  };

  const calculateHealthScore = (data, stressResult) => {
    let score = 100;

    if (parseFloat(data.sleepHours) < 6) score -= 15;
    if (parseFloat(data.spo2) < 95) score -= 15;
    if (parseFloat(data.bpSys) > 130 || parseFloat(data.bpDia) > 85) score -= 15;
    if (parseFloat(data.pulse) > 95) score -= 10;
    if (stressResult?.stress_level === 'Medium') score -= 10;
    if (stressResult?.stress_level === 'High') score -= 20;

    return Math.max(35, Math.min(98, Math.round(score)));
  };

  const buildDashboardSchedule = (stressResult, insights) => {
    if (stressResult?.ai_schedule?.length) {
      return stressResult.ai_schedule.map((item) => ({
        activity: item.task,
        baseline: item.type || 'wellness',
        ai: item.time,
        improvement: item.type || 'optimized',
      }));
    }

    return (insights?.schedule || []).map((item) => ({
      activity: item.task,
      baseline: item.type || 'wellness',
      ai: item.time,
      improvement: 'Rule-based recommendation',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    const storedUser = JSON.parse(localStorage.getItem('vitalMindUser') || '{}');
    if (!storedUser?.id) {
      setSubmitError('Please log in again so we can attach this analysis to your account.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const insights = generateInsights(formData);
      const stressResult = await predictStress(formData);

      const savePayload = {
        ...formData,
        auth_user_id: storedUser.id,
        email: storedUser.email,
        name: storedUser.name || formData.name,
        retrain_model: true,
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      let saveLogResult = null;

      try {
        const response = await fetch('http://localhost:5000/save_log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savePayload)
        });

        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Failed to save log');
        saveLogResult = payload;
      } catch (saveErr) {
        console.error('Failed to save log to DB:', saveErr);
        setSubmitError(`Analysis completed, but saving to health.db failed: ${saveErr.message}`);
      }

      const healthScore = calculateHealthScore(formData, stressResult);
      const dashboardSchedule = buildDashboardSchedule(stressResult, insights);

      const updatedUser = {
        ...storedUser,
        ...formData,
        sqliteUserId: saveLogResult?.user_id || storedUser.sqliteUserId,
      };

      localStorage.setItem('vitalMindUser', JSON.stringify(updatedUser));
      localStorage.setItem('vitalMindData', JSON.stringify({
        formData,
        insights,
        healthScore,
        schedule: dashboardSchedule,
        calories: parseFloat(formData.calories || 0),
      }));
      localStorage.setItem('vitalMindStress', JSON.stringify({
        ...stressResult,
        _date: new Date().toDateString(),
      }));
      window.dispatchEvent(new Event('storage'));

      setAnalysisResult({
        stressResult,
        insights,
        saveLogResult,
        healthScore,
      });
    } catch (err) {
      console.error('Submission error:', err);
      setSubmitError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="m2">
      <div className="c2">
        <h2 className="form-title text-gradient">Daily Health Analysis</h2>
        <p className="form-subtitle">Fill in today&apos;s vitals, analyze stress, and get your schedule on this page.</p>

        <div className="step-indicator">
          <div className={`step-dot ${step >= 1 ? (step > 1 ? 'completed' : 'active') : ''}`}>1</div>
          <div className={`step-dot ${step >= 2 ? (step > 2 ? 'completed' : 'active') : ''}`}>2</div>
          <div className={`step-dot ${step >= 3 ? 'active' : ''}`}>3</div>
        </div>

        {submitError && <div className="submit-banner error">{submitError}</div>}
        {analysisResult?.saveLogResult?.message && !submitError && (
          <div className="submit-banner success">
            Saved to <code>health.db</code> as user #{analysisResult.saveLogResult.user_id}
            {analysisResult.saveLogResult.retrained ? ' and retrained the model.' : '.'}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="step-content">
              <div className="form-grid">
                <div className="form-group">
                  <label>Name</label>
                  <div className="input-wrapper">
                    <User size={18} className={`input-icon ${errors.name ? 'error-icon' : ''}`} />
                    <input
                      type="text"
                      name="name"
                      className={`form-input ${errors.name ? 'error' : ''}`}
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.name && <span className="error-text">{errors.name}</span>}
                </div>

                <div className="form-group">
                  <label>Age</label>
                  <div className="input-wrapper">
                    <Calendar size={18} className={`input-icon ${errors.age ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="age"
                      className={`form-input ${errors.age ? 'error' : ''}`}
                      placeholder="25"
                      value={formData.age}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.age && <span className="error-text">{errors.age}</span>}
                </div>

                <div className="form-group">
                  <label>Weight (kg)</label>
                  <div className="input-wrapper">
                    <Weight size={18} className={`input-icon ${errors.weight ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="weight"
                      className={`form-input ${errors.weight ? 'error' : ''}`}
                      placeholder="70"
                      value={formData.weight}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.weight && <span className="error-text">{errors.weight}</span>}
                </div>

                <div className="form-group">
                  <label>Gender</label>
                  <div className="input-wrapper">
                    <User size={18} className="input-icon" />
                    <select
                      name="gender"
                      className="form-input"
                      value={formData.gender}
                      onChange={handleChange}
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Profession</label>
                  <div className="input-wrapper">
                    <Briefcase size={18} className="input-icon" />
                    <select
                      name="profession"
                      className="form-input"
                      value={formData.profession}
                      onChange={handleChange}
                    >
                      <option>Student</option>
                      <option>Worker</option>
                      <option>Nothing</option>
                    </select>
                  </div>
                </div>

                <div className="form-group form-group-full">
                  <label>Location</label>
                  <div className="input-wrapper">
                    <MapPin size={18} className={`input-icon ${errors.location ? 'error-icon' : ''}`} />
                    <input
                      type="text"
                      name="location"
                      className={`form-input ${errors.location ? 'error' : ''}`}
                      placeholder="City, Country"
                      value={formData.location}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.location && <span className="error-text">{errors.location}</span>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="step-content">
              <div className="form-grid">
                <div className="form-group">
                  <label>Temperature (°C)</label>
                  <div className="input-wrapper">
                    <Thermometer size={18} className={`input-icon ${errors.temp ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      step="0.1"
                      name="temp"
                      className={`form-input ${errors.temp ? 'error' : ''}`}
                      placeholder="36.8"
                      value={formData.temp}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.temp && <span className="error-text">{errors.temp}</span>}
                </div>

                <div className="form-group">
                  <label>SpO2 (%)</label>
                  <div className="input-wrapper">
                    <Activity size={18} className={`input-icon ${errors.spo2 ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="spo2"
                      className={`form-input ${errors.spo2 ? 'error' : ''}`}
                      placeholder="98"
                      value={formData.spo2}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.spo2 && <span className="error-text">{errors.spo2}</span>}
                </div>

                <div className="form-group">
                  <label>Pulse (bpm)</label>
                  <div className="input-wrapper">
                    <Heart size={18} className={`input-icon ${errors.pulse ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="pulse"
                      className={`form-input ${errors.pulse ? 'error' : ''}`}
                      placeholder="72"
                      value={formData.pulse}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.pulse && <span className="error-text">{errors.pulse}</span>}
                </div>

                <div className="form-group">
                  <label>BP Systolic</label>
                  <div className="input-wrapper">
                    <Activity size={18} className={`input-icon ${errors.bpSys ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="bpSys"
                      className={`form-input ${errors.bpSys ? 'error' : ''}`}
                      placeholder="120"
                      value={formData.bpSys}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.bpSys && <span className="error-text">{errors.bpSys}</span>}
                </div>

                <div className="form-group">
                  <label>BP Diastolic</label>
                  <div className="input-wrapper">
                    <Activity size={18} className={`input-icon ${errors.bpDia ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="bpDia"
                      className={`form-input ${errors.bpDia ? 'error' : ''}`}
                      placeholder="80"
                      value={formData.bpDia}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.bpDia && <span className="error-text">{errors.bpDia}</span>}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-content">
              <div className="form-grid">
                <div className="form-group">
                  <label>Sleep Hours</label>
                  <div className="input-wrapper">
                    <Moon size={18} className={`input-icon ${errors.sleepHours ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      step="0.5"
                      name="sleepHours"
                      className={`form-input ${errors.sleepHours ? 'error' : ''}`}
                      placeholder="7"
                      value={formData.sleepHours}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.sleepHours && <span className="error-text">{errors.sleepHours}</span>}
                </div>

                <div className="form-group">
                  <label>Workout Type</label>
                  <div className="input-wrapper">
                    <Dumbbell size={18} className="input-icon" />
                    <select
                      name="workoutType"
                      className="form-input"
                      value={formData.workoutType}
                      onChange={handleChange}
                    >
                      <option>None</option>
                      <option>Cardio</option>
                      <option>Yoga</option>
                      <option>Strength</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Exercise Time (hrs)</label>
                  <div className="input-wrapper">
                    <Clock size={18} className={`input-icon ${errors.exerciseTime ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      step="0.5"
                      name="exerciseTime"
                      className={`form-input ${errors.exerciseTime ? 'error' : ''}`}
                      placeholder="0.5"
                      value={formData.exerciseTime}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.exerciseTime && <span className="error-text">{errors.exerciseTime}</span>}
                </div>

                <div className="form-group">
                  <label>Study Hours</label>
                  <div className="input-wrapper">
                    <NotebookPen size={18} className={`input-icon ${errors.studyHours ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      step="0.5"
                      name="studyHours"
                      className={`form-input ${errors.studyHours ? 'error' : ''}`}
                      placeholder="2"
                      value={formData.studyHours}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.studyHours && <span className="error-text">{errors.studyHours}</span>}
                </div>

                <div className="form-group">
                  <label>Calories</label>
                  <div className="input-wrapper">
                    <Flame size={18} className={`input-icon ${errors.calories ? 'error-icon' : ''}`} />
                    <input
                      type="number"
                      name="calories"
                      className={`form-input ${errors.calories ? 'error' : ''}`}
                      placeholder="2200"
                      value={formData.calories}
                      onChange={handleChange}
                    />
                  </div>
                  {errors.calories && <span className="error-text">{errors.calories}</span>}
                </div>
              </div>
            </div>
          )}

          <div className="btn-group">
            {step > 1 && (
              <button type="button" className="btn-form btn-back" onClick={prevStep}>
                <ChevronLeft size={20} /> Back
              </button>
            )}

            {step < 3 ? (
              <button type="button" className="btn-form btn-next" onClick={nextStep}>
                Next <ChevronRight size={20} />
              </button>
            ) : (
              <button type="submit" className="btn-form btn-next" disabled={isSubmitting}>
                {isSubmitting ? <div className="spinner"></div> : <>Analyze <Activity size={20} /></>}
              </button>
            )}
          </div>
        </form>

        {analysisResult && (
          <section className="analysis-panel">
            <div className="analysis-header">
              <div>
                <h3>Today&apos;s Recommendation</h3>
                <p>Generated from your latest vitals and saved into the ML training logs.</p>
              </div>
              <button type="button" className="btn-form btn-dashboard" onClick={() => navigate('/dashboard')}>
                Open Dashboard
              </button>
            </div>

            <div className="analysis-grid">
              <article className={`metric-card stress-${analysisResult.stressResult.stress_level?.toLowerCase()}`}>
                <div className="metric-title"><BrainCircuit size={18} /> Stress Prediction</div>
                <div className="metric-value">{analysisResult.stressResult.stress_level}</div>
                <p className="metric-copy">
                  Source: {analysisResult.stressResult.source === 'ml-model' ? 'ML model' : 'JS fallback'}
                </p>
                <p className="metric-copy">Profession: {formData.profession}</p>
                <p className="metric-copy">Health score: {analysisResult.healthScore}/100</p>
              </article>

              <article className="metric-card">
                <div className="metric-title"><ShieldCheck size={18} /> Database Sync</div>
                <div className="metric-value">User #{analysisResult.saveLogResult?.user_id || 'pending'}</div>
                <p className="metric-copy">
                  Log ID: {analysisResult.saveLogResult?.log_id || 'not saved'}
                </p>
                <p className="metric-copy">
                  {analysisResult.saveLogResult?.retrained
                    ? 'Model retrained with the newest entry.'
                    : (analysisResult.saveLogResult?.retrain_error || 'Model retrain skipped or unavailable.')}
                </p>
              </article>
            </div>

            <div className="recommendation-layout">
              <article className="result-card">
                <div className="result-card-title"><Sparkles size={18} /> Daily Schedule</div>
                <div className="schedule-list">
                  {analysisResult.stressResult.ai_schedule?.map((item, index) => (
                    <div key={`${item.time}-${index}`} className="schedule-item">
                      <span className="schedule-emoji">{item.icon || '📋'}</span>
                      <div>
                        <p className="schedule-task">{item.task}</p>
                        <p className="schedule-time">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="result-card">
                <div className="result-card-title"><Activity size={18} /> Health Insights</div>
                <div className="insight-list">
                  {analysisResult.insights.insights?.map((item, index) => (
                    <div key={`${item.type}-${index}`} className={`insight-row ${item.type}`}>
                      <span className="insight-dot"></span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default DataForm;
