let state = {
  currentUser: null,
  isAdmin: false,
  currentView: 'dashboard',
  selectedWeek: getMonday(new Date()),
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

function getProgressKey(supId, actIdx, date) {
  const d = date || new Date();
  return `${supId}::${actIdx}::${d.toISOString().slice(0,10)}`;
}

function isDeptDone(supId, actIdx, dept, date) {
  const key = getProgressKey(supId, actIdx, date);
  return state.progress[key] && state.progress[key].includes(dept);
}

function isDeptDoneGlobal(supId, actIdx, dept) {
  for (const key of Object.keys(state.progress)) {
    if (key.startsWith(`${supId}::${actIdx}::`) && state.progress[key].includes(dept)) return true;
  }
  return false;
}

function toggleDept(supId, actIdx, dept, date) {
  const key = getProgressKey(supId, actIdx, date);
  if (!state.progress[key]) state.progress[key] = [];
  const idx = state.progress[key].indexOf(dept);
  if (idx >= 0) state.progress[key].splice(idx, 1);
  else state.progress[key].push(dept);
  if (state.progress[key].length === 0) delete state.progress[key];
  saveState();
}

function getActPendingDepts(actIdx) {
  return ACTIVITIES[actIdx].pending;
}

function getActProgress(supId, actIdx) {
  const pending = ACTIVITIES[actIdx].pending;
  const preDone = ACTIVITIES[actIdx].done;
  let doneCount = preDone.length;
  for (const d of pending) {
    if (isDeptDoneGlobal(supId, actIdx, d)) doneCount++;
  }
  return { total: pending.length + preDone.length, done: doneCount, pending: pending };
}

function getAllProgress(supId) {
  const indices = SUPERVISOR_ACTIVITIES[supId] || [];
  let total = 0, done = 0;
  for (const idx of indices) {
    const p = getActProgress(supId, idx);
    total += p.total;
    done += p.done;
  }
  return { done, total };
}

function getDeptsForDate(actIdx, date) {
  const dStr = date.toISOString().slice(0, 10);
  return ACTIVITIES[actIdx].schedule[dStr] || [];
}

function getWeekProgressAll(supId) {
  const dates = getWeekDates(state.selectedWeek);
  const indices = SUPERVISOR_ACTIVITIES[supId] || [];
  const result = [];
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    const dayEntries = [];
    let totalAct = 0, doneAct = 0;
    for (let i = 0; i < 5; i++) {
      const date = dates[i];
      const depts = getDeptsForDate(idx, date);
      if (depts.length === 0) continue;
      const doneDepts = depts.filter(d => isDeptDoneGlobal(supId, idx, d));
      dayEntries.push({ dayIdx: i, depts, doneDepts });
      totalAct += depts.length;
      doneAct += doneDepts.length;
    }
    if (totalAct === 0) continue;
    result.push({
      idx, name: act.name, responsable: act.responsable,
      dayEntries, totalAct, doneAct,
      allDone: totalAct > 0 && doneAct === totalAct
    });
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
      state.isAdmin = parsed.isAdmin || false;
      state.progress = parsed.progress || {};
      if (parsed.selectedWeek) state.selectedWeek = new Date(parsed.selectedWeek);
    }
  } catch (e) {}
}

function saveState() {
  try {
    localStorage.setItem('avance2-state', JSON.stringify({
      currentUser: state.currentUser,
      isAdmin: state.isAdmin,
      progress: state.progress,
      selectedWeek: state.selectedWeek.toISOString()
    }));
  } catch (e) {}
}

// ===================== RENDER =====================

function render() {
  try {
    updateHeader();
    if (!state.currentUser) { renderLogin(); return; }
    const nav = document.getElementById('nav-supervisor');
    const admNav = document.getElementById('nav-admin');
    if (nav) nav.style.display = state.isAdmin ? 'none' : 'grid';
    if (admNav) admNav.style.display = state.isAdmin ? 'grid' : 'none';
    if (state.isAdmin) {
      renderAdminReport();
    } else {
      switch (state.currentView) {
        case 'dashboard': renderDashboard(); break;
        case 'week': renderWeek(); break;
        case 'activities': renderActivities(); break;
        case 'export': renderExport(); break;
        default: state.currentView = 'dashboard'; renderDashboard(); break;
      }
    }
    updateNav();
  } catch (e) {
    console.error('Render error:', e);
  }
}

