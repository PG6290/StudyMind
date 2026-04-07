const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Create/Connect to SQLite Database
const db = new sqlite3.Database('./studymind.db');

// Research-based constants
const COGNITIVE_LOAD = {
  BASE_LOAD: 35,
  DIFFICULTY_MULTIPLIER: 7.2,  // Research: Each difficulty point increases load by ~7-8%
  DURATION_FACTOR: 0.12,       // 12% load increase per 30min (based on attention decay research)
  SWITCH_COST_BASE: 8,         // Minimum 8% penalty for context switching
  SWITCH_COST_MAX: 22,         // Maximum 22% penalty
  HRV_BASELINE: 58,            // Healthy HRV baseline in ms
  STRESS_THRESHOLD_HIGH: 75,
  STRESS_THRESHOLD_MEDIUM: 50
};

// Create all tables
db.serialize(() => {
  // Study sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      duration INTEGER NOT NULL,
      difficulty INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      task_category TEXT NOT NULL,
      load_impact INTEGER NOT NULL,
      hrv_impact INTEGER,
      stress_impact INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shield_active INTEGER DEFAULT 0,
      auto_shield INTEGER DEFAULT 1,
      shield_threshold INTEGER DEFAULT 75,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Activity log
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      load_value INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Daily stats table
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE UNIQUE,
      total_study_minutes INTEGER DEFAULT 0,
      total_switches INTEGER DEFAULT 0,
      avg_load INTEGER DEFAULT 0,
      peak_load INTEGER DEFAULT 0,
      total_switch_cost INTEGER DEFAULT 0,
      decision_density INTEGER DEFAULT 0,
      focus_stability INTEGER DEFAULT 0
    )
  `);

  // Switch cost records
  db.run(`
    CREATE TABLE IF NOT EXISTS switch_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_subject TEXT,
      to_subject TEXT,
      cost_percentage INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Recovery sessions
  db.run(`
    CREATE TABLE IF NOT EXISTS recovery_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recovery_type TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      load_before INTEGER,
      load_after INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Environmental context data
  db.run(`
    CREATE TABLE IF NOT EXISTS environmental_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time_of_day TEXT,
      hour INTEGER,
      avg_load INTEGER,
      performance_score INTEGER,
      session_count INTEGER
    )
  `);

  // Task type effectiveness
  db.run(`
    CREATE TABLE IF NOT EXISTS task_effectiveness (
      task_type TEXT PRIMARY KEY,
      recommended_load_min INTEGER,
      recommended_load_max INTEGER,
      energy_cost INTEGER,
      cognitive_overlap_score INTEGER
    )
  `);

  // Insert default settings if empty
  db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
    if (row && row.count === 0) {
      db.run("INSERT INTO settings (shield_active, auto_shield, shield_threshold) VALUES (0, 1, 75)");
    }
  });

  // Insert task type effectiveness data (research-based)
  db.get("SELECT COUNT(*) as count FROM task_effectiveness", (err, row) => {
    if (row && row.count === 0) {
      const tasks = [
        ['analytical', 20, 55, 45, 85],
        ['creative', 25, 60, 40, 70],
        ['rote', 10, 70, 25, 50],
        ['passive', 5, 80, 15, 30]
      ];
      tasks.forEach(task => {
        db.run(`INSERT INTO task_effectiveness (task_type, recommended_load_min, recommended_load_max, energy_cost, cognitive_overlap_score) VALUES (?, ?, ?, ?, ?)`, task);
      });
    }
  });

  // Initialize environmental data if empty
  db.get("SELECT COUNT(*) as count FROM environmental_data", (err, row) => {
    if (row && row.count === 0) {
      const hours = [6, 9, 12, 15, 18, 21, 0];
      hours.forEach(hour => {
        let timeOfDay = 'Night';
        if (hour >= 6 && hour < 12) timeOfDay = 'Morning';
        else if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
        else if (hour >= 17 && hour < 21) timeOfDay = 'Evening';
        else timeOfDay = 'Night';
        
        const baseLoad = hour >= 12 && hour <= 15 ? 65 : hour >= 21 ? 45 : 50;
        db.run(`INSERT INTO environmental_data (time_of_day, hour, avg_load, performance_score, session_count) VALUES (?, ?, ?, ?, ?)`, 
          [timeOfDay, hour, baseLoad, 100 - Math.abs(baseLoad - 50), 0]);
      });
    }
  });
});

// ============= HELPER FUNCTIONS =============

// Calculate cognitive load based on research
function calculateCognitiveLoad(difficulty, duration, taskType, recentLoad = null) {
  let load = COGNITIVE_LOAD.BASE_LOAD;
  load += difficulty * COGNITIVE_LOAD.DIFFICULTY_MULTIPLIER;
  load += Math.floor(duration / 30) * COGNITIVE_LOAD.DURATION_FACTOR * 100;
  
  // Task type modifier
  const taskModifiers = { analytical: 1.15, creative: 1.1, rote: 0.85, passive: 0.7 };
  const modifier = taskModifiers[taskType.toLowerCase()] || 1.0;
  load *= modifier;
  
  // Fatigue accumulation from recent sessions
  if (recentLoad !== null && recentLoad > 50) {
    load += (recentLoad - 50) * 0.3;
  }
  
  return Math.min(95, Math.max(20, Math.round(load)));
}

// Calculate HRV impact
function calculateHRV(difficulty, currentLoad) {
  let hrv = COGNITIVE_LOAD.HRV_BASELINE;
  hrv -= difficulty * 4.5;
  hrv -= Math.max(0, (currentLoad - 50) * 0.4);
  return Math.max(20, Math.min(120, Math.round(hrv)));
}

// Calculate switch cost (research-based)
function calculateSwitchCost(fromSubject, toSubject, recentSwitches) {
  let baseCost = COGNITIVE_LOAD.SWITCH_COST_BASE;
  
  // Different subjects = higher cost
  if (fromSubject !== toSubject) baseCost += 8;
  
  // Task type similarity (simplified - would need subject categorization)
  const cost = Math.min(COGNITIVE_LOAD.SWITCH_COST_MAX, 
    baseCost + (recentSwitches * 2));
  
  return cost;
}

// Update daily stats
async function updateDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  
  db.get(`
    SELECT 
      COUNT(*) as session_count,
      SUM(duration) as total_minutes,
      AVG(load_impact) as avg_load,
      MAX(load_impact) as peak_load
    FROM study_sessions 
    WHERE DATE(created_at) = DATE('now')
  `, (err, row) => {
    if (err) return;
    
    db.get(`SELECT COUNT(*) as switch_count FROM switch_costs WHERE DATE(created_at) = DATE('now')`, (err, switchRow) => {
      const totalSwitches = switchRow ? switchRow.switch_count : 0;
      
      db.run(`
        INSERT INTO daily_stats (date, total_study_minutes, total_switches, avg_load, peak_load, total_switch_cost, decision_density, focus_stability)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          total_study_minutes = excluded.total_study_minutes,
          total_switches = excluded.total_switches,
          avg_load = excluded.avg_load,
          peak_load = excluded.peak_load,
          total_switch_cost = excluded.total_switch_cost,
          decision_density = excluded.decision_density,
          focus_stability = excluded.focus_stability
      `, [
        today,
        row?.total_minutes || 0,
        totalSwitches,
        Math.round(row?.avg_load || 0),
        row?.peak_load || 0,
        totalSwitches * 12, // Average switch cost
        (row?.session_count || 0) * 8, // Decision density calculation
        100 - Math.min(100, (totalSwitches * 4)) // Focus stability
      ]);
    });
  });
}

// ============= API ENDPOINTS =============

// Get all study sessions
app.get('/api/sessions', (req, res) => {
  db.all(
    `SELECT * FROM study_sessions 
     WHERE created_at >= datetime('now', '-30 days')
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Add new study session
app.post('/api/sessions', (req, res) => {
  const { subject, duration, difficulty, task_type, load_impact, hrv_impact, stress_impact } = req.body;
  
  // Get task category
  let taskCategory = 'rote';
  if (task_type === 'Analytical') taskCategory = 'analytical';
  else if (task_type === 'Creative') taskCategory = 'creative';
  else if (task_type === 'Passive Listening') taskCategory = 'passive';
  
  db.run(
    `INSERT INTO study_sessions (subject, duration, difficulty, task_type, task_category, load_impact, hrv_impact, stress_impact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [subject, duration, difficulty, task_type, taskCategory, load_impact, hrv_impact, stress_impact],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.run(
        `INSERT INTO activity_log (action, details, load_value) VALUES (?, ?, ?)`,
        ['add_session', `Added ${subject} for ${duration}min - difficulty ${difficulty}`, load_impact]
      );
      
      updateDailyStats();
      
      res.json({ 
        id: this.lastID, 
        message: 'Session added successfully',
        load_impact: load_impact
      });
    }
  );
});

// Record switch cost
app.post('/api/switch-cost', (req, res) => {
  const { from_subject, to_subject, cost_percentage } = req.body;
  
  db.run(
    `INSERT INTO switch_costs (from_subject, to_subject, cost_percentage) VALUES (?, ?, ?)`,
    [from_subject, to_subject, cost_percentage],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      updateDailyStats();
      res.json({ id: this.lastID, message: 'Switch cost recorded' });
    }
  );
});

// Get today's stats
app.get('/api/stats/today', (req, res) => {
  db.get(
    `SELECT 
      COUNT(*) as session_count,
      SUM(duration) as total_minutes,
      AVG(load_impact) as avg_load,
      MAX(load_impact) as peak_load,
      AVG(hrv_impact) as avg_hrv
     FROM study_sessions 
     WHERE DATE(created_at) = DATE('now')`,
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.get(`SELECT * FROM daily_stats WHERE date = DATE('now')`, (err, dailyRow) => {
        res.json({
          session_count: row?.session_count || 0,
          total_minutes: row?.total_minutes || 0,
          avg_load: Math.round(row?.avg_load || 35),
          peak_load: row?.peak_load || 0,
          avg_hrv: Math.round(row?.avg_hrv || 58),
          total_switches: dailyRow?.total_switches || 0,
          total_switch_cost: dailyRow?.total_switch_cost || 0,
          decision_density: dailyRow?.decision_density || 0,
          focus_stability: dailyRow?.focus_stability || 85
        });
      });
    }
  );
});

// Get weekly load data for chart
app.get('/api/stats/weekly', (req, res) => {
  db.all(
    `SELECT 
      strftime('%w', created_at) as day,
      AVG(load_impact) as avg_load,
      COUNT(*) as session_count,
      AVG(hrv_impact) as avg_hrv
     FROM study_sessions 
     WHERE created_at >= datetime('now', '-7 days')
     GROUP BY strftime('%w', created_at)
     ORDER BY day`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const weekData = [0, 0, 0, 0, 0, 0, 0];
      const hrvData = [0, 0, 0, 0, 0, 0, 0];
      
      rows.forEach(row => {
        const dayIndex = parseInt(row.day);
        weekData[dayIndex] = Math.round(row.avg_load || 35);
        hrvData[dayIndex] = Math.round(row.avg_hrv || 58);
      });
      
      // Fill empty days with baseline
      for (let i = 0; i < 7; i++) {
        if (weekData[i] === 0) weekData[i] = 35;
        if (hrvData[i] === 0) hrvData[i] = 58;
      }
      
      res.json({ loads: weekData, hrv: hrvData });
    }
  );
});

// Get switch cost history
app.get('/api/switches', (req, res) => {
  db.all(
    `SELECT * FROM switch_costs 
     WHERE created_at >= datetime('now', '-7 days')
     ORDER BY created_at DESC LIMIT 10`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Get shield settings
app.get('/api/shield', (req, res) => {
  db.get("SELECT * FROM settings ORDER BY id DESC LIMIT 1", (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ 
      shieldActive: row?.shield_active === 1, 
      autoShield: row?.auto_shield === 1,
      shieldThreshold: row?.shield_threshold || 75
    });
  });
});

// Update shield settings
app.post('/api/shield', (req, res) => {
  const { shieldActive, autoShield, shieldThreshold } = req.body;
  
  db.run(
    `UPDATE settings SET shield_active = ?, auto_shield = ?, shield_threshold = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = (SELECT id FROM settings ORDER BY id DESC LIMIT 1)`,
    [shieldActive ? 1 : 0, autoShield ? 1 : 0, shieldThreshold || 75],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.run(`INSERT INTO activity_log (action, details) VALUES (?, ?)`,
        ['shield_update', `Shield set to ${shieldActive ? 'ON' : 'OFF'} at ${shieldThreshold || 75}% threshold`]
      );
      
      res.json({ message: 'Settings updated' });
    }
  );
});

// Get activity log
app.get('/api/activity', (req, res) => {
  db.all(
    `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 30`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Get recovery recommendations
app.get('/api/recovery/:loadValue', (req, res) => {
  const loadValue = parseInt(req.params.loadValue);
  
  let recoveryType = 'visual';
  let title = '20-20-20 Eye Reset';
  let description = 'Look at something 20ft away for 20 seconds to reduce eye strain.';
  let duration = 300; // 5 minutes
  
  if (loadValue > 80) {
    recoveryType = 'cognitive';
    title = 'Deep Breath Protocol';
    description = '4-7-8 breathing: inhale 4s, hold 7s, exhale 8s. Resets autonomic nervous system.';
    duration = 480;
  } else if (loadValue > 65) {
    recoveryType = 'cognitive';
    title = 'Breath Box Protocol';
    description = '4-count inhale, hold, exhale, hold. Reduces prefrontal cortex fatigue.';
    duration = 240;
  } else if (loadValue > 50) {
    recoveryType = 'visual';
    title = '20-20-20 Reset';
    description = 'Look at something 20ft away for 20 seconds. You need an eye break.';
    duration = 120;
  } else {
    recoveryType = 'motor';
    title = 'Micro-Movement Break';
    description = '30-second stretch sequence for neck, shoulders, and wrists.';
    duration = 90;
  }
  
  res.json({
    type: recoveryType,
    title: title,
    description: description,
    duration_seconds: duration,
    load_before: loadValue
  });
});

// Record recovery session
app.post('/api/recovery', (req, res) => {
  const { recovery_type, duration_seconds, load_before, load_after } = req.body;
  
  db.run(
    `INSERT INTO recovery_sessions (recovery_type, duration_seconds, load_before, load_after) VALUES (?, ?, ?, ?)`,
    [recovery_type, duration_seconds, load_before, load_after],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Recovery recorded' });
    }
  );
});

// Get environmental context
app.get('/api/environment', (req, res) => {
  const hour = new Date().getHours();
  let timeOfDay = 'Night';
  if (hour >= 6 && hour < 12) timeOfDay = 'Morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'Evening';
  
  db.get(
    `SELECT * FROM environmental_data WHERE hour = ? OR time_of_day = ? ORDER BY hour LIMIT 1`,
    [hour, timeOfDay],
    (err, row) => {
      if (err || !row) {
        res.json({
          time_window: timeOfDay,
          hour: hour,
          typical_load: 50,
          efficiency_delta: -15,
          optimal_start: 9,
          optimal_end: 11
        });
        return;
      }
      
      res.json({
        time_window: row.time_of_day,
        hour: row.hour,
        typical_load: row.avg_load,
        efficiency_delta: row.performance_score - 70,
        optimal_start: 9,
        optimal_end: 11
      });
    }
  );
});

// Get task recommendations based on current load
app.get('/api/task-recommendations/:currentLoad', (req, res) => {
  const currentLoad = parseInt(req.params.currentLoad);
  
  db.all(`SELECT * FROM task_effectiveness`, (err, tasks) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const recommendations = tasks.map(task => ({
      type: task.task_type,
      name: task.task_type.charAt(0).toUpperCase() + task.task_type.slice(1),
      recommended: currentLoad >= task.recommended_load_min && currentLoad <= task.recommended_load_max,
      energy_cost: task.energy_cost,
      overlap_score: task.cognitive_overlap_score
    }));
    
    res.json(recommendations);
  });
});

// Get burnout prediction
app.get('/api/burnout-prediction', (req, res) => {
  db.all(
    `SELECT load_impact, created_at FROM study_sessions 
     WHERE created_at >= datetime('now', '-7 days')
     ORDER BY created_at`,
    (err, sessions) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Predict future loads based on trend
      const loads = sessions.map(s => s.load_impact);
      const avgLoad = loads.reduce((a, b) => a + b, 0) / (loads.length || 1);
      const trend = loads.length > 1 ? (loads[loads.length - 1] - loads[0]) / loads.length : 0;
      
      const predictions = [];
      const hours = [9, 10, 11, 12, 13, 14, 15, 16];
      let currentPredicted = avgLoad;
      
      hours.forEach((hour, index) => {
        currentPredicted += trend * 2;
        let status = 'safe';
        if (currentPredicted > 75) status = 'danger';
        else if (currentPredicted > 55) status = 'caution';
        
        predictions.push({
          hour: hour,
          load: Math.min(95, Math.max(20, Math.round(currentPredicted))),
          status: status
        });
      });
      
      const riskLevel = avgLoad > 70 ? 'High' : avgLoad > 50 ? 'Medium' : 'Low';
      const suggestion = avgLoad > 70 
        ? 'High burnout risk detected. Schedule lighter tasks and take regular breaks.'
        : avgLoad > 50
        ? 'Moderate load. Monitor your energy levels and avoid back-to-back difficult tasks.'
        : 'Low load. You have capacity for challenging work.';
      
      res.json({
        predictions: predictions,
        risk_level: riskLevel,
        suggestion: suggestion,
        current_trend: trend > 0 ? 'increasing' : 'decreasing'
      });
    }
  );
});

// Get cognitive load history with trends
app.get('/api/load-history', (req, res) => {
  db.all(
    `SELECT 
      DATE(created_at) as date,
      AVG(load_impact) as avg_load,
      COUNT(*) as sessions
     FROM study_sessions 
     WHERE created_at >= datetime('now', '-14 days')
     GROUP BY DATE(created_at)
     ORDER BY date`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Clear all data (reset)
app.delete('/api/reset', (req, res) => {
  db.run("DELETE FROM study_sessions", (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    db.run("DELETE FROM activity_log");
    db.run("DELETE FROM switch_costs");
    db.run("DELETE FROM recovery_sessions");
    db.run("DELETE FROM daily_stats");
    db.run("UPDATE settings SET shield_active = 0, auto_shield = 1, shield_threshold = 75");
    res.json({ message: 'All data cleared' });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ═══════════════════════════════════════════
  🧠 StudyMind Backend Running!
  ═══════════════════════════════════════════
  📍 Local: http://localhost:${PORT}
  📍 API: http://localhost:${PORT}/api/sessions
  ═══════════════════════════════════════════
  `);
});