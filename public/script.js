
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const eventsEl = $('#events');
  const modal = $('#eventModal');
  const editModal = $('#editModal');
  const eventForm = $('#eventForm');
  const editForm = $('#editForm');
  const newEventBtn = $('#newEventBtn');
  const subForm = $('#subscribeForm');
  const subMsg = $('#subMsg');
  const moveModal = $('#moveModal');
  const moveForm = $('#moveForm');
  const moveChoices = $('#moveChoices');

  if (!eventsEl) { console.error('#events not found'); return; }

  const isIsoLike = s => typeof s === 'string' && /\d{4}-\d{2}-\d{2}T/.test(s);
  const get = (f, n) => (f?.elements?.[n]?.value || '').trim();
  function fmtDate(s){ try{ const d=isIsoLike(s)?new Date(s):new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});}catch{ return s||''; } }
  function fmtTime(hhmm){ if(!hhmm) return ''; const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm); if(!m) return hhmm; let h=parseInt(m[1],10); const min=m[2]; const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${min} ${ap}`; }
  function normalizeForm(form){ const data=Object.fromEntries(new FormData(form).entries()); if(data.date){ const d=new Date(data.date+'T00:00:00'); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); data.date=`${y}-${m}-${day}`; } return data; }
  async function api(path, opts){ const r=await fetch(path, opts); if(!r.ok) throw new Error('HTTP '+r.status); const ct=r.headers.get('content-type')||''; return ct.includes('application/json')?r.json():r.text(); }

  async function load(){ try{ const list=await api('/api/events'); render(Array.isArray(list)?list:[]);}catch(e){ console.error(e); eventsEl.innerHTML='<div class="card">Failed to load events.</div>'; } }

  function render(list){
    eventsEl.innerHTML='';
    for(const ev of list){
      const card=document.createElement('div'); card.className='card';
      const tees=(ev.teeTimes||[]).map(tt=>teeRow(ev,tt)).join('');
      card.innerHTML = `
        <h3 class="card-title">${ev.course || 'Course'}</h3>
        <div>${fmtDate(ev.date)}</div>
        <div class="tees">${tees || '<em>No tee times</em>'}</div>
        <div class="row">
          <button class="small" data-add-tee="${ev._id}">Add Tee Time</button>
          <button class="small" data-edit="${ev._id}">Edit</button>
          <button class="small" data-del="${ev._id}">Delete</button>
        </div>
        <div class="notes">${ev.notes || ''}</div>`;
      eventsEl.appendChild(card);
    }
  }

  function teeRow(ev, tt){
  const chips = (tt.players || []).map(p => {
    return `<span class="chip">
      ${p.name}
      <button class="icon small" title="Move" data-move="${ev._id}:${tt._id}:${p._id}">↔</button>
      <button class="icon small danger" title="Remove" data-del-player="${ev._id}:${tt._id}:${p._id}">×</button>
    </span>`;
  }).join('') || '—';
  const full = (tt.players || []).length >= 4;
  return `<div class="tee">
    <div class="tee-time">${fmtTime(tt.time)}</div>
    <div class="tee-players">${chips}</div>
    <div class="row"><button class="small" data-add-player="${ev._id}:${tt._id}" ${full?'disabled':''}>Add Player</button></div>
  </div>`;
}

  // ----- Dialog cancel buttons -----
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cancel]');
    if (!btn) return;
    ev.preventDefault();
    const dlg = btn.closest('dialog');
    if (dlg) {
      dlg.close();
      if (dlg === modal) eventForm?.reset();
      if (dlg === editModal) editForm?.reset();
      if (dlg === moveModal) moveForm?.reset();
    }
  });

  // ----- New Event -----
  on(newEventBtn, 'click', ()=> modal?.showModal());
  on(eventForm, 'submit', async (e)=>{
    e.preventDefault();
    if (e.submitter && e.submitter.hasAttribute('data-cancel')) { modal.close(); return; }
    try{
      const body=normalizeForm(eventForm);
      await api('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      modal.close(); eventForm.reset(); load();
    }catch{ alert('Create failed'); }
  });

  // ----- Events list actions -----
  on(eventsEl, 'click', async (e)=>{
    const t=(e.target.closest('[data-del-player],[data-add-tee],[data-add-player],[data-move],[data-edit],[data-del]')||e.target);
    try{
      if(t.dataset.delPlayer){
        const [eventId, teeId, playerId] = t.dataset.delPlayer.split(':');
        if(!confirm('Remove this player from the tee time?')) return;
        await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}`, { method: 'DELETE' });
        return load();
      }

      if(t.dataset.addTee){
        const time=prompt('New tee time (HH:MM)'); if(!time) return;
        await api(`/api/events/${t.dataset.addTee}/tee-times`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({time})});
        return load();
      }
      if(t.dataset.addPlayer){
        const [id,teeId]=t.dataset.addPlayer.split(':');
        const name=prompt('Player name'); if(!name) return;
        await api(`/api/events/${id}/tee-times/${teeId}/players`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
        return load();
      }
      if(t.dataset.move){
        const [eventId,fromTeeId,playerId]=t.dataset.move.split(':');
        await openMoveDialog(eventId,fromTeeId,playerId); return;
      }
      if(t.dataset.edit){
        const id=t.dataset.edit; const list=await api('/api/events'); const ev=(list||[]).find(x=>x._id===id); if(!ev) return;
        editForm.elements['id'].value=id;
        editForm.elements['course'].value=ev.course||'';
        editForm.elements['date'].value=(isIsoLike(ev.date)?ev.date.slice(0,10):ev.date);
        editForm.elements['notes'].value=ev.notes||'';
        return editModal.showModal();
      }
      if(t.dataset.del){
        const code=prompt('Admin delete code:'); if(!code) return;
        await api(`/api/events/${t.dataset.del}?code=${encodeURIComponent(code)}`,{method:'DELETE'});
        return load();
      }
    }catch(err){ console.error(err); alert('Action failed'); }
  });

  // ----- Edit Event -----
  on(editForm, 'submit', async (e)=>{
    e.preventDefault();
    if (e.submitter && e.submitter.hasAttribute('data-cancel')) { editModal.close(); return; }
    try{
      const id=editForm.elements['id'].value;
      const body=normalizeForm(editForm);
      body.course=get(editForm,'course');
      body.notes=get(editForm,'notes');
      await api(`/api/events/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      editModal.close(); load();
    }catch{ alert('Update failed'); }
  });

  // ----- Move Player -----
  async function openMoveDialog(eventId, fromTeeId, playerId){
    const list=await api('/api/events'); const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
    const options=(ev.teeTimes||[]).filter(t=>t._id!==fromTeeId); if(!options.length){ alert('No other tee times'); return; }
    moveForm.elements['eventId'].value=eventId;
    moveForm.elements['fromTeeId'].value=fromTeeId;
    moveForm.elements['playerId'].value=playerId;
    moveChoices.innerHTML = options.map(t=>`<label class="radio-item"><input type="radio" name="dest" value="${t._id}" required> ${t.time}</label>`).join('');
    moveModal.showModal();
  }

  on(moveForm, 'submit', async (e)=>{
    e.preventDefault();
    if (e.submitter && e.submitter.hasAttribute('data-cancel')) { moveModal.close(); return; }
    const eventId=moveForm.elements['eventId'].value;
    const fromTeeId=moveForm.elements['fromTeeId'].value;
    const playerId=moveForm.elements['playerId'].value;
    const toTeeId=moveForm.elements['dest'].value;
    try{
      await api(`/api/events/${eventId}/move-player`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromTeeId,toTeeId,playerId})});
      moveModal.close(); load();
    }catch{ alert('Move failed'); }
  });

  // ----- Subscribe -----
  on(subForm, 'submit', async (e)=>{
    e.preventDefault(); if(subMsg) subMsg.textContent='...';
    try{
      await api('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:new FormData(subForm).get('email')})});
      if(subMsg) subMsg.textContent='Saved'; subForm.reset();
    }catch{ if(subMsg) subMsg.textContent='Disabled'; }
  });

  // Kick off
  load();
})();