function renderLogin() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const nav = document.getElementById('nav-supervisor');
  const admNav = document.getElementById('nav-admin');
  if (nav) nav.style.display = 'none';
  if (admNav) admNav.style.display = 'none';
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
      state.isAdmin = false;
      state.currentView = 'dashboard';
      saveState();
      render();
    });
    grid.appendChild(btn);
  }
  const adminBtn = document.createElement('button');
  adminBtn.className = 'login-btn';
  adminBtn.style.cssText = 'grid-column:1/-1;margin-top:8px;border-color:var(--primary);color:var(--primary)';
  adminBtn.textContent = '🔑 Administrador';
  adminBtn.addEventListener('click', () => {
    const pwd = prompt('Contraseña de administrador:');
    if (pwd === ADMIN_PASSWORD) {
      state.currentUser = ADMIN.id;
      state.isAdmin = true;
      saveState();
      render();
    } else if (pwd !== null) {
      showToast('Contraseña incorrecta', 'error');
    }
  });
  grid.appendChild(adminBtn);
}

function updateHeader() {
  const el = document.getElementById('header-supervisor');
  const title = document.getElementById('header-title');
  if (state.currentUser) {
    if (state.isAdmin) {
      el.textContent = 'Administrador';
      title.textContent = 'Panel General';
    } else {
      const sup = SUPERVISORS.find(s => s.id === state.currentUser);
      el.textContent = sup ? sup.name : '';
      title.textContent = 'Avance Terminaciones';
    }
  } else {
    el.textContent = 'Orompello Centro';
    title.textContent = 'Avance Terminaciones';
  }
}

function updateNav() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  let map;
  if (state.isAdmin) {
    map = { 'admin-report': 'nav-admin-report' };
  } else {
    map = { dashboard: 'nav-dashboard', week: 'nav-week', activities: 'nav-activities', export: 'nav-export' };
  }
  const el = document.getElementById(map[state.currentView]);
  if (el) el.classList.add('active');
}

function navigate(view) {
  state.currentView = view;
  render();
}

