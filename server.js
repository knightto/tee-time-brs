/* server.js v3.13 — daily 5pm empty-tee reminder + manual trigger */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = process.env.SITE_URL || 'https://tee-time-brs.onrender.com/';
const LOCAL_TZ = process.env.LOCAL_TZ || 'America/New_York';

app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connected', uri:mongoUri })))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

let Event; try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
let Subscriber; try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = null; }

/* ---------------- Email helpers ---------------- */
let resend = null;
async function ensureResend() {
  if (resend || !process.env.RESEND_API_KEY) return resend;
  const { Resend } = require('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}
async function sendEmail(to, subject, html) {
  const api = await ensureResend();
  if (!api || !process.env.RESEND_FROM) {
    console.warn(JSON.stringify({ level:'warn', msg:'Email disabled', reason:'missing key/from' }));
    return { ok:false, disabled:true };
  }
  return api.emails.send({ from: process.env.RESEND_FROM, to, subject, html });
}
async function sendEmailToAll(subject, html) {
  if (!Subscriber) return { ok:false, reason:'no model' };
  const subs = await Subscriber.find({}).lean();
  if (!subs.length) return { ok:true, sent:0 };
  let sent = 0;
  for (const s of subs) {
    try { await sendEmail(s.email, subject, html); sent++; } catch {}
  }
  return { ok:true, sent };
}

/* ---------------- Formatting + dates ---------------- */
function esc(s=''){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function asUTCDate(x){
  if (!x) return new Date(NaN);
  if (x instanceof Date) return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 12, 0, 0));
  const s = String(x).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00Z');
  const d = new Date(s);
  return isNaN(d) ? new Date(NaN) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}
const fmt = {
  dateISO(x){ const d = asUTCDate(x); return isNaN(d) ? '' : d.toISOString().slice(0,10); },
  dateLong(x){ const d = asUTCDate(x); return isNaN(d) ? '' : d.toLocaleDateString(undefined,{ weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'UTC' }); },
  dateShortTitle(x){ const d = asUTCDate(x); return isNaN(d) ? '' : d.toLocaleDateString(undefined,{ weekday:'short', month:'numeric', day:'numeric', timeZone:'UTC' }); },
  tee(t){ if(!t) return ''; const m=/^(\d{1,2}):(\d{2})$/.exec(t); if(!m) return t; const H=+m[1], M=m[2]; const ap=H>=12?'PM':'AM'; const h=(H%12)||12; return `${h}:${M} ${ap}`; }
};
function btn(label='Go to Sign-up Page'){
  return `<p style="margin:24px 0"><a href="${esc(SITE_URL)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`;
}
function frame(title, body){
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:10px;padding:24px;border:1px solid #e5e7eb"><tr><td><h2 style="margin:0 0 12px 0;color:#111827;font-size:20px">${esc(title)}</h2>${body}<p style="color:#6b7280;font-size:12px;margin-top:24px">You received this because you subscribed to tee time updates.</p></td></tr></table></td></tr></table>`;
}
function reminderEmail(blocks){
  // blocks: [{course, dateISO, dateLong, empties: ['08:18 AM','08:28 AM']}]
  if (!blocks.length) return '';
  const rows = blocks.map(b=>{
    const list = b.empties.map(t=>`<li>${esc(t)}</li>`).join('');
    return `<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
      <p style="margin:0 0 6px 0"><strong>${esc(b.course)}</strong> — ${esc(b.dateLong)} (${esc(b.dateISO)})</p>
      <p style="margin:0 0 6px 0">Empty tee times:</p>
      <ul style="margin:0 0 0 18px">${list}</ul>
    </div>`;
  }).join('');
  return frame('Reminder: Empty Tee Times Tomorrow', `<p>These tee times are still empty. Grab a spot:</p>${rows}${btn('Go to Sign-up Page')}`);
}

/* local YMD in a TZ */
function ymdInTZ(d=new Date(), tz='America/New_York'){
  const fmt = new Intl.DateTimeFormat('en-CA',{ timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(d); // YYYY-MM-DD
}
function addDaysUTC(d, days){ const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate()+days); return x; }

/* ---------------- Core API (unchanged parts trimmed for brevity) ---------------- */
function genTeeTimes(startHHMM, count=3, mins=10) {
  if (!startHHMM) return [];
  const m = /^(\d{1,2}):(\d{2})$/.exec(startHHMM);
  if (!m) return [{ time: startHHMM, players: [] }];
  let h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  const out = [];
  for (let i=0;i<count;i++) {
    const tMin = h*60 + mm + i*mins;
    const H = Math.floor(tMin/60)%24;
    const M = tMin%60;
    out.push({ time: String(H).padStart(2,'0') + ':' + String(M).padStart(2,'0'), players: [] });
  }
  return out;
}

/* Helper: generate next automatic team name for an event (smallest unused Team N) */
function nextTeamNameForEvent(ev) {
  const used = new Set();
  (ev.teeTimes || []).forEach((tt, idx) => {
    if (tt && tt.name) used.add(String(tt.name).trim());
    else used.add(`Team ${idx+1}`);
  });
  let n = 1;
  while (used.has(`Team ${n}`)) n++;
  return `Team ${n}`;
}

/* Helper: compute next tee time by searching last valid time and adding mins (default 8), wrap at 24h */
function nextTeeTimeForEvent(ev, mins = 8, defaultTime = '07:00') {
  if (ev.teeTimes && ev.teeTimes.length) {
    for (let i = ev.teeTimes.length - 1; i >= 0; i--) {
      const lt = ev.teeTimes[i] && ev.teeTimes[i].time;
      if (typeof lt === 'string') {
        const m = /^(\d{1,2}):(\d{2})$/.exec(lt.trim());
        if (m) {
          const hours = parseInt(m[1], 10);
          const minutes = parseInt(m[2], 10);
          if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            const total = hours * 60 + minutes + mins;
            const newHours = Math.floor(total / 60) % 24;
            const newMinutes = total % 60;
            return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
          }
        }
      }
    }
  }
  return defaultTime;
}

app.get('/api/events', async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

app.post('/api/events', async (req, res) => {
  try {
    const { course, date, teeTime, teeTimes, notes, isTeamEvent, teamSizeMax } = req.body || {};
    const tt = isTeamEvent ? [] : (Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 10));
    const created = await Event.create({
      course,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(date||'')) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date),
      notes,
      isTeamEvent: !!isTeamEvent,
      teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
      teeTimes: tt
    });
    res.status(201).json(created);
    await sendEmailToAll(`New Event: ${created.course} (${fmt.dateISO(created.date)})`,
      frame('A New Golf Event Has Been Scheduled!',
            `<p>The following event is now open for sign-up:</p>
             <p><strong>Event:</strong> ${esc(fmt.dateShortTitle(created.date))}</p>
             <p><strong>Course:</strong> ${esc(created.course||'')}</p>
             <p><strong>Date:</strong> ${esc(fmt.dateLong(created.date))}</p>
             ${(!created.isTeamEvent && created.teeTimes?.[0]?.time) ? `<p><strong>First Tee Time:</strong> ${esc(fmt.tee(created.teeTimes[0].time))}</p>`:''}
             <p>Please visit the sign-up page to secure your spot!</p>${btn('Go to Sign-up Page')}`));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const { course, date, notes, isTeamEvent, teamSizeMax } = req.body || {};
    if (course !== undefined) ev.course = String(course);
    if (date !== undefined) ev.date = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date);
    if (notes !== undefined) ev.notes = String(notes);
    if (isTeamEvent !== undefined) ev.isTeamEvent = !!isTeamEvent;
    if (teamSizeMax !== undefined) ev.teamSizeMax = Math.max(2, Math.min(4, Number(teamSizeMax || 4)));
    await ev.save();
    res.json(ev);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  const code = req.query.code || req.body?.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  const del = await Event.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* tee/team, players, move endpoints remain as in your current server.js */
app.post('/api/events/:id/tee-times', async (req, res) => {
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.isTeamEvent) {
    // Accept optional name. If missing/blank, auto-assign the next available "Team N".
    let name = (req.body && typeof req.body.name === 'string') ? String(req.body.name).trim() : '';
    if (!name) {
      name = nextTeamNameForEvent(ev);
    } else {
      // Defensive: prevent duplicate team names (case-insensitive)
      const dup = (ev.teeTimes || []).some(t => t && t.name && String(t.name).trim().toLowerCase() === name.toLowerCase());
      if (dup) return res.status(409).json({ error: 'duplicate team name' });
    }
    ev.teeTimes.push({ name, players: [] });
    await ev.save(); return res.json(ev);
  }
  // For tee times: accept optional time. If missing, compute next time using event data.
  const { time } = req.body || {};
  let newTime = typeof time === 'string' && time.trim() ? time.trim() : null;
  if (!newTime) {
    newTime = nextTeeTimeForEvent(ev, 8, '07:00');
  }
  // Validate HH:MM and ranges
  const m = /^(\d{1,2}):(\d{2})$/.exec(newTime);
  if (!m) return res.status(400).json({ error: 'time required HH:MM' });
  const hh = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return res.status(400).json({ error: 'invalid time' });
  if (ev.teeTimes.some(t => t.time === newTime)) return res.status(409).json({ error: 'duplicate time' });
  ev.teeTimes.push({ time: newTime, players: [] });
  await ev.save(); res.json(ev);
});
app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    tt.deleteOne(); await ev.save(); res.json(ev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const tt = ev.teeTimes.id(req.params.teeId);
  if (!tt) return res.status(404).json({ error: 'tee time not found' });
  if (!Array.isArray(tt.players)) tt.players = [];
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (tt.players.length >= maxSize) return res.status(400).json({ error: ev.isTeamEvent ? 'team full' : 'tee time full' });
  tt.players.push({ name });
  await ev.save(); res.json(ev);
});
app.delete('/api/events/:id/tee-times/:teeId/players/:playerId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    if (!Array.isArray(tt.players)) tt.players = [];
    const idx = tt.players.findIndex(p => String(p._id) === String(req.params.playerId));
    if (idx === -1) return res.status(404).json({ error: 'player not found' });
    tt.players.splice(idx, 1);
    await ev.save();
    return res.json(ev);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
app.post('/api/events/:id/move-player', async (req, res) => {
  const { fromTeeId, toTeeId, playerId } = req.body || {};
  if (!fromTeeId || !toTeeId || !playerId) return res.status(400).json({ error: 'fromTeeId, toTeeId, playerId required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const fromTT = ev.teeTimes.id(fromTeeId);
  const toTT = ev.teeTimes.id(toTeeId);
  if (!fromTT || !toTT) return res.status(404).json({ error: 'tee time not found' });
  if (!Array.isArray(fromTT.players)) fromTT.players = [];
  if (!Array.isArray(toTT.players)) toTT.players = [];
  const idx = fromTT.players.findIndex(p => String(p._id) === String(playerId));
  if (idx === -1) return res.status(404).json({ error: 'player not found' });
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (toTT.players.length >= maxSize) return res.status(400).json({ error: 'destination full' });
  const [player] = fromTT.players.splice(idx, 1);
  toTT.players.push({ name: player.name });
  await ev.save(); res.json(ev);
});

/* ---------------- Subscribers ---------------- */
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    if (!Subscriber) return res.status(500).json({ error: 'subscriber model missing' });
    const s = await Subscriber.findOneAndUpdate({ email: email.toLowerCase() }, { $setOnInsert: { email: email.toLowerCase() } }, { upsert: true, new: true });
    res.json({ ok:true, id: s._id.toString(), email: s.email });
    await sendEmail(s.email, 'Subscribed to Tee Times',
      frame('Subscription Confirmed', `<p>You will receive updates for new events and changes.</p>${btn('Go to Sign-up Page')}`)).catch(()=>{});
  } catch (e) { res.status(500).json({ error:e.message }); }
});

