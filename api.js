// API Configuration
const API_URL = 'http://localhost:3000/api';

// Store current load value
let currentLoad = 68;

// Initialize data from backend
async function initBackend() {
  try {
    // Load shield settings
    const shieldRes = await fetch(`${API_URL}/shield`);
    const shieldData = await shieldRes.json();
    if (shieldData.shieldActive !== undefined) {
      shieldActive = shieldData.shieldActive;
      updateShieldUI();
    }
    
    // Load weekly stats for chart
    const weeklyRes = await fetch(`${API_URL}/stats/weekly`);
    const weeklyData = await weeklyRes.json();
    if (weeklyData && loadChart) {
      loadChart.data.datasets[0].data = weeklyData;
      loadChart.update();
    }
    
    console.log('Connected to backend!');
  } catch (error) {
    console.log('Backend not running, using local mode');
  }
}

// Modified addStudySession with backend save
async function addStudySession() {
  const subject = document.getElementById('subjectName')?.value || 'Unknown';
  const duration = parseInt(document.getElementById('duration')?.value) || 60;
  const difficulty = parseInt(document.getElementById('difficulty')?.value) || 3;
  const taskType = document.getElementById('taskType')?.value || 'Creative';
  const newLoad = Math.min(95, 68 + difficulty * 4 + Math.floor(duration / 30) * 3);

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
        load_impact: newLoad
      })
    });
    const data = await response.json();
    console.log('Saved to backend:', data);
  } catch (error) {
    console.log('Backend not available, saving locally only');
  }

  // Update UI (keep your existing UI update code)
  document.getElementById('loadScore').innerHTML = `${newLoad}<span class="summary-unit">/100</span>`;
  document.getElementById('loadFill').style.width = `${newLoad}%`;
  document.getElementById('studyTime').innerHTML = '5.1<span class="summary-unit">hrs</span>';
  document.getElementById('switchCount').innerText = '22';
  document.getElementById('fatigueLevel').innerText = newLoad > 75 ? 'High' : 'Medium';
  document.getElementById('routingLoad').textContent = `${newLoad}%`;

  if (loadChart) {
    loadChart.data.datasets[0].data = [48, 62, 71, 55, 78, newLoad, 72];
    loadChart.update();
  }

  document.getElementById('insightsPanel').innerHTML = `
    <div class="insight-item"><div class="insight-icon">add</div><div class="insight-text">Added <strong>${subject}</strong> — ${duration}min — difficulty ${difficulty}</div></div>
    <div class="insight-item"><div class="insight-icon">!</div><div class="insight-text">Load now <strong>${newLoad}%</strong> — ${newLoad > 75 ? 'take a break' : 'within safe range'}</div></div>
    <div class="insight-item"><div class="insight-icon">dd</div><div class="insight-text">Decision density: <strong>51</strong> today</div></div>
  `;

  const newHRV = Math.max(20, 42 - difficulty * 3);
  document.getElementById('hrvValue').innerHTML = `${newHRV}<span class="unit"> ms</span>`;
  document.getElementById('hrvFill').style.width = `${newHRV}%`;
  document.getElementById('stressIndex').innerHTML = `${Math.min(95, 67 + difficulty * 5)}<span class="unit"> /100</span>`;

  const hrvStatus = document.getElementById('hrvStatus');
  if (newHRV < 30) { 
    hrvStatus.textContent = '▸ Critical — high physiological stress'; 
    hrvStatus.className = 'bio-status bad'; 
  } else if (newHRV < 45) { 
    hrvStatus.textContent = '▸ Below optimal (50+ ms recommended)'; 
    hrvStatus.className = 'bio-status warn'; 
  } else { 
    hrvStatus.textContent = '▸ Healthy range'; 
    hrvStatus.className = 'bio-status good'; 
  }

  const taskItems = document.querySelectorAll('.task-item');
  taskItems.forEach(item => {
    const type = item.querySelector('.task-type');
    const match = item.querySelector('.energy-match');
    if (!type || !match) return;
    if (newLoad > 70 && (type.classList.contains('analytical') || type.classList.contains('creative'))) {
      item.classList.add('disabled');
      match.className = 'energy-match blocked';
      match.textContent = 'blocked';
    } else {
      item.classList.remove('disabled');
      match.className = 'energy-match recommended';
      match.textContent = '✓ recommended';
    }
  });

  const switchHistory = document.getElementById('switchHistory');
  const prevSubject = switchHistory.querySelector('.switch-event:last-child span:nth-child(3)')?.textContent || 'Math';
  const cost = Math.floor(Math.random() * 15) + 5;
  switchHistory.innerHTML += `<div class="switch-event"><span>${prevSubject}</span><span class="switch-arrow">→</span><span>${subject}</span><span class="switch-cost">+${cost}%</span></div>`;
  const totalCost = parseInt(document.getElementById('totalSwitchCost').textContent) + cost;
  document.getElementById('totalSwitchCost').textContent = `+${totalCost}%`;

  document.getElementById('burnoutAdvice').textContent =
    `Adding ${subject} raised predicted load to ${newLoad}%. ${newLoad > 75 ? 'Strongly recommend a 15-min break before next session.' : 'You still have headroom — continue with lighter tasks.'}`;

  if (newLoad >= 75 && !shieldActive) toggleShield();

  document.getElementById('breakPopup').style.display = newLoad > 75 ? 'block' : 'none';

  showDashboard();
}

// Modified toggleShield with backend sync
const originalToggleShield = toggleShield;
async function toggleShield() {
  shieldActive = !shieldActive;
  const toggle = document.getElementById('shieldToggle');
  const status = document.getElementById('shieldStatusText');
  const desc = document.getElementById('shieldDesc');
  const items = document.querySelectorAll('.blocked-item');

  toggle.classList.toggle('active', shieldActive);
  status.textContent = shieldActive ? 'Shield Active — Blocking Distractions' : 'Shield Inactive';
  status.style.color = shieldActive ? 'var(--danger)' : 'var(--text)';
  desc.textContent = shieldActive
    ? 'All listed sites are currently blocked. Focus mode engaged.'
    : 'Your load is below threshold — shield is standby.';
  items.forEach(i => i.classList.toggle('active-block', shieldActive));

  // Sync to backend
  try {
    await fetch(`${API_URL}/shield`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shieldActive: shieldActive, autoShield: true })
    });
  } catch (error) {
    console.log('Could not sync shield to backend');
  }
}

// Override the global functions
window.toggleShield = toggleShield;
window.addStudySession = addStudySession;

// Start backend connection when page loads
document.addEventListener('DOMContentLoaded', () => {
  initBackend();
});