const TARGET_DATE_ISO = '2026-06-19';
const TARGET_NAME_RE = /plastered/i;
const FALLBACK_ENTRY_FEE = 85;
const FALLBACK_PLAYER_CAP = 120;
const FALLBACK_TEAM_CAP = 60;
const ORGANIZER_CONTACT_NOTE = 'After signing up, contact the organizer within 2 days or your team may be removed.';

let liveEvent = null;
let liveDetail = null;
let lastStatusLookup = null;

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function statusLabel(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'open') return 'Open';
  if (key === 'waitlist') return 'Waitlist';
  if (key === 'closed') return 'Closed';
  if (key === 'completed') return 'Completed';
  if (key === 'draft') return 'Draft';
  return 'Unavailable';
}

function statusClass(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'open') return 'open';
  if (key === 'waitlist') return 'waitlist';
  if (key === 'closed') return 'closed';
  if (key === 'completed') return 'completed';
  return '';
}

function formatDateTime(value) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleString();
}

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return `$${FALLBACK_ENTRY_FEE}`;
  return `$${num.toFixed(0)}`;
}

function formatModeLabel(mode) {
  return String(mode || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findPlasteredEvent(events) {
  const list = Array.isArray(events) ? events : [];
  return list.find((event) => {
    const start = String(event && event.startDate || '').slice(0, 10);
    const end = String(event && event.endDate || '').slice(0, 10);
    return (start === TARGET_DATE_ISO || end === TARGET_DATE_ISO) && TARGET_NAME_RE.test(String(event && event.name || ''));
  }) || list.find((event) => {
    const start = String(event && event.startDate || '').slice(0, 10);
    const end = String(event && event.endDate || '').slice(0, 10);
    return start === TARGET_DATE_ISO || end === TARGET_DATE_ISO;
  }) || list.find((event) => TARGET_NAME_RE.test(String(event && event.name || '')));
}

function playerCap(detail) {
  const maxPlayers = Number(detail && detail.maxPlayers);
  if (Number.isFinite(maxPlayers) && maxPlayers > 0) return maxPlayers;
  return FALLBACK_PLAYER_CAP;
}

function teamCap(detail) {
  const maxTeams = Number(detail && detail.maxTeams);
  if (Number.isFinite(maxTeams) && maxTeams > 0) return maxTeams;
  const exact = Number(detail && detail.teamSizeExact);
  const maxPlayers = Number(detail && detail.maxPlayers);
  if (Number.isFinite(exact) && exact > 0 && Number.isFinite(maxPlayers) && maxPlayers > 0) {
    return Math.max(1, Math.floor(maxPlayers / exact));
  }
  return FALLBACK_TEAM_CAP;
}

function teamLimit(detail) {
  const exact = Number(detail && detail.teamSizeExact);
  if (Number.isFinite(exact) && exact > 0) return exact;
  const max = Number(detail && detail.teamSizeMax);
  return Number.isFinite(max) && max > 0 ? max : 2;
}

function joinableTeams(detail) {
  return ((detail && detail.teams) || []).filter((team) => team && team.canJoin);
}

function statTile(value, label) {
  return `<div class="stat-box"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function buildNotes(detail) {
  const notes = [
    'Friday, June 19, 2026 in Front Royal, Virginia.',
    'Flights are based on the final field size.',
    'Contest proceeds help cover outing costs and player prizes.',
    ORGANIZER_CONTACT_NOTE
  ];
  if (detail && detail.registrationNotes) notes.push(String(detail.registrationNotes).trim());
  if (detail && detail.cancellationPolicy) notes.push(`Cancellation policy: ${String(detail.cancellationPolicy).trim()}`);
  return notes.filter(Boolean);
}

function renderNotes(detail) {
  document.getElementById('notesList').innerHTML = buildNotes(detail)
    .map((note) => `<li>${esc(note)}</li>`).join('');
}

function updateStatusPills(status, labelOverride = '') {
  const label = labelOverride || statusLabel(status);
  const css = statusClass(status);
  ['cardStatusPill'].forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = label;
    node.className = `status-pill${css ? ` ${css}` : ''}`;
  });
}

function resetManageLookupUi(clearStored = false) {
  const wrap = document.getElementById('manageWrap');
  const btn = document.getElementById('manageSignupBtn');
  const hint = document.getElementById('manageHint');
  if (wrap) wrap.classList.add('hidden');
  if (btn) btn.classList.add('hidden');
  if (hint) hint.textContent = '';
  if (clearStored) lastStatusLookup = null;
}

function updateManageLookupUi(status, requesterEmail) {
  const wrap = document.getElementById('manageWrap');
  const btn = document.getElementById('manageSignupBtn');
  const hint = document.getElementById('manageHint');
  if (!wrap || !btn || !hint) return;

  if (!status || (!status.registration && !status.waitlist && !status.activeMember)) {
    resetManageLookupUi(true);
    return;
  }

  lastStatusLookup = { requesterEmail, payload: status };
  wrap.classList.remove('hidden');
  btn.classList.add('hidden');
  hint.textContent = '';

  if (status.registration) {
    btn.textContent = 'Manage Signup';
    btn.classList.remove('hidden');
    hint.textContent = status.registration.teamId
      ? 'Edit notes, remove golfers tied to your signup, add golfers if the team has room, or cancel the entry.'
      : 'This signup can be reviewed or cancelled here.';
    return;
  }

  if (status.waitlist) {
    btn.textContent = 'Manage Waitlist';
    btn.classList.remove('hidden');
    hint.textContent = 'Leave the waitlist here if your plans change.';
    return;
  }

  hint.textContent = 'This email is on an active team, but only the registration owner email can edit or cancel the signup.';
}

function renderFallbackState(message) {
  liveEvent = null;
  liveDetail = null;
  updateStatusPills('', 'Unavailable');
  document.getElementById('signupSubtitle').textContent = 'Live signup is temporarily unavailable for the Plastered "Open".';
  document.getElementById('statsGrid').innerHTML = [
    statTile('120', 'golfer cap'),
    statTile('2-Man', 'scramble teams'),
    statTile('$85', 'entry with lunch + prize pool'),
    statTile('60', 'team cap')
  ].join('');
  document.getElementById('signupMessage').innerHTML = `<strong>Registration is temporarily unavailable.</strong> ${esc(message || 'Use the Facebook page for updates while the outing feed is unavailable.')}`;
  document.getElementById('modeButtons').innerHTML = `
    <a class="mode-btn" href="https://www.facebook.com/plasteredmastersgolf" target="_blank" rel="noopener noreferrer">
      Follow the event page
      <small>Use Facebook for updates until live signup is back online.</small>
    </a>
  `;
  document.getElementById('openTeamsWrap').classList.add('hidden');
  document.getElementById('statusCheckWrap').classList.add('hidden');
  document.getElementById('statusNote').textContent = '';
  document.getElementById('liveMetaNote').textContent = 'Use the Facebook page for updates and sponsorship conversations while signup is unavailable.';
  renderNotes(null);
  resetManageLookupUi(true);
}

function recommendedModes(detail) {
  if (!detail) return [];
  const status = String(detail.status || '').toLowerCase();
  const modes = [];
  if (status === 'open') {
    if (detail.allowFullTeamSignup) {
      modes.push({ mode: 'full_team', label: 'Register 2-Man Team', help: 'Bring your partner and lock in the full scramble team.' });
    }
    if (detail.allowCaptainSignup) {
      modes.push({ mode: 'captain', label: 'Hold A Captain Spot', help: 'Start a team now and fill the partner later.' });
    }
    if (detail.allowSeekingPartner) {
      modes.push({ mode: 'seeking_partner', label: 'Need A Partner', help: 'Register solo and flag that you want a teammate.' });
    }
    if (detail.allowSeekingTeam) {
      modes.push({ mode: 'seeking_team', label: 'Need A Team', help: 'Register yourself and let the organizers slot you into an open team.' });
    }
    if (detail.allowSingles) {
      modes.push({ mode: 'single', label: 'Register Solo', help: 'Get your name in and let the field build around you.' });
    }
    if (detail.allowJoinExistingTeam && joinableTeams(detail).length) {
      modes.push({ mode: 'join_team', label: 'Join Open Team', help: 'Slide into a team that still has room for one more golfer.' });
    }
    if (detail.allowMemberGuestSignup) {
      modes.push({ mode: 'member_guest', label: 'Member + Guest', help: 'Register a paired member and guest together.' });
    }
    if (detail.allowPartialTeamSignup && !detail.allowCaptainSignup) {
      modes.push({ mode: 'partial_team', label: 'Partial Team Signup', help: 'Start a team with part of the roster and finish it later.' });
    }
  }
  if (detail.autoWaitlist || status === 'waitlist') {
    modes.push({ mode: 'waitlist', label: 'Join Waitlist', help: 'Use this if the live field is capped or the outing is already waitlist-only.' });
  }
  return modes;
}

function modeButtonTemplate(item) {
  if (item.mode === 'waitlist') {
    return `<button type="button" class="mode-btn" data-action="waitlist">${esc(item.label)}<small>${esc(item.help)}</small></button>`;
  }
  return `<button type="button" class="mode-btn" data-action="open-signup" data-mode="${esc(item.mode)}">${esc(item.label)}<small>${esc(item.help)}</small></button>`;
}

function renderOpenTeams(detail) {
  const teams = joinableTeams(detail);
  const wrap = document.getElementById('openTeamsWrap');
  const list = document.getElementById('openTeamsList');
  if (!teams.length) {
    wrap.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  list.innerHTML = teams.map((team) => {
    const names = Array.isArray(team.members) ? team.members.map((member) => member && member.name).filter(Boolean) : [];
    return `<button type="button" class="team-pill" data-action="open-signup" data-mode="join_team" data-team-id="${esc(String(team._id || ''))}"><strong>${esc(team.name || 'Open team')}</strong><span>${esc(`${team.memberCount || 0}/${Math.max(1, (team.memberCount || 0) + (team.spotsOpen || 0))} golfers`)}</span><small>${esc(names.length ? names.join(', ') : 'One open spot waiting.')}</small></button>`;
  }).join('');
}

function renderLiveState(detail) {
  liveDetail = detail;
  updateStatusPills(detail.status);
  const fee = formatCurrency(detail.entryFee);
  const players = Number(detail && detail.metrics && detail.metrics.players) || 0;
  const teams = Number(detail && detail.metrics && detail.metrics.teams) || 0;
  const spotsLeft = Math.max(0, playerCap(detail) - players);

  document.getElementById('signupSubtitle').textContent = `${detail.name || 'Plastered "Open"'} | ${detail.formatType || 'Outing'} | Signup closes ${formatDateTime(detail.signupCloseAt)}`;
  document.getElementById('statsGrid').innerHTML = [
    statTile(String(players), `${playerCap(detail)} player cap`),
    statTile(String(teams), `${teamCap(detail)} team cap`),
    statTile(String(spotsLeft), 'player spots left'),
    statTile(fee, detail.signupCloseAt ? `signup closes ${formatDateTime(detail.signupCloseAt)}` : 'entry with lunch + prize pool')
  ].join('');

  const status = String(detail.status || '').toLowerCase();
  let message = '<strong>Registration is not open yet.</strong> The outing exists, but golfers cannot submit a live signup until the event status moves to open.';
  if (status === 'open') message = '<strong>Live registration is open.</strong> Choose the signup style that fits your situation and submit directly from this page.';
  if (status === 'waitlist') message = '<strong>The field is on waitlist.</strong> Join the list and stay ready for a spot to open.';
  if (status === 'closed') message = '<strong>Signup is closed.</strong> Use the status checker below if you need to confirm whether your email already made the field.';
  if (status === 'completed') message = '<strong>This outing is complete.</strong> The signup form is preserved here for reference only.';
  document.getElementById('signupMessage').innerHTML = message;

  const modes = recommendedModes(detail);
  document.getElementById('modeButtons').innerHTML = modes.length
    ? modes.map(modeButtonTemplate).join('')
    : '<div class="quiet-note">Live registration settings are not available for this outing yet.</div>';

  document.getElementById('statusCheckWrap').classList.remove('hidden');
  document.getElementById('liveMetaNote').textContent = detail.ruleSummary || 'Live outing details come from the Blue Ridge Outings system.';
  renderOpenTeams(detail);
  renderNotes(detail);
}

async function loadLiveEvent() {
  try {
    const events = await api('/api/outings');
    liveEvent = findPlasteredEvent(events) || null;
    if (!liveEvent) {
      renderFallbackState('The Plastered "Open" outing record could not be found in the live system.');
      return;
    }
    renderLiveState(await api(`/api/outings/${encodeURIComponent(liveEvent._id)}`));
    if (lastStatusLookup && lastStatusLookup.requesterEmail) {
      await checkStatus(lastStatusLookup.requesterEmail);
    }
  } catch (err) {
    renderFallbackState('Live registration is not available right now. Use the Facebook page for updates until the outing card is online.');
  }
}

function playerRowTemplate(index) {
  return `<div class="player-row" data-player-row="${index}"><div class="grid2"><label class="field">Name<input type="text" data-player-name required></label><label class="field">Email<input type="email" data-player-email required autocomplete="email"></label></div><div class="grid2"><label class="field">Phone<input type="text" data-player-phone autocomplete="tel"></label><label class="field">Handicap Index<input type="number" step="0.1" data-player-hcp></label></div><div class="player-tools"><label><input type="checkbox" data-player-guest> Guest</label><button type="button" class="plain-btn" data-action="remove-player">Remove golfer</button></div></div>`;
}

function manageAddPlayerRowTemplate(index) {
  return `<div class="player-row" data-manage-player-row="${index}"><div class="grid2"><label class="field">Name<input type="text" data-manage-player-name></label><label class="field">Email<input type="email" data-manage-player-email autocomplete="email"></label></div><div class="grid2"><label class="field">Phone<input type="text" data-manage-player-phone autocomplete="tel"></label><label class="field">Handicap Index<input type="number" step="0.1" data-manage-player-hcp></label></div><div class="player-tools"><label><input type="checkbox" data-manage-player-guest> Guest</label><button type="button" class="plain-btn" data-action="remove-manage-player">Remove golfer</button></div></div>`;
}

function setPlayerCount(count) {
  const wrap = document.getElementById('playersWrap');
  wrap.innerHTML = Array.from({ length: Math.max(1, count || 1) }, (_, idx) => playerRowTemplate(idx + 1)).join('');
}

function requiredPlayerCountFromMode(mode, detail) {
  const exact = Number(detail && detail.teamSizeExact || 0);
  const max = Number(detail && detail.teamSizeMax || 2);
  if (mode === 'single' || mode === 'seeking_partner' || mode === 'seeking_team' || mode === 'join_team' || mode === 'captain') return 1;
  if (mode === 'member_guest') return exact > 0 ? exact : 2;
  if (mode === 'partial_team') return 1;
  if (mode === 'full_team') return exact > 0 ? exact : Math.max(2, max);
  return 1;
}

function collectPlayers() {
  return Array.from(document.querySelectorAll('[data-player-row]')).map((row) => ({
    name: String(row.querySelector('[data-player-name]')?.value || '').trim(),
    email: String(row.querySelector('[data-player-email]')?.value || '').trim(),
    phone: String(row.querySelector('[data-player-phone]')?.value || '').trim(),
    handicapIndex: String(row.querySelector('[data-player-hcp]')?.value || '').trim(),
    isGuest: Boolean(row.querySelector('[data-player-guest]')?.checked)
  }));
}

function collectManageAddPlayers() {
  return Array.from(document.querySelectorAll('[data-manage-player-row]')).map((row) => ({
    name: String(row.querySelector('[data-manage-player-name]')?.value || '').trim(),
    email: String(row.querySelector('[data-manage-player-email]')?.value || '').trim(),
    phone: String(row.querySelector('[data-manage-player-phone]')?.value || '').trim(),
    handicapIndex: String(row.querySelector('[data-manage-player-hcp]')?.value || '').trim(),
    isGuest: Boolean(row.querySelector('[data-manage-player-guest]')?.checked)
  })).filter((player) => player.name || player.email);
}

function openSignup(mode, preferredTeamId = '') {
  if (!liveDetail) return;
  const titles = {
    full_team: 'Register 2-Man Team',
    captain: 'Hold A Captain Spot',
    seeking_partner: 'Need A Partner',
    seeking_team: 'Need A Team',
    single: 'Register Solo',
    join_team: 'Join Open Team',
    member_guest: 'Member + Guest',
    partial_team: 'Partial Team Signup'
  };

  document.getElementById('signupDialogTitle').textContent = titles[mode] || 'Register';
  document.getElementById('signupDialogSubtitle').textContent = `${liveDetail.name || 'Plastered "Open"'} | ${liveDetail.ruleSummary || 'Outing registration'} | ${ORGANIZER_CONTACT_NOTE}`;
  document.getElementById('formEventId').value = liveDetail._id;
  document.getElementById('formMode').value = mode;
  document.getElementById('signupDialogMsg').textContent = '';
  document.getElementById('teamNameInput').value = '';
  document.getElementById('notesInput').value = '';

  const teamSelectField = document.getElementById('teamSelectField');
  const teamSelect = document.getElementById('teamSelect');
  const showTeamSelect = mode === 'join_team';
  teamSelectField.classList.toggle('hidden', !showTeamSelect);
  if (showTeamSelect) {
    const teams = joinableTeams(liveDetail);
    if (!teams.length) {
      document.getElementById('signupDialogMsg').textContent = 'There are no joinable teams right now.';
      return;
    }
    teamSelect.innerHTML = teams.map((team) => `<option value="${esc(String(team._id || ''))}">${esc(team.name || 'Open team')} (${esc(String(team.memberCount || 0))} players)</option>`).join('');
    if (preferredTeamId) teamSelect.value = preferredTeamId;
  }

  const needsTeamName = mode === 'full_team' || mode === 'captain' || mode === 'member_guest' || mode === 'partial_team';
  const canAddPlayers = mode === 'full_team' || mode === 'member_guest' || mode === 'partial_team';
  document.getElementById('teamNameField').classList.toggle('hidden', !needsTeamName);
  document.getElementById('addPlayerBtn').classList.toggle('hidden', !canAddPlayers);
  setPlayerCount(requiredPlayerCountFromMode(mode, liveDetail));

  if (mode === 'member_guest') {
    const rows = document.querySelectorAll('[data-player-row]');
    if (rows[1]) {
      const guestToggle = rows[1].querySelector('[data-player-guest]');
      if (guestToggle) guestToggle.checked = true;
    }
  }

  const dialog = document.getElementById('signupDialog');
  if (dialog.open) dialog.close();
  dialog.showModal();
}

async function submitSignup(event) {
  event.preventDefault();
  const msg = document.getElementById('signupDialogMsg');
  msg.textContent = '';

  const players = collectPlayers();
  if (!players.length) {
    msg.textContent = 'At least one golfer is required.';
    return;
  }

  try {
    await api(`/api/outings/${encodeURIComponent(document.getElementById('formEventId').value)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: document.getElementById('formMode').value,
        teamName: document.getElementById('teamNameInput').value,
        teamId: document.getElementById('teamSelect').value,
        notes: document.getElementById('notesInput').value,
        players
      })
    });

    const requesterEmail = String(players[0] && players[0].email || '').trim();
    document.getElementById('signupDialog').close();
    await loadLiveEvent();
    if (requesterEmail) {
      document.getElementById('statusEmailInput').value = requesterEmail;
      await checkStatus(requesterEmail);
    }
  } catch (err) {
    msg.textContent = err && err.message ? err.message : 'Registration failed.';
  }
}

