/* public/script.js v3.18 — add Edit Time dropdown for tee-time events; fix Move submit */
(() => {
  'use strict';
  const ADMIN_KEY = 'ADMIN_DELETE_CODE';
  const getAdmin = () => { try { return localStorage.getItem(ADMIN_KEY) || ''; } catch { return ''; } };
  const setAdmin = (v) => { try { localStorage.setItem(ADMIN_KEY, v||''); } catch {} };

  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const eventsEl = $('#events');
  const modal = $('#eventModal');
  const eventForm = $('#eventForm');
  const eventFormTitle = $('#eventFormTitle');
  const newTeeBtn = $('#newTeeBtn');
  const newTeamBtn = $('#newTeamBtn');
  const teeTimeRow = $('#teeTimeRow');
  const teamSizeRow = $('#teamSizeRow');
  const createModeInput = $('#createMode');
  const subForm = $('#subscribeForm');
  const subMsg = $('#subMsg');

  function fmtDate(val){
    try{
      if (!val) return '—';
      const s = String(val);
      let d;
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) d = new Date(s);
      else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s+'T12:00:00Z');
      else d = new Date(s);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });
    } catch { return '—'; }
  }
  function fmtTime(hhmm){ if(!hhmm) return ''; const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm); if(!m) return hhmm; let h=parseInt(m[1],10); const min=m[2]; const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${min} ${ap}`; }

  function normalizeForm(form){
    const data=Object.fromEntries(new FormData(form).entries());
    if(data.date){
      const s = String(data.date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + 'T12:00:00Z');
        const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
        data.date=`${y}-${m}-${day}`;
      } else data.date = s;
    }
    return data;
  }
  async function api(path, opts){ const r=await fetch(path, opts); if(!r.ok){ let msg=`HTTP ${r.status}`; try{ const j=await r.json(); msg=j.error||msg; }catch{} throw new Error(msg);} const ct=r.headers.get('content-type')||''; return ct.includes('application/json')?r.json():r.text(); }

  function openCreate(mode){
    createModeInput.value = mode;
    eventForm.reset();
    if (mode === 'teams') {
      eventFormTitle.textContent = 'Create Team Event';
      teeTimeRow.hidden = true;
      teamSizeRow.hidden = false;
    } else {
      eventFormTitle.textContent = 'Create Tee-Time Event';
      teeTimeRow.hidden = false;
      teamSizeRow.hidden = true;
      if (!eventForm.elements['teeTime'].value) eventForm.elements['teeTime'].value = '08:00';
    }
    modal?.showModal?.() ?? modal?.setAttribute('open','');
  }
  on(newTeeBtn, 'click', ()=> openCreate('tees'));
  on(newTeamBtn, 'click', ()=> openCreate('teams'));

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cancel]');
    if (!btn) return;
    ev.preventDefault();
    btn.closest('dialog')?.close?.();
  });

  on(eventForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const body=normalizeForm(eventForm);
      const isTeams = (body.mode === 'teams');
      const payload = { course: body.course, date: body.date, notes: body.notes || '', isTeamEvent: isTeams, teamSizeMax: isTeams ? Number(body.teamSizeMax || 4) : 4 };
      if (!isTeams) payload.teeTime = (body.teeTime || '').trim();
      await api('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      modal?.close?.(); eventForm.reset(); load();
    }catch(err){ console.error('Create failed:', err); alert('Create failed'); }
  });

  function ensureEditDialog(){
    if ($('#editModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="editModal">
      <form id="editForm" method="dialog">
        <h3>Edit Event</h3>
        <label>Course <input name="course" required></label>
        <label>Date <input name="date" type="date" required></label>
        <div id="editTeamSizeRow" hidden>
          <label>Team size max <input name="teamSizeMax" type="number" min="2" max="4" value="4"></label>
        </div>
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
        <input type="hidden" name="id">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Save</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
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
  function ensureTimeDialog(){
    if ($('#timeModal')) return;
    const tpl = document.createElement('div');
    tpl.innerHTML = `<dialog id="timeModal">
      <form id="timeForm" method="dialog">
        <h3>Edit Tee Time</h3>
        <label>Time
          <select name="time" id="timeOptions"></select>
        </label>
        <input type="hidden" name="eventId">
        <input type="hidden" name="teeId">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Save</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(tpl.firstElementChild);
  }
  ensureEditDialog(); ensureMoveDialog(); ensureTimeDialog();

  const editModal = $('#editModal');
  const editForm = $('#editForm');
  const editTeamSizeRow = $('#editTeamSizeRow');
  const moveModal = $('#moveModal');
  const moveForm = $('#moveForm');
  const moveChoices = $('#moveChoices');
  const moveTitle = $('#moveTitle');
  const timeModal = $('#timeModal');
  const timeForm = $('#timeForm');
  const timeOptions = $('#timeOptions');

  on(editForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const data = normalizeForm(editForm);
      const id = data.id;
      const payload = { course: data.course, date: data.date, notes: data.notes || '' };
      const ev = (await api('/api/events')).find(x=>x._id===id);
      if (ev?.isTeamEvent) payload.teamSizeMax = Number(data.teamSizeMax || ev.teamSizeMax || 4);
      await api(`/api/events/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      editModal?.close?.(); load();
    }catch(err){ console.error('Save failed:', err); alert('Save failed'); }
  });

  on($('#subscribeForm'), 'submit', async (e)=>{
    e.preventDefault(); if(subMsg) subMsg.textContent='...';
    try{
      const email = new FormData(subForm).get('email');
      await api('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      if(subMsg) subMsg.textContent='Subscribed';
      subForm.reset();
    }catch(e2){ console.error('Subscribe failed:', e2); if(subMsg) subMsg.textContent='Failed'; }
  });

  async function load(){ try{ const list=await api('/api/events'); render(Array.isArray(list)?list:[]);}catch(e){ console.error('Load failed:', e); eventsEl.innerHTML='<div class="card">Failed to load events.</div>'; } }

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
    const chips = (tt.players || []).map((p, i) => {
      const pid = p._id ? String(p._id) : `idx-${i}`;
      return `<span class="chip">
        ${p.name}
        <button class="icon small" title="Move" data-move="${ev._id}:${tt._id}:${pid}">↔</button>
        <button class="icon small danger" title="Remove" data-del-player="${ev._id}:${tt._id}:${pid}">×</button>
      </span>`;
    }).join('') || '—';
    const max = ev.teamSizeMax || 4;
    const full = (tt.players || []).length >= (isTeams ? max : 4);
    const left = isTeams ? (tt.name ? tt.name : `Team ${idx+1}`) : (tt.time ? fmtTime(tt.time) : '—');
    const delTitle = isTeams ? 'Remove team' : 'Remove tee time';
    const editBtn = isTeams ? `<button class="icon small" title="Rename team" data-edit-name="${ev._id}:${tt._id}:${tt.name||''}">✎</button>` : `<button class="icon small" title="Edit time" data-edit-time="${ev._id}:${tt._id}:${tt.time||''}">✎</button>`;
    return `<div class="tee">
      <div class="tee-time">${left}
        ${editBtn}
        <button class="icon small danger" title="${delTitle}" data-del-tee="${ev._id}:${tt._id}">×</button>
      </div>
      <div class="tee-players">${chips}</div>
      <div class="row">
        <button class="small" data-add-player="${ev._id}:${tt._id}" ${full?'disabled':''}>Add Player</button>
      </div>
    </div>`;
  }

  function buildTimeOptions(selected){
    // 05:00 -> 20:00 in 8-minute steps
    const items = [];
    let h=5, m=0;
    while (h<20 || (h===20 && m===0)){
      const HH=String(h).padStart(2,'0'), MM=String(m).padStart(2,'0');
      const val=`${HH}:${MM}`;
      const sel = (val === selected) ? ' selected' : '';
      items.push(`<option value="${val}"${sel}>${fmtTime(val)}</option>`);
      m += 8; if (m>=60){ h += 1; m -= 60; }
      if (h>20) break;
    }
    return items.join('');
  }

  on(eventsEl, 'click', async (e)=>{
    const t=(e.target.closest('[data-del-tee],[data-del-player],[data-add-tee],[data-add-player],[data-move],[data-edit],[data-del],[data-edit-time]')||e.target);
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
          await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
        }else{
          const timeInput = prompt('New tee time (HH:MM) — leave blank for +8 after last') || '';
          const body = timeInput.trim() ? { time: timeInput.trim() } : {};
          await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        }
        return load();
      }
      if(t.dataset.addPlayer){
        const [id,teeId]=t.dataset.addPlayer.split(':');
        const name=prompt('Player name'); if(!name) return;
        await api(`/api/events/${id}/tee-times/${teeId}/players`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name}) });
        return load();
      }
      if(t.dataset.move){
        const [eventId,fromTeeId,playerId]=t.dataset.move.split(':');
        return openMoveDialog(eventId,fromTeeId,playerId);
      }
      if(t.dataset.edit){
        const id=t.dataset.edit;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id); if(!ev) return;
        editForm.elements['id'].value=id;
        editForm.elements['course'].value=ev.course||'';
        editForm.elements['date'].value=(String(ev.date).slice(0,10));
        editForm.elements['notes'].value=ev.notes||'';
        $('#editTeamSizeRow').hidden = !ev.isTeamEvent;
        if (ev.isTeamEvent) editForm.elements['teamSizeMax'].value = ev.teamSizeMax || 4;
        editModal.showModal();
        return;
      }
      if(t.dataset.del){
        let code=getAdmin();
        if(!code){ code=prompt('Admin delete code:')||''; if(!code) return; setAdmin(code); }
        await api(`/api/events/${t.dataset.del}?code=${encodeURIComponent(code)}`,{method:'DELETE'});
        return load();
      }
      if(t.dataset.editTime){
        const [eventId, teeId, current] = t.dataset.editTime.split(':');
        timeForm.elements['eventId'].value = eventId;
        timeForm.elements['teeId'].value = teeId;
        timeOptions.innerHTML = buildTimeOptions(current);
        timeModal.showModal();
        return;
      }
    }catch(err){ console.error('Action failed:', err); alert('Action failed'); }
  });

  async function openMoveDialog(eventId, fromTeeId, playerId){
    const list=await api('/api/events'); const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
    const all = ev.teeTimes || [];
    const dests = all.filter(t => String(t._id) !== String(fromTeeId));
    if(!dests.length){ alert('No other destinations'); return; }
    const moveModal = $('#moveModal'), moveForm = $('#moveForm');
    moveForm.elements['eventId'].value=eventId;
    moveForm.elements['fromTeeId'].value=fromTeeId;
    moveForm.elements['playerId'].value=playerId;
    const moveChoices = $('#moveChoices'), moveTitle = $('#moveTitle');
    const html = dests.map((t)=>{
      const originalIdx = all.findIndex(tt => String(tt._id) === String(t._id));
      const label = ev.isTeamEvent ? (t.name ? t.name : ('Team ' + (originalIdx + 1))) : (t.time ? fmtTime(t.time) : '—');
      return `<label class="radio-item"><input type="radio" name="dest" value="${t._id}" required> ${label}</label>`;
    }).join('');
    moveTitle.textContent = ev.isTeamEvent ? 'Move Player to another Team' : 'Move Player to another Tee Time';
    moveChoices.innerHTML = html;
    moveModal.showModal();
  }

  on($('#moveForm'), 'submit', async (e)=>{
    e.preventDefault();
    try{
      const form = $('#moveForm');
      const eventId = form.elements['eventId'].value;
      const fromTeeId = form.elements['fromTeeId'].value;
      const playerId = form.elements['playerId'].value;
      const dest = form.querySelector('input[name="dest"]:checked');
      if (!dest) { alert('Pick a destination'); return; }
      const toTeeId = dest.value;
      await api(`/api/events/${eventId}/move-player`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromTeeId, toTeeId, playerId }) });
      $('#moveModal')?.close?.();
      load();
    }catch(err){ console.error('Move failed:', err); alert('Move failed'); }
  });

  // Save edited tee time
  on($('#timeForm'), 'submit', async (e)=>{
    e.preventDefault();
    try{
      const eventId = timeForm.elements['eventId'].value;
      const teeId = timeForm.elements['teeId'].value;
      const time = timeForm.elements['time'].value;
      await api(`/api/events/${eventId}/tee-times/${teeId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ time }) });
      timeModal?.close?.();
      load();
    }catch(err){ console.error('Time update failed:', err); alert(err.message || 'Update failed'); }
  });

  if (!eventsEl) return;
  load();
})();