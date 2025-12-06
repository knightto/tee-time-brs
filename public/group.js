const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('groupId');
if (!groupId) {
  document.body.innerHTML = '<h2>Missing groupId</h2>';
  throw new Error('Missing groupId');
}

async function fetchGroup() {
  const res = await fetch(`/api/groups/${groupId}`);
  if (!res.ok) throw new Error('Group not found');
  return res.json();
}

async function fetchEvents() {
  const res = await fetch(`/api/groups/${groupId}/events`);
  if (!res.ok) return [];
  return res.json();
}

function renderGroupHeader(group) {
  const el = document.getElementById('group-header');
  el.innerHTML = `<h1>${group.logoUrl ? `<img src="${group.logoUrl}" alt="logo" style="height:2em;vertical-align:middle;margin-right:0.5em;">` : ''}${group.name}</h1><p>${group.description||''}</p>`;
}

function renderEvents(events) {
  const el = document.getElementById('events-list');
  if (!events.length) {
    el.innerHTML = '<p>No upcoming events.</p>';
    return;
  }
  el.innerHTML = events.map(ev => `
    <div class="event-card">
      <h2>${ev.course} <span style="font-size:0.8em;color:#888;">${ev.isTeamEvent ? 'Team' : 'Tee Time'}</span></h2>
      <div><strong>Date:</strong> ${new Date(ev.date).toLocaleDateString()}</div>
      <div>${ev.notes||''}</div>
      <div>${ev.isTeamEvent ? renderTeams(ev) : renderTeeTimes(ev)}</div>
    </div>
  `).join('');
}

function renderTeeTimes(ev) {
  if (!ev.teeTimes || !ev.teeTimes.length) return '<em>No tee times</em>';
  return `<ul>${ev.teeTimes.map(tt => `<li>${tt.time} — ${tt.players.length}/4 players</li>`).join('')}</ul>`;
}

function renderTeams(ev) {
  if (!ev.teeTimes || !ev.teeTimes.length) return '<em>No teams</em>';
  return `<ul>${ev.teeTimes.map(tt => `<li>${tt.name||'Team'} — ${tt.players.length}/${ev.teamSizeMax||4} players</li>`).join('')}</ul>`;
}

document.getElementById('admin-link').addEventListener('click', (e) => {
  e.preventDefault();
  const code = prompt('Enter group admin code:');
  if (code) {
    window.location.href = `group-admin.html?groupId=${groupId}&code=${encodeURIComponent(code)}`;
  }
});

(async function init() {
  try {
    const group = await fetchGroup();
    renderGroupHeader(group);
    const events = await fetchEvents();
    renderEvents(events);
  } catch (e) {
    document.body.innerHTML = `<h2>Error: ${e.message}</h2>`;
  }
})();