function openWaitlist() {
  if (!liveDetail) return;
  document.getElementById('waitlistDialogMsg').textContent = '';
  document.getElementById('waitlistEventId').value = liveDetail._id;
  document.getElementById('waitlistName').value = '';
  document.getElementById('waitlistEmail').value = '';
  document.getElementById('waitlistPhone').value = '';
  document.getElementById('waitlistNotes').value = '';
  document.getElementById('waitlistDialog').showModal();
}

async function submitWaitlist(event) {
  event.preventDefault();
  const msg = document.getElementById('waitlistDialogMsg');
  msg.textContent = '';
  try {
    const email = String(document.getElementById('waitlistEmail').value || '').trim();
    await api(`/api/outings/${encodeURIComponent(document.getElementById('waitlistEventId').value)}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('waitlistName').value,
        email,
        phone: document.getElementById('waitlistPhone').value,
        notes: document.getElementById('waitlistNotes').value,
        mode: 'single'
      })
    });
    document.getElementById('waitlistDialog').close();
    await loadLiveEvent();
    if (email) {
      document.getElementById('statusEmailInput').value = email;
      await checkStatus(email);
    }
  } catch (err) {
    msg.textContent = err && err.message ? err.message : 'Waitlist request failed.';
  }
}

function resetManageDialog() {
  document.getElementById('manageDialogTitle').textContent = 'Manage Signup';
  document.getElementById('manageDialogSubtitle').textContent = 'Review your current registration and make changes.';
  document.getElementById('manageSummary').innerHTML = '';
  document.getElementById('manageCurrentWrap').classList.add('hidden');
  document.getElementById('manageCurrentPlayers').innerHTML = '';
  document.getElementById('manageAddWrap').classList.add('hidden');
  document.getElementById('manageAddPlayers').innerHTML = '';
  document.getElementById('manageAddPlayers').dataset.maxRows = '0';
  document.getElementById('manageCapacityNote').textContent = '';
  document.getElementById('manageNotesField').classList.add('hidden');
  document.getElementById('manageNotesInput').value = '';
  document.getElementById('manageDialogMsg').textContent = '';
  document.getElementById('manageCancelEntryBtn').classList.add('hidden');
  document.getElementById('manageCancelEntryBtn').textContent = 'Cancel Signup';
  document.getElementById('manageSaveBtn').classList.add('hidden');
}

function managePlayerCardTemplate(member, removable = false) {
  const badges = [];
  if (member && member.isCaptain) badges.push('Captain');
  if (removable) badges.push('Your signup');
  return `
    <div class="manage-player-card">
      <div class="manage-player-copy">
        <strong>${esc(member && member.name || 'Golfer')}</strong>
        <span>${esc(member && member.email || '')}</span>
        ${(member && member.phone) ? `<small>${esc(member.phone)}</small>` : ''}
      </div>
      <div class="manage-player-tools">
        ${badges.length ? `<span class="manage-tag">${esc(badges.join(' | '))}</span>` : ''}
        ${removable ? `<label class="manage-toggle"><input type="checkbox" data-remove-member-id="${esc(String(member && member._id || ''))}"> Remove</label>` : ''}
      </div>
    </div>
  `;
}

function openManageDialog() {
  if (!lastStatusLookup || !lastStatusLookup.payload || !liveDetail) return;

  const requesterEmail = lastStatusLookup.requesterEmail;
  const payload = lastStatusLookup.payload;
  const registration = payload.registration || null;
  const waitlist = payload.waitlist || null;

  resetManageDialog();

  if (registration) {
    const registrationMembers = Array.isArray(payload.registrationMembers) ? payload.registrationMembers : [];
    const teamMembers = registration.teamId
      ? (Array.isArray(payload.teamMembers) && payload.teamMembers.length ? payload.teamMembers : registrationMembers)
      : registrationMembers;
    const ownMemberIds = new Set(registrationMembers.map((member) => String(member && member._id || '')));
    const currentMembers = teamMembers.length ? teamMembers : registrationMembers;

    document.getElementById('manageDialogTitle').textContent = registration.teamId ? 'Manage Signup' : 'Review Signup';
    document.getElementById('manageDialogSubtitle').textContent = registration.teamId
      ? 'Update notes, add golfers if the team has room, remove golfers tied to this signup, or cancel the entry.'
      : 'This signup can be reviewed or cancelled here.';
    document.getElementById('manageSummary').innerHTML = registration.teamId
      ? `<strong>Team signup is active.</strong> ${esc(formatModeLabel(registration.mode))} submitted by ${esc(requesterEmail)}.${payload.team && payload.team.name ? ` Team: ${esc(payload.team.name)}.` : ''}`
      : `<strong>Registration is active.</strong> ${esc(formatModeLabel(registration.mode))} submitted by ${esc(requesterEmail)}.`;

    if (currentMembers.length) {
      document.getElementById('manageCurrentWrap').classList.remove('hidden');
      document.getElementById('manageCurrentPlayers').innerHTML = currentMembers.map((member) => {
        const removable = ownMemberIds.has(String(member && member._id || '')) && !member.isCaptain;
        return managePlayerCardTemplate(member, removable);
      }).join('');
    }

    document.getElementById('manageCancelEntryBtn').classList.remove('hidden');

    if (registration.teamId) {
      const spotsOpen = Math.max(0, teamLimit(liveDetail) - currentMembers.length);
      document.getElementById('manageNotesField').classList.remove('hidden');
      document.getElementById('manageNotesInput').value = String(registration.notes || '').trim();
      document.getElementById('manageSaveBtn').classList.remove('hidden');
      document.getElementById('manageAddWrap').classList.remove('hidden');
      document.getElementById('manageAddPlayers').dataset.maxRows = String(spotsOpen);
      document.getElementById('manageCapacityNote').textContent = spotsOpen > 0
        ? `${spotsOpen} team spot${spotsOpen === 1 ? '' : 's'} still open. Add golfers below if needed.`
        : 'This team is currently full.';
      document.getElementById('manageAddPlayerBtn').classList.toggle('hidden', spotsOpen <= 0);
    }
  } else if (waitlist) {
    document.getElementById('manageDialogTitle').textContent = 'Manage Waitlist';
    document.getElementById('manageDialogSubtitle').textContent = 'Leave the waitlist here if your plans change.';
    document.getElementById('manageSummary').innerHTML = `<strong>Waitlist entry is active.</strong> ${esc(waitlist.name || requesterEmail)} is still on the Plastered "Open" waitlist.`;
    document.getElementById('manageCancelEntryBtn').classList.remove('hidden');
    document.getElementById('manageCancelEntryBtn').textContent = 'Leave Waitlist';
  } else {
    return;
  }

  const dialog = document.getElementById('manageDialog');
  if (dialog.open) dialog.close();
  dialog.showModal();
}

async function submitManageForm(event) {
  event.preventDefault();
  const msg = document.getElementById('manageDialogMsg');
  msg.textContent = '';

  if (!lastStatusLookup || !lastStatusLookup.payload || !lastStatusLookup.payload.registration || !lastStatusLookup.payload.registration.teamId || !liveDetail) {
    msg.textContent = 'This signup does not support live edits.';
    return;
  }

  const requesterEmail = lastStatusLookup.requesterEmail;
  const registration = lastStatusLookup.payload.registration;
  const originalNotes = String(registration.notes || '').trim();
  const notes = String(document.getElementById('manageNotesInput').value || '').trim();
  const removeMemberIds = Array.from(document.querySelectorAll('[data-remove-member-id]:checked')).map((input) => input.dataset.removeMemberId).filter(Boolean);
  const addPlayers = collectManageAddPlayers();

  if (!removeMemberIds.length && !addPlayers.length && notes === originalNotes) {
    msg.textContent = 'No changes to save.';
    return;
  }

  try {
    await api(`/api/outings/${encodeURIComponent(liveDetail._id)}/registrations/${encodeURIComponent(registration._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterEmail,
        removeMemberIds,
        addPlayers,
        notes
      })
    });

    document.getElementById('manageDialog').close();
    await loadLiveEvent();
    document.getElementById('statusEmailInput').value = requesterEmail;
    await checkStatus(requesterEmail);
  } catch (err) {
    msg.textContent = err && err.message ? err.message : 'Signup update failed.';
  }
}

