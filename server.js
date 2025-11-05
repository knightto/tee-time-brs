/* server.js v3.17.0 — Unsubscribe links for bulk emails + robust time parsing + resilient team/tee delete */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = (process.env.SITE_URL || 'https://tee-time-brs.onrender.com/').replace(/\/+$/, '/') ;
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
const UNSUB_SECRET = process.env.UNSUB_SECRET || 'change-me';

/* ------------ file logger to ./logs ------------ */
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
function _logFilePath() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return path.join(LOG_DIR, `server-${y}-${m}-${day}.log`);
}
let _stream = fs.createWriteStream(_logFilePath(), { flags: 'a' });
setInterval(() => { const p = _logFilePath(); if (_stream.path !== p) { try { _stream.end(); } catch {} _stream = fs.createWriteStream(p, { flags: 'a' }); } }, 60 * 1000);
function log(level, obj) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, ...obj }) + '\n';
  try { _stream.write(line); } catch {}
  if (level === 'error') { console.error(line.trim()); } else { console.log(line.trim()); }
}
const _origLog = console.log, _origErr = console.error;
console.log = (...args) => { try { _stream.write(args.join(' ') + '\n'); } catch {} _origLog(...args); };
console.error = (...args) => { try { _stream.write(args.join(' ') + '\n'); } catch {} _origErr(...args); };

/* ------------ middleware ------------ */
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// req/resp log
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log('info', { http: `${req.method} ${req.originalUrl}`, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

/* ------------ db models ------------ */
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => log('info', { msg: 'Mongo connected', uri: mongoUri }))
  .catch((e) => { log('error', { msg: 'Mongo connection error', err: e.message, stack: e.stack }); process.exit(1); });

let Event; try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
let Subscriber; try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = require('./Subscriber'); }

// Lightweight "unsubscribed" collection so we do not modify Subscriber schema
const Unsub = mongoose.model('Unsub', new mongoose.Schema({
  email: { type: String, index: true, unique: true },
  at: { type: Date, default: Date.now }
}, { versionKey: false }));

/* ------------ email helpers (Resend) ------------ */
let resend = null;
async function ensureResend(){ if(resend || !process.env.RESEND_API_KEY) return resend; const { Resend } = require('resend'); resend = new Resend(process.env.RESEND_API_KEY); return resend; }
async function sendEmail(to, subject, html){
  const api = await ensureResend();
  if (!api || !process.env.RESEND_FROM) { log('warn', { msg: 'Email disabled', reason: 'missing API key or RESEND_FROM' }); return { ok:false, disabled:true }; }
  try { const out = await api.emails.send({ from: process.env.RESEND_FROM, to, subject, html }); log('info', { msg: 'Email queued', to, subject }); return out; }
  catch (e) { log('error', { msg: 'Email send failed', to, subject, err: e.message }); return { ok:false, error:e.message }; }
}


// extra diagnostics for dev from address
function warnIfOnboardingFrom(){
  const from = process.env.RESEND_FROM || '';
  if (/onboarding@resend\.dev/i.test(from)) {
    log('warn', { msg: 'Resend dev FROM in use', from, note: 'onboarding@resend.dev only works reliably to limited recipients; verify your own domain for production delivery' });
  }
}
warnIfOnboardingFrom();
// HMAC token so we do not have to store per-subscriber tokens
function unsubToken(email){
  const e = String(email||'').toLowerCase().trim();
  return crypto.createHmac('sha256', UNSUB_SECRET).update(e).digest('hex').slice(0, 32);
}
function unsubLink(email){
  const e = encodeURIComponent(String(email).toLowerCase().trim());
  const t = unsubToken(email);
  return `${SITE_URL}unsubscribe?e=${e}&t=${t}`;
}
function injectUnsub(html, email){
  const link = unsubLink(email);
  const foot = `<p style="margin-top:24px;color:#6b7280;font-size:12px">Don’t want these updates? <a href="${link}">Unsubscribe</a>.</p>`;
  // html is a full table frame already; append before closing outer table
  return String(html).replace(/<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*$/i, `${foot}$&`)
         || (html + foot);
}

async function sendEmailToAll(subject, rawHtml){
  const subs = await Subscriber.find({}).lean();
  if (!subs.length) return { ok:true, sent:0 };
  const emails = subs.map(s => String(s.email||'').toLowerCase().trim()).filter(Boolean);
  const unsubs = await Unsub.find({ email: { $in: emails } }).lean();
  const block = new Set(unsubs.map(u => u.email));
  let sent = 0;
  for (const s of subs){
    const e = String(s.email||'').toLowerCase().trim();
    if (!e || block.has(e)) continue;
    try { await sendEmail(e, subject, injectUnsub(rawHtml, e)); sent++; } catch {}
  }
  return { ok:true, sent };
}

