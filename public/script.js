/* public/script.js v3.10 team names + radio move */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const eventsEl = $('#events');
  const modal = $('#eventModal');
  const eventForm = $('#eventForm');
  const newEventBtn = $('#newEventBtn');
  const modeSelect = $('#modeSelect');
  const teeTimeRow = $('#teeTimeRow');
  const teamSizeRow = $('#teamSizeRow');
  const subForm = $('#subscribeForm');
  const subMsg = $('#subMsg');

  // Ensure a radio-based move dialog exists. Create dynamically if missing.
  function ensureMoveDialog(){
    if ($('#moveModal')) return;
    const tpl = document.createElement('div');
    tpl.innerHTML = `<dialog id="moveModal">
      <form id="moveForm" method="dialog">
        <h3 id="moveTitle">Move Player</h3>
        <div id="moveChoices" style="display:grid;gap:8px;margin:8px 0;"></div>
        <input type="hidden" name="eventId">
        <input type="hidden" name="fromTeeId">
        <input type="hidden" name="playerId">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Move</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(tpl.firstElementChild);
  }
  ensureMoveDialog();
  const moveModal = $('#moveModal');
  const moveForm = $('#moveForm');
  const moveChoices = $('#moveChoices');
  const moveTitle = $('#moveTitle');

  if (!eventsEl) return;

  const isIsoLike = s => typeof s === 'string' && /\d{4}-\d{2}-\d{2}T/.test(s);
  function fmtDate(s){ try{ const d=isIsoLike(s)?new Date(s):new Date(s+'T00:00:00Z'); return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric', timeZone:'UTC'});}catch{ return s||''; } }
  function fmtTime(hhmm){ if(!hhmm) return ''; const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm); if(!m) return hhmm; let h=parseInt(m[1],10); const min=m[2]; const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${min} ${ap}`; }
  function normalizeForm(form){ const data=Object.fromEntries(new FormData(form).entries()); if(data.date){ const d=new Date(data.date+'T00:00:00Z'); const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0'); data.date=`${y}-${m}-${day}`; } return data; }
  async function api(path, opts){ const r=await fetch(path, opts); if(!r.ok) throw new Error('HTTP '+r.status); const ct=r.headers.get('content-type')||''; return ct.includes('application/json')?r.json():r.text(); }

  // Create modal toggles
  on(newEventBtn, 'click', ()=> modal?.showModal?.() ?? modal?.setAttribute('open',''));
  on(modeSelect, 'change', () => {
    const teams = modeSelect.value === 'teams';
    if (teeTimeRow) teeTimeRow.hidden = teams;
    if (teamSizeRow) teamSizeRow.hidden = !teams;
    if (eventForm?.elements?.['teeTime']) eventForm.elements['teeTime'].required = !teams;
  });

  // Dialog cancel for any dialog
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cancel]');
    if (!btn) return;
    ev.preventDefault();
    const dlg = btn.closest('dialog');
    if (dlg) dlg.close?.();
  });

  // Create event submit
  on(eventForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const body=normalizeForm(eventForm);
      const isTeams = (body.mode === 'teams');
      const payload = {
        course: body.course,
        date: body.date,
        notes: body.notes || '',
        isTeamEvent: isTeams,
        teamSizeMax: isTeams ? Number(body.teamSizeMax || 4) : 4
      };
      if (!isTeams) payload.teeTime = body.teeTime;
      await api('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      modal?.close?.(); eventForm.reset(); load();
    }catch(err){ console.error(err); alert('Create failed'); }
  });

  // Subscribe
  on(subForm, 'submit', async (e)=>{
    e.preventDefault(); if(subMsg) subMsg.textContent='...';
    try{
      const email = new FormData(subForm).get('email');
      await api('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      if(subMsg) subMsg.textContent='Subscribed';
      subForm.reset();
    }catch{ if(subMsg) subMsg.textContent='Failed'; }
  });

  async function load(){ try{ const list=await api('/api/events'); render(Array.isArray(list)?list:[]);}catch(e){ console.error(e); eventsEl.innerHTML='<div class="card">Failed to load events.</div>'; } }

  function render(list){
    eventsEl.innerHTML='';
    for(const ev of list){
      const card=document.createElement('div'); card.className='card';
      const isTeams = !!ev.isTeamEvent;
      const tees=(ev.teeTimes||[]).map((tt,idx)=>teeRow(ev,tt,idx,isTeams)).join('');
      card.innerHTML = `
        <h3 class="card-title">${ev.course || 'Course'}</h3>
        <div>${fmtDate(ev.date)}</div>
        <div class="tees">${tees || (isTeams ? '<em>No teams</em>' : '<em>No tee times</em>')}</div>
        <div class="row">
          <button class="small" data-add-tee="${ev._id}">${isTeams ? 'Add Team' : 'Add Tee Time'}</button>
          <button class="small" data-edit="${ev._id}">Edit</button>
          <button class="small" data-del="${ev._id}">Delete</button>
        </div>
        <div class="notes">${ev.notes || ''}</div>`;
      eventsEl.appendChild(card);
    }
  }

  function teeRow(ev, tt, idx, isTeams){
    const chips = (tt.players || []).map(p => {
      return `<span class="chip">
        ${p.name}
        <button class="icon small" title="Move" data-move="${ev._id}:${tt._id}:${p._id}">↔</button>
        <button class="icon small danger" title="Remove" data-del-player="${ev._id}:${tt._id}:${p._id}">×</button>
      </span>`;
    }).join('') || '—';
    const max = ev.teamSizeMax || 4;
    const full = (tt.players || []).length >= (isTeams ? max : 4);
    const left = isTeams ? (tt.name ? tt.name : `Team ${idx+1}`) : fmtTime(tt.time);
    const delTitle = isTeams ? 'Remove team' : 'Remove tee time';
    return `<div class="tee">
      <div class="tee-time">${left}
        <button class="icon small danger" title="${delTitle}" data-del-tee="${ev._id}:${tt._id}">×</button>
      </div>
      <div class="tee-players">${chips}</div>
      <div class="row">
        <button class="small" data-add-player="${ev._id}:${tt._id}" ${full?'disabled':''}>Add Player</button>
      </div>
    </div>`;
  }

  // Events actions
  on(eventsEl, 'click', async (e)=>{
    const t=(e.target.closest('[data-del-tee],[data-del-player],[data-add-tee],[data-add-player],[data-move],[data-edit],[data-del]')||e.target);
    try{
      if(t.dataset.delTee){
        const [eventId, teeId] = t.dataset.delTee.split(':');
        if(!confirm('Remove this tee/team?')) return;
        await api(`/api/events/${eventId}/tee-times/${teeId}`, { method: 'DELETE' });
        return load();
      }
      if(t.dataset.delPlayer){
        const [eventId, teeId, playerId] = t.dataset.delPlayer.split(':');
        if(!confirm('Remove this player?')) return;
        await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}`, { method: 'DELETE' });
        return load();
      }
      if(t.dataset.addTee){
        const id=t.dataset.addTee;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id);
        if(!ev) return;
        if(ev.isTeamEvent){
          const name = prompt('Team name (optional)') || '';
          await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name }) });
        }else{
          const time=prompt('New tee time (HH:MM)'); if(!time) return;
          await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({time}) });
        }
        return load();
      }
      if(t.dataset.addPlayer){
        const [id,teeId]=t.dataset.addPlayer.split(':');
        const name=prompt('Player name'); if(!name) return;
        await api(`/api/events/${id}/tee-times/${teeId}/players`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
        return load();
      }
      if(t.dataset.move){
        const [eventId,fromTeeId,playerId]=t.dataset.move.split(':');
        return openMoveDialog(eventId,fromTeeId,playerId);
      }
      if(t.dataset.edit){
        alert('Edit event form not provided in this patch. Ensure your edit modal hides time for team events.');
        return;
      }
      if(t.dataset.del){
        const code=prompt('Admin delete code:'); if(!code) return;
        await api(`/api/events/${t.dataset.del}?code=${encodeURIComponent(code)}`,{method:'DELETE'});
        return load();
      }
    }catch(err){ console.error(err); alert('Action failed'); }
  });

  async function openMoveDialog(eventId, fromTeeId, playerId){
    const list=await api('/api/events'); const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
    const all = ev.teeTimes || [];
    const dests = all.filter(t => String(t._id) !== String(fromTeeId));
    if(!dests.length){ alert('No other destinations'); return; }

    moveForm.elements['eventId'].value=eventId;
    moveForm.elements['fromTeeId'].value=fromTeeId;
    moveForm.elements['playerId'].value=playerId;

    const html = dests.map((t)=>{
      const originalIdx = all.findIndex(tt => String(tt._id) === String(t._id));
      const label = ev.isTeamEvent ? (t.name ? t.name : ('Team ' + (originalIdx + 1))) : fmtTime(t.time);
      return `<label class="radio-item"><input type="radio" name="dest" value="${t._id}" required> ${label}</label>`;
    }).join('');

    moveTitle.textContent = ev.isTeamEvent ? 'Move Player to another Team' : 'Move Player to another Tee Time';
    moveChoices.innerHTML = html;
    moveModal.showModal();
  }

  on(moveForm, 'submit', async (e)=>{
    e.preventDefault();
    const eventId=moveForm.elements['eventId'].value;
    const fromTeeId=moveForm.elements['fromTeeId'].value;
    const playerId=moveForm.elements['playerId'].value;
    const toTeeId=moveForm.elements['dest'].value;
    try{
      await api(`/api/events/${eventId}/move-player`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromTeeId,toTeeId,playerId})});
      moveModal.close?.(); load();
    }catch{ alert('Move failed'); }
  });

  load();
})();