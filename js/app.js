let state = {
  currentUser: null,
  currentView: 'dashboard',
  progress: {}
};

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, 3000);
}

// ===================== PROGRESS =====================

function getProgressKey(activityIdx, dept) {
  return `${activityIdx}::${dept}`;
}

function isDeptDone(activityIdx, dept) {
  return !!state.progress[getProgressKey(activityIdx, dept)];
}

function toggleDept(activityIdx, dept) {
  const key = getProgressKey(activityIdx, dept);
  if (state.progress[key]) {
    delete state.progress[key];
  } else {
    state.progress[key] = true;
  }
  saveState();
}

function getSupervisorProgress(supId) {
  const indices = SUPERVISOR_ACTIVITIES[supId] || [];
  let pending = 0, done = 0, already = 0;
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    already += act.done.length;
    for (const d of act.pending) {
      pending++;
      if (isDeptDone(idx, d)) done++;
    }
  }
  return { pending, done, already, total: pending + already };
}

function getAllDeptProgress(supId) {
  const indices = SUPERVISOR_ACTIVITIES[supId] || [];
  const result = {};
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    const allDepts = [...act.pending, ...act.done];
    for (const d of allDepts) {
      if (!result[d]) result[d] = { total: 0, done: 0 };
      result[d].total++;
      if (isDeptDone(idx, d) || act.done.includes(d)) result[d].done++;
    }
  }
  return result;
}

// ===================== STATE =====================

function loadState() {
  try {
    const saved = localStorage.getItem('avance2-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.currentUser = parsed.currentUser || null;
      state.progress = parsed.progress || {};
    }
  } catch (e) {}
}

function saveState() {
  try {
    localStorage.setItem('avance2-state', JSON.stringify({
      currentUser: state.currentUser,
      progress: state.progress
    }));
  } catch (e) {}
}

// ===================== RENDER =====================

function render() {
  try {
    updateHeader();
    if (!state.currentUser) { renderLogin(); return; }
    const nav = document.getElementById('nav-supervisor');
    if (nav) nav.style.display = 'grid';
    switch (state.currentView) {
      case 'dashboard': renderDashboard(); break;
      case 'activities': renderActivities(); break;
      case 'export': renderExport(); break;
      default: state.currentView = 'dashboard'; renderDashboard(); break;
    }
    updateNav();
  } catch (e) {
    console.error('Render error:', e);
  }
}

function renderLogin() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const nav = document.getElementById('nav-supervisor');
  if (nav) nav.style.display = 'none';
  const screen = document.getElementById('screen-login');
  if (!screen) return;
  screen.classList.add('active');
  const grid = screen.querySelector('.login-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const sup of SUPERVISORS) {
    const btn = document.createElement('button');
    btn.className = 'login-btn';
    btn.textContent = sup.name;
    btn.addEventListener('click', () => {
      const pwd = prompt(`Contraseña para ${sup.name}:`);
      if (pwd === null) return;
      if (pwd !== sup.password) {
        showToast('Contraseña incorrecta', 'error');
        return;
      }
      state.currentUser = sup.id;
      state.currentView = 'dashboard';
      saveState();
      render();
    });
    grid.appendChild(btn);
  }
}

function updateHeader() {
  const el = document.getElementById('header-supervisor');
  const title = document.getElementById('header-title');
  if (state.currentUser) {
    const sup = SUPERVISORS.find(s => s.id === state.currentUser);
    el.textContent = sup ? sup.name : '';
    title.textContent = 'Avance Terminaciones';
  } else {
    el.textContent = 'Orompello Centro';
    title.textContent = 'Avance Terminaciones';
  }
}

function updateNav() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const map = { dashboard: 'nav-dashboard', activities: 'nav-activities', export: 'nav-export' };
  const el = document.getElementById(map[state.currentView]);
  if (el) el.classList.add('active');
}

function navigate(view) {
  state.currentView = view;
  render();
}

function logout() {
  state.currentUser = null;
  saveState();
  render();
}

// ===================== DASHBOARD =====================

function renderDashboard() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-dashboard').classList.add('active');
  state.currentView = 'dashboard';
  const container = document.getElementById('dashboard-content');
  const sup = SUPERVISORS.find(s => s.id === state.currentUser);
  const indices = SUPERVISOR_ACTIVITIES[state.currentUser] || [];
  const p = getSupervisorProgress(state.currentUser);
  const deptP = getAllDeptProgress(state.currentUser);
  const totalDepts = Object.keys(deptP).length;
  const doneDepts = Object.values(deptP).filter(d => d.done >= d.total).length;

  let html = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;color:var(--text2)">${sup.name}</div>
      <div style="font-size:20px;font-weight:700">Resumen General</div>
    </div>
    <div class="stats-row">
      <div class="stat">
        <div class="stat-num">${p.already + p.done}</div>
        <div class="stat-label">Completadas</div>
      </div>
      <div class="stat">
        <div class="stat-num">${p.pending - p.done}</div>
        <div class="stat-label">Pendientes</div>
      </div>
      <div class="stat">
        <div class="stat-num">${p.total ? Math.round((p.already+p.done)/p.total*100) : 0}%</div>
        <div class="stat-label">Avance</div>
      </div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${p.total ? ((p.already+p.done)/p.total*100) : 0}%"></div>
    </div>
    <div style="margin-top:16px;font-size:13px;color:var(--text2)">
      ${doneDepts}/${totalDepts} departamentos completos
    </div>`;

  // Activities by company
  const byComp = {};
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    const comp = act.responsable || 'Sin empresa';
    if (!byComp[comp]) byComp[comp] = [];
    byComp[comp].push(idx);
  }

  for (const [comp, idxs] of Object.entries(byComp)) {
    let compDone = 0, compAlready = 0, compPending = 0;
    for (const idx of idxs) {
      const act = ACTIVITIES[idx];
      compAlready += act.done.length;
      for (const d of act.pending) {
        compPending++;
        if (isDeptDone(idx, d)) compDone++;
      }
    }
    const total = compAlready + compPending;
    const pct = total ? Math.round((compAlready+compDone)/total*100) : 0;
    html += `<div style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px">
        <span>${comp}</span>
        <span style="color:${pct === 100 ? 'var(--success)' : 'var(--warning)'}">${compAlready+compDone}/${total}</span>
      </div>
      <div class="progress-bar" style="height:4px">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