/* ------------ format + helpers ------------ */
function esc(s=''){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function asUTCDate(x){ if(!x) return new Date(NaN); if(x instanceof Date) return new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth(),x.getUTCDate(),12,0,0)); const s=String(x).trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s+'T12:00:00Z'); const d=new Date(s); return isNaN(d)?new Date(NaN):new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),12,0,0)); }
const fmt = {
  dateISO(x){ const d=asUTCDate(x); return isNaN(d)?'':d.toISOString().slice(0,10); },
  dateLong(x){ const d=asUTCDate(x); return isNaN(d)?'':d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}); },
  dateShortTitle(x){ const d=asUTCDate(x); return isNaN(d)?'':d.toLocaleDateString(undefined,{weekday:'short',month:'numeric',day:'numeric',timeZone:'UTC'}); },
  tee(t){ if(!t) return ''; const m=/^(\d{1,2}):(\d{2})$/.exec(t); if(!m) return t; const H=+m[1], M=m[2]; const h=(H%12)||12, ap=H>=12?'PM':'AM'; return `${h}:${M} ${ap}`; }
};
function btn(label='Go to Sign-up Page'){ return `<p style="margin:24px 0"><a href="${esc(SITE_URL)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`; }
function frame(title, body){ return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:10px;padding:24px;border:1px solid #e5e7eb"><tr><td><h2 style="margin:0 0 12px 0;color:#111827;font-size:20px">${esc(title)}</h2>${body}<p style="color:#6b7280;font-size:12px;margin-top:24px">You subscribed to tee time updates.</p></td></tr></table></td></tr></table>`; }
function nextTeeAfter(ev, mins=8){
  const list=(ev.teeTimes||[]).filter(t=>t.time);
  if(!list.length) return null;
  const last=list[list.length-1].time; const m=/^(\d{1,2}):(\d{2})$/.exec(last); if(!m) return null;
  const base=(+m[1])*60+(+m[2])+mins; const H=Math.floor(base/60)%24, M=base%60;
  return `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`;
}
function parsePlayerIndexFromId(playerId, players){
  if (typeof playerId !== 'string') return -1;
  let m = /^idx-(\d+)$/.exec(playerId);
  if (!m && /^\d+$/.test(playerId)) m = [playerId, playerId];
  if (!m) return -1;
  const idx = Number(m[1]);
  return (idx>=0 && idx<players.length) ? idx : -1;
}
/* Robust time parser -> returns canonical 'HH:MM' or null */
function toHHMM(input){
  if (!input) return null;
  let s = String(input).trim().toUpperCase();
  // 'H:MM' or 'HH:MM' with optional AM/PM
  let m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/.exec(s);
  if (!m) m = /^(\d{1,2})\.(\d{2})\s*(AM|PM)?$/.exec(s); // allow '8.27' style
  if (m){
    let h = +m[1]; const min = +m[2]; const ap = m[3];
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (h>=0 && h<24 && min>=0 && min<60) return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  // 'HMM' like 827 -> 08:27
  m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (m){
    let h = +m[1], min = +m[2];
    if (h>=0 && h<24 && min>=0 && min<60) return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  return null;
}
function sortTeesInPlace(ev){ if(!Array.isArray(ev.teeTimes)) return; ev.teeTimes.sort((a,b)=>{ const ta=a.time||'99:99', tb=b.time||'99:99'; return ta.localeCompare(tb); }); }
function findTeeByIdOrIndex(ev, teeId){
  if (!ev || !Array.isArray(ev.teeTimes)) return { tt:null, idx:-1 };
  let tt = null;
  try { tt = ev.teeTimes.id(teeId); } catch {}
  if (tt) return { tt, idx: ev.teeTimes.findIndex(x => String(x._id) === String(teeId)) };
  // try numeric index fallback
  if (/^\d+$/.test(String(teeId))) {
    const idx = Number(teeId);
    if (idx >= 0 && idx < ev.teeTimes.length) return { tt: ev.teeTimes[idx], idx };
  }
  return { tt:null, idx:-1 };
}

/* ------------ unsubscribe endpoints ------------ */
app.get('/unsubscribe', async (req, res) => {
  try {
    const email = String(req.query.e || '').toLowerCase().trim();
    const token = String(req.query.t || '');
    if (!email || !token) return res.status(400).send('<p>Missing parameters.</p>');
    const expect = unsubToken(email);
    if (token !== expect) return res.status(403).send('<p>Invalid token.</p>');
    await Unsub.updateOne({ email }, { $set: { email, at: new Date() } }, { upsert: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:680px;margin:40px auto;padding:0 16px"><h2>Unsubscribed</h2><p>${email} will no longer receive tee time notifications.</p><p><a href="${SITE_URL}">Return to site</a></p></body></html>`);
  } catch (e) {
    log('error', { msg:'unsubscribe failed', err: e.message });
    res.status(500).send('<p>Unsubscribe failed. Please try again later.</p>');
  }
});

/* ------------ routes ------------ */
app.get('/api/events', async (_req, res) => { const items = await Event.find().sort({ date: 1 }).lean(); res.json(items); });

app.post('/api/events', async (req, res) => {
  try {
    const { course, date, teeTime, notes, isTeamEvent, teamSizeMax } = req.body || {};
    let tt = [];
    if (isTeamEvent) {
      tt = [{ name:'Team 1', players:[] }, { name:'Team 2', players:[] }];
    } else {
      const startHHMM = toHHMM(teeTime) || '08:00';
      const m = /^(\d{1,2}):(\d{2})$/.exec(startHHMM);
      const baseMin = (+m[1])*60+(+m[2]);
      tt = [0,1,2].map(i=>{
        const t=baseMin+i*8; const H=String(Math.floor(t/60)%24).padStart(2,'0'), M=String(t%60).padStart(2,'0');
        return { time:`${H}:${M}`, players:[] };
      });
    }
    const created = await Event.create({
      course,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(date||'')) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date),
      notes,
      isTeamEvent: !!isTeamEvent,
      teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
      teeTimes: tt
    });
    res.status(201).json(created);

    const headline = 'A New Golf Event Has Been Scheduled!';
    const body = [
      `<p>The following event is now open for sign-up:</p>`,
      `<p><strong>Event:</strong> ${esc(fmt.dateShortTitle(created.date))}</p>`,
      `<p><strong>Course:</strong> ${esc(created.course||'')}</p>`,
      `<p><strong>Date:</strong> ${esc(fmt.dateLong(created.date))}</p>`,
      !created.isTeamEvent && created.teeTimes?.[0]?.time ? `<p><strong>First Tee Time:</strong> ${esc(fmt.tee(created.teeTimes[0].time))}</p>` : '',
      `<p>Please visit the sign-up page to secure your spot.</p>`,
      btn('Go to Sign-up Page')
    ].join('');
    await sendEmailToAll(`New Event: ${created.course} (${fmt.dateISO(created.date)})`, frame(headline, body));
  } catch (e) { log('error', { msg:'create event failed', err:e.message }); res.status(400).json({ error: e.message }); }
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
    await ev.save(); res.json(ev);
  } catch (e) { log('error', { msg:'update event failed', id:req.params.id, err:e.message }); res.status(400).json({ error: e.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  const code = req.query.code || req.body?.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  const del = await Event.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
  // notify subscribers about cancellation
  try {
    const headline = 'Event Cancelled';
    const body = [
      `<p>The following event was cancelled:</p>`,
      `<p><strong>Event:</strong> ${esc(fmt.dateShortTitle(del.date))}</p>`,
      `<p><strong>Course:</strong> ${esc(del.course||'')}</p>`,
      `<p><strong>Date:</strong> ${esc(fmt.dateLong(del.date))}</p>`,
      btn('See Current Events')
    ].join('');
    await sendEmailToAll(`Cancelled: ${del.course} (${fmt.dateISO(del.date)})`, frame(headline, body));
  } catch (e) { log('error', { msg:'cancel email failed', id:req.params.id, err:e.message }); }
});

app.post('/api/events/:id/tee-times', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });

    if (ev.isTeamEvent) {
      const nextIndex = (ev.teeTimes?.length || 0) + 1;
      ev.teeTimes.push({ name: `Team ${nextIndex}`, players: [] });
      await ev.save(); return res.json(ev);
    }

    const existing = (ev.teeTimes || []).filter(t => t.time);
    let time = req.body?.time ? toHHMM(req.body.time) : null;
    if (!time) {
      if (existing.length === 0) time = '08:00';
      else time = nextTeeAfter(ev, 8) || '08:00';
    }
    if (ev.teeTimes.some(t => t.time === time)) return res.status(409).json({ error: 'duplicate time' });
    ev.teeTimes.push({ time, players: [] });
    ev.teeTimes.sort((a,b)=>a.time.localeCompare(b.time));
    await ev.save(); res.json(ev);
  } catch (e) { log('error', { msg:'add tee/team failed', id:req.params.id, err:e.message }); res.status(500).json({ error: e.message }); }
});

// edit tee time
app.put('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const time = toHHMM(req.body?.time);
    if (!time) return res.status(400).json({ error: 'time HH:MM or H:MM AM/PM required' });
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    if (ev.isTeamEvent) return res.status(400).json({ error: 'not a tee-time event' });
    const { tt } = findTeeByIdOrIndex(ev, req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee time not found' });
    if (ev.teeTimes.some(t => String(t._id) !== String(tt._id) && t.time === time)) return res.status(409).json({ error: 'duplicate time' });
    tt.time = time;
    ev.teeTimes.sort((a,b)=>a.time.localeCompare(b.time));
    await ev.save(); res.json(ev);
  } catch (e) { log('error', { msg:'update tee time failed', id:req.params.id, teeId:req.params.teeId, err:e.message }); res.status(500).json({ error: e.message }); }
});