function logout() {
  state.currentUser = null;
  state.isAdmin = false;
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
  const p = getAllProgress(state.currentUser);
  const today = new Date();
  const todayIdx = getTodayWeekdayIndex();

  let html = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;color:var(--text2)">${sup.name}</div>
      <div style="font-size:20px;font-weight:700">Resumen General</div>
      <div style="font-size:13px;color:var(--text2)">${formatDateFull(today)}</div>
    </div>
    <div class="stats-row">
      <div class="stat">
        <div class="stat-num">${p.done}</div>
        <div class="stat-label">Completadas</div>
      </div>
      <div class="stat">
        <div class="stat-num">${p.total - p.done}</div>
        <div class="stat-label">Pendientes</div>
      </div>
      <div class="stat">
        <div class="stat-num">${p.total ? Math.round(p.done/p.total*100) : 0}%</div>
        <div class="stat-label">Avance</div>
      </div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${p.total ? (p.done/p.total*100) : 0}%"></div>
    </div>`;

  const indices = SUPERVISOR_ACTIVITIES[state.currentUser] || [];
  const byComp = {};
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    const comp = act.responsable || 'Sin empresa';
    if (!byComp[comp]) byComp[comp] = [];
    byComp[comp].push(idx);
  }

  for (const [comp, idxs] of Object.entries(byComp)) {
    let compTotal = 0, compDone = 0;
    for (const idx of idxs) {
      const p2 = getActProgress(state.currentUser, idx);
      compTotal += p2.total;
      compDone += p2.done;
    }
    const cpct = compTotal ? Math.round(compDone/compTotal*100) : 0;
    html += `<div style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px">
        <span>${comp}</span>
        <span style="color:${cpct === 100 ? 'var(--success)' : 'var(--warning)'}">${compDone}/${compTotal}</span>
      </div>
      <div class="progress-bar" style="height:4px">
        <div class="progress-fill" style="width:${cpct}%"></div>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

// ===================== WEEK VIEW =====================

function renderWeek() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-week').classList.add('active');
  state.currentView = 'week';
  const container = document.getElementById('week-content');
  const sup = SUPERVISORS.find(s => s.id === state.currentUser);
  const dates = getWeekDates(state.selectedWeek);
  const todayStr = new Date().toISOString().slice(0,10);
  const todayDow = new Date().getDay();
  const weekDowMap = [1, 2, 3, 4, 5];

  const weekData = getWeekProgressAll(state.currentUser);
  const dayTotals = [{done:0,total:0},{done:0,total:0},{done:0,total:0},{done:0,total:0},{done:0,total:0}];
  for (const entry of weekData) {
    for (const de of entry.dayEntries) {
      dayTotals[de.dayIdx].total += de.depts.length;
      dayTotals[de.dayIdx].done += de.doneDepts.length;
    }
  }

  // Day summary row
  let daySummaryHtml = '<div class="week-row" style="font-size:11px;font-weight:600"><div style="color:var(--text2)">⚡ Día</div>';
  for (let i = 0; i < 5; i++) {
    const t = dayTotals[i];
    const pct = t.total ? Math.round(t.done/t.total*100) : 0;
    const allOk = t.total > 0 && pct === 100;
    const someOk = t.total > 0 && pct > 0 && !allOk;
    const isToday = weekDowMap[i] === todayDow;
    let color;
    if (allOk) color = 'var(--success)';
    else if (someOk) color = 'var(--warning)';
    else if (t.total > 0) color = 'var(--danger)';
    else color = 'var(--text2)';
    daySummaryHtml += `<div style="text-align:center;color:${color}${isToday ? ';font-weight:700' : ''}">${t.total > 0 ? pct + '%' : '—'}</div>`;
  }
  daySummaryHtml += '</div>';

  let weekHeaderHtml = '<div class="week-header"><div>Actividad</div>';
  for (let i = 0; i < 5; i++) {
    const isTodayHead = weekDowMap[i] === todayDow;
    const dayComplete = dayTotals[i].total > 0 && dayTotals[i].done === dayTotals[i].total;
    const dayHasWork = dayTotals[i].total > 0;
    let headCls = '';
    if (isTodayHead) headCls = 'today-header';
    else if (dayHasWork && !dayComplete) headCls = 'incomplete-header';
    weekHeaderHtml += `<div${headCls ? ' class="' + headCls + '"' : ''}>${WEEKDAY_LABELS[WEEKDAYS[i]]} ${dates[i].getDate()}</div>`;
  }
  weekHeaderHtml += '</div>';

  let html = `
    <div class="week-selector">
      <button onclick="shiftWeek(-1)">◀</button>
      <span>Semana del ${formatDate(dates[0])}</span>
      <button onclick="shiftWeek(1)">▶</button>
    </div>
    ${weekHeaderHtml}
    ${daySummaryHtml}
  `;

  let lastComp = '';
  for (const entry of weekData) {
    if (entry.responsable !== lastComp) {
      html += `<div style="margin-top:12px;margin-bottom:4px;font-weight:600;font-size:13px;color:var(--text2)">${entry.responsable}</div>`;
      lastComp = entry.responsable;
    }
    html += `<div class="week-row"><div class="act-name">${entry.name}</div>`;
    for (let i = 0; i < 5; i++) {
      const de = entry.dayEntries.find(d => d.dayIdx === i);
      const date = dates[i];
      const dateStr = date.toISOString().slice(0,10);
      const isToday = dateStr === todayStr;
      if (de) {
        const allDone = de.doneDepts.length === de.depts.length;
        const someDone = de.doneDepts.length > 0;
        let cls = 'day-cell';
        if (allDone) cls += ' done';
        else if (someDone) cls += ' partial';
        const dayAllDone = dayTotals[i].total > 0 && dayTotals[i].done === dayTotals[i].total;
        if (!dayAllDone && dayTotals[i].total > 0) cls += ' day-incomplete';
        if (isToday) cls += ' today';
        if (de.depts.length > 0) cls += ' has-dept';
        html += `<div class="${cls}" onclick="showDayDetail(${entry.idx},${i})">
          ${allDone ? '✓' : `${de.doneDepts.length}/${de.depts.length}`}
        </div>`;
      } else {
        const cls = 'day-cell' + (isToday ? ' today' : '');
        html += `<div class="${cls}">—</div>`;
      }
    }
    html += `</div>`;
  }

  if (weekData.length === 0) {
    html += `<div class="card" style="text-align:center;padding:24px;color:var(--text2);margin-top:16px">No hay actividades con departamentos pendientes esta semana.</div>`;
  }

  container.innerHTML = html;
}

function shiftWeek(dir) {
  const newDate = new Date(state.selectedWeek);
  newDate.setDate(newDate.getDate() + dir * 7);
  state.selectedWeek = newDate;
  saveState();
  renderWeek();
}

