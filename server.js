/* server.js v3.6 add tee/team delete */
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
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) { console.error('Missing MONGO_URI'); process.exit(1); }
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log('Mongo connected'))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

const Event = require('./models/Event');

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

// list
app.get('/api/events', async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

// create
app.post('/api/events', async (req, res) => {
  try {
    const { title, course, date, teeTime, teeTimes, notes, isTeamEvent, teamSizeMax } = req.body || {};
    let tt = [];
    if (isTeamEvent) {
      tt = []; // client will add teams
    } else {
      tt = Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 10);
    }
    const created = await Event.create({
      title, course, date, notes,
      isTeamEvent: !!isTeamEvent,
      teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
      teeTimes: tt
    });
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// update
app.put('/api/events/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });

    ev.course = payload.course ?? ev.course;
    ev.date   = payload.date   ?? ev.date;
    ev.notes  = payload.notes  ?? ev.notes;
    if (ev.isTeamEvent && payload.teamSizeMax) {
      ev.teamSizeMax = Math.max(2, Math.min(4, Number(payload.teamSizeMax)));
    }
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// delete event
app.delete('/api/events/:id', async (req, res) => {
  const code = req.query.code || req.body?.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  const del = await Event.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// add tee-time or team
app.post('/api/events/:id/tee-times', async (req, res) => {
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });

  if (ev.isTeamEvent) {
    ev.teeTimes.push({ time: '00:00', players: [] });
    await ev.save();
    return res.json(ev);
  }

  const { time } = req.body || {};
  if (!time) return res.status(400).json({ error: 'time required HH:MM' });
  if (ev.teeTimes.some(t => t.time === time)) return res.status(409).json({ error: 'duplicate time' });
  ev.teeTimes.push({ time, players: [] });
  await ev.save();
  res.json(ev);
});

// NEW: delete tee-time or team
app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    tt.deleteOne();
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// add player
app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const tt = ev.teeTimes.id(req.params.teeId);
  if (!tt) return res.status(404).json({ error: 'tee time not found' });
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (tt.players.length >= maxSize) return res.status(400).json({ error: ev.isTeamEvent ? 'team full' : 'tee time full' });
  tt.players.push({ name });
  await ev.save();
  res.json(ev);
});

// move player
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
  toTT.players.push({ name: player.name });
  await ev.save();
  res.json(ev);
});

// subscribe
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!process.env.RESEND_API_KEY) return res.status(501).json({ error: 'Email disabled' });
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.contacts.create({
      email,
      audienceId: process.env.RESEND_AUDIENCE_ID || undefined
    });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// delete player
app.delete('/api/events/:id/tee-times/:teeId/players/:playerId', async (req, res) => {
  try {
    const { id, teeId, playerId } = req.params;
    const ev = await Event.findById(id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(teeId);
    if (!tt) return res.status(404).json({ error: 'tee time not found' });
    const idx = tt.players.findIndex(p => String(p._id) === String(playerId));
    if (idx === -1) return res.status(404).json({ error: 'player not found' });
    tt.players.splice(idx, 1);
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`server on :${PORT}`));