// ===================== ACTIVITIES =====================

function renderActivities() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-activities').classList.add('active');
  state.currentView = 'activities';
  const container = document.getElementById('activities-content');
  const indices = SUPERVISOR_ACTIVITIES[state.currentUser] || [];

  let html = `<div style="margin-bottom:12px">
      <div style="font-size:20px;font-weight:700">Actividades</div>
      <div style="font-size:13px;color:var(--text2)">Toca cada depto para marcar como OK</div>
    </div>`;

  const byComp = {};
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    const comp = act.responsable || 'Sin empresa';
    if (!byComp[comp]) byComp[comp] = [];
    byComp[comp].push(idx);
  }

  for (const [comp, idxs] of Object.entries(byComp)) {
    html += `<div style="margin-top:12px;font-weight:600;font-size:14px;color:var(--text2)">${comp}</div>`;
    for (const idx of idxs) {
      const act = ACTIVITIES[idx];
      const pending = act.pending.filter(d => !isDeptDone(idx, d));
      const done = [...act.done, ...act.pending.filter(d => isDeptDone(idx, d))];
      const total = act.pending.length + act.done.length;
      const pct = total ? Math.round(done.length/total*100) : 0;
      const isComplete = pending.length === 0;

      html += `<div class="activity-item" style="border-left: 3px solid ${isComplete ? 'var(--success)' : 'var(--warning)'}">
        <div class="activity-header" onclick="toggleActivity(this)">
          <span class="activity-name">${act.name}</span>
          <span style="display:flex;align-items:center;gap:8px">
            <span class="activity-badge ${isComplete ? 'badge-done' : 'badge-pending'}">${done.length}/${total}</span>
            <span style="font-size:12px;color:var(--text2)">▼</span>
          </span>
        </div>
        <div class="dept-grid">
          <div style="display:flex;flex-wrap:wrap;gap:4px">`;
      for (const d of act.done) {
        html += `<div class="dept-btn done" title="${d}">${d} ✓</div>`;
      }
      for (const d of act.pending) {
        const ok = isDeptDone(idx, d);
        html += `<div class="dept-btn ${ok ? 'done' : ''}" onclick="handleDeptClick(${idx},'${esc(d)}')" title="${d}">${d}${ok ? ' ✓' : ''}</div>`;
      }
      html += `</div></div></div>`;
    }
  }

  container.innerHTML = html;
}

function handleDeptClick(activityIdx, dept) {
  toggleDept(activityIdx, dept);
  renderActivities();
}

function toggleActivity(header) {
  const grid = header.nextElementSibling;
  if (grid) grid.classList.toggle('open');
}

// ===================== EXPORT =====================

function renderExport() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-export').classList.add('active');
  state.currentView = 'export';
  const container = document.getElementById('export-content');
  const p = getSupervisorProgress(state.currentUser);
  container.innerHTML = `
    <div style="margin-bottom:16px">
      <h2>Exportar / Importar</h2>
      <p style="color:var(--text2);font-size:13px">Respalda o transfiere tu progreso.</p>
    </div>
    <div class="card">
      <div class="card-title">Progreso Total</div>
      <div class="card-value">${p.already + p.done} <small>/ ${p.total} actividades</small></div>
      <div class="progress-bar" style="margin-top:8px">
        <div class="progress-fill" style="width:${p.total ? ((p.already+p.done)/p.total*100) : 0}%"></div>
      </div>
    </div>
    <div class="export-actions">
      <button class="btn btn-primary" onclick="exportData()">📤 Exportar mis datos</button>
      <button class="btn btn-secondary" onclick="document.getElementById('import-file').click()">📥 Importar datos</button>
      <input type="file" id="import-file" accept=".json" onchange="importData(event)" style="display:none">
      <button class="btn btn-secondary" onclick="resetData()" style="color:var(--danger)">🗑️ Reiniciar mis datos</button>
    </div>`;
}

function exportData() {
  const data = { exportedAt: new Date().toISOString(), supervisor: state.currentUser, progress: state.progress };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `avance-${state.currentUser}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.progress) {
        if (data.supervisor && data.supervisor !== state.currentUser) {
          if (!confirm(`Datos de "${data.supervisor}". ¿Importar?`)) return;
        }
        Object.assign(state.progress, data.progress);
        saveState();
        render();
        showToast('Datos importados.', 'success');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetData() {
  if (confirm('¿Borrar todo el progreso registrado?')) {
    state.progress = {};
    saveState();
    render();
  }
}

// ===================== INIT =====================

window.render = render;
window.navigate = navigate;
window.logout = logout;
window.toggleActivity = toggleActivity;
window.handleDeptClick = handleDeptClick;
window.exportData = exportData;
window.importData = importData;
window.resetData = resetData;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const view = this.getAttribute('data-view');
      if (view) navigate(view);
    });
  });
  document.getElementById('btn-logout').addEventListener('click', logout);
  loadState();
  render();
});