function showDayDetail(actIdx, dayIdx) {
  const dates = getWeekDates(state.selectedWeek);
  const date = dates[dayIdx];
  const act = ACTIVITIES[actIdx];
  const depts = getDeptsForDate(actIdx, date);
  if (depts.length === 0) return;
  const dayLabel = date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const supId = state.currentUser;

  let html = `<div class="modal-overlay open" id="day-modal" onclick="closeDayModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <h3>${act.name}</h3>
      <p style="color:var(--text2);margin-bottom:12px">${dayLabel}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:6px" id="day-dept-grid">`;
  for (const d of depts) {
    const done = isDeptDoneGlobal(supId, actIdx, d);
    html += `<div class="dept-btn ${done ? 'done' : ''}" data-dept="${d}" onclick="handleDayDeptClick(${actIdx},'${esc(d)}')" title="${getDeptLabel(d)}">${d}</div>`;
  }
  html += `</div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="closeDayModal()">Cerrar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function handleDayDeptClick(actIdx, dept) {
  toggleDept(state.currentUser, actIdx, dept, new Date());
  const btn = document.querySelector(`#day-dept-grid .dept-btn[data-dept="${dept}"]`);
  if (btn) btn.classList.toggle('done');
}

function closeDayModal(e) {
  const modal = document.getElementById('day-modal');
  if (modal) modal.remove();
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
      const p = getActProgress(state.currentUser, idx);
      const pending = act.pending.filter(d => !isDeptDoneGlobal(state.currentUser, idx, d));
      const isComplete = pending.length === 0;
      const pct = p.total ? Math.round(p.done/p.total*100) : 0;

      html += `<div class="activity-item" style="border-left:3px solid ${isComplete ? 'var(--success)' : 'var(--warning)'}">
        <div class="activity-header" onclick="toggleActivity(this)">
          <span class="activity-name">${act.name}</span>
          <span style="display:flex;align-items:center;gap:8px">
            <span class="activity-badge ${isComplete ? 'badge-done' : 'badge-pending'}">${p.done}/${p.total}</span>
            <span style="font-size:12px;color:var(--text2)">▼</span>
          </span>
        </div>
        <div class="dept-grid">
          <div style="display:flex;flex-wrap:wrap;gap:4px">`;
      for (const d of act.done) {
        html += `<div class="dept-btn done" title="${getDeptLabel(d)}">${d}</div>`;
      }
      for (const d of act.pending) {
        const ok = isDeptDoneGlobal(state.currentUser, idx, d);
        html += `<div class="dept-btn ${ok ? 'done' : ''}" onclick="handleActDeptClick(${idx},'${esc(d)}')" title="${getDeptLabel(d)}">${d}</div>`;
      }
      html += `</div></div></div>`;
    }
  }

  container.innerHTML = html;
}

function handleActDeptClick(actIdx, dept) {
  toggleDept(state.currentUser, actIdx, dept, new Date());
  renderActivities();
}

function toggleActivity(header) {
  const grid = header.nextElementSibling;
  if (grid) grid.classList.toggle('open');
}

// ===================== ADMIN =====================