/* ---------------- Reminder logic ---------------- */
function tomorrowYMDLocal(){
  const now = new Date();
  const ymd = ymdInTZ(now, LOCAL_TZ);
  const [y,m,d] = ymd.split('-').map(Number);
  const baseUTCNoon = new Date(Date.UTC(y, m-1, d, 12, 0, 0)); // today at local date, noon UTC marker
  const tomUTCNoon = addDaysUTC(baseUTCNoon, 1);
  // We only need its local YMD string:
  return ymdInTZ(tomUTCNoon, LOCAL_TZ);
}
async function findEmptyTeeTimesForTomorrow(){
  const ymd = tomorrowYMDLocal();                  // 'YYYY-MM-DD' in local TZ
  const start = new Date(ymd + 'T00:00:00Z');      // events stored at noon UTC, this window is safe
  const end   = new Date(ymd + 'T23:59:59Z');
  const events = await Event.find({ isTeamEvent: false, date: { $gte: start, $lte: end } }).lean();
  const blocks = [];
  for (const ev of events) {
    const empties = (ev.teeTimes||[])
      .filter(tt => !tt.players || !tt.players.length)
      .map(tt => fmt.tee(tt.time||''));
    if (empties.length) {
      blocks.push({ course: ev.course||'Course', dateISO: fmt.dateISO(ev.date), dateLong: fmt.dateLong(ev.date), empties });
    }
  }
  return blocks;
}
async function runReminderIfNeeded(label){
  const blocks = await findEmptyTeeTimesForTomorrow();
  if (!blocks.length) {
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'reminder-skip', reason:'no empty tees', label }));
    return { ok:true, sent:0 };
  }
  const html = reminderEmail(blocks);
  const res = await sendEmailToAll('Reminder: Empty Tee Times Tomorrow', html);
  console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'reminder-sent', sent:res.sent, label }));
  return res;
}

