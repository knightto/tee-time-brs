(() => {
  const STORAGE_KEY = 'reunion-35-hq-v1';
  const EVENT_DATE = '2026-06-13';
  const PIN_CODE = '123';

  const defaultState = {
    startedAt: Date.now(),
    lastSaved: Date.now(),
    eventInfo: {
      location: 'Set city + main venue',
      contact: '',
      lodging: '',
      notes: '35th reunion — keep the weekend welcoming, nostalgic, and simple.',
    },
    attendees: [
      {
        id: 'a1',
        name: 'Alex Morgan',
        status: 'going',
        role: 'Check-in + name badges',
        origin: 'Austin',
        notes: 'Arrives Fri mid-day, can run registration table.',
      },
      {
        id: 'a2',
        name: 'Sam Lee',
        status: 'maybe',
        role: 'Playlist + photo slideshow',
        origin: 'Chicago',
        notes: 'Needs photos by Apr 30; DJ option TBD.',
      },
      {
        id: 'a3',
        name: 'Taylor Kim',
        status: 'pending',
        role: 'Outreach to classmates',
        origin: 'Seattle',
        notes: 'Will text the west coast group.',
      },
    ],
    logistics: [
      {
        id: 'l1',
        category: 'venue',
        title: 'Confirm contract with Riverview Hotel ballroom',
        owner: 'Jamie',
        due: '2026-02-15',
        status: 'in-progress',
        notes: 'Need deposit + AV package details.',
      },
      {
        id: 'l2',
        category: 'catering',
        title: 'Decide menu + vegan/veg options',
        owner: 'Alex',
        due: '2026-03-01',
        status: 'open',
        notes: 'Collect dietary needs from attendees.',
      },
      {
        id: 'l3',
        category: 'outreach',
        title: 'Send save-the-date email + social post',
        owner: 'Taylor',
        due: '2025-12-15',
        status: 'done',
        notes: 'Draft approved; ready to send.',
      },
    ],
    schedule: [
      {
        id: 's1',
        date: '2026-06-12',
        time: '18:00',
        title: 'Welcome mixer',
        location: 'Riverview Hotel lobby bar',
        type: 'social',
        status: 'planned',
        notes: 'Name badges + check-in QR code.',
      },
      {
        id: 's2',
        date: '2026-06-13',
        time: '11:00',
        title: 'Campus walk + photo',
        location: 'Old Main entrance',
        type: 'program',
        status: 'planned',
        notes: 'Group photo at noon.',
      },
      {
        id: 's3',
        date: '2026-06-13',
        time: '18:30',
        title: 'Reunion dinner',
        location: 'Riverview Ballroom',
        type: 'program',
        status: 'planned',
        notes: 'Emcee + short remarks at 7:15p.',
      },
      {
        id: 's4',
        date: '2026-06-14',
        time: '10:30',
        title: 'Farewell brunch',
        location: 'Westside Diner',
        type: 'social',
        status: 'planned',
        notes: 'Optional; pay-as-you-go.',
      },
    ],
    meetings: [
      {
        id: 'm1',
        date: '2026-01-15',
        time: '19:00',
        topic: 'Budget + ticket price',
        host: 'Jamie',
        channel: 'Zoom',
        status: 'scheduled',
        notes: 'Share budget draft by Jan 12.',
      },
      {
        id: 'm2',
        date: '2026-02-05',
        time: '19:00',
        topic: 'Program, music, slideshow',
        host: 'Sam',
        channel: 'Zoom',
        status: 'scheduled',
        notes: 'Collect photos; decide MC.',
      },
    ],
  };

  const el = (id) => document.getElementById(id);
  const countdownDate = new Date(`${EVENT_DATE}T00:00:00`);

  const formatDate = (value) => {
    if (!value) return '';
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const escapeHtml = (str = '') =>
    str
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const uid = () => Math.random().toString(36).slice(2, 9);

  const cloneDefaults = () => JSON.parse(JSON.stringify(defaultState));

  const ensurePin = (actionLabel = 'continue') => {
    const input = window.prompt(`Enter PIN to ${actionLabel}:`);
    return input === PIN_CODE;
  };

  const loadState = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...cloneDefaults(),
          ...parsed,
          attendees: parsed.attendees || [],
          logistics: parsed.logistics || [],
          schedule: parsed.schedule || [],
          meetings: parsed.meetings || [],
        };
      }
    } catch (err) {
      console.warn('Falling back to defaults', err);
    }
    return cloneDefaults();
  };

  let state = loadState();
  state.startedAt = state.startedAt || Date.now();

  const saveState = () => {
    state.lastSaved = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderMeta();
  };

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
        <div class="item-card" data-id="${a.id}">
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
              <select data-action="attendee-status" data-id="${a.id}">
                <option value="going"${a.status === 'going' ? ' selected' : ''}>Going</option>
                <option value="maybe"${a.status === 'maybe' ? ' selected' : ''}>Maybe</option>
                <option value="pending"${a.status === 'pending' ? ' selected' : ''}>Not yet</option>
              </select>
            </label>
            <button data-remove-attendee="${a.id}" class="ghost danger" type="button">Remove</button>
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
        <div class="item-card" data-id="${item.id}">
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
              <select data-action="logistics-status" data-id="${item.id}">
                <option value="open"${item.status === 'open' ? ' selected' : ''}>Open</option>
                <option value="in-progress"${item.status === 'in-progress' ? ' selected' : ''}>In progress</option>
                <option value="booked"${item.status === 'booked' ? ' selected' : ''}>Booked</option>
                <option value="done"${item.status === 'done' ? ' selected' : ''}>Done</option>
              </select>
            </label>
            <button data-remove-logistics="${item.id}" class="ghost danger" type="button">Remove</button>
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
        <div class="item-card" data-id="${item.id}">
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
              <select data-action="schedule-status" data-id="${item.id}">
                <option value="planned"${item.status === 'planned' ? ' selected' : ''}>Planned</option>
                <option value="firm"${item.status === 'firm' ? ' selected' : ''}>Firm</option>
                <option value="done"${item.status === 'done' ? ' selected' : ''}>Done</option>
              </select>
            </label>
            <button data-remove-schedule="${item.id}" class="ghost danger" type="button">Remove</button>
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
        <div class="item-card" data-id="${item.id}">
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
              <select data-action="meeting-status" data-id="${item.id}">
                <option value="scheduled"${item.status === 'scheduled' ? ' selected' : ''}>Scheduled</option>
                <option value="done"${item.status === 'done' ? ' selected' : ''}>Done</option>
              </select>
            </label>
            <button data-remove-meeting="${item.id}" class="ghost danger" type="button">Remove</button>
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

  // Form handlers
  el('eventInfoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (!ensurePin('save event info')) {
      renderEventInfo();
      return;
    }
    state.eventInfo = {
      location: form.location.value.trim(),
      contact: form.contact.value.trim(),
      lodging: form.lodging.value.trim(),
      notes: form.notes.value.trim(),
    };
    saveState();
    renderEventInfo();
  });

  el('attendeeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    state.attendees.push({
      id: uid(),
      name: form.name.value.trim(),
      status: form.status.value,
      role: form.role.value.trim(),
      origin: form.origin.value.trim(),
      notes: form.notes.value.trim(),
    });
    form.reset();
    saveState();
    renderAttendees();
  });

  el('logisticsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (!ensurePin('add a logistics item')) return;
    state.logistics.push({
      id: uid(),
      category: form.category.value,
      title: form.title.value.trim(),
      owner: form.owner.value.trim(),
      due: form.due.value,
      status: form.status.value,
      notes: form.notes.value.trim(),
    });
    form.reset();
    saveState();
    renderLogistics();
  });

  el('scheduleForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (!ensurePin('add to the schedule')) return;
    state.schedule.push({
      id: uid(),
      date: form.date.value,
      time: form.time.value,
      title: form.title.value.trim(),
      location: form.location.value.trim(),
      type: form.type.value,
      status: 'planned',
      notes: form.notes.value.trim(),
    });
    form.reset();
    saveState();
    renderSchedule();
  });

  el('meetingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (!ensurePin('add a meeting')) return;
    state.meetings.push({
      id: uid(),
      date: form.date.value,
      time: form.time.value,
      topic: form.topic.value.trim(),
      host: form.host.value.trim(),
      channel: form.channel.value.trim(),
      status: form.status.value,
      notes: form.notes.value.trim(),
    });
    form.reset();
    saveState();
    renderMeetings();
  });

  // Status updates and deletes
  el('attendeeList')?.addEventListener('change', (e) => {
    const select = e.target;
    if (select.dataset.action === 'attendee-status') {
      if (!ensurePin('update attendee status')) {
        renderAttendees();
        return;
      }
      const attendee = state.attendees.find((a) => a.id === select.dataset.id);
      if (attendee) attendee.status = select.value;
      saveState();
      renderAttendees();
    }
  });
  el('attendeeList')?.addEventListener('click', (e) => {
    const id = e.target.dataset.removeAttendee;
    if (!id) return;
    if (!ensurePin('remove attendee')) {
      renderAttendees();
      return;
    }
    state.attendees = state.attendees.filter((a) => a.id !== id);
    saveState();
    renderAttendees();
  });

  el('logisticsList')?.addEventListener('change', (e) => {
    const select = e.target;
    if (select.dataset.action === 'logistics-status') {
      if (!ensurePin('update logistics status')) {
        renderLogistics();
        return;
      }
      const item = state.logistics.find((l) => l.id === select.dataset.id);
      if (item) item.status = select.value;
      saveState();
      renderLogistics();
    }
  });
  el('logisticsList')?.addEventListener('click', (e) => {
    const id = e.target.dataset.removeLogistics;
    if (!id) return;
    if (!ensurePin('remove logistics item')) {
      renderLogistics();
      return;
    }
    state.logistics = state.logistics.filter((l) => l.id !== id);
    saveState();
    renderLogistics();
  });

  el('scheduleList')?.addEventListener('change', (e) => {
    const select = e.target;
    if (select.dataset.action === 'schedule-status') {
      if (!ensurePin('update schedule status')) {
        renderSchedule();
        return;
      }
      const item = state.schedule.find((s) => s.id === select.dataset.id);
      if (item) item.status = select.value;
      saveState();
      renderSchedule();
    }
  });
  el('scheduleList')?.addEventListener('click', (e) => {
    const id = e.target.dataset.removeSchedule;
    if (!id) return;
    if (!ensurePin('remove schedule item')) {
      renderSchedule();
      return;
    }
    state.schedule = state.schedule.filter((s) => s.id !== id);
    saveState();
    renderSchedule();
  });

  el('meetingList')?.addEventListener('change', (e) => {
    const select = e.target;
    if (select.dataset.action === 'meeting-status') {
      if (!ensurePin('update meeting status')) {
        renderMeetings();
        return;
      }
      const item = state.meetings.find((m) => m.id === select.dataset.id);
      if (item) item.status = select.value;
      saveState();
      renderMeetings();
    }
  });
  el('meetingList')?.addEventListener('click', (e) => {
    const id = e.target.dataset.removeMeeting;
    if (!id) return;
    if (!ensurePin('remove meeting')) {
      renderMeetings();
      return;
    }
    state.meetings = state.meetings.filter((m) => m.id !== id);
    saveState();
    renderMeetings();
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

  el('resetData')?.addEventListener('click', () => {
    if (!ensurePin('reset all planning data')) return;
    const confirmed = window.confirm('Reset reunion planning data to the starter template? This only affects your browser.');
    if (!confirmed) return;
    state = cloneDefaults();
    saveState();
    renderAll();
  });

  renderAll();
})();
