document.getElementById('access-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('accessCode').value.trim().toUpperCase();
  const errorDiv = document.getElementById('access-error');
  errorDiv.style.display = 'none';
  if (!code) return;
  const res = await fetch('/api/groups/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: code })
  });
  if (res.ok) {
    const group = await res.json();
    window.location.href = `group.html?groupId=${group._id}`;
  } else {
    const err = await res.json();
    errorDiv.textContent = err.error || 'Invalid access code.';
    errorDiv.style.display = 'block';
  }
});
