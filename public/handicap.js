/* public/handicap.js - Handicap tracking page */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const handicapList = $('#handicapList');
  const addPlayerBtn = $('#addPlayerBtn');
  const refreshAllBtn = $('#refreshAllBtn');
  const playerModal = $('#playerModal');
  const playerForm = $('#playerForm');
  const playerModalTitle = $('#playerModalTitle');

  let players = [];

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) {
      const msg = (typeof body === 'object' && body.message) || (typeof body === 'object' && body.error) || body || ('HTTP ' + r.status);
      throw new Error(msg);
    }
    return body;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  }

  function renderPlayers() {
    if (!players || players.length === 0) {
      handicapList.innerHTML = '<p style="color:#ffffff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">No players added yet. Click "Add Player" to get started.</p>';
      return;
    }

    // Sort by name
    const sorted = [...players].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    handicapList.innerHTML = sorted.map(player => {
      const handicapDisplay = player.handicapIndex !== null && player.handicapIndex !== undefined 
        ? player.handicapIndex.toFixed(1) 
        : 'N/A';
      
      const statusClass = player.lastFetchError ? 'error' : (player.lastFetchSuccess ? 'success' : 'pending');
      const statusText = player.lastFetchError 
        ? '⚠️ Error' 
        : (player.lastFetchSuccess ? '✓ Updated' : '⏳ Pending');

      return `
        <div class="handicap-card">
          <div class="handicap-card-header">
            <div>
              <h3 style="margin:0;font-size:18px;font-weight:700;color:var(--green-700)">${player.name || 'Unknown'}</h3>
              <div style="font-size:13px;color:var(--slate-700);margin-top:2px">
                GHIN: ${player.ghinNumber || 'N/A'}
              </div>
            </div>
            <div class="handicap-actions">
              <button class="icon small" title="Refresh" data-refresh="${player._id}">↻</button>
              <button class="icon small" title="Edit" data-edit="${player._id}">✎</button>
              <button class="icon small danger" title="Delete" data-delete="${player._id}">×</button>
            </div>
          </div>
          <div class="handicap-card-body">
            <div class="handicap-display">
              <div class="handicap-index">${handicapDisplay}</div>
              <div class="handicap-label">Handicap Index</div>
            </div>
            <div class="handicap-meta">
              <div class="status ${statusClass}">${statusText}</div>
              ${player.lastFetchedAt ? `<div style="font-size:12px;color:var(--slate-700)">Last updated: ${formatDate(player.lastFetchedAt)}</div>` : ''}
              ${player.notes ? `<div style="font-size:13px;color:var(--slate-700);margin-top:8px">${player.notes}</div>` : ''}
              ${player.lastFetchError ? `<div style="font-size:12px;color:#dc2626;margin-top:4px">${player.lastFetchError}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadPlayers() {
    try {
      players = await api('/api/handicaps');
      renderPlayers();
    } catch (err) {
      console.error(err);
      handicapList.innerHTML = '<p style="color:#dc2626;text-align:center">Failed to load players.</p>';
    }
  }

  // Add player
  on(addPlayerBtn, 'click', () => {
    playerForm.reset();
    playerForm.elements['id'].value = '';
    playerModalTitle.textContent = 'Add Player';
    playerModal.showModal();
  });

  // Submit player form
  on(playerForm, 'submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(playerForm).entries());
    
    try {
      const payload = { 
        name: data.name, 
        ghinNumber: data.ghinNumber, 
        notes: data.notes || ''
      };
      
      // Include handicap index if provided
      if (data.handicapIndex && data.handicapIndex.trim()) {
        payload.handicapIndex = parseFloat(data.handicapIndex);
      }
      
      if (data.id) {
        // Update existing
        await api(`/api/handicaps/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // Create new
        await api('/api/handicaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      playerModal.close();
      await loadPlayers();
    } catch (err) {
      console.error(err);
      alert('Failed to save player: ' + err.message);
    }
  });

  // Cancel button
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    e.preventDefault();
    const dlg = btn.closest('dialog');
    dlg?.close?.();
  });

  // Card actions
  on(handicapList, 'click', async (e) => {
    const target = e.target.closest('[data-refresh],[data-edit],[data-delete]');
    if (!target) return;

    try {
      if (target.dataset.refresh) {
        const id = target.dataset.refresh;
        await api(`/api/handicaps/${id}/refresh`, { method: 'POST' });
        await loadPlayers();
      } else if (target.dataset.edit) {
        const id = target.dataset.edit;
        const player = players.find(p => p._id === id);
        if (!player) return;
        
        playerForm.elements['id'].value = id;
        playerForm.elements['name'].value = player.name || '';
        playerForm.elements['ghinNumber'].value = player.ghinNumber || '';
        playerForm.elements['handicapIndex'].value = player.handicapIndex !== null && player.handicapIndex !== undefined ? player.handicapIndex : '';
        playerForm.elements['notes'].value = player.notes || '';
        playerModalTitle.textContent = 'Edit Player';
        playerModal.showModal();
      } else if (target.dataset.delete) {
        const id = target.dataset.delete;
        const player = players.find(p => p._id === id);
        if (!confirm(`Delete ${player?.name || 'this player'}?`)) return;
        
        await api(`/api/handicaps/${id}`, { method: 'DELETE' });
        await loadPlayers();
      }
    } catch (err) {
      console.error(err);
      alert('Action failed: ' + err.message);
    }
  });

  // Refresh all
  on(refreshAllBtn, 'click', async () => {
    if (!confirm('Refresh all handicaps? This may take a moment.')) return;
    try {
      refreshAllBtn.disabled = true;
      refreshAllBtn.textContent = 'Refreshing...';
      await api('/api/handicaps/refresh-all', { method: 'POST' });
      await loadPlayers();
    } catch (err) {
      console.error(err);
      alert('Refresh failed: ' + err.message);
    } finally {
      refreshAllBtn.disabled = false;
      refreshAllBtn.textContent = 'Refresh All';
    }
  });

  // Initial load
  loadPlayers();
})();
