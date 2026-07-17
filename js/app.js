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

function getPendingFromBefore(supId, actIdx, weekStart) {
  const act = ACTIVITIES[actIdx];
  if (!act.schedule) return [];
  const startMs = weekStart.getTime();
  const result = [];
  for (const [dateStr, depts] of Object.entries(act.schedule)) {
    const d = new Date(dateStr + 'T12:00:00');
    if (d.getTime() < startMs) {
      for (const dept of depts) {
        if (!isDeptDoneGlobal(supId, actIdx, dept)) {
          result.push(dept);
        }
      }
    }
  }
  return result;
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

    // Reprogrammed from previous weeks -> show on Monday
    const pendingBefore = getPendingFromBefore(supId, idx, dates[0]);
    if (pendingBefore.length > 0) {
      const doneBefore = pendingBefore.filter(d => isDeptDoneGlobal(supId, idx, d));
      const monEntry = dayEntries.find(e => e.dayIdx === 0);
      if (monEntry) {
        monEntry.depts = [...pendingBefore, ...monEntry.depts];
        monEntry.doneDepts = [...doneBefore, ...monEntry.doneDepts];
        monEntry.reproCount = pendingBefore.length;
      } else {
        dayEntries.push({ dayIdx: 0, depts: pendingBefore, doneDepts: doneBefore, reproCount: pendingBefore.length });
      }
      totalAct += pendingBefore.length;
      doneAct += doneBefore.length;
    }

    if (totalAct === 0) continue;
    const pct = Math.round(doneAct / totalAct * 100);
    result.push({
      idx, name: act.name, responsable: act.responsable,
      dayEntries, totalAct, doneAct, pct,
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

  // Weekly average of activity percentages
  let weekPct = 0;
  if (weekData.length > 0) {
    let sum = 0;
    for (const e of weekData) sum += e.pct;
    weekPct = Math.round(sum / weekData.length);
  }

  let html = `
    <div class="week-selector">
      <button onclick="shiftWeek(-1)">◀</button>
      <span>Semana del ${formatDate(dates[0])}</span>
      <button onclick="shiftWeek(1)">▶</button>
    </div>
    <div class="card" style="margin:12px 0;text-align:center">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">${weekPct}% · ${weekData.length} actividades</div>
      <div class="progress-bar" style="height:4px">
        <div class="progress-fill" style="width:${weekPct}%;background:${weekPct === 100 ? 'var(--success)' : weekPct >= 50 ? 'var(--warning)' : 'var(--danger)'}"></div>
      </div>
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
        if (de.reproCount) cls += ' has-repro';
        html += `<div class="${cls}" onclick="showDayDetail(${entry.idx},${i})">
          ${de.reproCount ? '<span style="font-size:9px;color:var(--accent)">↻</span>' : ''}
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
  const supId = state.currentUser;
  const scheduleDepts = getDeptsForDate(actIdx, date);

  // Build full dept list: scheduled + reprogrammed from prev weeks (on Mon)
  const reproDepts = [];
  const allDepts = [...scheduleDepts];
  if (dayIdx === 0) {
    const pendingBefore = getPendingFromBefore(supId, actIdx, dates[0]);
    for (const d of pendingBefore) {
      if (!allDepts.includes(d)) {
        allDepts.push(d);
        reproDepts.push(d);
      }
    }
  }
  if (allDepts.length === 0) return;
  const dayLabel = date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  let html = `<div class="modal-overlay open" id="day-modal" onclick="closeDayModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <h3>${act.name}</h3>
      <p style="color:var(--text2);margin-bottom:12px">${dayLabel}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:6px" id="day-dept-grid">`;
  for (const d of allDepts) {
    const done = isDeptDoneGlobal(supId, actIdx, d);
    const isRepro = reproDepts.includes(d);
    html += `<div class="dept-btn ${done ? 'done' : ''}${isRepro ? ' repro' : ''}" data-dept="${d}" onclick="handleDayDeptClick(${actIdx},'${esc(d)}')" title="${getDeptLabel(d)}${isRepro ? ' (reprogramada)' : ''}">
      ${d}${isRepro ? '<span style="font-size:9px;color:var(--accent);display:block">↻ reprogramada</span>' : ''}
    </div>`;
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

function getWeekProgressForSup(supId, dates) {
  const indices = SUPERVISOR_ACTIVITIES[supId] || [];
  const activityPcts = [];
  const noEjecutadas = [];
  for (const idx of indices) {
    const act = ACTIVITIES[idx];
    let hasWeekWork = false;
    let actWeekTotal = 0, actWeekDone = 0;

    // Count departments scheduled for this week's dates
    for (let i = 0; i < 5; i++) {
      const depts = getDeptsForDate(idx, dates[i]);
      if (depts.length === 0) continue;
      hasWeekWork = true;
      for (const d of depts) {
        actWeekTotal++;
        if (isDeptDoneGlobal(supId, idx, d)) actWeekDone++;
      }
    }

    // Also count reprogrammed (pending from before this week)
    const pendingBefore = getPendingFromBefore(supId, idx, dates[0]);
    if (pendingBefore.length > 0) {
      hasWeekWork = true;
      for (const d of pendingBefore) {
        actWeekTotal++;
        if (isDeptDoneGlobal(supId, idx, d)) actWeekDone++;
      }
    }

    if (!hasWeekWork) continue;
    activityPcts.push(Math.round(actWeekDone / actWeekTotal * 100));
    if (actWeekDone < actWeekTotal) {
      const pend = [];
      for (let i = 0; i < 5; i++) {
        const depts = getDeptsForDate(idx, dates[i]);
        const pending = depts.filter(d => !isDeptDoneGlobal(supId, idx, d));
        if (pending.length > 0) {
          pend.push({ day: dates[i], count: pending.length });
        }
      }
      const pendingBeforePending = pendingBefore.filter(d => !isDeptDoneGlobal(supId, idx, d));
      if (pendingBeforePending.length > 0) {
        pend.push({ day: dates[0], count: pendingBeforePending.length, repro: true });
      }
      noEjecutadas.push({ name: act.name, responsable: act.responsable, pendientes: pend, done: actWeekDone, total: actWeekTotal });
    }
  }
  let weekPct = 0;
  if (activityPcts.length > 0) {
    let sum = 0;
    for (const p of activityPcts) sum += p;
    weekPct = Math.round(sum / activityPcts.length);
  }
  return { activityCount: activityPcts.length, weekPct, noEjecutadas };
}

function renderAdminReport() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-admin').classList.add('active');
  state.currentView = 'admin-report';
  const container = document.getElementById('admin-content');
  const dates = getWeekDates(state.selectedWeek);

  let html = `<div class="week-selector">
      <button onclick="adminShiftWeek(-1)">◀</button>
      <span>Semana del ${formatDate(dates[0])}</span>
      <button onclick="adminShiftWeek(1)">▶</button>
    </div>
    <div style="margin-bottom:12px">
      <h2>Reporte Semanal</h2>
      <p style="color:var(--text2);font-size:13px">Cumplimiento por supervisor y actividades no ejecutadas.</p>
    </div>`;

  // Overall average across supervisors
  const weekReports = [];
  let totalAvg = 0;
  for (const sup of SUPERVISORS) {
    const w = getWeekProgressForSup(sup.id, dates);
    weekReports.push({ sup, ...w });
    if (w.activityCount > 0) totalAvg += w.weekPct * w.activityCount;
  }
  let globalPct = 0;
  {
    let totalActs = 0;
    for (const r of weekReports) totalActs += r.activityCount;
    if (totalActs > 0) {
      let sum = 0;
      for (const r of weekReports) sum += r.weekPct * r.activityCount;
      globalPct = Math.round(sum / totalActs);
    }
  }

  html += `<div class="stats-row">
      <div class="stat">
        <div class="stat-num">${globalPct}%</div>
        <div class="stat-label">Cumpl. Semanal</div>
      </div>
    </div>`;

  for (const r of weekReports) {
    const pct = r.weekPct;
    const allOk = r.activityCount > 0 && pct === 100;
    const someOk = r.activityCount > 0 && pct > 0;
    if (r.activityCount === 0) {
      html += `<div class="card" style="margin-top:12px;opacity:.5">
        <div style="font-weight:700;font-size:15px">${r.sup.name}</div>
        <div style="font-size:12px;color:var(--text2)">Sin actividades programadas esta semana</div>
      </div>`;
      continue;
    }
    html += `<div class="card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-weight:700;font-size:15px">${r.sup.name}</div>
        <div style="font-size:13px;font-weight:600;color:${allOk ? 'var(--success)' : someOk ? 'var(--warning)' : 'var(--danger)'}">${pct}% · ${r.activityCount} actividades</div>
      </div>
      <div class="progress-bar" style="height:4px">
        <div class="progress-fill" style="width:${pct}%;background:${allOk ? 'var(--success)' : someOk ? 'var(--warning)' : 'var(--danger)'}"></div>
      </div>`;

    if (r.noEjecutadas.length > 0) {
      html += `<div style="margin-top:10px;font-size:13px;font-weight:600;color:var(--danger)">⏳ No ejecutadas:</div>`;
      let lastComp = '';
      for (const p of r.noEjecutadas) {
        if (p.responsable !== lastComp) {
          html += `<div style="font-size:12px;color:var(--text2);margin-top:4px">${p.responsable}</div>`;
          lastComp = p.responsable;
        }
        const daysStr = p.pendientes.map(d => `${d.repro ? '↻' : ''}${d.day.getDate()}/${d.day.getMonth()+1} (${d.count})`).join(' · ');
        html += `<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.03)">
          <span>${p.name}</span>
          <span style="color:var(--danger);font-weight:600;text-align:right;font-size:11px">${p.done}/${p.total} · ${daysStr}</span>
        </div>`;
      }
    } else {
      html += `<div style="margin-top:8px;font-size:13px;color:var(--success)">✅ Todo ejecutado esta semana</div>`;
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

function adminShiftWeek(dir) {
  const newDate = new Date(state.selectedWeek);
  newDate.setDate(newDate.getDate() + dir * 7);
  state.selectedWeek = newDate;
  saveState();
  renderAdminReport();
}

function exportAdminExcel() {
  loadXLSX(() => {
    const dates = getWeekDates(state.selectedWeek);
    const wb = XLSX.utils.book_new();

    // Semana actual sheet: weekly compliance per supervisor
    const wsDataWeek = [['Supervisor', 'Actividad', 'Fecha', 'Tipo', 'Departamentos Programados', 'Departamentos Ejecutados', '%', 'Estado']];
    for (const sup of SUPERVISORS) {
      const indices = SUPERVISOR_ACTIVITIES[sup.id] || [];
      for (const idx of indices) {
        const act = ACTIVITIES[idx];
        for (let i = 0; i < 5; i++) {
          const depts = getDeptsForDate(idx, dates[i]);
          if (depts.length === 0) continue;
          const doneCount = depts.filter(d => isDeptDoneGlobal(sup.id, idx, d)).length;
          const pct = Math.round(doneCount/depts.length*100);
          wsDataWeek.push([
            sup.name, act.name, formatDate(dates[i]), 'Programada',
            depts.length, doneCount, pct,
            pct === 100 ? 'Completa' : pct > 0 ? 'Parcial' : 'No ejecutada'
          ]);
        }
        // Reprogramadas
        const pendingBefore = getPendingFromBefore(sup.id, idx, dates[0]);
        if (pendingBefore.length > 0) {
          const doneCount = pendingBefore.filter(d => isDeptDoneGlobal(sup.id, idx, d)).length;
          const pct = Math.round(doneCount/pendingBefore.length*100);
          wsDataWeek.push([
            sup.name, act.name, formatDate(dates[0]), '↻ Reprogramada',
            pendingBefore.length, doneCount, pct,
            pct === 100 ? 'Completa' : pct > 0 ? 'Parcial' : 'No ejecutada'
          ]);
        }
      }
    }
    if (wsDataWeek.length === 1) wsDataWeek.push(['Sin actividades programadas esta semana']);
    const ws1 = XLSX.utils.aoa_to_sheet(wsDataWeek);
    XLSX.utils.book_append_sheet(wb, ws1, 'Semana');

    // Progresso general sheet
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