async function cancelManagedEntry() {
  if (!lastStatusLookup || !lastStatusLookup.payload || !liveDetail) return;
  const requesterEmail = lastStatusLookup.requesterEmail;
  const registration = lastStatusLookup.payload.registration || null;
  const waitlist = lastStatusLookup.payload.waitlist || null;

  if (!registration && !waitlist) return;
  const targetLabel = registration ? 'signup' : 'waitlist entry';
  if (!window.confirm(`Cancel this ${targetLabel}?`)) return;

  try {
    if (registration) {
      await api(`/api/outings/${encodeURIComponent(liveDetail._id)}/registrations/${encodeURIComponent(registration._id)}?requesterEmail=${encodeURIComponent(requesterEmail)}`, {
        method: 'DELETE'
      });
    } else if (waitlist) {
      await api(`/api/outings/${encodeURIComponent(liveDetail._id)}/waitlist/${encodeURIComponent(waitlist._id)}?requesterEmail=${encodeURIComponent(requesterEmail)}`, {
        method: 'DELETE'
      });
    }

    document.getElementById('manageDialog').close();
    await loadLiveEvent();
    document.getElementById('statusEmailInput').value = requesterEmail;
    await checkStatus(requesterEmail);
  } catch (err) {
    document.getElementById('manageDialogMsg').textContent = err && err.message ? err.message : `Unable to cancel this ${targetLabel}.`;
  }
}

