// patch.js — Safe click handling for tee-time action icons. Load AFTER your main script.js
(function(){
  function closestAction(el){
    while(el && el !== document){
      if (el.dataset && el.dataset.action) return el;
      el = el.parentNode;
    }
    return null;
  }
  document.addEventListener('click', async function(e){
    const btn = closestAction(e.target);
    if (!btn) return;
    const action = btn.dataset.action;
    if (!action) return;
    // Prevent parent handlers from eating the click
    e.preventDefault(); e.stopPropagation();

    const card   = btn.closest('[data-event-id]');
    const tee    = btn.closest('[data-tee-id]');
    const eventId= card && card.dataset.eventId;
    const teeId  = tee && tee.dataset.teeId;
    const isTeam = !!(card && card.dataset.teamEvent === 'true');

    // We only handle delete/edit/move here. Defer to app hooks when available.
    if (action === 'delete-tee') {
      if(!eventId || !teeId) return;
      if(!confirm(isTeam ? 'Remove this team?' : 'Remove this tee time?')) return;
      const res = await fetch(`/api/events/${eventId}/tee-times/${teeId}`, { method:'DELETE' });
      if(!res.ok){ alert('Action failed'); return; }
      if (window.loadEvents) window.loadEvents();
      return;
    }
    if (action === 'edit-tee' && window.openEditTeeDialog){
      window.openEditTeeDialog(eventId, teeId); return;
    }
    if (action === 'move-tee' && window.openMoveDialog){
      window.openMoveDialog(eventId, teeId); return;
    }
  }, { capture:true });
})();