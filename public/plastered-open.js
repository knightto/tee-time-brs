const TARGET_DATE_ISO = '2026-06-19';
const TARGET_NAME_RE = /plastered/i;
const FALLBACK_ENTRY_FEE = 85;
const FALLBACK_PLAYER_CAP = 100;
const FALLBACK_TEAM_CAP = 50;

let liveEvent = null;
let liveDetail = null;

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
  return 'Coming Soon';
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
  return Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : FALLBACK_PLAYER_CAP;
}

function teamCap(detail) {
  const maxTeams = Number(detail && detail.maxTeams);
  if (Number.isFinite(maxTeams) && maxTeams > 0) return maxTeams;
  const exact = Number(detail && detail.teamSizeExact);
  const maxPlayers = Number(detail && detail.maxPlayers);
  if (Number.isFinite(exact) && exact > 0 && Number.isFinite(maxPlayers) && maxPlayers > 0) {
    return Math.floor(maxPlayers / exact);
  }
  return FALLBACK_TEAM_CAP;
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
    '9:00 AM shotgun start.',
    '2-man scramble teams.',
    '$85 covers golf, lunch, cash prizes, and drawings.',
    'Field flights are built from the final entrant count.',
    'Contests and proceeds feed outing cost and player prizes.',
    'Beer and U.S. Open viewing continue in the grill room after the round.'
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
  ['heroStatusPill', 'cardStatusPill'].forEach((id) => {
    const node = document.getElementById(id);
    node.textContent = label;
    node.className = `status-pill${css ? ` ${css}` : ''}`;
  });
}

function renderFallbackState(message) {
  liveEvent = null;
  liveDetail = null;
  updateStatusPills('', 'Coming Soon');
  document.getElementById('heroFigure').textContent = '$85';
  document.getElementById('heroFigureCopy').textContent = 'Golf, BBQ or burger lunch, cash prizes, and drawings are all part of the outing day.';
  document.getElementById('signupSubtitle').textContent = 'This slot turns into the live Plastered "Open" registration card as soon as the June 19, 2026 outing is published in the outing system.';
  document.getElementById('statsGrid').innerHTML = [
    statTile('100', 'golfer cap'),
    statTile('50', '2-man teams at full field'),
    statTile('$85', 'entry with lunch + prize pool'),
    statTile('9:00', 'shotgun start')
  ].join('');
  document.getElementById('signupMessage').innerHTML = `<strong>Registration opens soon.</strong> ${esc(message || 'The outing profile is here now; the live signup buttons appear here once the June 19 event is published.')}`;
  document.getElementById('modeButtons').innerHTML = `
    <a class="mode-btn" href="https://www.facebook.com/plasteredmastersgolf" target="_blank" rel="noopener noreferrer">
      Follow the event page
      <small>Use Facebook for updates until live signup is posted.</small>
    </a>
  `;
  document.getElementById('openTeamsWrap').classList.add('hidden');
  document.getElementById('statusCheckWrap').classList.add('hidden');
  document.getElementById('liveMetaNote').textContent = 'Use the Facebook page for updates and sponsorship conversations until the live outing is posted.';
  renderNotes(null);
}

function recommendedModes(detail) {
  if (!detail) return [];
  const status = String(detail.status || '').toLowerCase();
  const modes = [];
  if (status === 'open') {
    if (detail.allowFullTeamSignup) modes.push({ mode: 'full_team', label: 'Register 2-Man Team', help: 'Bring your partner and lock in the full scramble team.' });
    if (detail.allowSeekingPartner) modes.push({ mode: 'seeking_partner', label: 'Need A Partner', help: 'Register solo and flag that you want a teammate.' });
    if (detail.allowSingles) modes.push({ mode: 'single', label: 'Register Solo', help: 'Get your name in and let the field build around you.' });
    if (detail.allowJoinExistingTeam && joinableTeams(detail).length) modes.push({ mode: 'join_team', label: 'Join Open Team', help: 'Slide into a team that still has room for one more golfer.' });
    if (!modes.length && detail.allowCaptainSignup) modes.push({ mode: 'captain', label: 'Hold A Captain Spot', help: 'Start a team with one golfer and fill the partner later.' });
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
    return `<button type="button" class="team-pill" data-action="open-signup" data-mode="join_team"><strong>${esc(team.name || 'Open team')}</strong><span>${esc(`${team.memberCount || 0}/${Math.max(1, (team.memberCount || 0) + (team.spotsOpen || 0))} golfers`)}</span><small>${esc(names.length ? names.join(', ') : 'One open spot waiting.')}</small></button>`;
  }).join('');
}

function renderLiveState(detail) {
  liveDetail = detail;
  updateStatusPills(detail.status);
  const fee = formatCurrency(detail.entryFee);
  const players = Number(detail && detail.metrics && detail.metrics.players) || 0;
  const teams = Number(detail && detail.metrics && detail.metrics.teams) || 0;
  const spotsLeft = detail.spotsRemainingPlayers !== null && detail.spotsRemainingPlayers !== undefined
    ? Math.max(0, Number(detail.spotsRemainingPlayers) || 0)
    : Math.max(0, playerCap(detail) - players);

  document.getElementById('heroFigure').textContent = fee;
  document.getElementById('heroFigureCopy').textContent = detail.name
    ? `${detail.name} is the live outing record tied to this page. When status is open, the signup actions below submit straight into the event roster.`
    : 'Golf, BBQ or burger lunch, cash prizes, and drawings are all part of the outing day.';
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
      renderFallbackState('The outing profile is here now; the live signup buttons appear here once the June 19 event is published.');
      return;
    }
    renderLiveState(await api(`/api/outings/${encodeURIComponent(liveEvent._id)}`));
  } catch (err) {
    renderFallbackState('Live registration is not available right now. Use the Facebook page for updates until the outing card is online.');
  }
}