app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const { tt, idx } = findTeeByIdOrIndex(ev, req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    if (typeof tt.deleteOne === 'function') { tt.deleteOne(); }
    else if (idx >= 0) { ev.teeTimes.splice(idx, 1); }
    await ev.save(); res.json(ev);
  } catch (e) { log('error', { msg:'delete tee/team failed', id:req.params.id, teeId:req.params.teeId, err:e.message }); res.status(500).json({ error: e.message }); }
});

app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const { tt } = findTeeByIdOrIndex(ev, req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee time not found' });
    if (!Array.isArray(tt.players)) tt.players = [];
    const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
    if (tt.players.length >= maxSize) return res.status(400).json({ error: ev.isTeamEvent ? 'team full' : 'tee time full' });
    tt.players.push({ name });
    await ev.save(); res.json(ev);
  } catch (e) { log('error', { msg:'add player failed', id:req.params.id, teeId:req.params.teeId, err:e.message }); res.status(500).json({ error: e.message }); }
});

app.delete('/api/events/:id/tee-times/:teeId/players/:playerId', async (req, res) => {
  try {
    const { id, teeId, playerId } = req.params;
    const ev = await Event.findById(id);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    const { tt } = findTeeByIdOrIndex(ev, teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    if (!Array.isArray(tt.players)) tt.players = [];
    let idx = tt.players.findIndex(p => String(p?._id||'') === String(playerId));
    if (idx === -1) idx = parsePlayerIndexFromId(playerId, tt.players);
    if (idx === -1) return res.status(404).json({ error: 'player not found' });
    tt.players.splice(idx, 1);
    await ev.save();
    return res.json(ev);
  } catch (e) { log('error', { msg:'remove player failed', id:req.params.id, teeId:req.params.teeId, playerId:req.params.playerId, err:e.message }); return res.status(500).json({ error: e.message }); }
});

app.post('/api/events/:id/move-player', async (req, res) => {
  const { fromTeeId, toTeeId, playerId } = req.body || {};
  if (!fromTeeId || !toTeeId || !playerId) return res.status(400).json({ error: 'fromTeeId, toTeeId, playerId required' });
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const from = findTeeByIdOrIndex(ev, fromTeeId);
    const to = findTeeByIdOrIndex(ev, toTeeId);
    const fromTT = from.tt, toTT = to.tt;
    if (!fromTT || !toTT) return res.status(404).json({ error: 'tee time not found' });
    if (!Array.isArray(fromTT.players)) fromTT.players = [];
    if (!Array.isArray(toTT.players)) toTT.players = [];
    let idx = fromTT.players.findIndex(p => String(p?._id||'') === String(playerId));
    if (idx === -1) idx = parsePlayerIndexFromId(playerId, fromTT.players);
    if (idx === -1) return res.status(404).json({ error: 'player not found' });
    const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
    if (toTT.players.length >= maxSize) return res.status(400).json({ error: 'destination full' });
    const [player] = fromTT.players.splice(idx, 1);
    toTT.players.push({ name: player.name });
    await ev.save(); res.json(ev);
  } catch (e) { log('error', { msg:'move player failed', id:req.params.id, err:e.message }); res.status(500).json({ error: e.message }); }
});

app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const s = await Subscriber.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $setOnInsert: { email: email.toLowerCase() } },
      { upsert: true, new: true }
    );
    res.json({ ok:true, id: s._id.toString(), email: s.email });
    // confirmation includes unsubscribe link too
    const html = frame('Subscription Confirmed', `<p>You will receive updates for new events and changes.</p>${btn('Go to Sign-up Page')}`);
    await sendEmail(s.email, 'Subscription Confirmed', injectUnsub(html, s.email)).catch(()=>{});
  } catch (e) { log('error', { msg:'subscribe failed', email, err:e.message }); res.status(500).json({ error:e.message }); }
});

app.use((err, req, res, next) => { log('error', { msg: 'Unhandled error', http: `${req.method} ${req.originalUrl}`, err: String(err?.message || err), stack: err?.stack }); res.status(500).json({ error: 'Internal error' }); });
process.on('unhandledRejection', (e) => log('error', { msg: 'unhandledRejection', err: String(e), stack: e?.stack }));
process.on('uncaughtException',  (e) => log('error', { msg: 'uncaughtException',  err: String(e), stack: e?.stack }));

app.listen(PORT, () => log('info', { msg:'listening', port: PORT }));
module.exports = app;
