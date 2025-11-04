/* server.js v3.12 — edit API, array safety, UTC dates, email template, signup link */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = process.env.SITE_URL || 'https://tee-time-brs.onrender.com/';

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
let Subscriber;
try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = null; }

/* ---- email helpers ---- */
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

/* ---- date + formatting ---- */
function esc(s=''){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function asUTCDate(x){
  if (!x) return new Date(NaN);
  if (x instanceof Date) return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 12, 0, 0));
  const s = String(x).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00Z'); // noon UTC
  const d = new Date(s);
  return isNaN(d) ? new Date(NaN) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}
function toNoonUTC(input){
  if (!input) return input;
  if (input instanceof Date && !isNaN(input)) return asUTCDate(input);
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00Z');
  const d = new Date(s);
  return isNaN(d) ? input : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
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
function eventCreatedEmail(ev){
  const rows = [
    `<p style="margin:0 0 12px 0">The following event is now open for sign-up:</p>`,
    `<p style="margin:0 0 6px 0"><strong>Event:</strong> ${esc(fmt.dateShortTitle(ev.date))}</p>`,
    `<p style="margin:0 0 6px 0"><strong>Course:</strong> ${esc(ev.course||'')}</p>`,
    `<p style="margin:0 0 6px 0"><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>`
  ];
  if (!ev.isTeamEvent) {
    const first = ev.teeTimes && ev.teeTimes.length ? ev.teeTimes[0].time : '';
    if (first) rows.push(`<p style="margin:0 0 6px 0"><strong>First Tee Time:</strong> ${esc(fmt.tee(first))}</p>`);
  }
  rows.push(`<p style="margin:12px 0">Please visit the sign-up page to secure your spot!</p>`);
  rows.push(btn('Go to Sign-up Page'));
  return frame('A New Golf Event Has Been Scheduled!', rows.join('\n'));
}
function eventDeletedEmail(ev){
  const body = `<p style="margin:0 0 6px 0"><strong>Event:</strong> ${esc(fmt.dateShortTitle(ev.date))} — ${esc(ev.course||'')}</p><p style="margin:0 0 6px 0">This event has been canceled or removed.</p>`;
  return frame('An Event Has Been Removed', body);
}
function teeAddedEmail(ev, time){
  const body = `<p style="margin:0 0 6px 0"><strong>Event:</strong> ${esc(fmt.dateShortTitle(ev.date))} — ${esc(ev.course||'')}</p><p style="margin:0 0 6px 0"><strong>Tee Time:</strong> ${esc(fmt.tee(time))}</p>${btn('Go to Sign-up Page')}`;
  return frame('A New Tee Time Was Added', body);
}
function teamAddedEmail(ev, name){
  const body = `<p style="margin:0 0 6px 0"><strong>Event:</strong> ${esc(fmt.dateShortTitle(ev.date))} — ${esc(ev.course||'')}</p><p style="margin:0 0 6px 0">Another team slot ${name?`(${esc(name)}) `:''}is now available.</p>${btn('Go to Sign-up Page')}`;
  return frame('A New Team Was Added', body);
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

/* ---- API ---- */
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
      date: toNoonUTC(date),
      notes,
      isTeamEvent: !!isTeamEvent,
      teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
      teeTimes: tt
    });
    res.status(201).json(created);
    await sendEmailToAll(`New Event: ${created.course} (${fmt.dateISO(created.date)})`, eventCreatedEmail(created));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Edit event
app.put('/api/events/:id', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const { course, date, notes, isTeamEvent, teamSizeMax } = req.body || {};
    if (course !== undefined) ev.course = String(course);
    if (date !== undefined) ev.date = toNoonUTC(date);
    if (notes !== undefined) ev.notes = String(notes);
    if (isTeamEvent !== undefined) ev.isTeamEvent = !!isTeamEvent;
    if (teamSizeMax !== undefined) ev.teamSizeMax = Math.max(2, Math.min(4, Number(teamSizeMax || 4)));
    await ev.save();
    res.json(ev);
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
  await sendEmailToAll(`Event Deleted: ${del.course} (${fmt.dateISO(del.date)})`, eventDeletedEmail(del));
});

app.post('/api/events/:id/tee-times', async (req, res) => {
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.isTeamEvent) {
    const name = (req.body && req.body.name ? String(req.body.name).trim() : '') || undefined;
    ev.teeTimes.push(name ? { name, players: [] } : { players: [] });
    await ev.save(); res.json(ev);
    return void sendEmailToAll(`Team Added: ${ev.course} (${fmt.dateISO(ev.date)})`, teamAddedEmail(ev, name));
  }
  const { time } = req.body || {};
  if (!time) return res.status(400).json({ error: 'time required HH:MM' });
  if (ev.teeTimes.some(t => t.time === time)) return res.status(409).json({ error: 'duplicate time' });
  ev.teeTimes.push({ time, players: [] });
  await ev.save(); res.json(ev);
  return void sendEmailToAll(`Tee Time Added: ${ev.course} (${fmt.dateISO(ev.date)})`, teeAddedEmail(ev, time));
});

app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    const isTeam = ev.isTeamEvent;
    const name = tt.name;
    const time = tt.time;
    tt.deleteOne(); await ev.save(); res.json(ev);
    const subj = isTeam ? `Team removed: ${ev.course} (${fmt.dateISO(ev.date)})`
                        : `Tee time removed: ${ev.course} ${fmt.tee(time)} (${fmt.dateISO(ev.date)})`;
    const html = isTeam
      ? teamAddedEmail(ev, name||'').replace('A New Team Was Added','A Team Was Removed').replace('Another team slot','A team')
      : teeAddedEmail(ev, time).replace('A New Tee Time Was Added','A Tee Time Was Removed').replace('was added','was removed');
    return void sendEmailToAll(subj, html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Players
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

/* ---- subscribers ---- */
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    if (!Subscriber) return res.status(500).json({ error: 'subscriber model missing' });
    const s = await Subscriber.findOneAndUpdate({ email: email.toLowerCase() }, { $setOnInsert: { email: email.toLowerCase() } }, { upsert: true, new: true });
    res.json({ ok:true, id: s._id.toString(), email: s.email });
    await sendEmail(s.email, 'Subscribed to Tee Times', frame('Subscription Confirmed', `<p>You will receive updates for new events and changes.</p>${btn('Go to Sign-up Page')}`)).catch(()=>{});
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));

module.exports = app;