function playerRowTemplate(index) {
  return `<div class="player-row" data-player-row="${index}"><div class="grid2"><label class="field">Name<input type="text" data-player-name required></label><label class="field">Email<input type="email" data-player-email required autocomplete="email"></label></div><div class="grid2"><label class="field">Phone<input type="text" data-player-phone autocomplete="tel"></label><label class="field">Handicap Index<input type="number" step="0.1" data-player-hcp></label></div><div class="player-tools"><label><input type="checkbox" data-player-guest> Guest</label><button type="button" class="plain-btn" data-action="remove-player">Remove golfer</button></div></div>`;
}

function setPlayerCount(count) {
  const wrap = document.getElementById('playersWrap');
  wrap.innerHTML = Array.from({ length: Math.max(1, count || 1) }, (_, idx) => playerRowTemplate(idx + 1)).join('');
}

function requiredPlayerCountFromMode(mode, detail) {
  const exact = Number(detail && detail.teamSizeExact || 0);
  const max = Number(detail && detail.teamSizeMax || 2);
  if (mode === 'single' || mode === 'seeking_partner' || mode === 'join_team' || mode === 'captain') return 1;
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

function openSignup(mode) {
  if (!liveDetail) return;
  const titles = {
    full_team: 'Register 2-Man Team',
    seeking_partner: 'Need A Partner',
    single: 'Register Solo',
    join_team: 'Join Open Team',
    captain: 'Hold A Captain Spot'
  };
  document.getElementById('signupDialogTitle').textContent = titles[mode] || 'Register';
  document.getElementById('signupDialogSubtitle').textContent = `${liveDetail.name || 'Plastered "Open"'} | ${liveDetail.ruleSummary || 'Outing registration'}`;
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
    teamSelect.innerHTML = teams.map((team) => `<option value="${esc(team._id)}">${esc(team.name || 'Open team')} (${esc(String(team.memberCount || 0))} players)</option>`).join('');
  }

  const needsTeamName = mode === 'full_team' || mode === 'captain';
  document.getElementById('teamNameField').classList.toggle('hidden', !needsTeamName);
  setPlayerCount(requiredPlayerCountFromMode(mode, liveDetail));
  document.getElementById('addPlayerBtn').classList.toggle('hidden', mode !== 'full_team');
  document.getElementById('signupDialog').showModal();
}

async function submitSignup(event) {
  event.preventDefault();
  const msg = document.getElementById('signupDialogMsg');
  msg.textContent = '';
  try {
    await api(`/api/outings/${encodeURIComponent(document.getElementById('formEventId').value)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: document.getElementById('formMode').value,
        teamName: document.getElementById('teamNameInput').value,
        teamId: document.getElementById('teamSelect').value,
        notes: document.getElementById('notesInput').value,
        players: collectPlayers()
      })
    });
    document.getElementById('signupDialog').close();
    await loadLiveEvent();
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
    await api(`/api/outings/${encodeURIComponent(document.getElementById('waitlistEventId').value)}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('waitlistName').value,
        email: document.getElementById('waitlistEmail').value,
        phone: document.getElementById('waitlistPhone').value,
        notes: document.getElementById('waitlistNotes').value,
        mode: 'single'
      })
    });
    document.getElementById('waitlistDialog').close();
    await loadLiveEvent();
  } catch (err) {
    msg.textContent = err && err.message ? err.message : 'Waitlist request failed.';
  }
}

async function checkStatus() {
  if (!liveDetail) return;
  const note = document.getElementById('statusNote');
  note.textContent = '';
  const email = String(document.getElementById('statusEmailInput').value || '').trim();
  if (!email) {
    note.textContent = 'Enter your email to check status.';
    return;
  }
  try {
    const status = await api(`/api/outings/${encodeURIComponent(liveDetail._id)}/status?email=${encodeURIComponent(email)}`);
    note.textContent = status.isRegistered ? 'That email is currently registered for the outing.' : status.isWaitlisted ? 'That email is currently on the waitlist.' : 'No active signup was found for that email.';
  } catch (err) {
    note.textContent = err && err.message ? err.message : 'Status lookup failed.';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('modeButtons').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'open-signup') openSignup(btn.dataset.mode);
    if (btn.dataset.action === 'waitlist') openWaitlist();
  });
  document.getElementById('openTeamsList').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="open-signup"]');
    if (btn) openSignup(btn.dataset.mode);
  });
  document.getElementById('playersWrap').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="remove-player"]');
    if (!btn) return;
    if (document.querySelectorAll('[data-player-row]').length <= 1) return;
    btn.closest('[data-player-row]').remove();
  });
  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    const wrap = document.getElementById('playersWrap');
    wrap.insertAdjacentHTML('beforeend', playerRowTemplate(wrap.querySelectorAll('[data-player-row]').length + 1));
  });
  document.getElementById('cancelSignupBtn').addEventListener('click', () => document.getElementById('signupDialog').close());
  document.getElementById('cancelWaitlistBtn').addEventListener('click', () => document.getElementById('waitlistDialog').close());
  document.getElementById('signupForm').addEventListener('submit', submitSignup);
  document.getElementById('waitlistForm').addEventListener('submit', submitWaitlist);
  document.getElementById('statusCheckBtn').addEventListener('click', checkStatus);
  await loadLiveEvent();
});
