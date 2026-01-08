(() => {
  const EVENT_DATE = '2026-06-13';
  const PIN_CODE = '123';
  const API_BASE = '/api/reunion';

  const defaultState = {
    startedAt: Date.now(),
    lastSaved: Date.now(),
    eventInfo: {
      location: 'Set city + main venue',
      contact: '',
      lodging: '',
      notes: '35th reunion - keep the weekend welcoming, nostalgic, and simple.',
    },
    attendees: [],
    logistics: [],
    schedule: [],
    meetings: [],
  };

  const el = (id) => document.getElementById(id);
  const countdownDate = new Date(`${EVENT_DATE}T00:00:00`);

  const escapeHtml = (str = '') =>
    str
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatDate = (value) => {
    if (!value) return '';
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const cloneDefaults = () => JSON.parse(JSON.stringify(defaultState));

  const normalizePlan = (plan = {}) => ({
    startedAt: plan.startedAt ? new Date(plan.startedAt).getTime() : Date.now(),
    lastSaved: plan.updatedAt ? new Date(plan.updatedAt).getTime() : Date.now(),
    eventInfo: { ...defaultState.eventInfo, ...(plan.eventInfo || {}) },
    attendees: Array.isArray(plan.attendees) ? plan.attendees : [],
    logistics: Array.isArray(plan.logistics) ? plan.logistics : [],
    schedule: Array.isArray(plan.schedule) ? plan.schedule : [],
    meetings: Array.isArray(plan.meetings) ? plan.meetings : [],
  });

  let state = cloneDefaults();

  const api = async (path, options = {}) => {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && data.error) || res.statusText || 'Request failed');
    }
    return data;
  };

  const ensurePin = (actionLabel = 'continue') => {
    const input = window.prompt(`Enter PIN to ${actionLabel}:`);
    if (input !== PIN_CODE) {
      if (input !== null) alert('Incorrect PIN.');
      return null;
    }
    return input;
  };

  const getId = (item) => (item && (item.id || item._id || item._id?.toString())) || '';

  const renderMeta = () => {
    const lastSavedEl = el('lastSaved');
    if (lastSavedEl) {
      lastSavedEl.textContent = `Saved ${new Date(state.lastSaved).toLocaleString()}`;
    }

    const going = state.attendees.filter((a) => a.status === 'going').length;
    const maybe = state.attendees.filter((a) => a.status === 'maybe').length;
    const pending = state.attendees.filter((a) => a.status === 'pending').length;
    const attendeeStats = el('attendeeStats');
    const attendeeCount = el('attendeeCount');
    if (attendeeStats) attendeeStats.textContent = `${going} going · ${maybe} maybe`;
    if (attendeeCount) attendeeCount.textContent = `${going} / ${maybe} (${pending} not yet)`;

    const openLogistics = state.logistics.filter((l) => !['done', 'booked'].includes(l.status)).length;
    const logisticsStats = el('logisticsStats');
    const openLogisticsCount = el('openLogisticsCount');
    if (logisticsStats) logisticsStats.textContent = `${openLogistics} open`;
    if (openLogisticsCount) openLogisticsCount.textContent = openLogistics.toString();

    const upcoming = nextMeeting();
    const nextMeetingPill = el('nextMeetingPill');
    const meetingStats = el('meetingStats');
    if (upcoming) {
      const when = formatDate(upcoming.date);
      const time = upcoming.time ? ` · ${upcoming.time}` : '';
      if (nextMeetingPill) nextMeetingPill.textContent = `Next: ${when}${time} (${upcoming.topic})`;
      if (meetingStats) meetingStats.textContent = `${when}${time}`;
    } else {
      if (nextMeetingPill) nextMeetingPill.textContent = 'No meeting scheduled';
      if (meetingStats) meetingStats.textContent = 'No meetings';
    }

    const now = Date.now();
    const totalMs = countdownDate.getTime() - state.startedAt;
    const elapsedMs = now - state.startedAt;
    const ratio = Math.min(1, Math.max(0, elapsedMs / Math.max(totalMs, 1)));
    const daysLeft = Math.max(0, Math.ceil((countdownDate.getTime() - now) / (1000 * 60 * 60 * 24)));
    const weeksLeft = Math.max(0, Math.ceil(daysLeft / 7));
    const daysEl = el('daysLeft');
    const weeksEl = el('weeksLeft');
    const bar = el('countdownBar');
    if (daysEl) daysEl.textContent = daysLeft.toString();
    if (weeksEl) weeksEl.textContent = weeksLeft.toString();
    if (bar) bar.style.width = `${Math.round(ratio * 100)}%`;
  };

  const renderEventInfo = () => {
    const form = el('eventInfoForm');
    if (!form) return;
    form.location.value = state.eventInfo.location || '';
    form.contact.value = state.eventInfo.contact || '';
    form.lodging.value = state.eventInfo.lodging || '';
    form.notes.value = state.eventInfo.notes || '';
  };

  const statusLabel = (status) => {
    switch (status) {
      case 'going':
        return 'Going';
      case 'maybe':
        return 'Maybe';
      case 'pending':
        return 'Not yet';
      case 'open':
        return 'Open';
      case 'in-progress':
        return 'In progress';
      case 'booked':
        return 'Booked';
      case 'done':
        return 'Done';
      case 'firm':
        return 'Firm';
      case 'planned':
        return 'Planned';
      case 'scheduled':
        return 'Scheduled';
      default:
        return status || 'Unknown';
    }
  };

  const typeLabel = (type) => {
    switch (type) {
      case 'venue':
        return 'Venue';
      case 'catering':
        return 'Food & drink';
      case 'lodging':
        return 'Lodging';
      case 'program':
        return 'Program';
      case 'outreach':
        return 'Outreach';
      case 'social':
        return 'Social';
      case 'prep':
        return 'Prep';
      case 'travel':
        return 'Travel';
      default:
        return 'Other';
    }
  };

  const renderAttendees = () => {
    const list = el('attendeeList');
    if (!list) return;
    if (!state.attendees.length) {
      list.innerHTML = `<div class="empty">Add everyone so we know who is coming, who is helping, and who to nudge.</div>`;
      return;
    }
    const order = { going: 0, maybe: 1, pending: 2 };
    const rows = state.attendees
      .slice()
      .sort((a, b) => order[a.status] - order[b.status])
      .map(
        (a) => `
        <div class="item-card" data-id="${getId(a)}">
          <div class="item-head">
            <h3>${escapeHtml(a.name)}</h3>
            <span class="status-pill status-${a.status}">${statusLabel(a.status)}</span>
          </div>
          <div class="row">
            ${a.role ? `<span class="badge">${escapeHtml(a.role)}</span>` : ''}
            ${a.origin ? `<span class="badge" style="background:#e0f2fe;color:#075985">From ${escapeHtml(a.origin)}</span>` : ''}
          </div>
          ${a.notes ? `<p class="notes">${escapeHtml(a.notes)}</p>` : ''}
          <div class="controls">
            <label style="font-weight:700;font-size:12px;color:#334155">Status
              <select data-action="attendee-status" data-id="${getId(a)}">
                <option value="going"${a.status === 'going' ? ' selected' : ''}>Going</option>
                <option value="maybe"${a.status === 'maybe' ? ' selected' : ''}>Maybe</option>
                <option value="pending"${a.status === 'pending' ? ' selected' : ''}>Not yet</option>
              </select>
            </label>
            <button data-remove-attendee="${getId(a)}" class="ghost danger" type="button">Remove</button>
          </div>
        </div>`
      )
      .join('');
    list.innerHTML = rows;
  };

  const renderLogistics = () => {
    const list = el('logisticsList');
    if (!list) return;
    if (!state.logistics.length) {
      list.innerHTML = `<div class="empty">Track venue, vendors, budget, and comms here.</div>`;
      return;
    }
    const rows = state.logistics
      .slice()
      .sort((a, b) => (a.due || '').localeCompare(b.due || ''))
      .map(
        (item) => `
        <div class="item-card" data-id="${getId(item)}">
          <div class="item-head">
            <h3>${escapeHtml(item.title)}</h3>
            <span class="badge">${typeLabel(item.category)}</span>
          </div>
          <div class="row">
            ${item.owner ? `<span class="badge" style="background:#dcfce7;color:#166534">Owner: ${escapeHtml(item.owner)}</span>` : ''}
            ${item.due ? `<span class="badge" style="background:#ffe4e6;color:#be123c">Due ${formatDate(item.due)}</span>` : ''}
          </div>
          ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ''}
          <div class="controls">
            <label style="font-weight:700;font-size:12px;color:#334155">Status
              <select data-action="logistics-status" data-id="${getId(item)}">
                <option value="open"${item.status === 'open' ? ' selected' : ''}>Open</option>
                <option value="in-progress"${item.status === 'in-progress' ? ' selected' : ''}>In progress</option>
                <option value="booked"${item.status === 'booked' ? ' selected' : ''}>Booked</option>
                <option value="done"${item.status === 'done' ? ' selected' : ''}>Done</option>
              </select>
            </label>
            <button data-remove-logistics="${getId(item)}" class="ghost danger" type="button">Remove</button>
          </div>
        </div>`
      )
      .join('');
    list.innerHTML = rows;
  };

  const renderSchedule = () => {
    const list = el('scheduleList');
    if (!list) return;
    if (!state.schedule.length) {
      list.innerHTML = `<div class="empty">Add the whole weekend agenda here.</div>`;
      return;
    }
    const rows = state.schedule
      .slice()
      .sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`))
      .map(
        (item) => `
        <div class="item-card" data-id="${getId(item)}">
          <div class="item-head">
            <h3>${escapeHtml(item.title)}</h3>
            <span class="badge">${typeLabel(item.type)}</span>
          </div>
          <div class="row">
            ${item.date ? `<span class="badge" style="background:#e0f2fe;color:#075985">${formatDate(item.date)}${item.time ? ' · ' + item.time : ''}</span>` : ''}
            ${item.location ? `<span class="badge" style="background:#e5e7eb;color:#111827">${escapeHtml(item.location)}</span>` : ''}
          </div>
          ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ''}
          <div class="controls">
            <label style="font-weight:700;font-size:12px;color:#334155">Status
              <select data-action="schedule-status" data-id="${getId(item)}">
                <option value="planned"${item.status === 'planned' ? ' selected' : ''}>Planned</option>
                <option value="firm"${item.status === 'firm' ? ' selected' : ''}>Firm</option>
                <option value="done"${item.status === 'done' ? ' selected' : ''}>Done</option>
              </select>
            </label>
            <button data-remove-schedule="${getId(item)}" class="ghost danger" type="button">Remove</button>
          </div>
        </div>`
      )
      .join('');
    list.innerHTML = rows;
  };

  const renderMeetings = () => {
    const list = el('meetingList');
    if (!list) return;
    if (!state.meetings.length) {
      list.innerHTML = `<div class="empty">Map out every planning touchpoint until the reunion.</div>`;
      return;
    }
    const rows = state.meetings
      .slice()
      .sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`))
      .map(
        (item) => `
        <div class="item-card" data-id="${getId(item)}">
          <div class="item-head">
            <h3>${escapeHtml(item.topic)}</h3>
            <span class="status-pill ${item.status === 'done' ? 'status-done' : 'status-maybe'}">${statusLabel(item.status)}</span>
          </div>
          <div class="row">
            <span class="badge" style="background:#dbeafe;color:#1d4ed8">${formatDate(item.date)} · ${item.time || 'TBD'}</span>
            ${item.channel ? `<span class="badge" style="background:#e0e7ff;color:#312e81">${escapeHtml(item.channel)}</span>` : ''}
            ${item.host ? `<span class="badge" style="background:#dcfce7;color:#166534">Host: ${escapeHtml(item.host)}</span>` : ''}
          </div>
          ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ''}
          <div class="controls">
            <label style="font-weight:700;font-size:12px;color:#334155">Status
              <select data-action="meeting-status" data-id="${getId(item)}">
                <option value="scheduled"${item.status === 'scheduled' ? ' selected' : ''}>Scheduled</option>
                <option value="done"${item.status === 'done' ? ' selected' : ''}>Done</option>
              </select>
            </label>
            <button data-remove-meeting="${getId(item)}" class="ghost danger" type="button">Remove</button>
          </div>
        </div>`
      )
      .join('');
    list.innerHTML = rows;
  };

  const nextMeeting = () => {
    const now = new Date();
    const upcoming = state.meetings
      .filter((m) => m.status !== 'done')
      .map((m) => ({ ...m, dt: new Date(`${m.date || EVENT_DATE}T${m.time || '00:00'}`) }))
      .filter((m) => m.dt >= now)
      .sort((a, b) => a.dt - b.dt);
    return upcoming[0];
  };

  const renderAll = () => {
    renderEventInfo();
    renderAttendees();
    renderLogistics();
    renderSchedule();
    renderMeetings();
    renderMeta();
  };

  const handleError = (err, fallbackRender) => {
    console.error(err);
    alert(err.message || 'Request failed');
    if (typeof fallbackRender === 'function') fallbackRender();
  };

  const loadPlan = async () => {
    try {
      const data = await api(API_BASE);
      state = normalizePlan(data.plan);
    } catch (err) {
      console.error('Failed to load reunion data from server, using defaults.', err);
      state = cloneDefaults();
    }
    renderAll();
  };

  el('eventInfoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const pin = ensurePin('save event info');
    if (!pin) {
      renderEventInfo();
      return;
    }
    try {
      const data = await api(`${API_BASE}/event-info`, {
        method: 'POST',
        body: {
          pin,
          eventInfo: {
            location: form.location.value.trim(),
            contact: form.contact.value.trim(),
            lodging: form.lodging.value.trim(),
            notes: form.notes.value.trim(),
          },
        },
      });
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderEventInfo);
    }
  });

  el('attendeeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      const data = await api(`${API_BASE}/attendees`, {
        method: 'POST',
        body: {
          name: form.name.value.trim(),
          status: form.status.value,
          role: form.role.value.trim(),
          origin: form.origin.value.trim(),
          notes: form.notes.value.trim(),
        },
      });
      form.reset();
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderAttendees);
    }
  });

  el('logisticsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const pin = ensurePin('add a logistics item');
    if (!pin) return;
    try {
      const data = await api(`${API_BASE}/logistics`, {
        method: 'POST',
        body: {
          pin,
          category: form.category.value,
          title: form.title.value.trim(),
          owner: form.owner.value.trim(),
          due: form.due.value,
          status: form.status.value,
          notes: form.notes.value.trim(),
        },
      });
      form.reset();
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderLogistics);
    }
  });

  el('scheduleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const pin = ensurePin('add to the schedule');
    if (!pin) return;
    try {
      const data = await api(`${API_BASE}/schedule`, {
        method: 'POST',
        body: {
          pin,
          date: form.date.value,
          time: form.time.value,
          title: form.title.value.trim(),
          location: form.location.value.trim(),
          type: form.type.value,
          notes: form.notes.value.trim(),
        },
      });
      form.reset();
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderSchedule);
    }
  });

  el('meetingForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const pin = ensurePin('add a meeting');
    if (!pin) return;
    try {
      const data = await api(`${API_BASE}/meetings`, {
        method: 'POST',
        body: {
          pin,
          date: form.date.value,
          time: form.time.value,
          topic: form.topic.value.trim(),
          host: form.host.value.trim(),
          channel: form.channel.value.trim(),
          status: form.status.value,
          notes: form.notes.value.trim(),
        },
      });
      form.reset();
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderMeetings);
    }
  });

  el('attendeeList')?.addEventListener('change', async (e) => {
    const select = e.target;
    if (select.dataset.action === 'attendee-status') {
      const pin = ensurePin('update attendee status');
      if (!pin) {
        renderAttendees();
        return;
      }
      try {
        const data = await api(`${API_BASE}/attendees/${select.dataset.id}/status`, {
          method: 'PUT',
          body: { status: select.value, pin },
        });
        state = normalizePlan(data.plan);
        renderAll();
      } catch (err) {
        handleError(err, renderAttendees);
      }
    }
  });
  el('attendeeList')?.addEventListener('click', async (e) => {
    const id = e.target.dataset.removeAttendee;
    if (!id) return;
    const pin = ensurePin('remove attendee');
    if (!pin) {
      renderAttendees();
      return;
    }
    try {
      const data = await api(`${API_BASE}/attendees/${id}`, { method: 'DELETE', body: { pin } });
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderAttendees);
    }
  });

  el('logisticsList')?.addEventListener('change', async (e) => {
    const select = e.target;
    if (select.dataset.action === 'logistics-status') {
      const pin = ensurePin('update logistics status');
      if (!pin) {
        renderLogistics();
        return;
      }
      try {
        const data = await api(`${API_BASE}/logistics/${select.dataset.id}/status`, {
          method: 'PUT',
          body: { status: select.value, pin },
        });
        state = normalizePlan(data.plan);
        renderAll();
      } catch (err) {
        handleError(err, renderLogistics);
      }
    }
  });
  el('logisticsList')?.addEventListener('click', async (e) => {
    const id = e.target.dataset.removeLogistics;
    if (!id) return;
    const pin = ensurePin('remove logistics item');
    if (!pin) {
      renderLogistics();
      return;
    }
    try {
      const data = await api(`${API_BASE}/logistics/${id}`, { method: 'DELETE', body: { pin } });
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderLogistics);
    }
  });

  el('scheduleList')?.addEventListener('change', async (e) => {
    const select = e.target;
    if (select.dataset.action === 'schedule-status') {
      const pin = ensurePin('update schedule status');
      if (!pin) {
        renderSchedule();
        return;
      }
      try {
        const data = await api(`${API_BASE}/schedule/${select.dataset.id}/status`, {
          method: 'PUT',
          body: { status: select.value, pin },
        });
        state = normalizePlan(data.plan);
        renderAll();
      } catch (err) {
        handleError(err, renderSchedule);
      }
    }
  });
  el('scheduleList')?.addEventListener('click', async (e) => {
    const id = e.target.dataset.removeSchedule;
    if (!id) return;
    const pin = ensurePin('remove schedule item');
    if (!pin) {
      renderSchedule();
      return;
    }
    try {
      const data = await api(`${API_BASE}/schedule/${id}`, { method: 'DELETE', body: { pin } });
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderSchedule);
    }
  });

  el('meetingList')?.addEventListener('change', async (e) => {
    const select = e.target;
    if (select.dataset.action === 'meeting-status') {
      const pin = ensurePin('update meeting status');
      if (!pin) {
        renderMeetings();
        return;
      }
      try {
        const data = await api(`${API_BASE}/meetings/${select.dataset.id}/status`, {
          method: 'PUT',
          body: { status: select.value, pin },
        });
        state = normalizePlan(data.plan);
        renderAll();
      } catch (err) {
        handleError(err, renderMeetings);
      }
    }
  });
  el('meetingList')?.addEventListener('click', async (e) => {
    const id = e.target.dataset.removeMeeting;
    if (!id) return;
    const pin = ensurePin('remove meeting');
    if (!pin) {
      renderMeetings();
      return;
    }
    try {
      const data = await api(`${API_BASE}/meetings/${id}`, { method: 'DELETE', body: { pin } });
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderMeetings);
    }
  });

  el('exportData')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reunion-plan.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  el('resetData')?.addEventListener('click', async () => {
    const pin = ensurePin('reset all planning data');
    if (!pin) return;
    const confirmed = window.confirm('Reset reunion planning data to the starter template? This only affects your browser view of the live data.');
    if (!confirmed) return;
    try {
      const data = await api(`${API_BASE}/reset`, { method: 'POST', body: { pin } });
      state = normalizePlan(data.plan);
      renderAll();
    } catch (err) {
      handleError(err, renderAll);
    }
  });

  loadPlan();
})();
