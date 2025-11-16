// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
/* public/script.js v3.13 — calendar view with date selection */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Debug logging
  const debugLog = (type, message, data) => {
    const debugLogs = $('#debugLogs');
    if (!debugLogs) return;
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : type === 'warn' ? '#ffd43b' : '#74c0fc';
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
    const logEntry = document.createElement('div');
    logEntry.style.cssText = `border-left:3px solid ${color};padding:4px 8px;margin:4px 0;background:rgba(255,255,255,0.05)`;
    logEntry.innerHTML = `<span style="color:#888">[${timestamp}]</span> ${icon} <strong style="color:${color}">${type.toUpperCase()}</strong>: ${message}${data ? `\n${JSON.stringify(data, null, 2)}` : ''}`;
    debugLogs.appendChild(logEntry);
    debugLogs.scrollTop = debugLogs.scrollHeight;
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

  // Calendar elements
  const calendarGrid = $('#calendarGrid');
  const currentMonthEl = $('#currentMonth');
  const prevMonthBtn = $('#prevMonth');
  const nextMonthBtn = $('#nextMonth');
  const selectedDateTitle = $('#selectedDateTitle');

  // State
  let allEvents = [];
  let currentDate = new Date();
  let selectedDate = null;

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
  const auditModal = $('#auditModal');
  const auditLogContent = $('#auditLogContent');

  if (!eventsEl) return;

  // Generate time options from 6:00 AM to 7:00 PM in 9-minute intervals
  function generateTimeOptions() {
    const options = [];
    const startMinutes = 6 * 60; // 6:00 AM
    const endMinutes = 19 * 60; // 7:00 PM
    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 9) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      options.push(time);
    }
    return options;
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
    debugLog('info', `API Request: ${opts?.method || 'GET'} ${path}`, opts?.body ? JSON.parse(opts.body) : null);
    
    // Add timeout for slow requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const r=await fetch(path, { ...opts, signal: controller.signal }); 
      clearTimeout(timeoutId);
      
      const ct=r.headers.get('content-type')||''; 
      const body = ct.includes('application/json') ? await r.json() : await r.text();
      if(!r.ok) {
        const msg = (typeof body === 'object' && body.message) || (typeof body === 'object' && body.error) || body || ('HTTP '+r.status);
        debugLog('error', `API Error: ${opts?.method || 'GET'} ${path} (${r.status})`, body);
        throw new Error(msg);
      }
      debugLog('success', `API Success: ${opts?.method || 'GET'} ${path}`, body);
      return body;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        debugLog('error', `API Timeout: ${opts?.method || 'GET'} ${path}`, { error: 'Request timed out after 30 seconds' });
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      debugLog('error', `API Failed: ${opts?.method || 'GET'} ${path}`, { error: err.message });
      throw err;
    }
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
      const body=normalizeForm(eventForm);
      const isTeams = (body.mode === 'teams');
      
      // Get course name from search input
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
        payload.teeTime = body.teeTime;
      }
      
      await api('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      modal?.close?.(); 
      eventForm.reset(); 
      courseInfoCard.style.display = 'none';
      selectedCourseData = null;
      load();
    }catch(err){ console.error(err); alert('Create failed'); }
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

  // Edit tee/team save
  on(editTeeForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const data = normalizeForm(editTeeForm);
      const eventId = data.eventId;
      const teeId = data.teeId;
      const isTeam = data.isTeam === '1';
      // Always use input value for tee times (select is hidden)
      let value = (data.value || '').trim();
      if (!value) {
        alert(isTeam ? 'Team name is required' : 'Tee time is required');
        return;
      }
      // For tee times, validate HH:MM format (allow H:MM and pad)
      if (!isTeam) {
        let m = /^\d{1,2}:\d{2}$/.exec(value);
        if (!m) {
          alert('Tee time must be in HH:MM format (e.g., 07:00)');
          return;
        }
        // Pad to HH:MM
        let [h, mm] = value.split(':');
        value = `${h.padStart(2,'0')}:${mm}`;
      }
      const payload = isTeam ? { name: value } : { time: value };
      await api(`/api/events/${eventId}/tee-times/${teeId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      editTeeModal?.close?.(); load();
    }catch(err){ 
      console.error(err); 
      alert('Save failed: ' + (err.message || 'Unknown error'));
    }
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
    
    // Build event date map (YYYY-MM-DD format)
    const eventDates = new Set();
    allEvents.forEach(ev => {
      if (ev.date) {
        const dateStr = String(ev.date).slice(0, 10);
        eventDates.add(dateStr);
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
    
    dayEl.addEventListener('click', () => {
      if (isOtherMonth) {
        // Navigate to other month when clicking its days
        currentDate = new Date(actualYear, actualMonth, day);
        renderCalendar();
      }
      selectDate(dateStr);
    });
    
    return dayEl;
  }
  
  function selectDate(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    renderEventsForDate();
  }
  
  function renderEventsForDate() {
    if (!selectedDate) {
      selectedDateTitle.textContent = 'Select a date';
      eventsEl.innerHTML = '<div style="color:#ffffff;padding:20px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">Select a date from the calendar to view tee times</div>';
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
  
  // Calendar navigation
  on(prevMonthBtn, 'click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  
  on(nextMonthBtn, 'click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  async function load(){ 
    try{ 
      const list = await api('/api/events'); 
      allEvents = Array.isArray(list) ? list : [];
      renderCalendar();
      if (selectedDate) {
        renderEventsForDate();
      } else {
        eventsEl.innerHTML = '<div style="color:#ffffff;padding:20px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">Select a date from the calendar to view tee times</div>';
      }
    } catch(e) { 
      console.error(e); 
      eventsEl.innerHTML='<div class="card">Failed to load events.</div>'; 
    } 
  }

  function render(list){
    eventsEl.innerHTML='';
    for(const ev of list){
      const card=document.createElement('div'); card.className='card';
      const isTeams = !!ev.isTeamEvent;
      const tees=(ev.teeTimes||[]).map((tt,idx)=>teeRow(ev,tt,idx,isTeams)).join('');
      
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
            <button class="small" data-add-maybe="${ev._id}" style="font-size:11px;padding:3px 8px">+ Interested</button>
          </div>
          <div class="maybe-list">
            ${maybeList || '<em style="color:var(--slate-700);font-size:11px;opacity:0.7">No one yet</em>'}
          </div>
        </div>
      `;
      
      // Weather icon inline with date (doubled size)
      const weatherIcon = ev.weather && ev.weather.icon 
        ? `<span class="weather-inline" style="font-size:3em;cursor:pointer" title="${ev.weather.description || 'Weather forecast'}" data-weather-info='${JSON.stringify({temp: ev.weather.temp, desc: ev.weather.description, icon: ev.weather.icon})}'>${ev.weather.icon}</span>` 
        : '';
      
      // Course details
      const courseDetails = ev.courseInfo && (ev.courseInfo.city || ev.courseInfo.phone || ev.courseInfo.website) 
        ? `<div style="font-size:13px;color:var(--slate-700);margin-top:4px">
            ${ev.courseInfo.city && ev.courseInfo.state ? `<span>📍 ${ev.courseInfo.city}, ${ev.courseInfo.state}</span>` : ''}
            ${ev.courseInfo.phone ? `<span style="margin-left:12px">📞 ${ev.courseInfo.phone}</span>` : ''}
            ${ev.courseInfo.website ? `<span style="margin-left:12px"><a href="${ev.courseInfo.website}" target="_blank" style="color:var(--blue-600);text-decoration:none">🔗 Website</a></span>` : ''}
            ${ev.courseInfo.holes && ev.courseInfo.par ? `<span style="margin-left:12px">⛳ ${ev.courseInfo.holes} holes, Par ${ev.courseInfo.par}</span>` : ''}
          </div>`
        : '';
      
      card.innerHTML = `
        <div class="card-header">
          <div class="card-header-left">
            <h3 class="card-title">${ev.course || 'Course'}</h3>
            <div class="card-date">
              ${fmtDate(ev.date)} ${weatherIcon}
              <button class="small" data-audit="${ev._id}" style="font-size:11px;padding:3px 8px;margin-left:8px;opacity:0.7" title="View Audit Log">📋</button>
            </div>
            ${courseDetails}
          </div>
          <div class="button-row">
            <button class="small" data-add-tee="${ev._id}">${isTeams ? 'Add Team' : 'Add Tee Time'}</button>
            <button class="small" data-edit="${ev._id}">Edit</button>
            <button class="small" data-del="${ev._id}">Delete</button>
          </div>
        </div>
        <div class="card-content">
          ${maybeSection}
          <div class="tees">${tees || (isTeams ? '<em>No teams</em>' : '<em>No tee times</em>')}</div>
          ${ev.notes ? `<div class="notes">${ev.notes}</div>` : ''}
        </div>`;
      eventsEl.appendChild(card);
    }
    // Add touch/click handler for weather icon to show temp/desc on mobile
    setTimeout(() => {
      document.querySelectorAll('.weather-inline').forEach(el => {
        // Remove any previous handler
        el.removeEventListener('touchstart', el._weatherTouchHandler);
        el.removeEventListener('click', el._weatherTouchHandler);
        // Handler
        el._weatherTouchHandler = function(e) {
          e.preventDefault();
          e.stopPropagation();
          // Remove any existing popup
          document.querySelectorAll('.weather-popup').forEach(p => p.remove());
          const info = el.dataset.weatherInfo ? JSON.parse(el.dataset.weatherInfo) : {};
          const popup = document.createElement('div');
          popup.className = 'weather-popup';
          popup.style.position = 'fixed';
          popup.style.zIndex = 9999;
          popup.style.background = '#fff';
          popup.style.color = '#222';
          popup.style.border = '1px solid #bbb';
          popup.style.borderRadius = '8px';
          popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          popup.style.padding = '12px 18px';
          popup.style.fontSize = '1.1em';
          popup.style.minWidth = '120px';
          popup.style.textAlign = 'center';
          popup.innerHTML = `<div style="font-size:2em">${info.icon||''}</div><div style="margin:4px 0">${info.temp !== undefined && info.temp !== null ? info.temp + '°F' : ''}</div><div style="font-size:0.95em;color:#555">${info.desc||''}</div>`;
          // Position popup near touch/click
          let x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) || 100;
          let y = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY) || 100;
          popup.style.left = Math.max(10, x - 60) + 'px';
          popup.style.top = Math.max(10, y + 10) + 'px';
          document.body.appendChild(popup);
          // Remove popup on next touch/click/scroll
          const removePopup = () => { popup.remove(); document.removeEventListener('touchstart', removePopup, true); document.removeEventListener('click', removePopup, true); document.removeEventListener('scroll', removePopup, true); };
          setTimeout(() => {
            document.addEventListener('touchstart', removePopup, true);
            document.addEventListener('click', removePopup, true);
            document.addEventListener('scroll', removePopup, true);
          }, 10);
        };
        el.addEventListener('touchstart', el._weatherTouchHandler);
        el.addEventListener('click', el._weatherTouchHandler);
      });
    }, 0);
  }

  function teeRow(ev, tt, idx, isTeams){
    const chips = (tt.players || []).map(p => {
      // keep a safe-quoted title for tooltips so long names can be seen on hover
      const safe = String(p.name || '').replace(/"/g, '&quot;');
      return `<span class="chip" title="${safe}">
        <span class="chip-label" title="${safe}">${p.name}</span>
        <span class="chip-actions">
          <button class="icon small" title="Move" data-move="${ev._id}:${tt._id}:${p._id}">↔</button>
          <button class="icon small danger" title="Remove" data-del-player="${ev._id}:${tt._id}:${p._id}">×</button>
        </span>
      </span>`;
    }).join('') || '—';
    const max = ev.teamSizeMax || 4;
    const full = (tt.players || []).length >= (isTeams ? max : 4);
    const left = isTeams ? (tt.name ? tt.name : `Team ${idx+1}`) : (tt.time ? fmtTime(tt.time) : '—');
    const delTitle = isTeams ? 'Remove team' : 'Remove tee time';
    // Only show edit button for teams, not tee times
    let editBtn = '';
    if (isTeams) {
      const editTitle = 'Edit team name';
      editBtn = `<button class="icon small" title="${editTitle}" data-edit-tee="${ev._id}:${tt._id}">✎</button>`;
    }
    return `<div class="tee ${full ? 'tee-full' : ''}">
      <div class="tee-meta">
        <div class="tee-time">${left}</div>
        <div class="tee-actions">
          ${editBtn}
          <button class="icon small danger" title="${delTitle}" data-del-tee="${ev._id}:${tt._id}">×</button>
        </div>
      </div>
      <div class="tee-players">${chips}</div>
      <div class="row">
        <button class="small" data-add-player="${ev._id}:${tt._id}" ${full?'disabled':''}>Add\nPlayer</button>
      </div>
    </div>`;
  }

  on(eventsEl, 'click', async (e)=>{
    const t=(e.target.closest('[data-del-tee],[data-del-player],[data-add-tee],[data-add-player],[data-move],[data-edit],[data-del],[data-audit],[data-add-maybe],[data-remove-maybe],[data-edit-tee]')||e.target);
    try{
      if(t.dataset.addMaybe){
        const id=t.dataset.addMaybe;
        const name=prompt('Enter your name to add to the Maybe list:'); 
        if(!name) return;
        try {
          await api(`/api/events/${id}/maybe`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
          return load();
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
      if(t.dataset.removeMaybe){
        const [id, index] = t.dataset.removeMaybe.split(':');
        if(!confirm('Remove from maybe list?')) return;
        await api(`/api/events/${id}/maybe/${index}`,{ method:'DELETE' });
        return load();
      }
      if(t.dataset.audit){
        const id=t.dataset.audit;
        await openAuditLog(id);
        return;
      }
      if(t.dataset.delTee){
        const [eventId, teeId] = t.dataset.delTee.split(':');
        if(!confirm('Remove this tee/team?')) return;
        t.disabled = true;
        t.textContent = 'Removing...';
        await api(`/api/events/${eventId}/tee-times/${teeId}`, { method: 'DELETE' });
        await load();
        return;
      }
      if(t.dataset.delPlayer){
        const [eventId, teeId, playerId] = t.dataset.delPlayer.split(':');
        if(!confirm('Remove this player?')) return;
        t.disabled = true;
        t.textContent = '...';
        await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}`, { method: 'DELETE' });
        await load();
        return;
      }
      if(t.dataset.addTee){
        const id=t.dataset.addTee;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id);
        if(!ev) return;
        if(ev.isTeamEvent){
            // Build a set of displayed team names (includes unnamed teams rendered as "Team {index+1}")
            const used = new Set();
            (ev.teeTimes || []).forEach((tt, idx) => {
              if (tt && tt.name) used.add(String(tt.name).trim());
              else used.add(`Team ${idx+1}`);
            });
            // Find the smallest Team N not already used
            let nextTeamNum = 1;
            while (used.has(`Team ${nextTeamNum}`)) nextTeamNum++;
            const name = `Team ${nextTeamNum}`;
            await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name }) });
          }else{
            // For tee time events, show a select dialog for time
            let dialog = document.getElementById('teeTimeSelectDialog');
            if (!dialog) {
              dialog = document.createElement('dialog');
              dialog.id = 'teeTimeSelectDialog';
              dialog.innerHTML = `
                <form method="dialog" style="min-width:220px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                  <label style="font-weight:600;">Select Tee Time
                    <select id="teeTimeSelect" required style="font-size:18px;padding:8px 6px;margin-top:8px;">
                      ${Array.from({length: 48}, (_,i) => {
                        const h = String(Math.floor(i/2)).padStart(2,'0');
                        const m = i%2===0 ? '00' : '30';
                        return `<option value="${h}:${m}">${h}:${m}</option>`;
                      }).join('')}
                    </select>
                  </label>
                  <menu style="display:flex;gap:10px;justify-content:flex-end;">
                    <button value="cancel" type="button">Cancel</button>
                    <button value="ok" type="submit" class="primary">Add</button>
                  </menu>
                </form>`;
              document.body.appendChild(dialog);
            }
            const select = dialog.querySelector('#teeTimeSelect');
            select.selectedIndex = 14; // default to 07:00
            return new Promise(resolve => {
              dialog.onclose = async function() {
                if (dialog.returnValue !== 'ok') return resolve();
                const timeToAdd = select.value;
                const body = { time: timeToAdd };
                t.disabled = true;
                const origText = t.textContent;
                t.textContent = 'Adding...';
                await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
                await load();
                t.disabled = false;
                t.textContent = origText;
                resolve();
              };
              dialog.showModal();
            });
          }
        await load();
        return;
      }
      if(t.dataset.addPlayer){
        const [id,teeId]=t.dataset.addPlayer.split(':');
        const name=prompt('Player name'); if(!name) return;
        try {
          t.disabled = true;
          t.textContent = 'Adding...';
          await api(`/api/events/${id}/tee-times/${teeId}/players`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
          await load();
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
      if(t.dataset.del){
        const code=prompt('Admin delete code:'); if(!code) return;
        t.disabled = true;
        t.textContent = 'Deleting...';
        t.style.background = '#dc2626';
        t.style.color = 'white';
        try {
          await api(`/api/events/${t.dataset.del}?code=${encodeURIComponent(code)}`,{method:'DELETE'});
          await load();
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
      await api(`/api/events/${eventId}/move-player`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromTeeId,toTeeId,playerId})});
      moveModal.close?.(); load();
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

  load();
})();