function renderAdminReport() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-admin').classList.add('active');
  state.currentView = 'admin-report';
  const container = document.getElementById('admin-content');

  let html = `<div style="margin-bottom:16px">
      <h2>Panel de Administración</h2>
      <p style="color:var(--text2);font-size:13px">Reporte de cumplimiento por supervisor.</p>
      <div style="font-size:13px;color:var(--text2)">${formatDateFull(new Date())}</div>
    </div>`;

  let totalAll = 0, doneAll = 0;
  const reports = [];
  for (const sup of SUPERVISORS) {
    const p = getAllProgress(sup.id);
    totalAll += p.total;
    doneAll += p.done;
    const pct = p.total ? Math.round(p.done/p.total*100) : 0;
    reports.push({ sup, ...p, pct });
  }

  html += `<div class="stats-row">
      <div class="stat">
        <div class="stat-num">${doneAll}</div>
        <div class="stat-label">Total Hecho</div>
      </div>
      <div class="stat">
        <div class="stat-num">${totalAll}</div>
        <div class="stat-label">Total Prog.</div>
      </div>
      <div class="stat">
        <div class="stat-num">${totalAll ? Math.round(doneAll/totalAll*100) : 0}%</div>
        <div class="stat-label">Avance Gral.</div>
      </div>
    </div>`;

  for (const r of reports) {
    const isGood = r.pct >= 80;
    const isMid = r.pct >= 50;
    html += `<div class="card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-weight:700;font-size:15px">${r.sup.name}</div>
        <div style="font-size:13px;font-weight:600;color:${isGood ? 'var(--success)' : isMid ? 'var(--warning)' : 'var(--danger)'}">${r.pct}% · ${r.done}/${r.total}</div>
      </div>
      <div class="progress-bar" style="height:4px">
        <div class="progress-fill" style="width:${r.pct}%;background:${isGood ? 'var(--success)' : isMid ? 'var(--warning)' : 'var(--danger)'}"></div>
      </div>`;

    // Find pending activities for this supervisor
    const indices = SUPERVISOR_ACTIVITIES[r.sup.id] || [];
    const pendingList = [];
    for (const idx of indices) {
      const act = ACTIVITIES[idx];
      const pending = act.pending.filter(d => !isDeptDoneGlobal(r.sup.id, idx, d));
      if (pending.length > 0) {
        pendingList.push({ name: act.name, responsable: act.responsable, count: act.pending.length - pending.length, total: act.pending.length, pending });
      }
    }
    if (pendingList.length > 0) {
      html += `<div style="margin-top:10px;font-size:13px;font-weight:600;color:var(--danger)">⏳ Actividades Pendientes:</div>`;
      let lastComp = '';
      for (const p of pendingList) {
        if (p.responsable !== lastComp) {
          html += `<div style="font-size:12px;color:var(--text2);margin-top:4px">${p.responsable}</div>`;
          lastComp = p.responsable;
        }
        html += `<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.03)">
          <span>${p.name}</span>
          <span style="color:var(--danger);font-weight:600">${p.count}/${p.total}</span>
        </div>`;
      }
    } else {
      html += `<div style="margin-top:8px;font-size:13px;color:var(--success)">✅ Todas las actividades completadas</div>`;
    }
    html += `</div>`;
  }

  html += `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn btn-secondary" onclick="exportAdminExcel()">📋 Exportar Excel</button>
    <button class="btn btn-secondary" onclick="document.getElementById('admin-import-file').click()">📥 Importar progreso</button>
    <input type="file" id="admin-import-file" accept=".json" onchange="importAdminData(event)" style="display:none">
  </div>`;

  container.innerHTML = html;
}

function exportAdminExcel() {
  loadXLSX(() => {
    const wb = XLSX.utils.book_new();
    const wsData = [['Supervisor', 'Empresa', 'Actividad', 'Hecho', 'Pendiente', 'Total', '% Avance']];
    for (const sup of SUPERVISORS) {
      const indices = SUPERVISOR_ACTIVITIES[sup.id] || [];
      for (const idx of indices) {
        const act = ACTIVITIES[idx];
        const p = getActProgress(sup.id, idx);
        const pending = act.pending.filter(d => !isDeptDoneGlobal(sup.id, idx, d));
        const pct = p.total ? Math.round((p.done)/p.total*100) : 0;
        wsData.push([sup.name, act.responsable, act.name, p.done, pending.length, p.total, pct + '%']);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:20},{wch:22},{wch:38},{wch:8},{wch:10},{wch:8},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `reporte-terminaciones-${new Date().toISOString().slice(0,10)}.xlsx`);
  });
}

function loadXLSX(cb) {
  if (typeof XLSX !== 'undefined') { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  s.onload = cb;
  s.onerror = () => { showToast('Error al cargar librería Excel.', 'error'); };
  document.head.appendChild(s);
}

function importAdminData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.progress) {
        Object.assign(state.progress, data.progress);
        saveState();
        render();
        showToast('Datos importados correctamente.', 'success');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ===================== EXPORT =====================

function renderExport() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-export').classList.add('active');
  state.currentView = 'export';
  const container = document.getElementById('export-content');
  const p = getAllProgress(state.currentUser);
  container.innerHTML = `
    <div style="margin-bottom:16px">
      <h2>Exportar / Importar</h2>
      <p style="color:var(--text2);font-size:13px">Respalda o transfiere tu progreso.</p>
    </div>
    <div class="card">
      <div class="card-title">Progreso Total</div>
      <div class="card-value">${p.done} <small>/ ${p.total} actividades</small></div>
      <div class="progress-bar" style="margin-top:8px">
        <div class="progress-fill" style="width:${p.total ? (p.done/p.total*100) : 0}%"></div>
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
window.handleActDeptClick = handleActDeptClick;
window.shiftWeek = shiftWeek;
window.showDayDetail = showDayDetail;
window.handleDayDeptClick = handleDayDeptClick;
window.closeDayModal = closeDayModal;
window.exportData = exportData;
window.importData = importData;
window.resetData = resetData;
window.exportAdminExcel = exportAdminExcel;

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
