// StudyMind App - Fully Backend Connected Version

const API_URL = 'http://localhost:3000/api';

// Global state
let loadChart;
let shieldActive = false;
let shieldThreshold = 75;
let currentLoad = 35;
let currentHRV = 58;
let currentStress = 45;
let currentStats = {
  totalMinutes: 0,
  sessionCount: 0,
  totalSwitches: 0,
  totalSwitchCost: 0,
  decisionDensity: 0,
  focusStability: 85
};

// Navigation functions
function showDashboard() {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('taskForm').style.display = 'none';
    initChart();
    loadAllData();
}

function showTaskForm() {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('taskForm').style.display = 'block';
}

// Initialize dashboard
if (document.getElementById('landing')) {
    document.getElementById('landing').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('taskForm').style.display = 'none';
}

// Chart initialization
function initChart() {
    const ctx = document.getElementById('loadChart')?.getContext('2d');
    if (!ctx) return;
    if (loadChart) loadChart.destroy();
    loadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'cognitive load',
                data: [35, 35, 35, 35, 35, 35, 35],
                borderColor: '#888',
                backgroundColor: 'rgba(136,136,136,0.08)',
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#888',
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#555', font: { family: 'IBM Plex Mono' } }, grid: { color: '#1a1a1a' } },
                y: { ticks: { color: '#555', font: { family: 'IBM Plex Mono' } }, grid: { color: '#1a1a1a' }, min: 0, max: 100 }
            }
        }
    });
}

// Load all data from backend
async function loadAllData() {
    await Promise.all([
        loadTodayStats(),
        loadWeeklyData(),
        loadShieldSettings(),
        loadSwitchHistory(),
        loadBurnoutPrediction(),
        loadTaskRecommendations(),
        loadEnvironmentalContext(),
        loadActivityLog()
    ]);
}

// Load today's stats
async function loadTodayStats() {
    try {
        const response = await fetch(`${API_URL}/stats/today`);
        const stats = await response.json();
        
        currentStats = stats;
        currentLoad = stats.avg_load || 35;
        
        updateUIWithStats(stats);
    } catch (error) {
        console.error('Error loading stats:', error);
        setDefaultValues();
    }
}

// Update UI with stats from backend
function updateUIWithStats(stats) {
    const loadScoreElem = document.getElementById('loadScore');
    const loadFillElem = document.getElementById('loadFill');
    const studyTimeElem = document.getElementById('studyTime');
    const switchCountElem = document.getElementById('switchCount');
    const fatigueLevelElem = document.getElementById('fatigueLevel');
    const routingLoadElem = document.getElementById('routingLoad');
    const totalSwitchCostElem = document.getElementById('totalSwitchCost');
    
    if (loadScoreElem) loadScoreElem.innerHTML = `${stats.avg_load || 35}<span class="summary-unit">/100</span>`;
    if (loadFillElem) loadFillElem.style.width = `${stats.avg_load || 35}%`;
    if (studyTimeElem) {
        const hours = (stats.total_minutes / 60).toFixed(1);
        studyTimeElem.innerHTML = `${hours}<span class="summary-unit">hrs</span>`;
    }
    if (switchCountElem) switchCountElem.innerText = stats.total_switches || 0;
    if (fatigueLevelElem) {
        const load = stats.avg_load || 35;
        fatigueLevelElem.innerText = load > 70 ? 'High' : load > 45 ? 'Medium' : 'Low';
    }
    if (routingLoadElem) routingLoadElem.textContent = `${stats.avg_load || 35}%`;
    if (totalSwitchCostElem) totalSwitchCostElem.textContent = `+${stats.total_switch_cost || 0}%`;
    
    const decisionDensityElem = document.querySelector('.badge-card:first-child div:last-child div:first-child');
    if (decisionDensityElem) {
        decisionDensityElem.innerHTML = `${stats.decision_density || 0} <span style="font-size:13px;color:var(--text-muted);font-weight:400;">academic decisions</span>`;
    }
    
    const focusStabilityElem = document.querySelector('.badge-card:nth-child(2) div:last-child div:first-child');
    if (focusStabilityElem) {
        focusStabilityElem.innerHTML = `${stats.focus_stability || 85}<span style="font-size:13px;color:var(--text-muted);">/100</span>`;
    }
}

