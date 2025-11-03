/* Tee Time Manager v4.0 - SPA with localStorage persistence
   Features:
   - Create/Edit/Delete events with Title, Course, Date
   - Title updates are immediate and persistent
   - Tee time grid with add/remove/move players
   - Modal with radio buttons to move a player between tee times
   - Unassigned player bucket
   - Hash routing: #/ , #/create , #/event/:id , #/edit/:id
*/
const DB_KEY = "ttm.db.v4";
const state = {
  route: "#/",
  db: { version: 1, events: [] }
};

// ---------- Storage ----------
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw){ state.db = JSON.parse(raw); }
    else { seed(); saveDB(); }
  }catch(e){ console.error(e); seed(); saveDB(); }
}
function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(state.db)); }
function seed(){
  const id = crypto.randomUUID();
  state.db = {
    version: 1,
    events: [{
      id, title:"Untitled Event", course:"Blue Ridge Shadows", date: new Date().toISOString().slice(0,10),
      teeSize:4,
      tees:[
        { id: crypto.randomUUID(), label:"Tee 1", players: [] },
        { id: crypto.randomUUID(), label:"Tee 2", players: [] },
        { id: crypto.randomUUID(), label:"Tee 3", players: [] }
      ],
      unassigned: []
    }]
  };
}

// ---------- Router ----------
window.addEventListener("hashchange", () => { state.route = location.hash || "#/"; render(); });
function nav(to){ location.hash = to; }

// ---------- DOM helpers ----------
const $ = (sel, ctx=document)=>ctx.querySelector(sel);
const $$ = (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel));
function tmpl(id){ return document.importNode($(id).content, true); }
function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==="class") n.className=v; else if(k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if(k==="html") n.innerHTML=v; else n.setAttribute(k,v);
  });
  children.forEach(c=> n.appendChild(typeof c==="string" ? document.createTextNode(c) : c));
  return n;
}

// ---------- Render ----------
function render(){
  const root = $("#app"); root.innerHTML = "";
  $("#nav-home").onclick = ()=>nav("#/");
  $("#nav-create").onclick = ()=>nav("#/create");

  if(!state.route || state.route==="#/") return renderEventList(root);
  if(state.route.startsWith("#/create")) return renderEditor(root);
  if(state.route.startsWith("#/edit/")) return renderEditor(root, state.route.split("/")[2]);
  if(state.route.startsWith("#/event/")) return renderEventView(root, state.route.split("/")[2]);
  return renderEventList(root);
}

function renderEventList(root){
  const frag = tmpl("#eventListTmpl");
  const grid = frag.querySelector("#eventsGrid");
  state.db.events.forEach(ev => {
    const card = tmpl("#eventCardTmpl");
    card.querySelector(".event-title").textContent = ev.title || "Untitled";
    card.querySelector(".date").textContent = ev.date || "";
    card.querySelector(".course").textContent = ev.course || "";
    card.querySelector(".view").onclick = ()=> nav(`#/event/${ev.id}`);
    card.querySelector(".edit").onclick = ()=> nav(`#/edit/${ev.id}`);
    card.querySelector(".delete").onclick = ()=> { if(confirm("Delete event?")) { delEvent(ev.id); render(); } };
    grid.appendChild(card);
  });
  root.appendChild(frag);
}

function renderEditor(root, id){
  const isEdit = Boolean(id);
  const ev = isEdit ? getEvent(id) : null;
  const frag = tmpl("#eventEditorTmpl");
  const form = frag.querySelector("#eventForm");
  const heading = frag.querySelector("#editorHeading");
  heading.textContent = isEdit ? "Edit Event" : "Create Event";

  if(isEdit){
    form.title.value = ev.title;
    form.course.value = ev.course || "";
    form.date.value = ev.date || "";
    form.teeCount.value = ev.tees?.length || 3;
    form.teeSize.value = ev.teeSize || 4;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const teeCount = Math.max(1, parseInt(data.teeCount||"3",10));
    const teeSize = Math.max(2, parseInt(data.teeSize||"4",10));
    if(isEdit){
      ev.title = data.title.trim() || "Untitled";
      ev.course = data.course.trim();
      ev.date = data.date;
      ev.teeSize = teeSize;
      // if tee count changed, adjust tees
      adjustTees(ev, teeCount);
      upsertEvent(ev);
      nav(`#/event/${ev.id}`);
    }else{
      const newEv = {
        id: crypto.randomUUID(),
        title: data.title.trim() || "Untitled",
        course: data.course.trim(),
        date: data.date,
        teeSize,
        tees: Array.from({length: teeCount}, (_,i)=>({id:crypto.randomUUID(), label:`Tee ${i+1}`, players: []})),
        unassigned: []
      };
      upsertEvent(newEv);
      nav(`#/event/${newEv.id}`);
    }
  });
  frag.querySelector("#cancelEdit").onclick = ()=> nav(isEdit ? `#/event/${id}` : "#/");
  root.appendChild(frag);
}

