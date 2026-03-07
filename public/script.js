// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  let swControllerReloaded = false;
  const requestSwActivation = (reg) => {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        console.log('Service Worker registered:', reg.scope);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (swControllerReloaded) return;
          swControllerReloaded = true;
          window.location.reload();
        });
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              requestSwActivation(reg);
            }
          });
        });
        requestSwActivation(reg);
        reg.update().catch(() => {});
      })
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
/* public/script.js v3.13 — calendar view with date selection */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const debugFooter = $('#debugFooter');
  const debugLogsEl = $('#debugLogs');
  const showLogsBtn = $('[data-show-logs]');
  const closeLogsBtn = $('[data-close-logs]');
  let debugActive = (window.location.search || '').includes('debug=1');
  try {
    debugActive = debugActive || localStorage.getItem('debugLogs') === '1';
  } catch (_) {}

  function setDebugActive(on) {
    debugActive = !!on;
    try {
      if (debugActive) localStorage.setItem('debugLogs', '1');
      else localStorage.removeItem('debugLogs');
    } catch (_) {}
    if (debugFooter) debugFooter.style.display = debugActive ? 'block' : 'none';
    if (showLogsBtn) showLogsBtn.style.display = debugActive ? 'none' : '';
  }

  // Apply persisted debug state on load
  if (debugActive) setDebugActive(true);

  // Debug logging
  const debugLog = (type, message, data) => {
    if (!debugActive || !debugLogsEl) return;
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : type === 'warn' ? '#ffd43b' : '#74c0fc';
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
    const logEntry = document.createElement('div');
    logEntry.style.cssText = `border-left:3px solid ${color};padding:4px 8px;margin:4px 0;background:rgba(255,255,255,0.05)`;
    logEntry.innerHTML = `<span style="color:#888">[${timestamp}]</span> ${icon} <strong style="color:${color}">${type.toUpperCase()}</strong>: ${message}${data ? `\n${JSON.stringify(data, null, 2)}` : ''}`;
    debugLogsEl.appendChild(logEntry);
    debugLogsEl.scrollTop = debugLogsEl.scrollHeight;
  };

  // Override console methods to capture logs
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  console.log = function(...args) {
    debugLog('info', args.join(' '));
    originalConsoleLog.apply(console, args);
  };
  
  console.error = function(...args) {
    debugLog('error', args.join(' '));
    originalConsoleError.apply(console, args);
  };
  
  console.warn = function(...args) {
    debugLog('warn', args.join(' '));
    originalConsoleWarn.apply(console, args);
  };

  on(showLogsBtn, 'click', (e) => {
    e.preventDefault();
    setDebugActive(true);
  });

  on(closeLogsBtn, 'click', (e) => {
    e.preventDefault();
    setDebugActive(false);
  });

  const eventsEl = $('#events');
  const modal = $('#eventModal');
  const eventForm = $('#eventForm');
  const newTeeBtn = $('#newTeeBtn');
  const newTeamBtn = $('#newTeamBtn');
  const createModeInput = $('#createMode');
  const teeTimeRow = $('#teeTimeRow');
  const teamSizeRow = $('#teamSizeRow');
  const subForm = $('#subscribeForm');
  const subMsg = $('#subMsg');
  const subscribeModal = $('#subscribeModal');
  const openSubscribeBtn = $('#openSubscribeBtn');
  const REFRESH_INTERVAL_MS = 15000;

  // Calendar elements
  const calendarGrid = $('#calendarGrid');
  const currentMonthEl = $('#currentMonth');
  const prevMonthBtn = $('#prevMonth');
  const nextMonthBtn = $('#nextMonth');
  const selectedDateTitle = $('#selectedDateTitle');
  const monthCalendarBtn = $('#monthCalendarBtn');
  const requestClubTimeBtn = $('#requestClubTimeBtn');
  const refreshBtn = $('#refreshBtn');
  const lastUpdatedEl = $('#lastUpdated');
  const requestClubTimeModal = $('#requestClubTimeModal');
  const requestClubTimeForm = $('#requestClubTimeForm');
  const requestClubDateInput = $('#requestClubDate');
  const requestClubPreferredTimeInput = $('#requestClubPreferredTime');
  const requestClubRequesterNameInput = $('#requestClubRequesterName');
  const requestClubNameOptions = $('#requestClubNameOptions');

  // State
  let allEvents = [];
  let currentDate = new Date();
  let selectedDate = null;
  let isLoading = false;
  let loadPending = false;
  let autoRefreshTimer = null;
  let lastUpdatedAt = null;
  let lastResumeRefreshAt = 0;

  // Inject Edit dialog
  function ensureEditDialog(){
    if ($('#editModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="editModal">
      <form id="editForm" method="dialog">
        <h3>Edit Event</h3>
        <label>Course <input name="course" required></label>
        <label>Date <input name="date" type="date" required></label>
        <label>Mode
          <select id="editModeSelect" name="mode">
            <option value="tees">Tee times</option>
            <option value="teams">Teams</option>
          </select>
        </label>
        <div id="editTeamSizeRow">
          <label>Team size max <input name="teamSizeMax" type="number" min="2" max="4" value="4"></label>
        </div>
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
        <input type="hidden" name="id">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Save</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  function ensureAuditDialog(){
    if ($('#auditModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="auditModal" style="min-width:600px;max-width:800px">
      <h3>📋 Audit Log</h3>
      <div id="auditLogContent" style="max-height:500px;overflow-y:auto;margin:16px 0">
        <p style="color:var(--slate-700);text-align:center">Loading...</p>
      </div>
      <menu>
        <button type="button" data-cancel>Close</button>
      </menu>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  function ensureMoveDialog(){
    if ($('#moveModal')) return;
    const tpl = document.createElement('div');
    tpl.innerHTML = `<dialog id="moveModal">
      <form id="moveForm" method="dialog">
        <h3 id="moveTitle">Move Player</h3>
        <div id="moveChoices" style="display:grid;gap:8px;margin:8px 0;"></div>
        <input type="hidden" name="eventId">
        <input type="hidden" name="fromTeeId">
        <input type="hidden" name="playerId">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Move</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(tpl.firstElementChild);
  }
  function ensureEditTeeDialog(){
    if ($('#editTeeModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="editTeeModal">
      <form id="editTeeForm" method="dialog">
        <h3 id="editTeeTitle">Edit</h3>
        <label>
          <span id="editTeeLabel">Name</span>
          <input id="editTeeInput" name="value" required>
          <select id="editTeeSelect" name="value" required style="display:none;"></select>
        </label>
        <input type="hidden" name="eventId">
        <input type="hidden" name="teeId">
        <input type="hidden" name="isTeam">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Save</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  ensureEditDialog();
  ensureMoveDialog();
  ensureEditTeeDialog();
  ensureAuditDialog();

  const editModal = $('#editModal');
  const editForm = $('#editForm');
  const editModeSelect = $('#editModeSelect');
  const editTeamSizeRow = $('#editTeamSizeRow');
  const moveModal = $('#moveModal');
  const moveForm = $('#moveForm');
  const moveChoices = $('#moveChoices');
  const moveTitle = $('#moveTitle');
  const editTeeModal = $('#editTeeModal');
  const editTeeForm = $('#editTeeForm');
  const editTeeTitle = $('#editTeeTitle');
  const editTeeLabel = $('#editTeeLabel');
  const editTeeInput = $('#editTeeInput');
  const editTeeSelect = $('#editTeeSelect');

  if (!eventsEl) return;

  function updateLastUpdated(text){
    if (!lastUpdatedEl) return;
    lastUpdatedEl.textContent = text;
  }

  function stampLastUpdated(){
    lastUpdatedAt = new Date();
    updateLastUpdated(`Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }

  function setLoading(isBusy){
    if (!refreshBtn) return;
    refreshBtn.disabled = !!isBusy;
    refreshBtn.textContent = isBusy ? 'Refreshing…' : 'Refresh';
  }

  function fmtDate(val){
    try{
      if (!val) return '—';
      const s = String(val);
      let d;
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) d = new Date(s);
      else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s+'T12:00:00Z');
      else d = new Date(s);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });
    } catch { return '—'; }
  }
  function fmtTime(hhmm){ if(!hhmm) return ''; const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm); if(!m) return hhmm; let h=parseInt(m[1],10); const min=m[2]; const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${min} ${ap}`; }
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function weatherSummaryMarkup(ev) {
    const weather = ev && ev.weather ? ev.weather : null;
    if (!weather) {
      return '<span class="weather-summary weather-summary-muted"><span class="weather-text">Forecast unavailable</span></span>';
    }
    const icon = weather.icon ? `<span class="weather-inline" aria-hidden="true">${escapeHtml(weather.icon)}</span>` : '';
    const details = [];
    const low = Number.isFinite(Number(weather.tempLow)) ? Math.round(Number(weather.tempLow)) : null;
    const high = Number.isFinite(Number(weather.tempHigh)) ? Math.round(Number(weather.tempHigh)) : null;
    if (Number.isFinite(low) && Number.isFinite(high)) {
      details.push(`L${low}\u00b0 / H${high}\u00b0`);
    } else if (Number.isFinite(Number(weather.temp))) {
      details.push(`${Math.round(Number(weather.temp))}\u00b0F`);
    }
    const rainChance = Number.isFinite(Number(weather.rainChance)) ? Math.round(Number(weather.rainChance)) : null;
    if (Number.isFinite(rainChance) && rainChance > 15) {
      details.push(`Rain ${rainChance}%`);
    }
    const desc = String(weather.description || weather.condition || '').trim();
    if (desc) details.push(desc);
    const text = details.join(' • ') || 'Forecast unavailable';
    const safeText = escapeHtml(text);
    return `<span class="weather-summary${details.length ? '' : ' weather-summary-muted'}" title="${safeText}">${icon}<span class="weather-text">${safeText}</span></span>`;
  }
  function wazeLinkForEvent(ev) {
    const course = String((ev && ev.course) || '').trim();
    const info = (ev && ev.courseInfo) || {};
    const address = String(info.address || info.fullAddress || '').trim();
    const city = String(info.city || '').trim();
    const state = String(info.state || '').trim();
    let query = '';
    if (address) {
      query = address;
    } else {
      query = [course, city, state].filter(Boolean).join(', ');
    }
    if (!query || /^course$/i.test(query)) return '';
    return `https://www.waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
  }
  function courseTitleMarkup(ev) {
    const course = String((ev && ev.course) || '').trim();
    const label = escapeHtml(course || 'Course');
    if (!course) return label;
    const waze = wazeLinkForEvent(ev);
    if (!waze) return label;
    return `<a class="card-title-link" href="${waze}" target="_blank" rel="noopener" title="Open in Waze">${label}</a>`;
  }
  const CALENDAR_EVENT_DURATION_MINUTES = 270;

  function toDateISO(val) {
    const str = String(val || '').trim();
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(str);
    if (match) return match[1];
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseHHMMToMinutes(rawTime = '') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(rawTime).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isInteger(h) || !Number.isInteger(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return (h * 60) + mm;
  }

  function eventStartMinutes(ev) {
    let min = null;
    for (const tt of (ev && ev.teeTimes) || []) {
      const mins = parseHHMMToMinutes(tt && tt.time);
      if (mins === null) continue;
      if (min === null || mins < min) min = mins;
    }
    return min;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtCalendarDate(date) {
    return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
  }

  function fmtCalendarDateTime(date) {
    return `${fmtCalendarDate(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}00`;
  }

  function eventCalendarTiming(ev) {
    const dateISO = toDateISO(ev && ev.date);
    if (!dateISO) return null;
    const [year, month, day] = dateISO.split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const startMinutes = eventStartMinutes(ev);
    if (startMinutes === null) {
      const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
      return { allDay: true, startDate, endDate };
    }
    const start = new Date(Date.UTC(year, month - 1, day, Math.floor(startMinutes / 60), startMinutes % 60, 0));
    const end = new Date(start.getTime() + (CALENDAR_EVENT_DURATION_MINUTES * 60 * 1000));
    return { allDay: false, start, end };
  }

  function calendarTitle(ev) {
    const mode = ev && ev.isTeamEvent ? 'Team Event' : 'Tee-Time Event';
    const course = ev && ev.course ? String(ev.course).trim() : 'Golf Event';
    return `${course} (${mode})`;
  }

  function calendarDescription(ev) {
    const lines = ['Tee Time Manager Event'];
    if (ev && ev.course) lines.push(`Course: ${String(ev.course).trim()}`);
    lines.push(`Date: ${fmtDate(ev && ev.date)}`);
    const slotLines = ((ev && ev.teeTimes) || [])
      .map((tt, idx) => {
        if (tt && tt.time) {
          if (ev && ev.isTeamEvent) return `${tt.name || `Team ${idx + 1}`}: ${fmtTime(tt.time)}`;
          return `Tee ${idx + 1}: ${fmtTime(tt.time)}`;
        }
        if (ev && ev.isTeamEvent) return tt && tt.name ? String(tt.name) : `Team ${idx + 1}`;
        return '';
      })
      .filter(Boolean);
    if (slotLines.length) lines.push(`${ev && ev.isTeamEvent ? 'Teams' : 'Tee Times'}: ${slotLines.join(', ')}`);
    if (ev && ev.notes) lines.push(`Notes: ${String(ev.notes).trim()}`);
    if (ev && ev._id) lines.push(`Event Link: ${window.location.origin}/?event=${encodeURIComponent(ev._id)}`);
    return lines.join('\n');
  }

  function buildGoogleCalendarUrl(ev) {
    const timing = eventCalendarTiming(ev);
    if (!timing) return '';
    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', calendarTitle(ev));
    params.set('details', calendarDescription(ev));
    params.set('location', ev && ev.course ? String(ev.course) : 'Golf Course');
    if (timing.allDay) {
      params.set('dates', `${fmtCalendarDate(timing.startDate)}/${fmtCalendarDate(timing.endDate)}`);
    } else {
      params.set('dates', `${fmtCalendarDateTime(timing.start)}/${fmtCalendarDateTime(timing.end)}`);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) params.set('ctz', tz);
    }
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function openExternalCalendarUrlSafely(urlBuilder) {
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    return Promise.resolve()
      .then(urlBuilder)
      .then((url) => {
        if (!url) {
          if (popup && !popup.closed) popup.close();
          return false;
        }
        if (popup && !popup.closed) {
          popup.location = url;
          return true;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      })
      .catch((err) => {
        if (popup && !popup.closed) popup.close();
        throw err;
      });
  }

  function upsertCachedEvent(ev) {
    if (!ev || !ev._id) return;
    const idx = allEvents.findIndex((item) => String(item && item._id) === String(ev._id));
    if (idx >= 0) allEvents[idx] = ev;
    else allEvents.push(ev);
  }

  function normalizeForm(form){
    const data=Object.fromEntries(new FormData(form).entries());
    if(data.date){
      const s = String(data.date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + 'T12:00:00Z');
        const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
        data.date=`${y}-${m}-${day}`;
      } else {
        data.date = s;
      }
    }
    return data;
  }
  async function api(path, opts){ 
    const method = String(opts?.method || 'GET').toUpperCase();
    let requestPath = path;
    const mergedHeaders = { ...(opts?.headers || {}) };
    if (method === 'GET') {
      // Force fresh API reads, especially after mobile app resume.
      mergedHeaders['Cache-Control'] = mergedHeaders['Cache-Control'] || 'no-cache';
      mergedHeaders.Pragma = mergedHeaders.Pragma || 'no-cache';
      try {
        const u = new URL(path, window.location.origin);
        if (!u.searchParams.has('fresh')) u.searchParams.set('fresh', '1');
        u.searchParams.set('_rt', String(Date.now()));
        requestPath = u.origin === window.location.origin
          ? `${u.pathname}${u.search}${u.hash}`
          : u.toString();
      } catch (_) {}
    }
    debugLog('info', `API Request: ${method} ${requestPath}`, opts?.body ? JSON.parse(opts.body) : null);
    
    // Add timeout for slow requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const r=await fetch(requestPath, {
        ...opts,
        headers: mergedHeaders,
        cache: method === 'GET' ? 'no-store' : opts?.cache,
        signal: controller.signal,
      }); 
      clearTimeout(timeoutId);
      
      const ct=r.headers.get('content-type')||''; 
      const body = ct.includes('application/json') ? await r.json() : await r.text();
      if(!r.ok) {
        const msg = (typeof body === 'object' && body.message) || (typeof body === 'object' && body.error) || body || ('HTTP '+r.status);
        debugLog('error', `API Error: ${method} ${requestPath} (${r.status})`, body);
        throw new Error(msg);
      }
      debugLog('success', `API Success: ${method} ${requestPath}`, body);
      return body;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        debugLog('error', `API Timeout: ${method} ${requestPath}`, { error: 'Request timed out after 30 seconds' });
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      debugLog('error', `API Failed: ${method} ${requestPath}`, { error: err.message });
      throw err;
    }
  }

  function refreshOnResume(reason) {
    const now = Date.now();
    if (now - lastResumeRefreshAt < 1500) return;
    lastResumeRefreshAt = now;
    debugLog('info', `Resume refresh: ${reason}`);
    load(true);
  }

  // Create Event: open modal in the requested mode (tees or teams)
  on(newTeeBtn, 'click', () => {
    if (createModeInput) createModeInput.value = 'tees';
    if (teeTimeRow) teeTimeRow.hidden = false;
    if (teamSizeRow) teamSizeRow.hidden = true;
    if (eventForm?.elements?.['teeTime']) eventForm.elements['teeTime'].required = true;
    if (eventForm?.elements?.['teamStartTime']) eventForm.elements['teamStartTime'].required = false;
    if (selectedDate && eventForm?.elements?.['date']) {
      eventForm.elements['date'].value = selectedDate;
    }
    modal?.showModal?.();
  });
  on(newTeamBtn, 'click', () => {
    if (createModeInput) createModeInput.value = 'teams';
    if (teeTimeRow) teeTimeRow.hidden = true;
    if (teamSizeRow) teamSizeRow.hidden = false;
    if (eventForm?.elements?.['teeTime']) eventForm.elements['teeTime'].required = false;
    if (eventForm?.elements?.['teamStartTime']) eventForm.elements['teamStartTime'].required = true;
    if (selectedDate && eventForm?.elements?.['date']) {
      eventForm.elements['date'].value = selectedDate;
    }
    modal?.showModal?.();
  });

  // Team start type toggle
  const teamStartType = $('#teamStartType');
  const teamStartHint = $('#teamStartHint');
  on(teamStartType, 'change', () => {
    const isShotgun = teamStartType.value === 'shotgun';
    if (teamStartHint) {
      teamStartHint.textContent = isShotgun 
        ? 'All teams start at this time' 
        : 'Teams will start 9 minutes apart';
    }
  });

  // Dialog cancel
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cancel]');
    if (!btn) return;
    ev.preventDefault();
    const dlg = btn.closest('dialog');
    dlg?.close?.();
  });

  // Create event submit
  on(eventForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const body = normalizeForm(eventForm);
      const isTeams = (body.mode === 'teams');
      const courseName = body.course;
      const payload = {
        course: courseName,
        courseInfo: selectedCourseData || {},
        date: body.date,
        notes: body.notes || '',
        isTeamEvent: isTeams,
        teamSizeMax: isTeams ? Number(body.teamSizeMax || 4) : 4
      };
      if (isTeams) {
        payload.teamStartType = body.teamStartType || 'shotgun';
        payload.teamStartTime = body.teamStartTime;
      } else {
        const teeTime = body.teeTime;
        let count = 4;
        if (body.teeTimesCount) {
          count = parseInt(body.teeTimesCount, 10) || 4;
        }
        if (teeTime) {
          const mins = teeTime.split(':').map(Number);
          const startMins = mins[0] * 60 + mins[1];
          payload.teeTime = teeTime;
          if (count > 1) {
            payload.teeTimes = [];
            for (let i = 0; i < count; i++) {
              let minsVal = startMins + i * 9;
              let h = String(Math.floor(minsVal / 60) % 24).padStart(2, '0');
              let m = String(minsVal % 60).padStart(2, '0');
              payload.teeTimes.push({ time: `${h}:${m}` });
            }
          }
        }
      }
      await api('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      modal?.close?.();
      eventForm.reset();
      if (courseInfoCard) courseInfoCard.style.display = 'none';
      selectedCourseData = null;
      load();
    } catch (err) {
      console.error(err);
      alert('Create failed: ' + (err && err.message ? err.message : 'Unknown error'));
    }
  });

  // Edit mode toggle
  on(editModeSelect, 'change', ()=>{
    const teams = editModeSelect.value === 'teams';
    if (editTeamSizeRow) editTeamSizeRow.hidden = !teams;
  });

  // Edit save
  on(editForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const data = normalizeForm(editForm);
      const id = data.id;
      const payload = {
        course: data.course,
        date: data.date,
        notes: data.notes || '',
        isTeamEvent: data.mode === 'teams',
        teamSizeMax: data.mode === 'teams' ? Number(data.teamSizeMax || 4) : 4
      };
      await api(`/api/events/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      editModal?.close?.(); load();
    }catch(err){ console.error(err); alert('Save failed'); }
  });

  // Subscribe modal
  console.log('Subscribe button:', openSubscribeBtn, 'Modal:', subscribeModal);
  on(openSubscribeBtn, 'click', () => {
    console.log('Subscribe button clicked!');
    subscribeModal?.showModal?.();
  });
  on(subscribeModal, 'click', (e) => {
    if (e.target.dataset.cancel) subscribeModal?.close();
  });

  // Subscribe
  on(subForm, 'submit', async (e)=>{
    e.preventDefault(); 
    if(subMsg) {
      subMsg.textContent='Subscribing...';
      subMsg.style.color='var(--slate-700)';
      subMsg.style.fontWeight='500';
    }
    try{
      const formData = new FormData(subForm);
      const payload = { email: formData.get('email') };
      
      const result = await api('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(subMsg) {
        subMsg.style.color='var(--green-700)';
        subMsg.style.fontWeight='600';
        if (result.isNew) {
          subMsg.textContent = '✓ Email subscription confirmed!';
        } else {
          subMsg.textContent = '✓ Already subscribed!';
        }
      }
      setTimeout(() => {
        subscribeModal?.close();
        if(subMsg) subMsg.textContent='';
      }, 2500);
      subForm.reset();
    }catch(err){ 
      console.error(err);
      if(subMsg) {
        subMsg.textContent='Failed: ' + (err.message || 'Unknown error');
        subMsg.style.color='#dc2626';
        subMsg.style.fontWeight='600';
      }
    }
  });

  // Calendar functions
  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month/year title
    currentMonthEl.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (monthCalendarBtn) {
      const fullMonth = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long' });
      monthCalendarBtn.textContent = 'Add this month\'s tee times';
      monthCalendarBtn.title = `Add all ${fullMonth} ${year} tee times to your calendar`;
    }
    
    // Clear grid
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
      const header = document.createElement('div');
      header.className = 'calendar-day-header';
      header.textContent = day;
      calendarGrid.appendChild(header);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Build event date maps (YYYY-MM-DD format)
    const eventDates = new Set();
    const teamEventDates = new Set();
    const urgentTeeEventDates = new Set();
    const nonBlueRidgeTeeEventDates = new Set();
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const DAY_MS = 24 * 60 * 60 * 1000;
    allEvents.forEach(ev => {
      const dateStr = toDateISO(ev && ev.date);
      if (!dateStr) return;
      eventDates.add(dateStr);
      if (ev && ev.isTeamEvent) {
        teamEventDates.add(dateStr);
        return;
      }
      const courseName = String((ev && ev.course) || '').trim().toLowerCase();
      const isBlueRidgeShadows = /blue\s*ridge\s*shadows/.test(courseName);
      if (courseName && !isBlueRidgeShadows) {
        nonBlueRidgeTeeEventDates.add(dateStr);
      }
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return;
      const eventDayUtc = Date.UTC(y, m - 1, d);
      const daysUntil = Math.round((eventDayUtc - todayUtc) / DAY_MS);
      if (daysUntil >= 0 && daysUntil <= 3) {
        urgentTeeEventDates.add(dateStr);
      }
    });
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dayEl = createDayElement(day, year, month - 1, true);
      calendarGrid.appendChild(dayEl);
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = createDayElement(day, year, month, false);
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      
      if (dateStr === todayStr) {
        dayEl.classList.add('today');
      }
      
      if (eventDates.has(dateStr)) {
        dayEl.classList.add('has-events');
        if (teamEventDates.has(dateStr)) dayEl.classList.add('has-team-events');
        if (urgentTeeEventDates.has(dateStr)) dayEl.classList.add('has-urgent-tee-events');
        if (nonBlueRidgeTeeEventDates.has(dateStr)) dayEl.classList.add('has-non-brs-tee-events');
        if (dateStr < todayStr) dayEl.classList.add('past-event-day');
        else dayEl.classList.add('upcoming-event-day');
      }
      
      if (selectedDate && dateStr === selectedDate) {
        dayEl.classList.add('selected');
      }
      
      calendarGrid.appendChild(dayEl);
    }
    
    // Next month days
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      const dayEl = createDayElement(day, year, month + 1, true);
      calendarGrid.appendChild(dayEl);
    }
  }
  
  function createDayElement(day, year, month, isOtherMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    if (isOtherMonth) dayEl.classList.add('other-month');
    dayEl.textContent = day;
    
    // Handle month overflow
    let actualYear = year;
    let actualMonth = month;
    if (month < 0) {
      actualMonth = 11;
      actualYear--;
    } else if (month > 11) {
      actualMonth = 0;
      actualYear++;
    }
    
    const dateStr = `${actualYear}-${String(actualMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    
    // Use passive event listener for better scroll/tap performance
    dayEl.addEventListener('click', () => {
      if (isOtherMonth) {
        // Navigate to other month when clicking its days
        currentDate = new Date(actualYear, actualMonth, day);
        renderCalendar();
      }
      selectDate(dateStr);
    }, { passive: true });
    
    return dayEl;
  }
  
  // Debounced selectDate for smoother mobile experience
  let selectDateTimeout = null;
  function selectDate(dateStr) {
    if (selectedDate === dateStr) return; // No-op if already selected
    if (selectDateTimeout) clearTimeout(selectDateTimeout);
    selectDateTimeout = setTimeout(() => {
      selectedDate = dateStr;
      renderCalendar();
      renderEventsForDate();
    }, 60); // 60ms debounce for fast taps
  }
  
  function renderEventsForDate() {
    if (!selectedDate) {
      selectedDateTitle.textContent = '';
      eventsEl.innerHTML = '';
      return;
    }
    
    const date = new Date(selectedDate + 'T12:00:00Z');
    selectedDateTitle.textContent = date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'UTC'
    });
    
    const filtered = allEvents.filter(ev => {
      if (!ev.date) return false;
      const evDateStr = String(ev.date).slice(0, 10);
      return evDateStr === selectedDate;
    });
    
    if (filtered.length === 0) {
      eventsEl.innerHTML = '<div style="color:#ffffff;padding:20px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">No events scheduled for this date</div>';
    } else {
      render(filtered);
    }
  }

  function gatherKnownGolferNames() {
    const names = new Set();
    for (const ev of (allEvents || [])) {
      for (const tt of (ev.teeTimes || [])) {
        for (const p of (tt.players || [])) {
          const n = String((p && p.name) || '').trim();
          if (n) names.add(n);
        }
      }
      for (const maybeName of (ev.maybeList || [])) {
        const n = String(maybeName || '').trim();
        if (n) names.add(n);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  function openRequestClubTimeModal() {
    if (!requestClubTimeModal || !requestClubDateInput || !requestClubPreferredTimeInput || !requestClubRequesterNameInput || !requestClubNameOptions) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    requestClubDateInput.value = selectedDate || todayIso;
    requestClubPreferredTimeInput.value = '';

    const golfers = gatherKnownGolferNames();
    requestClubNameOptions.innerHTML = '';
    if (!golfers.length) {
      requestClubRequesterNameInput.value = '';
    } else {
      if (!requestClubRequesterNameInput.value) requestClubRequesterNameInput.value = golfers[0];
      for (const name of golfers) {
        const opt = document.createElement('option');
        opt.value = name;
        requestClubNameOptions.appendChild(opt);
      }
    }
    requestClubTimeModal.showModal();
  }
  

  on(refreshBtn, 'click', (e) => {
    e.preventDefault();
    load(true);
  });

  on(requestClubTimeBtn, 'click', (e) => {
    e.preventDefault();
    openRequestClubTimeModal();
  });

  on(requestClubTimeModal, 'click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closeRequestClubTime !== undefined) {
      requestClubTimeModal.close();
    }
  });

  on(requestClubTimeForm, 'submit', async (e) => {
    e.preventDefault();
    const submitBtn = requestClubTimeForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : 'Send Request';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }
    try {
      const fd = new FormData(requestClubTimeForm);
      const payload = {
        date: String(fd.get('date') || '').trim(),
        preferredTime: String(fd.get('preferredTime') || '').trim(),
        requesterName: String(fd.get('requesterName') || '').trim(),
        note: String(fd.get('note') || '').trim(),
      };
      await api('/api/request-club-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      requestClubTimeModal.close();
      alert('Club time request sent.');
    } catch (err) {
      console.error(err);
      alert('Request failed: ' + (err.message || 'Unknown error'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });

  on(monthCalendarBtn, 'click', (e) => {
    e.preventDefault();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const url = `/api/events/calendar/month.ics?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;
    window.location.assign(url);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshOnResume('visibility');
  });
  window.addEventListener('pageshow', (e) => {
    if (e && e.persisted) refreshOnResume('pageshow-bfcache');
    else refreshOnResume('pageshow');
  });
  window.addEventListener('focus', () => refreshOnResume('focus'));
  window.addEventListener('online', () => refreshOnResume('online'));

  // Calendar navigation
  on(prevMonthBtn, 'click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  on(nextMonthBtn, 'click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  // No MutationObserver: only call load() after successful actions

  async function load(force=false){ 
    if (isLoading) { 
      loadPending = true; 
      return; 
    }
    if (!force && document.hidden) {
      loadPending = true;
      return;
    }
    isLoading = true;
    setLoading(true);
    try{ 
      const list = await api('/api/events'); 
      allEvents = Array.isArray(list) ? list : [];
      renderCalendar();
      if (selectedDate) {
        renderEventsForDate();
      } else {
        eventsEl.innerHTML = '';
      }
      stampLastUpdated();
    } catch(e) { 
      console.error(e); 
      eventsEl.innerHTML='<div class="card">Failed to load events.</div>'; 
      updateLastUpdated('Refresh failed');
    } finally {
      isLoading = false;
      setLoading(false);
      if (loadPending) {
        loadPending = false;
        load(true);
      }
    } 
  }

  function startAutoRefresh(){
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      load();
    }, REFRESH_INTERVAL_MS);
  }

  // Fetch a single event by ID
  async function fetchEventById(eventId) {
    try {
      return await api(`/api/events/${eventId}`);
    } catch (e) {
      console.error('Failed to fetch event by ID:', e);
      return null;
    }
  }

  async function getEventForAction(eventId) {
    const cached = allEvents.find((item) => String(item && item._id) === String(eventId));
    if (cached) return cached;
    const fetched = await fetchEventById(eventId);
    if (fetched) upsertCachedEvent(fetched);
    return fetched;
  }

  function render(list){
    // Use a document fragment for batch DOM updates
    window.requestAnimationFrame(() => {
      eventsEl.innerHTML = '';
      const frag = document.createDocumentFragment();
      for(const ev of list){
        const card=document.createElement('div'); card.className='card';
        const isTeams = !!ev.isTeamEvent;
        let teesArr = ev.teeTimes || [];
        if (!isTeams) {
          // Sort tee times by time (HH:MM) ascending
          teesArr = teesArr.slice().sort((a, b) => {
            if (!a.time || !b.time) return 0;
            const [ah, am] = a.time.split(":").map(Number);
            const [bh, bm] = b.time.split(":").map(Number);
            return ah !== bh ? ah - bh : am - bm;
          });
        }
        const slotCap = isTeams ? (ev.teamSizeMax || 4) : 4;
        const slotCount = teesArr.length;
        const registeredCount = teesArr.reduce((sum, tt) => sum + ((tt.players || []).length), 0);
        const checkedInCount = teesArr.reduce((sum, tt) => sum + ((tt.players || []).filter((p) => !!p.checkedIn).length), 0);
        const totalCapacity = slotCount * slotCap;
        const openCount = Math.max(0, totalCapacity - registeredCount);
        const maybeCount = (ev.maybeList || []).length;
        const summaryRow = `<div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0 10px 0;font-size:12px;color:var(--slate-700)">
          <span><strong>${registeredCount}</strong> registered</span>
          <span><strong>${checkedInCount}</strong> checked in</span>
          <span><strong>${openCount}</strong> open</span>
          <span><strong>${maybeCount}</strong> maybe</span>
          <span><strong>${slotCount}</strong> ${isTeams ? 'teams' : 'tee times'}</span>
        </div>`;
        const tees = teesArr.map((tt,idx)=>teeRow(ev,tt,idx,isTeams)).join('');
        // Render maybe list
        const maybeList = (ev.maybeList || []).map((name, idx) => {
          const safe = String(name).replace(/"/g, '&quot;');
          return `<span class="maybe-chip" title="${safe}">
            <span class="maybe-name">${name}</span>
            <button class="icon small danger" title="Remove" data-remove-maybe="${ev._id}:${idx}">×</button>
          </span>`;
        }).join('');
        const maybeSection = `
          <div class="maybe-section">
            <div class="maybe-header">
              <h4>🤔 Maybe List</h4>
              <div class="maybe-controls">
                <button class="small maybe-btn" data-add-maybe="${ev._id}">+ Interested</button>
                <button class="small maybe-btn" data-fill-maybe="${ev._id}" title="Move someone from maybe list into an open spot">Fill Spot</button>
              </div>
            </div>
            <div class="maybe-list">
              ${maybeList || '<em style="color:var(--slate-700);font-size:11px;opacity:0.7">No one yet</em>'}
            </div>
          </div>
        `;
        const weatherSummary = weatherSummaryMarkup(ev);
        // Course details
        const courseDetailsBits = [];
        if (ev.courseInfo && ev.courseInfo.city && ev.courseInfo.state) {
          courseDetailsBits.push(`<span>📍 ${escapeHtml(ev.courseInfo.city)}, ${escapeHtml(ev.courseInfo.state)}</span>`);
        }
        if (ev.courseInfo && ev.courseInfo.phone) {
          courseDetailsBits.push(`<span>📞 ${escapeHtml(ev.courseInfo.phone)}</span>`);
        }
        if (ev.courseInfo && ev.courseInfo.website) {
          courseDetailsBits.push(`<span><a href="${escapeHtml(ev.courseInfo.website)}" target="_blank" rel="noopener">🔗 Website</a></span>`);
        }
        if (ev.courseInfo && ev.courseInfo.holes && ev.courseInfo.par) {
          courseDetailsBits.push(`<span>⛳ ${escapeHtml(ev.courseInfo.holes)} holes, Par ${escapeHtml(ev.courseInfo.par)}</span>`);
        }
        const courseDetails = courseDetailsBits.length
          ? `<div class="course-details">${courseDetailsBits.join('')}</div>`
          : '';
        const eventActionLegend = `
          <div class="event-action-legend" aria-label="Golfer action legend">
            <span class="event-action-title">Actions</span>
            <span class="event-action-item"><span class="event-action-symbol">○</span>Individual check-in</span>
            <span class="event-action-item"><span class="event-action-pill">All</span>Group check-in</span>
            <span class="event-action-item"><span class="event-action-symbol">↔</span>Move golfer</span>
            <span class="event-action-item"><span class="event-action-symbol danger">×</span>Delete golfer</span>
          </div>
        `;
        card.innerHTML = `
          <div class="card-header">
            <div class="card-header-left">
              <div class="card-title-row">
                <h3 class="card-title">${courseTitleMarkup(ev)}</h3>
                <div class="event-top-actions">
                  <button class="event-top-btn event-top-edit" data-edit="${ev._id}" title="Edit Event" aria-label="Edit Event">✏</button>
                  <button class="event-top-btn event-top-delete" data-del="${ev._id}" title="Delete Event" aria-label="Delete Event">✕</button>
                </div>
              </div>
              <div class="card-date">
                <span>${fmtDate(ev.date)}</span>
                ${weatherSummary}
              </div>
              ${courseDetails}
            </div>
        <div class="card-actions">
          <button class="small event-actions-toggle" data-toggle-actions title="Show/hide event actions">Actions</button>
          <div class="button-row">
            ${isTeams ? `<button class="small" data-add-tee="${ev._id}">Add Team</button>` : `<div class="time-action-pair"><button class="small" data-add-tee="${ev._id}">Add Existing Time</button><button class="small" data-request-extra-tee="${ev._id}" title="Email Brian Jones to request an additional tee time">Request Club Time</button></div>`}
            ${isTeams ? '' : `<button class="small" data-suggest-pairings="${ev._id}" title="Suggest balanced groups using handicap data">Pairings</button>`}
            <button class="small" data-calendar-google="${ev._id}" title="Add this event to Google Calendar">Google</button>
          </div>
        </div>
          </div>
          <div class="card-content">
            ${maybeSection}
            ${summaryRow}
            <div class="tees">${tees || (isTeams ? '<em>No teams</em>' : '<em>No tee times</em>')}</div>
            ${ev.notes ? `<div class="notes">${ev.notes}</div>` : ''}
            ${eventActionLegend}
            <div class="event-bottom-actions">
              <button class="small event-audit-btn event-bottom-audit-btn" data-audit="${ev._id}" title="View Audit Log" aria-label="View Audit Log">View Audit</button>
            </div>
          </div>`;
        frag.appendChild(card);
      }
      eventsEl.appendChild(frag);
    });
  }

  function teeRow(ev, tt, idx, isTeams){
    const chips = (tt.players || []).map(p => {
      // keep a safe-quoted title for tooltips so long names can be seen on hover
      const safe = String(p.name || '').replace(/"/g, '&quot;');
      const checkedIn = !!p.checkedIn;
      return `<span class="chip ${checkedIn ? 'checked-in' : ''}" title="${safe}">
        <span class="chip-label" title="${safe}">${p.name}</span>
        <span class="chip-actions">
          <button class="icon small ${checkedIn ? 'ok' : ''}" title="${checkedIn ? 'Checked in' : 'Mark checked in'}" data-toggle-checkin="${ev._id}:${tt._id}:${p._id}:${checkedIn ? '1' : '0'}">${checkedIn ? '✓' : '○'}</button>
          <button class="icon small" title="Move" data-move="${ev._id}:${tt._id}:${p._id}">↔</button>
          <button class="icon small danger" title="Remove" data-del-player="${ev._id}:${tt._id}:${p._id}">×</button>
        </span>
      </span>`;
    }).join('') || '—';
    const max = ev.teamSizeMax || 4;
    const slotMax = isTeams ? max : 4;
    const count = (tt.players || []).length;
    const checkedInCount = (tt.players || []).filter((p) => !!p.checkedIn).length;
    const openSpots = Math.max(0, slotMax - count);
    const full = count >= slotMax;
    const dateISO = toDateISO(ev && ev.date);
    let daysUntil = null;
    if (dateISO) {
      const [y, m, d] = dateISO.split('-').map(Number);
      if (Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)) {
        const eventDay = Date.UTC(y, m - 1, d);
        const now = new Date();
        const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        daysUntil = Math.round((eventDay - today) / (1000 * 60 * 60 * 24));
      }
    }
    const urgentEmpty = !isTeams && count === 0 && Number.isInteger(daysUntil) && daysUntil >= 0 && daysUntil <= 3;
    const allCheckedIn = count > 0 && checkedInCount === count;
    const left = isTeams ? (tt.name ? tt.name : `Team ${idx+1}`) : (tt.time ? fmtTime(tt.time) : '—');
    const delTitle = isTeams ? 'Remove team' : 'Remove tee time';
    const teeClasses = ['tee'];
    if (full) teeClasses.push('tee-full');
    if (urgentEmpty) teeClasses.push('tee-empty-urgent');
    // Only show edit button for teams, not tee times
    let editBtn = '';
    if (isTeams) {
      const editTitle = 'Edit team name';
      editBtn = `<button class="icon small" title="${editTitle}" data-edit-tee="${ev._id}:${tt._id}">✎</button>`;
    }
    return `<div class="${teeClasses.join(' ')}">
      <div class="tee-meta">
        <div class="tee-time">${left} <span style="font-size:11px;opacity:0.8">(${count}/${slotMax})</span></div>
        <div class="tee-summary" style="font-size:11px;color:var(--slate-700)">${openSpots} open</div>
        <div class="tee-actions">
          ${editBtn}
          <button class="icon small danger" title="${delTitle}" data-del-tee="${ev._id}:${tt._id}">×</button>
        </div>
      </div>
      <div class="tee-players">${chips}</div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="small" data-add-player="${ev._id}:${tt._id}" ${full?'disabled':''}>Add Player</button>
        <button class="small" data-checkin-all="${ev._id}:${tt._id}:${allCheckedIn ? '1' : '0'}" ${count ? '' : 'disabled'}>${allCheckedIn ? 'Clear Check-In' : 'Check In All'}</button>
      </div>
    </div>`;
  }

  on(eventsEl, 'click', async (e)=>{
    const t=(e.target.closest('[data-del-tee],[data-del-player],[data-add-tee],[data-add-player],[data-move],[data-edit],[data-del],[data-audit],[data-add-maybe],[data-remove-maybe],[data-fill-maybe],[data-edit-tee],[data-request-extra-tee],[data-suggest-pairings],[data-toggle-checkin],[data-checkin-all],[data-toggle-actions],[data-calendar-google],[data-calendar-ics]')||e.target);
    try{
      if(t.dataset.toggleActions !== undefined){
        const header = t.closest('.card-header');
        if (!header) return;
        const open = header.classList.toggle('actions-open');
        t.textContent = open ? 'Hide Actions' : 'Actions';
        return;
      }
      if(t.dataset.calendarGoogle){
        const ok = await openExternalCalendarUrlSafely(async () => {
          const ev = await getEventForAction(t.dataset.calendarGoogle);
          return ev ? buildGoogleCalendarUrl(ev) : '';
        });
        if (!ok) alert('Unable to build Google Calendar link for this event.');
        return;
      }
      if(t.dataset.calendarIcs){
        const id = String(t.dataset.calendarIcs);
        window.location.assign(`/api/events/${encodeURIComponent(id)}/calendar.ics`);
        return;
      }
      if(t.dataset.addMaybe){
        const id=t.dataset.addMaybe;
        const name=prompt('Enter your name to add to the Maybe list:'); 
        if(!name) return;
        try {
          const updatedEvent = await api(`/api/events/${id}/maybe`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
          await updateEventCard(id, updatedEvent);
          return;
        } catch (err) {
          console.error(err);
          if (err.message && err.message.includes('already on maybe list')) {
            alert('You\'re already on the maybe list for this event!');
          } else {
            alert('Failed to add to maybe list: ' + err.message);
          }
          return;
        }
      }
      if(t.dataset.fillMaybe){
        const id = t.dataset.fillMaybe;
        const name = prompt('Optional maybe-list name to confirm now (leave blank for first in list):', '') || '';
        const original = t.textContent;
        t.disabled = true;
        t.textContent = 'Filling...';
        try {
          const result = await api(`/api/events/${id}/maybe/fill`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ name: name.trim() || undefined })
          });
          await updateEventCard(id, result && result.event ? result.event : null);
        } catch (err) {
          console.error(err);
          alert('Fill failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
          t.textContent = original;
        }
        return;
      }
      if(t.dataset.removeMaybe){
        const [id, index] = t.dataset.removeMaybe.split(':');
        if(!confirm('Remove from maybe list?')) return;
        const updatedEvent = await api(`/api/events/${id}/maybe/${index}`,{ method:'DELETE' });
        await updateEventCard(id, updatedEvent);
        return;
      }
      if(t.dataset.audit){
        const id=t.dataset.audit;
        await openAuditLog(id);
        return;
      }
      if(t.dataset.requestExtraTee){
        const id = t.dataset.requestExtraTee;
        const noteInput = prompt('Leave your name so the club knows who requested this:', '');
        if (noteInput === null) return; // user cancelled
        const note = String(noteInput).trim();
        const orig = t.textContent;
        t.disabled = true;
        t.textContent = 'Sending...';
        try {
          await api(`/api/events/${id}/request-extra-tee-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
          });
          alert('Additional tee time request emailed to Brian Jones.');
        } catch (err) {
          console.error(err);
          alert('Request failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
          t.textContent = orig;
        }
        return;
      }
      if(t.dataset.toggleCheckin){
        const [eventId, teeId, playerId, currentFlag] = t.dataset.toggleCheckin.split(':');
        const nextCheckedIn = currentFlag !== '1';
        t.disabled = true;
        try {
          await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}/check-in`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ checkedIn: nextCheckedIn })
          });
          await updateEventCard(eventId);
        } catch (err) {
          console.error(err);
          alert('Check-in update failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
        }
        return;
      }
      if(t.dataset.checkinAll){
        const [eventId, teeId, allFlag] = t.dataset.checkinAll.split(':');
        const nextChecked = allFlag !== '1';
        t.disabled = true;
        try {
          await api(`/api/events/${eventId}/tee-times/${teeId}/check-in-all`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ checkedIn: nextChecked })
          });
          await updateEventCard(eventId);
        } catch (err) {
          console.error(err);
          alert('Bulk check-in failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
        }
        return;
      }
      if(t.dataset.suggestPairings){
        const id = t.dataset.suggestPairings;
        const original = t.textContent;
        t.disabled = true;
        t.textContent = 'Working...';
        try {
          const suggestion = await api(`/api/events/${id}/pairings/suggest`, { method: 'POST' });
          const groups = Array.isArray(suggestion.groups) ? suggestion.groups : [];
          if (!groups.length) {
            alert('No players found to pair.');
            return;
          }
          const summary = groups.map((g, idx) => {
            const names = (g.players || []).map((p) => {
              const h = Number.isFinite(p.handicapIndex) ? ` (${p.handicapIndex})` : '';
              return `${p.name}${h}`;
            }).join(', ');
            return `Group ${idx + 1}: ${names || 'No players'}`;
          }).join('\n');
          const applyNow = confirm(`Suggested pairings:\n\n${summary}\n\nApply these pairings?`);
          if (!applyNow) return;
          await api(`/api/events/${id}/pairings/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groups: groups.map((g) => ({
                teeId: g.teeId || null,
                playerIds: (g.players || []).map((p) => p.playerId)
              }))
            })
          });
          await updateEventCard(id);
          alert('Pairings applied.');
        } catch (err) {
          console.error(err);
          alert('Pairing action failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
          t.textContent = original;
        }
        return;
      }
      if(t.dataset.delTee){
        const [eventId, teeId] = t.dataset.delTee.split(':');
        if(!confirm('Remove this tee/team?')) return;
        const adminCode = (prompt('Admin delete code (required):') || '').trim();
        if(!adminCode) return;
        const ev = await getEventForAction(eventId);
        const isTeamEvent = !!(ev && ev.isTeamEvent);
        let notifyClub = false;
        if (!isTeamEvent) {
          const notifyChoice = String(
            prompt('Notify the club to remove this tee time from their books? Type "yes" or "no".', 'no') || 'no'
          ).trim().toLowerCase();
          notifyClub = notifyChoice === 'yes' || notifyChoice === 'y';
        }
        t.disabled = true;
        t.textContent = notifyClub ? 'Sending...' : 'Removing...';
        try {
          const params = new URLSearchParams();
          if (notifyClub) params.set('notifyClub', '1');
          if (adminCode) params.set('code', adminCode);
          const url = `/api/events/${eventId}/tee-times/${teeId}${params.toString() ? `?${params.toString()}` : ''}`;
          const resp = await api(url, { method: 'DELETE' });
          if (resp && resp.notifyClub) {
            alert('Club notified and tee time removed.');
          } else {
            alert(isTeamEvent ? 'Team removed.' : 'Tee time removed without club notification.');
          }
        } catch (err) {
          console.error(err);
          t.disabled = false;
          t.textContent = '×';
          alert('Delete tee/team failed: ' + (err.message || 'Unknown error'));
          return;
        }
        await updateEventCard(eventId);
        return;
      }
      if(t.dataset.delPlayer){
        const [eventId, teeId, playerId] = t.dataset.delPlayer.split(':');
        if(!confirm('Remove this player?')) return;
        const origText = t.textContent;
        t.disabled = true;
        t.textContent = '...';
        try {
          await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}`, { method: 'DELETE' });
          await updateEventCard(eventId);
        } catch (err) {
          console.error(err);
          t.disabled = false;
          t.textContent = origText || 'x';
          alert('Remove player failed: ' + (err.message || 'Unknown error'));
        }
        return;
      }
      if(t.dataset.addTee){
        const id=t.dataset.addTee;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id);
        if(!ev) return;
        if(ev.isTeamEvent){
            const origText = t.textContent;
            t.disabled = true;
            t.textContent = 'Adding...';
            try {
              await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
              await updateEventCard(id);
            } finally {
              t.disabled = false;
              t.textContent = origText;
            }
        }else{
            // For tee time events, show a select dialog for time
            let dialog = document.getElementById('teeTimeSelectDialog');
            if (!dialog) {
              dialog = document.createElement('dialog');
              dialog.id = 'teeTimeSelectDialog';
              // Show times from 06:30 to 23:59, formatted as HH:MM AM/PM
              const startMinutes = 6 * 60 + 30; // 6:30 AM
              const endMinutes = 23 * 60 + 59; // 23:59
              dialog.innerHTML = `
                <form method="dialog" style="min-width:220px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                  <label style="font-weight:600;">Select Tee Time
                    <select id="teeTimeSelect" required style="font-size:18px;padding:8px 6px;margin-top:8px;">
                      ${Array.from({length: endMinutes - startMinutes + 1}, (_,i) => {
                        const total = startMinutes + i;
                        const h24 = Math.floor(total/60);
                        const m = String(total%60).padStart(2,'0');
                        const h12 = ((h24+11)%12)+1;
                        const ampm = h24 < 12 ? 'AM' : 'PM';
                        const value = `${String(h24).padStart(2,'0')}:${m}`;
                        return `<option value="${value}">${h12}:${m} ${ampm}</option>`;
                      }).join('')}
                    </select>
                  </label>
                  <menu style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="teeTimeCancelBtn" value="cancel" type="button">Cancel</button>
                    <button value="ok" type="submit" class="primary">Add</button>
                  </menu>
                </form>`;
              document.body.appendChild(dialog);
            }
            const select = dialog.querySelector('#teeTimeSelect');
            select.selectedIndex = 0; // default to 06:30 AM
            return new Promise(resolve => {
              // Ensure cancel button closes the dialog
              dialog.querySelector('#teeTimeCancelBtn').onclick = function() {
                dialog.close('cancel');
              };
              dialog.onclose = async function() {
                if (dialog.returnValue !== 'ok') return resolve();
                const timeToAdd = select.value;
                const body = { time: timeToAdd };
                t.disabled = true;
                const origText = t.textContent;
                t.textContent = 'Adding...';
                await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
                await updateEventCard(id);
                t.disabled = false;
                t.textContent = origText;
                resolve();
              };
              dialog.showModal();
            });
          }
        return;
      }
      if(t.dataset.del){
        const code=(prompt('Admin delete code:') || '').trim(); if(!code) return;
        t.disabled = true;
        t.textContent = 'Deleting...';
        t.style.background = '#dc2626';
        t.style.color = 'white';
        try {
          await api(`/api/events/${t.dataset.del}?code=${encodeURIComponent(code)}`,{method:'DELETE'});
          await updateEventCard(t.dataset.del);
        } catch(err) {
          console.error(err);
          t.disabled = false;
          t.textContent = 'Delete';
          t.style.background = '';
          t.style.color = '';
          alert('Delete failed: ' + (err.message || 'Invalid code or network error'));
        }
        return;
      }
      if(t.dataset.addPlayer){
        const [id,teeId]=t.dataset.addPlayer.split(':');
        const name=prompt('Player name'); if(!name) return;
        try {
          t.disabled = true;
          t.textContent = 'Adding...';
          const updatedEvent = await api(`/api/events/${id}/tee-times/${teeId}/players`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
          await updateEventCard(id, updatedEvent);
          return;
        } catch (err) {
          console.error(err);
          t.disabled = false;
          t.textContent = '+';
          if (err.message && err.message.includes('duplicate')) {
            alert('⚠️ Duplicate name detected!\n\nA player with this name already exists on another tee time. Please use a nickname to avoid confusion.\n\nExamples:\n• "John S" or "John 2"\n• "Mike B" or "Big Mike"');
          } else {
            alert('Failed to add player: ' + (err.message || 'Unknown error'));
          }
          return;
        }
      }
      if(t.dataset.move){
        const [eventId,fromTeeId,playerId]=t.dataset.move.split(':');
        return openMoveDialog(eventId,fromTeeId,playerId);
      }
      if(t.dataset.edit){
        const id=t.dataset.edit;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id); if(!ev) return;
        editForm.elements['id'].value=id;
        editForm.elements['course'].value=ev.course||'';
        editForm.elements['date'].value=(String(ev.date).slice(0,10));
        editForm.elements['notes'].value=ev.notes||'';
        editModeSelect.value = ev.isTeamEvent ? 'teams' : 'tees';
        editTeamSizeRow.hidden = !ev.isTeamEvent;
        if (ev.isTeamEvent) editForm.elements['teamSizeMax'].value = ev.teamSizeMax || 4;
        editModal.showModal();
        return;
      }
      if(t.dataset.editTee){
        const [eventId, teeId] = t.dataset.editTee.split(':');
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
        const tee = (ev.teeTimes||[]).find(x=>x._id===teeId); if(!tee) return;
        const isTeam = ev.isTeamEvent;
        editTeeTitle.textContent = isTeam ? 'Edit Team Name' : 'Edit Tee Time';
        editTeeLabel.textContent = isTeam ? 'Team Name' : 'Tee Time';
        
        if (isTeam) {
          // Show input for team name
          editTeeInput.style.display = '';
          editTeeSelect.style.display = 'none';
          editTeeInput.value = tee.name || '';
        } else {
          // Only show free input for tee time
          editTeeInput.style.display = '';
          editTeeSelect.style.display = 'none';
          editTeeInput.value = tee.time || '';
        }
        // Always enable Save button if value is present
        const saveBtn = editTeeForm.querySelector('button[type="submit"]');
        saveBtn.disabled = false;
        
        editTeeForm.elements['eventId'].value = eventId;
        editTeeForm.elements['teeId'].value = teeId;
        editTeeForm.elements['isTeam'].value = isTeam ? '1' : '0';
        editTeeModal.showModal();
        return;
      }
    }catch(err){
      console.error(err);
      if (err && err.message) {
        alert('Action failed: ' + err.message);
      } else {
        alert('Action failed');
      }
    }
  });

  async function openMoveDialog(eventId, fromTeeId, playerId){
    const list=await api('/api/events'); const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
    const all = ev.teeTimes || [];
    const dests = all.filter(t => String(t._id) !== String(fromTeeId));
    if(!dests.length){ alert('No other destinations'); return; }

    moveForm.elements['eventId'].value=eventId;
    moveForm.elements['fromTeeId'].value=fromTeeId;
    moveForm.elements['playerId'].value=playerId;

    const html = dests.map((t)=>{
      const originalIdx = all.findIndex(tt => String(tt._id) === String(t._id));
      const label = ev.isTeamEvent ? (t.name ? t.name : ('Team ' + (originalIdx + 1))) : (t.time ? fmtTime(t.time) : '—');
      return `<label class="radio-item"><input type="radio" name="dest" value="${t._id}" required> ${label}</label>`;
    }).join('');

    moveTitle.textContent = ev.isTeamEvent ? 'Move Player to another Team' : 'Move Player to another Tee Time';
    moveChoices.innerHTML = html;
    moveModal.showModal();
  }

  on(moveForm, 'submit', async (e)=>{
    e.preventDefault();
    const eventId=moveForm.elements['eventId'].value;
    const fromTeeId=moveForm.elements['fromTeeId'].value;
    const playerId=moveForm.elements['playerId'].value;
    const toTeeId=moveForm.elements['dest'].value;
    try{
      const updatedEvent = await api(`/api/events/${eventId}/move-player`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromTeeId,toTeeId,playerId})});
      moveModal.close?.();
      await updateEventCard(eventId, updatedEvent);
    }catch(err){ 
      console.error(err);
      const msg = err.message || 'Move failed';
      alert(msg);
    }
  });

  async function openAuditLog(eventId){
    try{
      const content = $('#auditLogContent');
      const modal = $('#auditModal');
      if (!content || !modal) {
        console.error('Audit modal elements not found');
        return;
      }
      content.innerHTML = '<p style="color:var(--slate-700);text-align:center">Loading...</p>';
      modal.showModal();
      const logs = await api(`/api/events/${eventId}/audit-log`);
      if (!logs || logs.length === 0) {
        content.innerHTML = '<p style="color:var(--slate-700);text-align:center">No audit entries yet.</p>';
        return;
      }
      const items = logs.map(log => {
        const ts = new Date(log.timestamp).toLocaleString();
        let desc = '';
        if (log.action === 'add_player') {
          desc = `➕ Added <strong>${log.playerName}</strong> to ${log.teeLabel}`;
        } else if (log.action === 'remove_player') {
          desc = `➖ Removed <strong>${log.playerName}</strong> from ${log.teeLabel}`;
        } else if (log.action === 'move_player') {
          desc = `↔️ Moved <strong>${log.playerName}</strong> from ${log.fromTeeLabel} to ${log.toTeeLabel}`;
        } else if (log.action === 'check_in_player') {
          desc = `✅ Checked in <strong>${log.playerName}</strong> at ${log.teeLabel}`;
        } else if (log.action === 'undo_check_in_player') {
          desc = `⬜ Marked not checked in: <strong>${log.playerName}</strong> at ${log.teeLabel}`;
        } else if (log.action === 'bulk_check_in') {
          desc = `✅ Checked in all players at ${log.teeLabel}`;
        } else if (log.action === 'bulk_clear_check_in') {
          desc = `⬜ Cleared check-in for all players at ${log.teeLabel}`;
        }
        return `<div style="padding:8px;border-bottom:1px solid var(--slate-200)">
          <div style="font-size:14px;color:var(--slate-900)">${desc}</div>
          <div style="font-size:12px;color:var(--slate-700);margin-top:4px">${ts}</div>
        </div>`;
      }).join('');
      content.innerHTML = items;
    }catch(err){
      console.error(err);
      const content = $('#auditLogContent');
      if (content) content.innerHTML = '<p style="color:#dc2626;text-align:center">Failed to load audit log.</p>';
    }
  }

  // Golf Course Search with Dynamic API Search and Caching
  const courseSearch = $('#courseSearch');
  const courseList = $('#courseList');
  const courseInfoCard = $('#courseInfoCard');
  const courseLocation = $('#courseLocation');
  const courseDetails = $('#courseDetails');
  const courseWebsite = $('#courseWebsite');
  let coursesData = [];
  let selectedCourseData = null;
  let searchTimeout = null;
  
  const CACHE_KEY = 'golfCourseCache';
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  function getCachedCourses(query) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      
      const cache = JSON.parse(cached);
      const cacheKey = query || '_default';
      
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_DURATION) {
        console.log(`Using cached courses for "${query || 'default'}"`);
        return cache[cacheKey].data;
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }
    return null;
  }

  function setCachedCourses(query, courses) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const cache = cached ? JSON.parse(cached) : {};
      const cacheKey = query || '_default';
      
      cache[cacheKey] = {
        data: courses,
        timestamp: Date.now()
      };
      
      // Keep cache size reasonable - remove entries older than 7 days
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      Object.keys(cache).forEach(key => {
        if (cache[key].timestamp < weekAgo) {
          delete cache[key];
        }
      });
      
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log(`Cached courses for "${query || 'default'}"`);
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }

  async function searchGolfCourses(query) {
    if (!query || query.length < 2) {
      // Load default local courses for short queries
      await loadDefaultCourses();
      return;
    }
    
    // Check cache first
    const cached = getCachedCourses(query);
    if (cached) {
      coursesData = cached;
      updateCourseList(cached);
      return;
    }
    
    try {
      // Search API with the typed query
      const courses = await api(`/api/golf-courses/search?q=${encodeURIComponent(query)}`);
      coursesData = courses;
      
      // Cache the results
      setCachedCourses(query, courses);
      
      updateCourseList(courses);
    } catch (err) {
      console.error('Failed to search golf courses:', err);
      // Fall back to loading all courses on error
      await loadDefaultCourses();
    }
  }
  
  function updateCourseList(courses) {
    if (!courseList) return;
    
    courseList.innerHTML = '';
    courses.forEach((course) => {
      const option = document.createElement('option');
      option.value = course.name;
      courseList.appendChild(option);
    });
  }

  async function loadDefaultCourses() {
    // Check cache first
    const cached = getCachedCourses('');
    if (cached) {
      coursesData = cached;
      updateCourseList(cached);
      return;
    }
    
    try {
      const courses = await api('/api/golf-courses/list?limit=20');
      coursesData = courses;
      
      // Cache the default courses
      setCachedCourses('', courses);
      
      updateCourseList(courses);
    } catch (err) {
      console.error('Failed to load default courses:', err);
    }
  }

  async function loadGolfCourses() {
    // Clear datalist and coursesData to force dynamic search
    coursesData = [];
    if (courseList) courseList.innerHTML = '';
    if (courseInfoCard) courseInfoCard.style.display = 'none';
    if (courseSearch) courseSearch.value = '';
    selectedCourseData = null;
  }

  // Display course info when course is selected/typed
  function displayCourseInfo(course) {
    if (!course || !courseInfoCard) return;
    
    selectedCourseData = course;
    
    // Location
    const location = [course.city, course.state].filter(Boolean).join(', ');
    courseLocation.textContent = location ? `📍 ${location}` : '';
    
    // Details (holes, par, phone)
    const details = [];
    if (course.holes) details.push(`${course.holes} holes`);
    if (course.par) details.push(`Par ${course.par}`);
    if (course.phone) details.push(`📞 ${course.phone}`);
    
    courseDetails.innerHTML = details.map(d => `<span>${d}</span>`).join('');
    
    // Website
    if (course.website) {
      courseWebsite.innerHTML = `<a href="${course.website}" target="_blank" style="color:#15803d;text-decoration:none;font-size:12px;display:inline-flex;align-items:center;gap:4px">🌐 Visit Website</a>`;
    } else {
      courseWebsite.innerHTML = '';
    }
    
    courseInfoCard.style.display = 'block';
  }

  // Weather preview on date selection
  const dateInput = $('#dateInput');
  const weatherPreview = $('#weatherPreview');
  
  if (dateInput && weatherPreview) {
    dateInput.addEventListener('change', async (e) => {
      const selectedDate = e.target.value;
      if (!selectedDate) {
        weatherPreview.style.display = 'none';
        return;
      }
      
      // Show loading state
      weatherPreview.style.display = 'block';
      weatherPreview.innerHTML = '<div style="color:#3b82f6;font-size:13px">Loading weather...</div>';
      
      // Simple date validation - show weather emoji based on how far in future
      const daysUntil = Math.ceil((new Date(selectedDate) - new Date()) / (1000 * 60 * 60 * 24));
      
      if (daysUntil > 16) {
        weatherPreview.innerHTML = '<div style="font-size:13px;color:#6b7280">⛅ Weather forecast available closer to date</div>';
      } else if (daysUntil < 0) {
        weatherPreview.style.display = 'none';
      } else {
        // Show generic preview (actual weather will be fetched on backend)
        weatherPreview.innerHTML = `<div style="font-size:13px;color:#1e40af">
          <span style="font-size:20px">🌤️</span> Weather forecast will be added automatically
        </div>`;
      }
    });
  }

  // Load courses when modal opens
  if (newTeeBtn) {
    newTeeBtn.addEventListener('click', () => {
      loadGolfCourses();
    });
  }
  
  if (newTeamBtn) {
    newTeamBtn.addEventListener('click', () => {
      loadGolfCourses();
    });
  }

  // Handle course search input with debounced API search
  if (courseSearch) {
    // Handle Enter key to submit form
    courseSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Find the submit button and click it
        const submitBtn = eventForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    });
    
    courseSearch.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      // Debounce API search (wait 300ms after user stops typing)
      searchTimeout = setTimeout(() => {
        searchGolfCourses(value);
      }, 300);
      
      // Find exact match in current coursesData
      const course = coursesData.find(c => c.name === value);
      
      if (course) {
        // Exact match found - show course info
        displayCourseInfo(course);
      } else {
        // No match or partial input - hide course info
        courseInfoCard.style.display = 'none';
        selectedCourseData = null;
      }
    });
    
    // Also listen for selection from datalist
    courseSearch.addEventListener('change', (e) => {
      const value = e.target.value;
      const course = coursesData.find(c => c.name === value);
      
      if (course) {
        displayCourseInfo(course);
      } else if (value.trim() !== '') {
        // User typed custom course name
        courseInfoCard.style.display = 'none';
        selectedCourseData = null;
      }
    });
  }

  // Expose cache clearing function globally for debugging
  window.clearCourseCache = function() {
    try {
      localStorage.removeItem(CACHE_KEY);
      console.log('Course cache cleared!');
      return 'Course cache cleared successfully';
    } catch (e) {
      console.error('Failed to clear cache:', e);
      return 'Failed to clear cache';
    }
  };

  // Update only a single event card in the DOM
  async function updateEventCard(eventId, prefetchedEvent = null) {
    try {
      const ev = prefetchedEvent || await fetchEventById(eventId);
      if (!ev) return load(); // fallback
      upsertCachedEvent(ev);
      // Find the card
      const card = document.querySelector(`.card [data-edit='${eventId}']`)?.closest('.card');
      if (!card) return load(); // fallback
      // Re-render just this card
      const isTeams = !!ev.isTeamEvent;
      let teesArr = ev.teeTimes || [];
      if (!isTeams) {
        teesArr = teesArr.slice().sort((a, b) => {
          if (!a.time || !b.time) return 0;
          const [ah, am] = a.time.split(":").map(Number);
          const [bh, bm] = b.time.split(":").map(Number);
          return ah !== bh ? ah - bh : am - bm;
        });
      }
      const slotCap = isTeams ? (ev.teamSizeMax || 4) : 4;
      const slotCount = teesArr.length;
      const registeredCount = teesArr.reduce((sum, tt) => sum + ((tt.players || []).length), 0);
      const checkedInCount = teesArr.reduce((sum, tt) => sum + ((tt.players || []).filter((p) => !!p.checkedIn).length), 0);
      const totalCapacity = slotCount * slotCap;
      const openCount = Math.max(0, totalCapacity - registeredCount);
      const maybeCount = (ev.maybeList || []).length;
      const summaryRow = `<div class=\"row\" style=\"gap:8px;flex-wrap:wrap;margin:6px 0 10px 0;font-size:12px;color:var(--slate-700)\">\n        <span><strong>${registeredCount}</strong> registered</span>\n        <span><strong>${checkedInCount}</strong> checked in</span>\n        <span><strong>${openCount}</strong> open</span>\n        <span><strong>${maybeCount}</strong> maybe</span>\n        <span><strong>${slotCount}</strong> ${isTeams ? 'teams' : 'tee times'}</span>\n      </div>`;
      const tees = teesArr.map((tt,idx)=>teeRow(ev,tt,idx,isTeams)).join('');
      const maybeList = (ev.maybeList || []).map((name, idx) => {
        const safe = String(name).replace(/"/g, '&quot;');
        return `<span class=\"maybe-chip\" title=\"${safe}\">\n        <span class=\"maybe-name\">${name}</span>\n        <button class=\"icon small danger\" title=\"Remove\" data-remove-maybe=\"${ev._id}:${idx}\">×</button>\n      </span>`;
      }).join('');
      const maybeSection = `\n      <div class=\"maybe-section\">\n        <div class=\"maybe-header\">\n          <h4>🤔 Maybe List</h4>\n          <div class=\"maybe-controls\">\n            <button class=\"small maybe-btn\" data-add-maybe=\"${ev._id}\">+ Interested</button>\n            <button class=\"small maybe-btn\" data-fill-maybe=\"${ev._id}\" title=\"Move someone from maybe list into an open spot\">Fill Spot</button>\n          </div>\n        </div>\n        <div class=\"maybe-list\">\n          ${maybeList || '<em style=\"color:var(--slate-700);font-size:11px;opacity:0.7\">No one yet</em>'}\n        </div>\n      </div>\n    `;
      const weatherSummary = weatherSummaryMarkup(ev);
      const courseDetailsBits = [];
      if (ev.courseInfo && ev.courseInfo.city && ev.courseInfo.state) {
        courseDetailsBits.push(`<span>📍 ${escapeHtml(ev.courseInfo.city)}, ${escapeHtml(ev.courseInfo.state)}</span>`);
      }
      if (ev.courseInfo && ev.courseInfo.phone) {
        courseDetailsBits.push(`<span>📞 ${escapeHtml(ev.courseInfo.phone)}</span>`);
      }
      if (ev.courseInfo && ev.courseInfo.website) {
        courseDetailsBits.push(`<span><a href="${escapeHtml(ev.courseInfo.website)}" target="_blank" rel="noopener">🔗 Website</a></span>`);
      }
      if (ev.courseInfo && ev.courseInfo.holes && ev.courseInfo.par) {
        courseDetailsBits.push(`<span>⛳ ${escapeHtml(ev.courseInfo.holes)} holes, Par ${escapeHtml(ev.courseInfo.par)}</span>`);
      }
      const courseDetails = courseDetailsBits.length
        ? `<div class="course-details">${courseDetailsBits.join('')}</div>`
        : '';
      const eventActionLegend = `\n          <div class=\"event-action-legend\" aria-label=\"Golfer action legend\">\n            <span class=\"event-action-title\">Actions</span>\n            <span class=\"event-action-item\"><span class=\"event-action-symbol\">○</span>Individual check-in</span>\n            <span class=\"event-action-item\"><span class=\"event-action-pill\">All</span>Group check-in</span>\n            <span class=\"event-action-item\"><span class=\"event-action-symbol\">↔</span>Move golfer</span>\n            <span class=\"event-action-item\"><span class=\"event-action-symbol danger\">×</span>Delete golfer</span>\n          </div>\n      `;
      card.innerHTML = `
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-title-row">
            <h3 class="card-title">${courseTitleMarkup(ev)}</h3>
            <div class="event-top-actions">
              <button class="event-top-btn event-top-edit" data-edit="${ev._id}" title="Edit Event" aria-label="Edit Event">✏</button>
              <button class="event-top-btn event-top-delete" data-del="${ev._id}" title="Delete Event" aria-label="Delete Event">✕</button>
            </div>
          </div>
          <div class="card-date">
            <span>${fmtDate(ev.date)}</span>
            ${weatherSummary}
          </div>
          ${courseDetails}
        </div>
        <div class="card-actions">
          <button class="small event-actions-toggle" data-toggle-actions title="Show/hide event actions">Actions</button>
          <div class="button-row">
            ${isTeams ? `<button class="small" data-add-tee="${ev._id}">Add Team</button>` : `<div class="time-action-pair"><button class="small" data-add-tee="${ev._id}">Add Existing Time</button><button class="small" data-request-extra-tee="${ev._id}" title="Email Brian Jones to request an additional tee time">Request Club Time</button></div>`}
            ${isTeams ? '' : `<button class="small" data-suggest-pairings="${ev._id}" title="Suggest balanced groups using handicap data">Pairings</button>`}
            <button class="small" data-calendar-google="${ev._id}" title="Add this event to Google Calendar">Google</button>
          </div>
        </div>
      </div>
      <div class="card-content">
        ${maybeSection}
        ${summaryRow}
        <div class="tees">${tees || (isTeams ? '<em>No teams</em>' : '<em>No tee times</em>')}</div>
        ${ev.notes ? `<div class="notes">${ev.notes}</div>` : ''}
        ${eventActionLegend}
        <div class="event-bottom-actions">
          <button class="small event-audit-btn event-bottom-audit-btn" data-audit="${ev._id}" title="View Audit Log" aria-label="View Audit Log">View Audit</button>
        </div>
      </div>`;
    } catch (e) {
      console.error('Failed to update event card:', e);
      load();
    }
  }

  updateLastUpdated('Loading…');
  load();
  startAutoRefresh();
})();