// Load weekly chart data
async function loadWeeklyData() {
    try {
        const response = await fetch(`${API_URL}/stats/weekly`);
        const data = await response.json();
        
        if (loadChart && data.loads) {
            loadChart.data.datasets[0].data = data.loads;
            loadChart.update();
        }
        
        if (data.hrv && data.hrv.length > 0) {
            const hrvValue = document.getElementById('hrvValue');
            if (hrvValue) {
                const avgHRV = data.hrv.reduce((a, b) => a + b, 0) / data.hrv.length;
                currentHRV = Math.round(avgHRV);
                hrvValue.innerHTML = `${currentHRV}<span class="unit"> ms</span>`;
                
                const hrvFill = document.getElementById('hrvFill');
                if (hrvFill) hrvFill.style.width = `${Math.min(100, currentHRV)}%`;
                
                updateHRVStatus(currentHRV);
            }
        }
    } catch (error) {
        console.error('Error loading weekly data:', error);
    }
}

// Update HRV status based on value
function updateHRVStatus(hrv) {
    const hrvStatus = document.getElementById('hrvStatus');
    if (!hrvStatus) return;
    
    if (hrv < 30) { 
        hrvStatus.textContent = '▸ Critical — high physiological stress'; 
        hrvStatus.className = 'bio-status bad'; 
    } else if (hrv < 50) { 
        hrvStatus.textContent = '▸ Below optimal (50+ ms recommended)'; 
        hrvStatus.className = 'bio-status warn'; 
    } else { 
        hrvStatus.textContent = '▸ Healthy range'; 
        hrvStatus.className = 'bio-status good'; 
    }
}

// Load shield settings
async function loadShieldSettings() {
    try {
        const response = await fetch(`${API_URL}/shield`);
        const data = await response.json();
        
        shieldActive = data.shieldActive;
        shieldThreshold = data.shieldThreshold || 75;
        
        updateShieldUI();
    } catch (error) {
        console.error('Error loading shield settings:', error);
        shieldThreshold = 75;
    }
}

// Update shield UI
function updateShieldUI() {
    const toggle = document.getElementById('shieldToggle');
    const status = document.getElementById('shieldStatusText');
    const desc = document.getElementById('shieldDesc');
    const items = document.querySelectorAll('.blocked-item');
    
    if (toggle) toggle.classList.toggle('active', shieldActive);
    if (status) {
        status.textContent = shieldActive ? 'Shield Active — Blocking Distractions' : 'Shield Inactive';
        status.style.color = shieldActive ? 'var(--danger)' : 'var(--text)';
    }
    if (desc) {
        desc.textContent = shieldActive
            ? 'All listed sites are currently blocked. Focus mode engaged.'
            : `Your load is below ${shieldThreshold}% — shield is standby.`;
    }
    items.forEach(i => i.classList.toggle('active-block', shieldActive));
}

// Load switch history
async function loadSwitchHistory() {
    try {
        const response = await fetch(`${API_URL}/switches`);
        const switches = await response.json();
        
        const switchHistory = document.getElementById('switchHistory');
        if (switchHistory && switches.length > 0) {
            switchHistory.innerHTML = switches.slice(0, 5).map(s => `
                <div class="switch-event">
                    <span>${s.from_subject || 'Previous'}</span>
                    <span class="switch-arrow">→</span>
                    <span>${s.to_subject}</span>
                    <span class="switch-cost">+${s.cost_percentage}%</span>
                </div>
            `).join('');
            
            const totalCost = switches.reduce((sum, s) => sum + (s.cost_percentage || 0), 0);
            const totalCostElem = document.getElementById('totalSwitchCost');
            if (totalCostElem) totalCostElem.textContent = `+${totalCost}%`;
        }
    } catch (error) {
        console.error('Error loading switch history:', error);
    }
}

// Load burnout prediction
async function loadBurnoutPrediction() {
    try {
        const response = await fetch(`${API_URL}/burnout-prediction`);
        const prediction = await response.json();
        
        const timeline = document.getElementById('burnoutTimeline');
        if (timeline && prediction.predictions) {
            timeline.innerHTML = prediction.predictions.map(p => `
                <div class="timeline-block ${p.status}">
                    <div class="time">${p.hour % 12 || 12} ${p.hour >= 12 ? 'PM' : 'AM'}</div>
                    <div class="load-val">${p.load}</div>
                </div>
            `).join('');
        }
        
        const adviceElem = document.getElementById('burnoutAdvice');
        if (adviceElem) adviceElem.textContent = prediction.suggestion || 'Monitor your load throughout the day.';
        
        const riskElem = document.getElementById('fatigueLevel');
        if (riskElem && prediction.risk_level) {
            riskElem.innerText = prediction.risk_level;
        }
    } catch (error) {
        console.error('Error loading burnout prediction:', error);
    }
}

