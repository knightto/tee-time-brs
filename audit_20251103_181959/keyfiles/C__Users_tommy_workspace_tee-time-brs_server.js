/* server.js v3.5 (email-ready) */
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

// No-cache for HTML
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- DB ---
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) { console.error('Missing MONGO_URI'); process.exit(1); }
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log('Mongo connected'))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

const Event = require('./models/Event');

// --- Email (Resend) helper ---
let resendClient = null;
const canEmail = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
if (canEmail) {
  const { Resend } = require('resend');
  resendClient = new Resend(process.env.RESEND_API_KEY);
}
async function sendEmail({ to, subject, html, cc, bcc, audienceId }) {
  if (!canEmail) return { skipped: true, reason: 'Email disabled' };
  try {
    // Either specify `to` or `audienceId` (not both)
    const payload = {
      from: process.env.RESEND_FROM,
      subject,
      html
    };
    if (audienceId) payload.audienceId = audienceId;
    else payload.to = Array.isArray(to) ? to : [to];

    if (cc) payload.cc = cc;
    if (bcc) payload.bcc = bcc;

    return await resendClient.emails.send(payload);
  } catch (e) {
    console.error('Resend send error:', e);
    return { error: e.message || String(e) };
  }
}

// --- Helpers ---
function genTeeTimes(startHHMM, count = 3, mins = 10) {
  if (!startHHMM) return [];
  const m = /^(\d{1,2}):(\d{2})$/.exec(startHHMM);
  if (!m) return [{ time: startHHMM, players: [] }];
  let h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  const out = [];
  for (let i = 0; i < count; i++) {
    const tMin = h * 60 + mm + i * mins;
    const H = Math.floor(tMin / 60) % 24;
    const M = tMin % 60;
    out.push({ time: String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0'), players: [] });
  }
  return out;
}

// --- Routes ---
app.get('/api/events', async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

app.post('/api/events', async (req, res) => {
  try {
    const { title, course, date, teeTime, teeTimes, notes } = req.body || {};
    const tt = Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 10);
    const created = await Event.create({ title, course, date, notes, teeTimes: tt });

    // Email: notify admin on new event
    if (canEmail && process.env.RESEND_ADMIN_TO) {
      const subj = `New Tee-Time Event: ${title || course || 'Untitled'}`;
      const html = `
        <div style="font-family:Arial,sans-serif">
          <h2>New Event Created</h2>
          <p><b>Title:</b> ${title || '-'}</p>
          <p><b>Course:</b> ${course || '-'}</p>
          <p><b>Date:</b> ${date || '-'}</p>
          <p><b>Notes:</b> ${notes || '-'}</p>
          <p><b>Tee Times:</b> ${tt.map(t => t.time).join(', ')}</p>
        </div>`;
      await sendEmail({ to: process.env.RESEND_ADMIN_TO, subject: subj, html });
    }

    // Optional audience blast (if you want to ping your list)
    if (canEmail && process.env.RESEND_AUDIENCE_ID && process.env.RESEND_NOTIFY_AUDIENCE === '1') {
      const subj = `New Golf Event: ${title || course || 'Join Us'}`;
      const html = `
        <div style="font-family:Arial,sans-serif">
          <h2>${title || 'New Golf Event'}</h2>
          <p><b>Course:</b> ${course || '-'}</p>
          <p><b>Date:</b> ${date || '-'}</p>
          <p>We just posted a new outing. Slots are limited — grab a tee time!</p>
        </div>`;
      await sendEmail({ subject: subj, html, audienceId: process.env.RESEND_AUDIENCE_ID });
    }

    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: {
        course: payload.course,
        date: payload.date,
        notes: payload.notes
      }},
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
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
});

// Add tee time
app.post('/api/events/:id/tee-times', async (req, res) => {
  const { time } = req.body || {};
  if (!time) return res.status(400).json({ error: 'time required HH:MM' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.teeTimes.some(t => t.time === time)) return res.status(409).json({ error: 'duplicate time' });
  ev.teeTimes.push({ time, players: [] });
  await ev.save();
  res.json(ev);
});

// Add player to tee time
app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const tt = ev.teeTimes.id(req.params.teeId);
  if (!tt) return res.status(404).json({ error: 'tee time not found' });
  if (tt.players.length >= 4) return res.status(400).json({ error: 'tee time full' });
  tt.players.push({ name });
  await ev.save();
  res.json(ev);
});

// Move player
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
  if (toTT.players.length >= 4) return res.status(400).json({ error: 'destination full' });
  const [player] = fromTT.players.splice(idx, 1);
  toTT.players.push({ name: player.name });
  await ev.save();
  res.json(ev);
});

// Meta
const pkg = require('./package.json');
app.get('/__meta', (_req, res) => res.json({
  version: pkg.version,
  commit: process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || null,
  when: new Date().toISOString()
}));

// Subscribe
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!canEmail) return res.status(501).json({ error: 'Email disabled' });

  try {
    // Create contact (optional audience)
    let createdContact = null;
    try {
      createdContact = await resendClient.contacts.create({
        email,
        audienceId: process.env.RESEND_AUDIENCE_ID || undefined
      });
    } catch (e) {
      // If contact exists already, continue to send welcome anyway
      console.warn('contacts.create warning:', e?.message || e);
    }

    // Send welcome email to the subscriber
    await sendEmail({
      to: email,
      subject: 'Welcome — You’re on the Tee-Time list!',
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Welcome!</h2>
          <p>You’re subscribed for tee-time updates and new event announcements.</p>
          <p>We’ll keep it reasonable—no spam.</p>
          <p>– Golf Bros</p>
        </div>`
    });

    res.json({ ok: true, contact: createdContact || null });
  } catch (e) {
    console.error('subscribe error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`server on :${PORT}`));
