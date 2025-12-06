let adminCode = '';
const panel = document.getElementById('admin-panel');
const errorDiv = document.getElementById('admin-error');

document.getElementById('admin-auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  adminCode = document.getElementById('admin-code').value.trim();
  errorDiv.style.display = 'none';
  if (!adminCode) return;
  const res = await fetch(`/api/groups?code=${encodeURIComponent(adminCode)}`);
  if (res.ok) {
    const groups = await res.json();
    renderGroupsTable(groups);
    panel.style.display = '';
    document.getElementById('admin-auth-form').style.display = 'none';
  } else {
    errorDiv.textContent = 'Invalid admin code.';
    errorDiv.style.display = 'block';
  }
});

function renderGroupsTable(groups) {
  panel.innerHTML = `
    <h2>Groups</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
      <thead><tr><th>Name</th><th>Template</th><th>Access Code</th><th>Created</th><th>Active</th><th>Actions</th></tr></thead>
      <tbody>
        ${groups.map(g => `<tr>
          <td>${g.name}</td>
          <td>${g.template}</td>
          <td>${g.accessCode}</td>
          <td>${new Date(g.createdAt).toLocaleDateString()}</td>
          <td>${g.isActive ? 'Yes' : 'No'}</td>
          <td>
            <button onclick="editGroup('${g._id}')">Edit</button>
            <button onclick="archiveGroup('${g._id}')">${g.isActive ? 'Archive' : 'Unarchive'}</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    <h3>Create Group</h3>
    <form id="create-group-form">
      <input type="text" id="group-name" placeholder="Name" required>
      <input type="text" id="group-desc" placeholder="Description">
      <select id="group-template">
        <option value="golf">Golf</option>
        <option value="default">Default</option>
        <option value="social">Social</option>
      </select>
      <input type="text" id="group-logo" placeholder="Logo URL">
      <button type="submit">Create</button>
    </form>
    <div id="group-create-error" style="color:#b91c1c;margin-top:1em;display:none"></div>
  `;
  document.getElementById('create-group-form').addEventListener('submit', createGroup);
}

async function createGroup(e) {
  e.preventDefault();
  const name = document.getElementById('group-name').value.trim();
  const description = document.getElementById('group-desc').value.trim();
  const template = document.getElementById('group-template').value;
  const logoUrl = document.getElementById('group-logo').value.trim();
  const res = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: adminCode, name, description, template, logoUrl })
  });
  if (res.ok) {
    location.reload();
  } else {
    const err = await res.json();
    const errDiv = document.getElementById('group-create-error');
    errDiv.textContent = err.error || 'Error creating group.';
    errDiv.style.display = 'block';
  }
}

window.editGroup = function(id) {
  alert('Edit group not implemented in this demo.');
};
window.archiveGroup = async function(id) {
  if (!confirm('Archive/unarchive this group?')) return;
  const res = await fetch(`/api/groups/${id}?code=${encodeURIComponent(adminCode)}`, { method: 'DELETE' });
  if (res.ok) location.reload();
  else alert('Failed to archive group.');
};