// Load task recommendations
async function loadTaskRecommendations() {
    try {
        const response = await fetch(`${API_URL}/task-recommendations/${currentLoad}`);
        const recommendations = await response.json();
        
        const taskList = document.getElementById('taskList');
        if (taskList && recommendations.length > 0) {
            taskList.innerHTML = recommendations.map(task => `
                <div class="task-item ${!task.recommended ? 'disabled' : ''}">
                    <span class="task-name">${getTaskDisplayName(task.type)}</span>
                    <div class="task-meta">
                        <span class="task-type ${task.type}">${task.type}</span>
                        <span class="energy-match ${task.recommended ? 'recommended' : 'blocked'}">
                            ${task.recommended ? '✓ recommended' : 'blocked'}
                        </span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading task recommendations:', error);
    }
}

// Helper function for task display names
function getTaskDisplayName(type) {
    const names = {
        analytical: '📐 Analytical Problem Solving',
        creative: '✍️ Creative Work',
        rote: '📇 Memorization Tasks',
        passive: '🎧 Passive Review'
    };
    return names[type] || type;
}

// Load environmental context
async function loadEnvironmentalContext() {
    try {
        const response = await fetch(`${API_URL}/environment`);
        const env = await response.json();
        
        const envTimeElem = document.getElementById('envTime');
        if (envTimeElem) envTimeElem.textContent = env.time_window || getTimeOfDay();
        
        const envNoiseElem = document.getElementById('envNoise');
        if (envNoiseElem) {
            // Simulate noise detection (would come from actual API in production)
            const simulatedNoise = Math.floor(Math.random() * 30) + 30;
            envNoiseElem.innerHTML = `${simulatedNoise}<span class="unit"> dB</span>`;
        }
        
        const insightElem = document.querySelector('.env-card:first-child .env-insight');
        if (insightElem && env.typical_load) {
            insightElem.textContent = `Your typical load during ${env.time_window} is ${env.typical_load}%`;
        }
        
        const optimalElem = document.querySelector('.env-card:last-child .env-value');
        if (optimalElem && env.optimal_start && env.optimal_end) {
            optimalElem.textContent = `${env.optimal_start}–${env.optimal_end} AM`;
        }
    } catch (error) {
        console.error('Error loading environmental context:', error);
    }
}

// Load activity log
async function loadActivityLog() {
    try {
        const response = await fetch(`${API_URL}/activity`);
        const activities = await response.json();
        
        const insightsPanel = document.getElementById('insightsPanel');
        if (insightsPanel && activities.length > 0) {
            const recentActivities = activities.slice(0, 3);
            insightsPanel.innerHTML = recentActivities.map(a => `
                <div class="insight-item">
                    <div class="insight-icon">📋</div>
                    <div class="insight-text">${a.details || a.action}</div>
                </div>
            `).join('');
            
            if (recentActivities.length < 3) {
                insightsPanel.innerHTML += `
                    <div class="insight-item"><div class="insight-icon">!</div><div class="insight-text">No recent activity — add a study session to get insights</div></div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading activity log:', error);
    }
}

// Get time of day
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 6) return 'Night';
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    if (hour < 21) return 'Evening';
    return 'Night';
}

