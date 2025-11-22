/* server.js v3.9 (Fixed for Port Binding, app initialization, and Resend Webhook API) */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL SECURITY NOTE: This code is only used as a temporary solution. 
// For production, this must be replaced with proper user authentication (JWTs/Sessions).
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || ''; 

// --- Email (Resend) client setup ---
let resendClient = null;
const canEmail = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
if (canEmail) {
  const { Resend } = require('resend');
  resendClient = new Resend(process.env.RESEND_API_KEY);
}
// NOTE: Assuming you have these models/utils for the webhook logic if needed later
// const TeeTime = require('./models/TeeTime'); 
// const { parseTeeTimeEmail } = require('./utils/parseTeeTimeEmail');
// ------------------------------------


// --- Middleware ---
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

// Serve static files and root HTML
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));


// --- Email (Resend) helper functions ---
async function sendEmail({ to, subject, html, cc, bcc, audienceId }) {
  if (!canEmail) return { skipped: true, reason: 'Email disabled' };
  try {
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

// --- API Routes ---
const Event = require('./models/Event');

app.get('/api/events', async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

app.post('/api/events', async (req, res) => {
  try {
    const { title, course, date, teeTime, notes } = req.body || {};
    const tt = genTeeTimes(teeTime, 3, 10);
    const created = await Event.create({ title, course, date, notes, teeTimes: tt });

    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const code = req.body?.code || ''; 
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  const del = await Event.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});


app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const tt = ev.teeTimes.id(req.params.teeId);
  if (!tt) return res.status(404).json({ error: 'tee time not found' });
  
  tt.players.push({ name });
  
  try {
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(400).json({ error: e.message });
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
  
  const idx = fromTT.players.findIndex(p => String(p._id) === String(playerId));
  if (idx === -1) return res.status(404).json({ error: 'player not found' });
  const [player] = fromTT.players.splice(idx, 1);
  
  toTT.players.push(player); 
  
  try {
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const pkg = require('./package.json');
app.get('/__meta', (_req, res) => res.json({
  version: pkg.version,
  commit: process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || null,
  when: new Date().toISOString()
}));

app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!canEmail) return res.status(501).json({ error: 'Email disabled' });

  try {
    let createdContact = null;
    try {
      createdContact = await resendClient.contacts.create({
        email,
        audienceId: process.env.RESEND_AUDIENCE_ID || undefined
      });
    } catch (e) {
      console.warn('contacts.create warning:', e?.message || e);
    }

    await sendEmail({
      to: email,
      subject: 'Welcome — You’re on the Tee-Time list!',
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Welcome!</h2>
          <p>You’re subscribed for tee-time updates and new event announcements.</p>
          <p>– Golf Bros</p>
        </div>`
    });

    res.json({ ok: true, contact: createdContact || null });
  } catch (e) {
    console.error('subscribe error:', e);
    res.status(500).json({ error: e.message });
  }
});


// --- Resend Webhook (CORRECTLY PLACED AND FIXED FOR RESEND API) ---
if (canEmail) {
  // const ALLOWED_TO = ['teetime@xenailexou.resend.app']; // Used for manual checks

  app.post('/webhooks/resend', async (req, res) => {
    try {
      if (!resendClient) {
        console.error('[webhook] Resend client not configured');
        return res.status(500).send('Resend not configured');
      }

      const event = req.body;
      console.log('[webhook] Event type:', event.type);
      if (!event || event.type !== 'email.received') {
        return res.status(200).send('Ignored: not an email.received event');
      }
      
      const emailId = event.data && event.data.email_id;
      if (!emailId) {
        console.warn('[webhook] No email_id in event data');
        return res.status(200).send('No email_id');
      }

      // ⚡️ THE FIX: Use resendClient.inbound.get()
      const { data: email } = await resendClient.inbound.get(emailId); 

      console.log('[webhook] Email meta:', {
        from: email.from,
        to: email.to,
        subject: email.subject
      });

      const textPreview = (email.text || '').slice(0, 400);
      console.log('[webhook] Email text preview:', textPreview);

      // TODO: Add your full webhook processing logic here (e.g., parsing the email and updating DB)

      return res.status(200).json({ ok: true });
    } catch (err) {
      // Log the full error to help debug your webhook logic
      console.error('[webhook] Internal error handling webhook:', err); 
      return res.status(500).send('Error fetching email');
    }
  });
}
// --------------------------------------------------------------------


// --- DB & Server Start ---
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) { console.error('Missing MONGO_URI'); process.exit(1); }

// *** FIX for "No open ports detected": Start app.listen only after DB connection ***
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => {
    console.log('Mongo connected');
    
    // START SERVER ONLY AFTER MONGO IS READY
    app.listen(PORT, () => console.log(`server on :${PORT}`));
    
  })
  .catch((e) => { 
    console.error('Mongo connection error', e); 
    process.exit(1); 
  });