function renderEventView(root, id){
  const ev = getEvent(id);
  if(!ev){ root.appendChild(el("p",{class:"subtle"},["Event not found."])); return; }
  const frag = tmpl("#eventViewTmpl");
  frag.querySelector(".event-title").textContent = ev.title || "Untitled";
  frag.querySelector(".course").textContent = ev.course || "";
  frag.querySelector(".date").textContent = ev.date || "";

  frag.querySelector(".edit").onclick = ()=> nav(`#/edit/${ev.id}`);
  frag.querySelector(".delete").onclick = ()=> { if(confirm("Delete event?")) { delEvent(ev.id); nav("#/"); }};

  // Unassigned list
  const unList = frag.querySelector("#unassignedList");
  ev.unassigned.forEach(p => unList.appendChild(playerRow(p, ev)));

  // add player to unassigned
  frag.querySelector("#addPlayerForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = e.target.player.value.trim();
    if(!name) return;
    addPlayer(ev, name, null);
    upsertEvent(ev);
    e.target.reset();
    render();
  });

  // Tee time grid
  const grid = frag.querySelector("#teeTimeGrid");
  ev.tees.forEach((t, idx) => {
    const card = tmpl("#teeTimeCardTmpl");
    card.querySelector(".tee-label").textContent = t.label || `Tee ${idx+1}`;
    card.querySelector(".cap").textContent = `${t.players.length}/${ev.teeSize}`;
    const ul = card.querySelector(".players");
    t.players.forEach(p => ul.appendChild(playerRow(p, ev, t.id)));

    // quick add to this tee
    card.querySelector(".add-to-tee").addEventListener("submit", e => {
      e.preventDefault();
      const name = e.target.player.value.trim();
      if(!name) return;
      addPlayer(ev, name, t.id);
      upsertEvent(ev);
      e.target.reset();
      render();
    });

    grid.appendChild(card);
  });

  root.appendChild(frag);
}

function playerRow(name, ev, teeId=null){
  const li = el("li");
  const left = el("span", {}, [name]);
  const actions = el("span", {class:"row-actions"});
  const moveBtn = el("button",{class:"btn", onClick:()=>openMoveDialog(ev, name, teeId)},["Move"]);
  const delBtn = el("button",{class:"btn danger", onClick:()=>{ removePlayer(ev, name); upsertEvent(ev); render();}},["Remove"]);
  actions.append(moveBtn, delBtn);
  li.append(left, actions);
  return li;
}

// ---------- Business logic ----------
function getEvent(id){ return state.db.events.find(e=>e.id===id); }
function upsertEvent(ev){
  const idx = state.db.events.findIndex(e=>e.id===ev.id);
  if(idx>=0) state.db.events[idx]=ev; else state.db.events.push(ev);
  saveDB();
}
function delEvent(id){
  state.db.events = state.db.events.filter(e=>e.id!==id);
  saveDB();
}
function adjustTees(ev, targetCount){
  const cur = ev.tees.length;
  if(targetCount===cur) return;
  if(targetCount>cur){
    for(let i=cur;i<targetCount;i++){
      ev.tees.push({id:crypto.randomUUID(), label:`Tee ${i+1}`, players:[]});
    }
  }else{
    // move overflow players to unassigned, then trim
    const removed = ev.tees.splice(targetCount);
    removed.forEach(t=> t.players.forEach(p=> ev.unassigned.push(p)));
  }
}
function addPlayer(ev, name, teeId){
  // avoid dupes
  removePlayer(ev, name);
  if(teeId){
    const tee = ev.tees.find(t=>t.id===teeId);
    if(tee) tee.players.push(name);
  }else{
    ev.unassigned.push(name);
  }
}
function removePlayer(ev, name){
  ev.unassigned = ev.unassigned.filter(p=>p!==name);
  ev.tees.forEach(t=> t.players = t.players.filter(p=>p!==name));
}
function movePlayer(ev, name, toTeeId){
  removePlayer(ev, name);
  if(toTeeId==="__unassigned__"){ ev.unassigned.push(name); return; }
  const tee = ev.tees.find(t=>t.id===toTeeId);
  if(tee) tee.players.push(name);
}

// ---------- Move dialog ----------
function openMoveDialog(ev, name, currentTeeId){
  const dlg = $("#moveDialog");
  $("#movePlayerLabel").textContent = name;
  const group = $("#teeTimeRadioGroup"); group.innerHTML="";
  const optUn = el("label",{},[el("input",{type:"radio", name:"target", value:"__unassigned__", ...(currentTeeId?{}:{checked:true})}), el("span",{class:"chip"},["Unassigned"])]);
  group.appendChild(optUn);
  ev.tees.forEach((t,i)=>{
    const checked = t.id===currentTeeId;
    const cap = `${t.players.length}/${ev.teeSize}`;
    const lab = el("label",{},[
      el("input",{type:"radio", name:"target", value:t.id, ...(checked?{checked:true}:{})}),
      el("span",{},[t.label || `Tee ${i+1}`]),
      el("span",{class:"chip"},[` • ${cap}`])
    ]);
    group.appendChild(lab);
  });
  dlg.returnValue="";
  dlg.showModal();
  $("#moveForm").onsubmit = (e)=>{
    const target = new FormData(e.target).get("target");
    if(target){ movePlayer(ev, name, target); upsertEvent(ev); render(); }
  };
}

// ---------- Boot ----------
loadDB();
state.route = location.hash || "#/";
render();