/* manual trigger: GET /admin/run-reminders?code=... */
app.get('/admin/run-reminders', async (req, res) => {
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  try { const r = await runReminderIfNeeded('manual'); return res.json(r); }
  catch (e) { return res.status(500).json({ error: e.message }); }
});

/* 5:00 PM local scheduler without extra deps
   Only enable when running as the entry point (not when imported by tests)
   and when ENABLE_SCHEDULER is not explicitly disabled. */
if (require.main === module && process.env.ENABLE_SCHEDULER !== '0') {
  let lastRunForYMD = null;
  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(now).split(':');
      const hour = Number(parts[0]), minute = Number(parts[1]);
      const todayLocalYMD = ymdInTZ(now, LOCAL_TZ);
      if (hour === 17 && minute === 0 && lastRunForYMD !== todayLocalYMD) {
        lastRunForYMD = todayLocalYMD;
        await runReminderIfNeeded('auto-17:00');
      }
    } catch (e) {
      console.error('reminder tick error', e);
    }
  }, 60 * 1000); // check once per minute
}

if (require.main === module) {
  app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));
}
module.exports = app;
// Export helpers for testing
module.exports.nextTeamNameForEvent = nextTeamNameForEvent;
module.exports.nextTeeTimeForEvent = nextTeeTimeForEvent;