async function checkStatus(requestedEmail = '') {
  if (!liveDetail) return null;
  const note = document.getElementById('statusNote');
  note.textContent = '';

  const emailInput = document.getElementById('statusEmailInput');
  const email = String(requestedEmail || emailInput.value || '').trim();
  if (!email) {
    note.textContent = 'Enter your email to check status.';
    resetManageLookupUi(true);
    return null;
  }

  emailInput.value = email;

  try {
    const status = await api(`/api/outings/${encodeURIComponent(liveDetail._id)}/status?email=${encodeURIComponent(email)}`);
    if (status.registration) {
      note.textContent = 'That email currently owns an active signup for the outing.';
    } else if (status.isWaitlisted) {
      note.textContent = 'That email is currently on the waitlist.';
    } else if (status.activeMember) {
      note.textContent = 'That email is currently on an active team. Team management stays with the registration owner email.';
    } else {
      note.textContent = 'No active signup was found for that email.';
    }
    updateManageLookupUi(status, email);
    return status;
  } catch (err) {
    note.textContent = err && err.message ? err.message : 'Status lookup failed.';
    resetManageLookupUi(true);
    return null;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('modeButtons').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'open-signup') openSignup(btn.dataset.mode, btn.dataset.teamId || '');
    if (btn.dataset.action === 'waitlist') openWaitlist();
  });

  document.getElementById('openTeamsList').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="open-signup"]');
    if (btn) openSignup(btn.dataset.mode, btn.dataset.teamId || '');
  });

  document.getElementById('playersWrap').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="remove-player"]');
    if (!btn) return;
    if (document.querySelectorAll('[data-player-row]').length <= 1) return;
    btn.closest('[data-player-row]').remove();
  });

  document.getElementById('manageAddPlayers').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="remove-manage-player"]');
    if (!btn) return;
    btn.closest('[data-manage-player-row]').remove();
  });

  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    const wrap = document.getElementById('playersWrap');
    wrap.insertAdjacentHTML('beforeend', playerRowTemplate(wrap.querySelectorAll('[data-player-row]').length + 1));
  });

  document.getElementById('manageAddPlayerBtn').addEventListener('click', () => {
    const wrap = document.getElementById('manageAddPlayers');
    const maxRows = Number(wrap.dataset.maxRows || 0);
    const currentRows = wrap.querySelectorAll('[data-manage-player-row]').length;
    if (maxRows > 0 && currentRows >= maxRows) return;
    wrap.insertAdjacentHTML('beforeend', manageAddPlayerRowTemplate(currentRows + 1));
  });

  document.getElementById('cancelSignupBtn').addEventListener('click', () => document.getElementById('signupDialog').close());
  document.getElementById('cancelWaitlistBtn').addEventListener('click', () => document.getElementById('waitlistDialog').close());
  document.getElementById('manageCloseBtn').addEventListener('click', () => document.getElementById('manageDialog').close());
  document.getElementById('signupForm').addEventListener('submit', submitSignup);
  document.getElementById('waitlistForm').addEventListener('submit', submitWaitlist);
  document.getElementById('manageForm').addEventListener('submit', submitManageForm);
  document.getElementById('statusCheckBtn').addEventListener('click', () => checkStatus());
  document.getElementById('manageSignupBtn').addEventListener('click', openManageDialog);
  document.getElementById('manageCancelEntryBtn').addEventListener('click', cancelManagedEntry);

  await loadLiveEvent();
});
