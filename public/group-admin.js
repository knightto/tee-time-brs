const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('groupId');
const code = urlParams.get('code');
const panel = document.getElementById('group-admin-panel');

if (!groupId || !code) {
  panel.innerHTML = '<h2>Missing groupId or admin code</h2>';
  throw new Error('Missing groupId or code');
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

function renderGroupAdmin(group, events) {
  panel.innerHTML = `
    <h2>${group.name}</h2>
    <p>${group.description||''}</p>
    <h3>Events</h3>
    <ul>${events.map(ev => `<li>${ev.course} (${new Date(ev.date).toLocaleDateString()})</li>`).join('')}</ul>
    <h3>Subscribers</h3>
    <div id="subscribers-list">(Not implemented in this demo)</div>
    <h3>Notifications</h3>
    <button disabled>Send empty tee time reminder now</button>
    <button disabled>Send event summary to subscribers</button>
  `;
}

(async function init() {
  try {
    const group = await fetchGroup();
    const events = await fetchEvents();
    renderGroupAdmin(group, events);
  } catch (e) {
    panel.innerHTML = `<h2>Error: ${e.message}</h2>`;
  }
})();