// Add study session - fully connected to backend
async function addStudySession() {
    console.log('📝 Adding study session...');
    
    const subject = document.getElementById('subjectName')?.value || '';
    if (!subject) {
        alert('Please enter a subject name');
        return;
    }
    
    const duration = parseInt(document.getElementById('duration')?.value) || 60;
    const difficulty = parseInt(document.getElementById('difficulty')?.value) || 3;
    const taskType = document.getElementById('taskType')?.value || 'Creative';
    
    // Calculate load using backend formula (mirrored here for UI responsiveness)
    const baseLoad = 35;
    const loadFromDifficulty = difficulty * 7.2;
    const loadFromDuration = Math.floor(duration / 30) * 12;
    let newLoad = Math.min(95, Math.max(20, Math.round(baseLoad + loadFromDifficulty + loadFromDuration)));
    
    // Task type modifier
    const modifiers = { 'Analytical': 1.15, 'Creative': 1.1, 'Rote Memorization': 0.85, 'Passive Listening': 0.7 };
    newLoad = Math.min(95, Math.round(newLoad * (modifiers[taskType] || 1.0)));
    
    // Calculate HRV impact
    const newHRV = Math.max(20, Math.min(120, Math.round(58 - difficulty * 4.5 - Math.max(0, (newLoad - 50) * 0.4))));
    
    // Calculate stress impact
    const newStress = Math.min(95, Math.max(20, Math.round(45 + difficulty * 5 + (newLoad - 50) * 0.5)));
    
    // Save to backend
    try {
        const response = await fetch(`${API_URL}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: subject,
                duration: duration,
                difficulty: difficulty,
                task_type: taskType,
                load_impact: newLoad,
                hrv_impact: newHRV,
                stress_impact: newStress
            })
        });
        
        if (response.ok) {
            console.log('✅ Session saved to backend!');
            
            // Calculate and save switch cost
            const switchHistory = document.getElementById('switchHistory');
            const lastSubject = switchHistory?.querySelector('.switch-event:first-child span:first-child')?.textContent;
            if (lastSubject && lastSubject !== subject) {
                const cost = Math.floor(Math.random() * 15) + 8;
                await fetch(`${API_URL}/switch-cost`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from_subject: lastSubject,
                        to_subject: subject,
                        cost_percentage: cost
                    })
                });
            }
        } else {
            console.log('⚠️ Backend save returned:', response.status);
        }
    } catch (error) {
        console.error('❌ Backend save error:', error);
        alert('⚠️ Could not save to backend. Check if server is running on port 3000');
    }
    
    // Update UI
    currentLoad = newLoad;
    currentHRV = newHRV;
    currentStress = newStress;
    
    document.getElementById('loadScore').innerHTML = `${newLoad}<span class="summary-unit">/100</span>`;
    document.getElementById('loadFill').style.width = `${newLoad}%`;
    
    const currentTotalMinutes = currentStats.total_minutes || 0;
    const newTotalHours = ((currentTotalMinutes + duration) / 60).toFixed(1);
    document.getElementById('studyTime').innerHTML = `${newTotalHours}<span class="summary-unit">hrs</span>`;
    
    document.getElementById('switchCount').innerText = (currentStats.total_switches || 0) + 1;
    
    const fatigueLevel = newLoad > 70 ? 'High' : newLoad > 45 ? 'Medium' : 'Low';
    document.getElementById('fatigueLevel').innerText = fatigueLevel;
    document.getElementById('routingLoad').textContent = `${newLoad}%`;
    
    // Update chart
    if (loadChart) {
        const currentData = loadChart.data.datasets[0].data;
        const newData = [...currentData.slice(1), newLoad];
        loadChart.data.datasets[0].data = newData;
        loadChart.update();
    }
    
    // Update HRV display
    document.getElementById('hrvValue').innerHTML = `${newHRV}<span class="unit"> ms</span>`;
    document.getElementById('hrvFill').style.width = `${Math.min(100, newHRV)}%`;
    document.getElementById('stressIndex').innerHTML = `${newStress}<span class="unit"> /100</span>`;
    updateHRVStatus(newHRV);
    
    // Update insights
    const insightsPanel = document.getElementById('insightsPanel');
    if (insightsPanel) {
        insightsPanel.innerHTML = `
            <div class="insight-item"><div class="insight-icon">add</div><div class="insight-text">Added <strong>${subject}</strong> — ${duration}min — difficulty ${difficulty}</div></div>
            <div class="insight-item"><div class="insight-icon">!</div><div class="insight-text">Load now <strong>${newLoad}%</strong> — ${newLoad > 75 ? 'take a break' : 'within safe range'}</div></div>
            <div class="insight-item"><div class="insight-icon">dd</div><div class="insight-text">Decision density: <strong>${(currentStats.decision_density || 0) + 8}</strong> today</div></div>
        `;
    }
    
    // Check shield activation
    if (newLoad >= shieldThreshold && !shieldActive) {
        await toggleShield();
    }
    
    // Show break popup if needed
    const breakPopup = document.getElementById('breakPopup');
    if (breakPopup) breakPopup.style.display = newLoad > 75 ? 'block' : 'none';
    
    // Update burnout advice
    const burnoutAdvice = document.getElementById('burnoutAdvice');
    if (burnoutAdvice) {
        burnoutAdvice.textContent = newLoad > 70 
            ? `Adding ${subject} raised load to ${newLoad}%. Strongly recommend a break before your next session.`
            : `Adding ${subject} raised load to ${newLoad}%. You still have capacity for more work.`;
    }
    
    // Reload all data to sync
    await loadAllData();
    
    // Navigate back to dashboard
    showDashboard();
}

// Toggle shield with backend sync
async function toggleShield() {
    shieldActive = !shieldActive;
    
    try {
        await fetch(`${API_URL}/shield`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                shieldActive: shieldActive, 
                autoShield: true,
                shieldThreshold: shieldThreshold
            })
        });
    } catch (error) {
        console.error('Could not sync shield to backend:', error);
    }
    
    updateShieldUI();
}

// Recovery timer
let rxInterval;
function startRecoveryTimer(cardId, seconds) {
    clearInterval(rxInterval);
    let remaining = seconds;
    const el = document.querySelector(`#${cardId} .recovery-timer`);
    if (!el) return;
    
    rxInterval = setInterval(async () => {
        remaining--;
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = `${m}:${String(s).padStart(2, '0')}`;
        
        if (remaining <= 0) {
            clearInterval(rxInterval);
            el.textContent = 'Done ✓';
            el.style.color = 'var(--success)';
            
            // Record recovery completion
            try {
                await fetch(`${API_URL}/recovery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recovery_type: cardId.replace('rx', '').toLowerCase(),
                        duration_seconds: seconds,
                        load_before: currentLoad,
                        load_after: Math.max(20, currentLoad - 15)
                    })
                });
            } catch (error) {
                console.error('Error recording recovery:', error);
            }
        }
    }, 1000);
}

// Recovery card click handlers
document.querySelectorAll('.recovery-card').forEach(card => {
    card.addEventListener('click', async function() {
        document.querySelectorAll('.recovery-card').forEach(c => c.classList.remove('active-rx'));
        this.classList.add('active-rx');
        
        const loadValue = currentLoad;
        try {
            const response = await fetch(`${API_URL}/recovery/${loadValue}`);
            const recovery = await response.json();
            
            const titleElem = this.querySelector('.recovery-title');
            const descElem = this.querySelector('.recovery-desc');
            const timerElem = this.querySelector('.recovery-timer');
            
            if (titleElem) titleElem.textContent = recovery.title;
            if (descElem) descElem.textContent = recovery.description;
            if (timerElem) {
                const mins = Math.floor(recovery.duration_seconds / 60);
                const secs = recovery.duration_seconds % 60;
                timerElem.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
                startRecoveryTimer(this.id, recovery.duration_seconds);
            }
        } catch (error) {
            console.error('Error loading recovery:', error);
            const timerText = this.querySelector('.recovery-timer')?.textContent || '5:00';
            const parts = timerText.split(':');
            const secs = parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
            if (secs > 0 && this.id) startRecoveryTimer(this.id, secs);
        }
    });
});

// Set default values when backend unavailable
function setDefaultValues() {
    document.getElementById('loadScore').innerHTML = `35<span class="summary-unit">/100</span>`;
    document.getElementById('loadFill').style.width = '35%';
    document.getElementById('studyTime').innerHTML = `0<span class="summary-unit">hrs</span>`;
    document.getElementById('switchCount').innerText = '0';
    document.getElementById('fatigueLevel').innerText = 'Low';
    document.getElementById('routingLoad').textContent = '35%';
    document.getElementById('totalSwitchCost').textContent = '+0%';
    document.getElementById('hrvValue').innerHTML = `58<span class="unit"> ms</span>`;
    document.getElementById('hrvFill').style.width = '58%';
    document.getElementById('stressIndex').innerHTML = `45<span class="unit"> /100</span>`;
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('landing').style.display !== 'none') {
        // On landing page, don't auto-load
        return;
    }
    loadAllData();
});

// Make functions global
window.showDashboard = showDashboard;
window.showTaskForm = showTaskForm;
window.toggleShield = toggleShield;
window.addStudySession = addStudySession;

console.log('✅ app.js loaded - fully backend connected');