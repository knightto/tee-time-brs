/* server.js v3.8 create+email fixes */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';

app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connected', uri:mongoUri })))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

let Event;
try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
const Subscriber = require('./models/Subscriber');

/* ---- Resend email helpers ---- */
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
  const subs = await Subscriber.find({}).lean();
  if (!subs.length) return { ok:true, sent:0 };
  let sent = 0;
  for (const s of subs) {
    try { await sendEmail(s.email, subject, html); sent++; } catch {}
  }
  return { ok:true, sent };
}

/* ---- utils ---- */
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
function esc(s=''){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const fmt = {
  date(d){ try{ return new Date(d).toLocaleDateString(); } catch{ return d; } },
  tee(t){ if(!t) return ''; const [H,M] = t.split(':').map(x=>parseInt(x,10)); const ap=H>=12?'PM':'AM'; const h=((H%12)||12); return `${h}:${String(M).padStart(2,'0')} ${ap}`; }
};

/* ---- API ---- */
app.get('/api/events', async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

app.post('/api/events', async (req, res) => {
  try {
    const { course, date, teeTime, teeTimes, notes, isTeamEvent, teamSizeMax } = req.body || {};
    let tt = [];
    if (isTeamEvent) {
      tt = [];
    } else {
      tt = Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 10);
    }
    const created = await Event.create({
      course, date, notes,
      isTeamEvent: !!isTeamEvent,
      teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
      teeTimes: tt
    });
    res.status(201).json(created);

    // Notify new event
    await sendEmailToAll(`New ${created.isTeamEvent ? 'Team Event' : 'Event'}: ${created.course} (${fmt.date(created.date)})`,
      `<h2>${esc(created.course||'Event')}</h2><p>Date: ${esc(fmt.date(created.date))}</p><p>${created.isTeamEvent ? 'Teams will be added' : 'Tee times created'}</p><p>${esc(created.notes||'')}</p>`);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const code = req.query.code || req.body?.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  const del = await Event.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
  await sendEmailToAll(`Event Deleted: ${del.course} (${fmt.date(del.date)})`,
    `<h2>${esc(del.course)}</h2><p>Date: ${esc(fmt.date(del.date))}</p><p>Event has been removed.</p>`);
});

app.post('/api/events/:id/tee-times', async (req, res) => {
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.isTeamEvent) {
    ev.teeTimes.push({ time: '00:00', players: [] });
    await ev.save(); res.json(ev);
    return void sendEmailToAll(`Team added: ${ev.course} (${fmt.date(ev.date)})`, `<p>A new team was added to <strong>${esc(ev.course)}</strong>.</p>`);
  }
  const { time } = req.body || {};
  if (!time) return res.status(400).json({ error: 'time required HH:MM' });
  if (ev.teeTimes.some(t => t.time === time)) return res.status(409).json({ error: 'duplicate time' });
  ev.teeTimes.push({ time, players: [] });
  await ev.save(); res.json(ev);
  return void sendEmailToAll(`Tee time added: ${ev.course} ${fmt.tee(time)} (${fmt.date(ev.date)})`, `<p>Tee time ${esc(fmt.tee(time))} added.</p>`);
});

app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    const isTeam = ev.isTeamEvent, time = tt.time;
    tt.deleteOne(); await ev.save(); res.json(ev);
    const subj = isTeam ? `Team removed: ${ev.course} (${fmt.date(ev.date)})`
                        : `Tee time removed: ${ev.course} ${fmt.tee(time)} (${fmt.date(ev.date)})`;
    const html = isTeam ? `<p>A team was removed from <strong>${esc(ev.course)}</strong>.</p>`
                        : `<p>Tee time ${esc(fmt.tee(time))} removed from <strong>${esc(ev.course)}</strong>.</p>`;
    return void sendEmailToAll(subj, html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// no emails for player changes
app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const tt = ev.teeTimes.id(req.params.teeId);
  if (!tt) return res.status(404).json({ error: 'tee time not found' });
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (tt.players.length >= maxSize) return res.status(400).json({ error: ev.isTeamEvent ? 'team full' : 'tee time full' });
  tt.players.push({ name }); await ev.save(); res.json(ev);
});

app.post('/api/events/:id/move-player', async (req, res) => {
  const { fromTeeId, toTeeId, playerId } = req.body || {};
  if (!fromTeeId || !toTeeId || !playerId) return res.status(400).json({ error: 'fromTeeId, toTeeId, playerId required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const fromTT = ev.teeTimes.id(fromTeeId);
  const toTT = ev.teeTimes.id(toTeeId);
  if (!fromTT || !toTT) return res.status(404).json({ error: 'tee time not found' });
  const idx = fromTT.players.findIndex(p => String(p._id) === String(playerId));
  if (idx === -1) return res.status(404).json({ error: 'player not found' });
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (toTT.players.length >= maxSize) return res.status(400).json({ error: 'destination full' });
  const [player] = fromTT.players.splice(idx, 1);
  toTT.players.push({ name: player.name }); await ev.save(); res.json(ev);
});

/* ---- subscribers ---- */
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const s = await Subscriber.findOneAndUpdate({ email: email.toLowerCase() }, { $setOnInsert: { email: email.toLowerCase() } }, { upsert: true, new: true });
    res.json({ ok:true, id: s._id.toString(), email: s.email });
    // welcome email
    await sendEmail(s.email, 'Subscribed to Tee Times', `<p>You will receive updates for new events and changes.</p>`).catch(()=>{});
  } catch (e) {
    res.status(500).json({ error:e.message });
  }
});

app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));
