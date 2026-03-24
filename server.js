// Alert for nearly full tee times (4 days out or less, >50% full)
async function alertNearlyFullTeeTimes() {
  const now = new Date();
  const fourDaysOut = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  // Find all tee-time events (not team events) within next 4 days (inclusive)
  const events = await Event.find({ isTeamEvent: false, date: { $gte: now, $lte: fourDaysOut } }).lean();
  let blocks = [];
  for (const ev of events) {
    if (!Array.isArray(ev.teeTimes) || !ev.teeTimes.length) continue;
    const max = 4; // max per tee time
    const fullTeeTimes = ev.teeTimes.filter(tt => Array.isArray(tt.players) && tt.players.length / max > 0.5);
    if (fullTeeTimes.length) {
      blocks.push({
        course: ev.course || 'Course',
        dateISO: fmt.dateISO(ev.date),
        dateLong: fmt.dateLong(ev.date),
        teeTimes: fullTeeTimes.map(tt => ({
          time: fmt.tee(tt.time),
          count: tt.players.length
        })),
        total: ev.teeTimes.length
      });
    }
  }
  if (!blocks.length) return { ok: true, sent: 0, message: 'No nearly full tee times' };
  // Compose email
  const rows = blocks.map(b => {
    const list = b.teeTimes.map(t => `<li><strong>${t.time}</strong> — ${t.count} of 4 spots filled</li>`).join('');
    return `<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
      <p style="margin:0 0 6px 0"><strong>${esc(b.course)}</strong> — ${esc(b.dateLong)} (${esc(b.dateISO)})</p>
      <p style="margin:0 0 6px 0">Tee times more than 50% full:</p>
      <ul style="margin:0 0 0 18px">${list}</ul>
      <p style="color:#b91c1c;"><strong>Consider calling the clubhouse to request an additional tee time if needed.</strong></p>
    </div>`;
  }).join('');
  const html = frame('Tee Times Nearly Full', `<p>The following tee times are more than 50% full (4 days out or less):</p>${rows}${btn('Go to Sign-up Page')}`);
  const res = await sendEmailToAll('Alert: Tee Times Nearly Full', html);
  return { ok: true, sent: res.sent, blocks };
}
/* server.js v3.13 — daily 5pm empty-tee reminder + manual trigger */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const { EJSON } = require('bson');
// Secondary connection for Myrtle Trip (kept in separate module to avoid circular requires)
const { initSecondaryConn, getSecondaryConn } = require('./secondary-conn');
initSecondaryConn();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { importHandicapsFromCsv } = require('./services/handicapImportService');
const { requestContext } = require('./middleware/requestContext');
const { cacheJson } = require('./middleware/responseCache');
const { validateBody, validateCreateEvent, validateAddPlayer } = require('./middleware/validate');
const { buildSystemRouter } = require('./routes/system');

// Polyfill fetch for Node < 18
const fetch = global.fetch || require('node-fetch');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
const PORT = process.env.PORT || 5000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_ADMIN_WRITE_CODE = process.env.SITE_ADMIN_WRITE_CODE || '2000';
const ADMIN_DESTRUCTIVE_CODE = process.env.ADMIN_DESTRUCTIVE_CODE || ADMIN_DELETE_CODE;
const ADMIN_DESTRUCTIVE_CONFIRM_CODE = process.env.ADMIN_DESTRUCTIVE_CONFIRM_CODE || '';
const SITE_URL = (process.env.SITE_URL || 'https://tee-time-brs.onrender.com/').replace(/\/$/, '') + '/';
const LOCAL_TZ = process.env.LOCAL_TZ || 'America/New_York';
const CALENDAR_EVENT_DURATION_MINUTES = Math.max(30, Number(process.env.CALENDAR_EVENT_DURATION_MINUTES || 270) || 270);
const BACKUP_ROOT = path.join(__dirname, 'backups');
const SITE_BACKUP_TARGETS = [
  'public',
  'routes',
  'services',
  'models',
  'middleware',
  'utils',
  'docs',
  'scripts',
  'server.js',
  'secondary-conn.js',
  'package.json',
  'package-lock.json',
  'README.md',
  '.env.example',
];
const processedEmailIds = new Map(); // simple idempotency guard for inbound emails
let backupJobPromise = null;
let restoreJobPromise = null;

function parseIcsReminderMinutes(input = '') {
  const parsed = String(input || '')
    .split(',')
    .map((value) => Number(String(value).trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 60 * 24 * 30);
  const unique = Array.from(new Set(parsed));
  unique.sort((a, b) => b - a);
  return unique;
}

const REQUIRED_ICS_REMINDER_MINUTES = [4320, 1440]; // 3 days, 1 day
const ICS_REMINDER_MINUTES = Array.from(new Set([
  ...REQUIRED_ICS_REMINDER_MINUTES,
  ...parseIcsReminderMinutes(process.env.ICS_REMINDER_MINUTES || ''),
])).sort((a, b) => b - a);

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));
app.use(compression());
app.use(requestContext);

// Prevent intermediary/browser caches from serving stale API data on mobile resumes.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Define routes before static middleware to ensure they take precedence
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// --- Myrtle Beach Trip Tracker API ---
// Debug endpoint: Query all trips and participants from secondary DB
app.get('/api/debug/secondary-trips', async (req, res) => {
  try {
    const secondaryConn = getSecondaryConn();
    if (!secondaryConn) return res.status(500).json({ error: 'No secondary connection' });
    const Trip = secondaryConn.model('Trip', require('./models/Trip').schema);
    const TripParticipant = secondaryConn.model('TripParticipant', require('./models/TripParticipant').schema);
    const trips = await Trip.find().lean();
    const participants = await TripParticipant.find().lean();
    res.json({ trips, participants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.use('/api/trips', require('./routes/trips'));
app.use('/api/outings', cacheJson(15 * 1000), require('./routes/outings'));
app.use('/api/valley', require('./routes/valley'));
// Handicap tracking removed

// --- Handicap directory (manual list) ---
app.get('/api/handicaps', async (_req, res) => {
  try {
    if (!Handicap) return res.status(500).json({ error: 'Handicap model unavailable' });
    const list = await Handicap.find().sort({ name: 1 }).lean();
    const scrubbed = list.map((doc) => {
      const rest = { ...doc };
      delete rest.ownerCode;
      return rest;
    });
    res.json(scrubbed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/handicaps', async (req, res) => {
  try {
    if (!Handicap) return res.status(500).json({ error: 'Handicap model unavailable' });
    const isAdminUser = isSiteAdmin(req);
    const { name, ghinNumber, handicapIndex, notes, ownerCode, clubName } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!isAdminUser && !ownerCode) return res.status(400).json({ error: 'ownerCode required' });
    const payload = {
      name: String(name).trim(),
      clubName: clubName ? String(clubName).trim() : '',
      notes: notes ? String(notes).trim() : '',
      handicapIndex: handicapIndex === '' || handicapIndex === null || handicapIndex === undefined ? null : Number(handicapIndex)
    };
    const ghin = ghinNumber ? String(ghinNumber).trim() : '';
    if (ghin) payload.ghinNumber = ghin;
    if (isAdminUser) {
      payload.ownerCode = ownerCode ? String(ownerCode).trim() : payload.ownerCode;
    } else {
      payload.ownerCode = String(ownerCode || '').trim();
    }
    if (!payload.ownerCode) return res.status(400).json({ error: 'ownerCode required' });
    const created = await Handicap.create(payload);
    const rest = created.toObject();
    delete rest.ownerCode;
    res.status(201).json(rest);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'duplicate ghinNumber' });
    }
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/handicaps/:id', async (req, res) => {
  try {
    if (!Handicap) return res.status(500).json({ error: 'Handicap model unavailable' });
    const isAdminUser = isSiteAdmin(req);
    const h = await Handicap.findById(req.params.id);
    if (!h) return res.status(404).json({ error: 'Not found' });
    if (!isAdminUser) {
      const provided = String((req.body && req.body.ownerCode) || '').trim();
      if (!provided || provided !== (h.ownerCode || '')) return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, ghinNumber, handicapIndex, notes, ownerCode, clubName } = req.body || {};
    if (name !== undefined) h.name = String(name).trim();
    if (notes !== undefined) h.notes = String(notes).trim();
    if (clubName !== undefined) h.clubName = String(clubName || '').trim();
    if (handicapIndex !== undefined) {
      h.handicapIndex = handicapIndex === '' || handicapIndex === null ? null : Number(handicapIndex);
    }
    if (ghinNumber !== undefined) {
      const ghin = String(ghinNumber || '').trim();
      h.ghinNumber = ghin || undefined;
    }
    if (ownerCode !== undefined && (isAdminUser || ownerCode)) {
      h.ownerCode = String(ownerCode || '').trim();
    }
    await h.save();
    const rest = h.toObject();
    delete rest.ownerCode;
    res.json(rest);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'duplicate ghinNumber' });
    }
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/handicaps/:id', async (req, res) => {
  try {
    if (!Handicap) return res.status(500).json({ error: 'Handicap model unavailable' });
    const isAdminUser = isSiteAdmin(req);
    const h = await Handicap.findById(req.params.id);
    if (!h) return res.status(404).json({ error: 'Not found' });
    if (!isAdminUser) {
      const provided = String((req.body && req.body.ownerCode) || req.query.ownerCode || '').trim();
      if (!provided || provided !== (h.ownerCode || '')) return res.status(403).json({ error: 'Forbidden' });
    }
    await h.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Golfer list with current handicap from latest snapshot
app.get('/api/clubs/:clubId/golfers', async (req, res) => {
  try {
    if (!Golfer || !HandicapSnapshot) return res.status(500).json({ error: 'Handicap models unavailable' });
    const clubId = req.params.clubId;
    const golfers = await Golfer.find({ clubId }).lean();
    const ids = golfers.map((g) => g._id);
    const snaps = await HandicapSnapshot.find({ golferId: { $in: ids } }).sort({ asOfDate: -1, importedAt: -1 }).lean();
    const latestByGolfer = new Map();
    for (const snap of snaps) {
      const key = String(snap.golferId);
      if (!latestByGolfer.has(key)) latestByGolfer.set(key, snap);
    }
    const output = golfers.map((g) => {
      const latest = latestByGolfer.get(String(g._id));
      return {
        ...g,
        current_handicap_index: latest ? latest.handicapIndex : null,
        current_as_of_date: latest ? latest.asOfDate : null
      };
    });
    res.json(output);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin import (CSV upload)
app.post('/api/admin/clubs/:clubId/handicaps/import', upload.single('file'), async (req, res) => {
  try {
    if (!isSiteAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
    if (!Golfer || !HandicapSnapshot || !ImportBatch) return res.status(500).json({ error: 'Handicap models unavailable' });
    const clubId = req.params.clubId;
    const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const csvText = req.file.buffer.toString('utf8');
    const result = await importHandicapsFromCsv({
      csvText,
      clubId,
      dryRun,
      importedBy: 'admin',
      fileName: req.file.originalname,
      models: { Golfer, HandicapSnapshot, ImportBatch }
    });
    res.json(result);
  } catch (err) {
    console.error('Handicap import error', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/import-batches', async (req, res) => {
  try {
    if (!isSiteAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
    if (!ImportBatch) return res.status(500).json({ error: 'ImportBatch model unavailable' });
    const q = {};
    if (req.query.clubId) q.clubId = req.query.clubId;
    const list = await ImportBatch.find(q).sort({ createdAt: -1 }).limit(200).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/import-batches/:batchId', async (req, res) => {
  try {
    if (!isSiteAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
    if (!ImportBatch) return res.status(500).json({ error: 'ImportBatch model unavailable' });
    const batch = await ImportBatch.findById(req.params.batchId).lean();
    if (!batch) return res.status(404).json({ error: 'Not found' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- Resend inbound webhook for email.received events ---
app.post('/webhooks/resend', async (req, res) => {
  try {
    const event = req.body;
    console.log('[webhook] Incoming event:', JSON.stringify(event));

    // Only handle inbound email events
    if (!event || event.type !== 'email.received') {
      return res.status(200).send('Ignored: not an email.received event');
    }

    const emailId = event.data && event.data.email_id;
    if (!emailId) {
      console.warn('[webhook] No email_id in event data');
      return res.status(200).send('No email_id');
    }
    // Idempotency guard: ignore repeat webhook deliveries for the same email_id (Resend can retry)
    const nowMs = Date.now();
    for (const [id, ts] of [...processedEmailIds.entries()]) {
      if (nowMs - ts > 10 * 60 * 1000) processedEmailIds.delete(id); // expire after 10 minutes
    }
    const markProcessed = () => processedEmailIds.set(emailId, Date.now());
    if (processedEmailIds.has(emailId)) {
      console.log('[webhook] Skipping already-processed email', emailId);
      return res.status(200).send('Already processed');
    }

    // Restrict to your expected sender and recipient for now
    const fromAddress = event.data.from || '';
    const toList = event.data.to || [];
    const allowedTo = ['teetime@xenailexou.resend.app'];
    const allowedFrom = ['tommy.knight@gmail.com', 'no-reply@foreupsoftware.com'];

    const toAllowed =
      Array.isArray(toList) &&
      toList.some(
        (addr) =>
          typeof addr === 'string' &&
          allowedTo.some((allowed) => addr.toLowerCase() === allowed.toLowerCase())
      );

    const fromAllowed = allowedFrom.some(
      (allowed) => fromAddress.toLowerCase() === allowed.toLowerCase()
    );

    if (!toAllowed || !fromAllowed) {
      console.log('[webhook] Ignored: to/from not allowed', {
        from: fromAddress,
        to: toList,
      });
      markProcessed();
      return res.status(200).send('Ignored: to/from not allowed');
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('[webhook] RESEND_API_KEY not configured');
      markProcessed();
      return res.status(200).send('Resend not configured');
    }

    // Fetch full email content from Resend Receiving API via HTTP
    try {
      const emailRes = await fetch(
        `https://api.resend.com/emails/receiving/${emailId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!emailRes.ok) {
        const text = await emailRes.text();
        console.error('[webhook] Resend API error:', emailRes.status, text);
        return res.status(500).send('Error fetching email');
      }

      const email = await emailRes.json();

      console.log('[webhook] Email meta:', {
        from: email.from,
        to: email.to,
        subject: email.subject,
      });

      const textBody = email.text || '';
      const textPreview = textBody.slice(0, 400);
      console.log('[webhook] Email text preview:', textPreview);

      // Parse the email body for reservation details
      const { parseTeeTimeEmail } = require('./utils/parseTeeTimeEmail');
      const parsed = parseTeeTimeEmail(textBody, email.subject);
      if (!parsed || !parsed.action) {
        console.warn('[webhook] No valid tee time action found');
        return res.status(200).send('No valid tee time data');
      }

      // Extract additional details from the email body (Facility, TTID, etc.)
      let facility = '';
      let notes = '';
      for (const line of (parsed.rawLines || [])) {
        if (/^facility:/i.test(line)) facility = line.replace(/^facility:/i, '').trim();
        if (/^details:/i.test(line)) notes = line.replace(/^details:/i, '').trim();
      }
      // Fallback: try to extract facility from the first lines if not found
      if (!facility && parsed.rawLines && parsed.rawLines.length > 0) {
        const facIdx = parsed.rawLines.findIndex(l => /facility/i.test(l));
        if (facIdx >= 0 && parsed.rawLines[facIdx + 1]) {
          facility = parsed.rawLines[facIdx + 1].trim();
        }
      }

      // Tag event with source email note for traceability
      const sourceEmail = email.from || fromAddress || '';
      const sourceNote = sourceEmail ? `Email source: ${sourceEmail}` : '';
      const combinedNotes = [notes, sourceNote].filter(Boolean).join(' | ');

      // Normalize date to YYYY-MM-DD and time to HH:MM 24h
      function normalizeDate(dateStr) {
        // Accept MM/DD/YY or MM/DD/YYYY and convert to YYYY-MM-DD
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateStr)) {
          const [m, d, y] = dateStr.split('/');
          const year = y.length === 2 ? '20' + y : y;
          return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return dateStr;
      }
      function normalizeTime(timeStr) {
        // Accept 8:18am or 8:18 am, return 08:18 (24h)
        const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (!m) return timeStr;
        let h = parseInt(m[1], 10);
        const min = m[2];
        const ap = m[3] ? m[3].toLowerCase() : '';
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}`;
      }

      const normalizedDate = normalizeDate(parsed.dateStr || '');
      const normalizedTime = normalizeTime(parsed.timeStr || '');
      const eventDateObj = asUTCDate(normalizedDate);
      if (isNaN(eventDateObj)) {
        console.warn('[webhook] Invalid date parsed from email, skipping');
        markProcessed();
        return res.status(200).send('Invalid date in email');
      }

      // Derive number of tee times from golfers count (4 per tee)
      const teeTimeCount = (typeof parsed.players === 'number' && parsed.players > 0)
        ? Math.max(1, Math.ceil(parsed.players / 4))
        : null;
      const teeTimesFromCount = teeTimeCount ? genTeeTimes(normalizedTime, teeTimeCount, 9) : undefined;
      const dedupeKey = buildDedupeKey(eventDateObj, teeTimesFromCount || [{ time: normalizedTime }], false);

      // Compose event payload as expected by /api/events (UI form)
      const eventPayload = {
        course: facility || parsed.course || email.subject || 'Unknown Course',
        date: normalizedDate,
        notes: combinedNotes,
        isTeamEvent: false,
        teamSizeMax: 4,
        teeTime: normalizedTime, // UI expects 'teeTime' for first tee time
        teeTimes: teeTimesFromCount,
        dedupeKey
      };
      console.log('[webhook] Event payload to be created:', JSON.stringify(eventPayload));

      const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const findMatchingEvents = async () => {
        // Prefer exact course + time match, then time-only match on same date
        const queries = [];
        if (eventPayload.teeTime) {
          if (eventPayload.dedupeKey) {
            queries.push({ dedupeKey: eventPayload.dedupeKey });
          }
          if (eventPayload.course) {
            queries.push({
              date: eventDateObj,
              'teeTimes.time': eventPayload.teeTime,
              course: new RegExp(`^${escapeRegex(eventPayload.course)}$`, 'i')
            });
          }
          queries.push({ date: eventDateObj, 'teeTimes.time': eventPayload.teeTime });
        } else {
          queries.push({ date: eventDateObj });
        }
        for (const q of queries) {
          const found = await Event.find(q).sort({ createdAt: 1 });
          if (found.length) return found;
        }
        return [];
      };

      const updateEventFromPayload = async (ev) => {
        ev.course = eventPayload.course || ev.course;
        ev.notes = eventPayload.notes || ev.notes || '';
        ev.date = eventDateObj;
        ev.isTeamEvent = false;
        ev.teamSizeMax = 4;

        const hasPlayers = Array.isArray(ev.teeTimes) && ev.teeTimes.some((tt) => Array.isArray(tt.players) && tt.players.length);
        if (Array.isArray(eventPayload.teeTimes) && eventPayload.teeTimes.length && !hasPlayers) {
          ev.teeTimes = eventPayload.teeTimes;
        } else if (eventPayload.teeTime) {
          if (Array.isArray(ev.teeTimes) && ev.teeTimes.length) {
            ev.teeTimes[0].time = eventPayload.teeTime;
          } else {
            ev.teeTimes = [{ time: eventPayload.teeTime, players: [] }];
          }
        }
        return ev.save();
      };

      const createEventThroughApi = async (reason = 'CREATE') => {
        const body = { ...eventPayload, date: normalizedDate };
        const fetchRes = await fetch(`${SITE_URL}api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!fetchRes.ok) {
          const text = await fetchRes.text();
          throw new Error(`API ${reason} create failed: ${fetchRes.status} ${text}`);
        }
        const created = await fetchRes.json();
        console.log(`[webhook] Event created from email (${reason}) via API:`, created._id);
        return created;
      };

      if ((parsed.action === 'CREATE' || parsed.action === 'UPDATE') && eventPayload.course && eventPayload.date && eventPayload.teeTime) {
        try {
          const matches = await findMatchingEvents();
          if (matches.length) {
            const updated = await updateEventFromPayload(matches[0]);
            console.log('[webhook] Event matched existing, updated instead of creating new', { id: updated._id });
            markProcessed();
            return res.status(200).json({ ok: true, eventId: updated._id, updated: true, deduped: 0 });
          }

          const created = await createEventThroughApi(parsed.action);
          // Send notification email to all subscribers (same as /api/events) for brand new events only
          try {
            const eventUrl = `${SITE_URL}?event=${created._id}`;
            await sendEmailToAll(`New Event: ${created.course} (${fmt.dateISO(created.date)})`,
              frame('A New Golf Event Has Been Scheduled!',
                `<p>The following event is now open for sign-up:</p>
                 <p><strong>Event:</strong> ${esc(fmt.dateShortTitle(created.date))}</p>
                 <p><strong>Course:</strong> ${esc(created.course||'')}</p>
                 <p><strong>Date:</strong> ${esc(fmt.dateLong(created.date))}</p>
                 ${(!created.isTeamEvent && created.teeTimes?.[0]?.time) ? `<p><strong>First Tee Time:</strong> ${esc(fmt.tee(created.teeTimes[0].time))}</p>`:''}
                 <p>Please <a href="${eventUrl}" style="color:#166534;text-decoration:underline">click here to view this event directly</a> or visit the sign-up page to secure your spot!</p>${btn('Go to Sign-up Page', eventUrl)}`)
            );
          } catch (e) {
            console.error('[webhook] Failed to send notification email:', e);
          }
          markProcessed();
          return res.status(201).json({ ok: true, eventId: created._id, created: true });
        } catch (err) {
          console.error('[webhook] Error creating/updating event via email:', err);
          return res.status(500).send('Error creating/updating event via API');
        }
      } else if (parsed.action === 'CANCEL' && eventPayload.course && eventPayload.date && eventPayload.teeTime) {
        try {
          const matches = await findMatchingEvents();
          if (matches.length) {
            const primary = matches[0];
            await Event.findByIdAndDelete(primary._id);
            console.log('[webhook] Event cancelled from email (removed match):', primary._id);
            // Notify subscribers about the cancellation (non-blocking)
            const teeMatch = (primary.teeTimes || []).find(tt => tt && tt.time === eventPayload.teeTime);
            const teeLabel = teeMatch && teeMatch.time ? fmt.tee(teeMatch.time) : null;
            sendEmailToAll(
              `Event Cancelled: ${primary.course || 'Event'} (${fmt.dateISO(primary.date)})`,
              frame('Golf Event Cancelled',
                `<p>The following event has been cancelled:</p>
                 <p><strong>Event:</strong> ${esc(fmt.dateShortTitle(primary.date))}</p>
                 <p><strong>Course:</strong> ${esc(primary.course||'')}</p>
                 <p><strong>Date:</strong> ${esc(fmt.dateLong(primary.date))}</p>
                 ${teeLabel ? `<p><strong>Tee Time:</strong> ${esc(teeLabel)}</p>` : ''}
                 <p>We apologize for any inconvenience.</p>${btn('View Other Events')}`))
              .catch(err => console.error('[webhook] Failed to send cancellation email:', err));
            markProcessed();
            return res.status(200).json({ ok: true, cancelled: true, eventIds: [primary._id] });
          } else {
            console.warn('[webhook] Cancel: no matching event found');
            markProcessed();
            return res.status(200).send('Cancel: no matching event found');
          }
        } catch (err) {
          console.error('[webhook] Error cancelling event:', err);
          return res.status(500).send('Error cancelling event');
        }
      } else {
        console.log('[webhook] Ignoring non-create/cancel email action:', parsed.action);
        markProcessed();
        return res.status(200).send(`No event created or cancelled (action=${parsed.action || 'unknown'})`);
      }
    } catch (err) {
      console.error('[webhook] Error fetching email content from Resend:', err);
      return res.status(500).send('Error fetching email');
    }
  } catch (err) {
    console.error('[webhook] Internal error handling webhook:', err);
    return res.status(500).send('Internal server error');
  }
});

const LEGACY_STATIC_REDIRECTS = new Map([
  ['/myrtle-trip-2026.html', '/myrtle/trip-2026.html'],
  ['/tin-cup-trip-2026.html', '/tin-cup/trip-2026.html'],
  ['/tin-cup-live-score-entry.html', '/tin-cup/live-score-entry.html'],
  ['/tin-cup-leaderboard-2026.html', '/tin-cup/leaderboard-2026.html'],
  ['/tin-cup-guests-lodging.html', '/tin-cup/guests-lodging.html'],
]);

app.get(Array.from(LEGACY_STATIC_REDIRECTS.keys()), (req, res) => {
  const target = LEGACY_STATIC_REDIRECTS.get(req.path);
  if (!target) return res.status(404).end();
  const suffix = `${req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''}`;
  return res.redirect(302, `${target}${suffix}`);
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
  setHeaders: (res, filePath) => {
    if (/\.(js|css|png|svg|ico|webp|json)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

const skipMongoConnect = process.env.SKIP_MONGO_CONNECT === '1';
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
if (!skipMongoConnect) {
  mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connected', uri:mongoUri })))
    .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });
} else {
  console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connect skipped for test mode' }));
}

let Event; try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
let Subscriber; try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = null; }
let AuditLog; try { AuditLog = require('./models/AuditLog'); } catch { AuditLog = null; }
let Settings; try { Settings = require('./models/Settings'); } catch { Settings = null; }
let Handicap; try { Handicap = require('./models/Handicap'); } catch { Handicap = null; }
let Golfer; try { Golfer = require('./models/Golfer'); } catch { Golfer = null; }
let HandicapSnapshot; try { HandicapSnapshot = require('./models/HandicapSnapshot'); } catch { HandicapSnapshot = null; }
let ImportBatch; try { ImportBatch = require('./models/ImportBatch'); } catch { ImportBatch = null; }
let TeeTimeLog; try { TeeTimeLog = require('./models/TeeTimeLog'); } catch { TeeTimeLog = null; }

app.use('/api', buildSystemRouter({
  mongoose,
  getSecondaryConn,
  getFeatures: () => ({
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasResendFrom: !!process.env.RESEND_FROM,
    hasSubscriberModel: !!Subscriber,
    hasHandicapModels: !!(Golfer && HandicapSnapshot && ImportBatch),
  }),
  port: PORT,
}));

/* ---------------- Admin Configuration ---------------- */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'tommy.knight@gmail.com,jvhyers@gmail.com').split(',').map(e => e.trim()).filter(Boolean);
const CLUB_EMAIL = process.env.CLUB_CANCEL_EMAIL || 'Brian.Jones@blueridgeshadows.com';
const SCHEDULER_ENV_DISABLED = process.env.ENABLE_SCHEDULER === '0';
const SCHEDULED_EMAIL_RULE_DEFAULTS = Object.freeze({
  brianTomorrowEmptyClubAlert: true,
  reminder48Hour: true,
  reminder24Hour: true,
  nearlyFullTeeTimes: true,
  adminEmptyTeeAlerts: true,
});
const SCHEDULED_EMAIL_RULE_KEYS = Object.keys(SCHEDULED_EMAIL_RULE_DEFAULTS);

/* ---------------- Tee time change logging ---------------- */
async function logTeeTimeChange(entry = {}) {
  if (!TeeTimeLog) return;
  try {
    await TeeTimeLog.create({
      eventId: entry.eventId,
      teeId: entry.teeId,
      action: entry.action,
      labelBefore: entry.labelBefore || '',
      labelAfter: entry.labelAfter || '',
      isTeamEvent: !!entry.isTeamEvent,
      course: entry.course || '',
      dateISO: entry.dateISO || '',
      notifyClub: !!entry.notifyClub,
      mailMethod: entry.mailMethod || null,
      mailError: entry.mailError || null,
    });
  } catch (err) {
    console.error('[tee-time] Failed to log tee time change', err.message);
  }
}

/* ---------------- Weather helpers ---------------- */
// Default location (Richmond, VA area - adjust for your region)
const DEFAULT_LAT = process.env.DEFAULT_LAT || '37.5407';
const DEFAULT_LON = process.env.DEFAULT_LON || '-77.4360';
const weatherCache = new Map(); // key: `${dateISO}|${lat}|${lon}` -> { data, ts }
const WEATHER_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const weatherGeocodeCache = new Map(); // key: normalized query -> { data, ok, ts }
const WEATHER_GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const WEATHER_GEOCODE_NEG_TTL_MS = 60 * 60 * 1000; // 1 hour

function getWeatherIcon(weatherCode, isDay = true) {
  // WMO Weather interpretation codes
  // https://open-meteo.com/en/docs
  if (weatherCode === 0) return { icon: '☀️', condition: 'sunny', desc: 'Clear sky' };
  if (weatherCode === 1) return { icon: isDay ? '🌤️' : '🌙', condition: 'mostly-sunny', desc: 'Mainly clear' };
  if (weatherCode === 2) return { icon: '⛅', condition: 'partly-cloudy', desc: 'Partly cloudy' };
  if (weatherCode === 3) return { icon: '☁️', condition: 'cloudy', desc: 'Overcast' };
  if (weatherCode >= 45 && weatherCode <= 48) return { icon: '🌫️', condition: 'foggy', desc: 'Foggy' };
  if (weatherCode >= 51 && weatherCode <= 67) return { icon: '🌧️', condition: 'rainy', desc: 'Rainy' };
  if (weatherCode >= 71 && weatherCode <= 77) return { icon: '🌨️', condition: 'snowy', desc: 'Snow' };
  if (weatherCode >= 80 && weatherCode <= 82) return { icon: '🌦️', condition: 'showers', desc: 'Rain showers' };
  if (weatherCode >= 95) return { icon: '⛈️', condition: 'stormy', desc: 'Thunderstorm' };
  return { icon: '🌤️', condition: 'unknown', desc: 'Unknown' };
}

function toNullableString(value) {
  const raw = String(value || '').trim();
  return raw || null;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toLatitude(value) {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  if (n < -90 || n > 90) return null;
  return n;
}

function toLongitude(value) {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  if (n < -180 || n > 180) return null;
  return n;
}

function normalizeCourseInfo(input = {}) {
  const courseInfo = (input && typeof input === 'object') ? input : {};
  const out = {};
  const city = toNullableString(courseInfo.city);
  const state = toNullableString(courseInfo.state);
  const phone = toNullableString(courseInfo.phone);
  const website = toNullableString(courseInfo.website);
  const imageUrl = toNullableString(courseInfo.imageUrl);
  const address = toNullableString(courseInfo.address);
  const fullAddress = toNullableString(courseInfo.fullAddress);
  const holesRaw = toFiniteNumber(courseInfo.holes);
  const parRaw = toFiniteNumber(courseInfo.par);
  const latitude = toLatitude(courseInfo.latitude ?? courseInfo.lat);
  const longitude = toLongitude(courseInfo.longitude ?? courseInfo.lon ?? courseInfo.lng);

  if (city) out.city = city;
  if (state) out.state = state;
  if (phone) out.phone = phone;
  if (website) out.website = website;
  if (imageUrl) out.imageUrl = imageUrl;
  if (address) out.address = address;
  if (fullAddress) out.fullAddress = fullAddress;
  if (holesRaw !== null && holesRaw > 0) out.holes = Math.round(holesRaw);
  if (parRaw !== null && parRaw > 0) out.par = Math.round(parRaw);
  if (latitude !== null) out.latitude = latitude;
  if (longitude !== null) out.longitude = longitude;
  return out;
}

function uniqueLocationQueries(queries = []) {
  const out = [];
  const seen = new Set();
  for (const q of queries) {
    const value = String(q || '').trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function geocodeLocationQuery(query) {
  const normalizedQuery = String(query || '').trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return null;

  const cacheKey = normalizedQuery.toLowerCase();
  const cached = weatherGeocodeCache.get(cacheKey);
  if (cached) {
    const ttl = cached.ok ? WEATHER_GEOCODE_TTL_MS : WEATHER_GEOCODE_NEG_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalizedQuery)}&count=5&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);

    const payload = await response.json();
    const results = Array.isArray(payload && payload.results) ? payload.results : [];
    const findValid = (list = []) => list.find((entry) => toLatitude(entry.latitude) !== null && toLongitude(entry.longitude) !== null);
    const usMatch = findValid(results.filter((entry) => String(entry.country_code || '').toUpperCase() === 'US'));
    const best = usMatch || findValid(results);

    const geocoded = best
      ? {
          lat: Number(best.latitude),
          lon: Number(best.longitude),
          source: 'geocoded',
          query: normalizedQuery,
        }
      : null;

    weatherGeocodeCache.set(cacheKey, { data: geocoded, ok: !!geocoded, ts: Date.now() });
    return geocoded;
  } catch (err) {
    console.warn('Weather geocode error:', err.message, '(query:', normalizedQuery, ')');
    weatherGeocodeCache.set(cacheKey, { data: null, ok: false, ts: Date.now() });
    return null;
  }
}

async function resolveWeatherCoordinates(eventLike = {}) {
  const courseInfo = (eventLike && eventLike.courseInfo && typeof eventLike.courseInfo === 'object')
    ? eventLike.courseInfo
    : {};
  const storedLat = toLatitude(courseInfo.latitude ?? courseInfo.lat);
  const storedLon = toLongitude(courseInfo.longitude ?? courseInfo.lon ?? courseInfo.lng);
  if (storedLat !== null && storedLon !== null) {
    return { lat: storedLat, lon: storedLon, source: 'course-info' };
  }

  const course = toNullableString(eventLike.course);
  const city = toNullableString(courseInfo.city);
  const state = toNullableString(courseInfo.state);
  const address = toNullableString(courseInfo.address || courseInfo.fullAddress);

  const queries = uniqueLocationQueries([
    [course, address, city, state].filter(Boolean).join(', '),
    [course, city, state].filter(Boolean).join(', '),
    [address, city, state].filter(Boolean).join(', '),
    [course, city].filter(Boolean).join(', '),
    [course, state].filter(Boolean).join(', '),
    [city, state].filter(Boolean).join(', '),
    course || '',
  ]);

  for (const query of queries) {
    const geocoded = await geocodeLocationQuery(query);
    if (geocoded) return geocoded;
  }

  const fallbackLat = toLatitude(DEFAULT_LAT);
  const fallbackLon = toLongitude(DEFAULT_LON);
  return {
    lat: fallbackLat !== null ? fallbackLat : 37.5407,
    lon: fallbackLon !== null ? fallbackLon : -77.4360,
    source: 'default',
  };
}

async function fetchWeatherForEvent(eventLike = {}) {
  const date = eventLike && eventLike.date;
  const coords = await resolveWeatherCoordinates(eventLike);
  return fetchWeatherForecast(date, coords.lat, coords.lon);
}

async function fetchWeatherForecast(date, lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      console.error('Weather fetch error: Invalid or missing date', date);
      return {
        success: false,
        condition: 'error',
        icon: '🌤️',
        temp: null,
        tempLow: null,
        tempHigh: null,
        rainChance: null,
        description: 'Invalid or missing event date',
        lastFetched: null
      };
    }
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheKey = `${dateStr}|${lat}|${lon}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) {
      return cached.data;
    }
    const today = new Date();
    const daysAhead = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    // Open-Meteo provides forecasts up to 16 days ahead
    if (daysAhead > 16) {
      console.log(`Weather: Event is ${daysAhead} days ahead (max 16), returning placeholder`);
      return {
        success: false,
        condition: 'unknown',
        icon: '🌤️',
        temp: null,
        tempLow: null,
        tempHigh: null,
        rainChance: null,
        description: 'Forecast not yet available',
        lastFetched: null
      };
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Weather API HTTP error: ${response.status} ${response.statusText}`);
      throw new Error(`Weather API HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.daily || !data.daily.weather_code || data.daily.weather_code[0] === undefined) {
      console.error('Weather API returned incomplete data:', JSON.stringify(data));
      throw new Error('No weather data available');
    }
    const weatherCode = data.daily.weather_code[0];
    const tempMax = data.daily.temperature_2m_max[0];
    const tempMin = data.daily.temperature_2m_min[0];
    const precipMax = data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[0] : null;
    const avgTemp = Math.round((tempMax + tempMin) / 2);
    const weatherInfo = getWeatherIcon(weatherCode, true);
    const roundedLow = Number.isFinite(Number(tempMin)) ? Math.round(Number(tempMin)) : null;
    const roundedHigh = Number.isFinite(Number(tempMax)) ? Math.round(Number(tempMax)) : null;
    const rainChance = Number.isFinite(Number(precipMax)) ? Math.round(Number(precipMax)) : null;
    const out = {
      success: true,
      condition: weatherInfo.condition,
      icon: weatherInfo.icon,
      temp: avgTemp,
      tempLow: roundedLow,
      tempHigh: roundedHigh,
      rainChance,
      description: weatherInfo.desc,
      lastFetched: new Date()
    };
    weatherCache.set(cacheKey, { data: out, ts: Date.now() });
    return out;
  } catch (e) {
    let dateStr = 'undefined';
    if (date && date instanceof Date && !isNaN(date.getTime())) {
      dateStr = date.toISOString().split('T')[0];
    }
    console.error('Weather fetch error:', e.message, '(Date:', dateStr, 'Lat:', lat, 'Lon:', lon, ')');
    return {
      success: false,
      condition: 'error',
      icon: '🌧️',
      temp: null,
      tempLow: null,
      tempHigh: null,
      rainChance: null,
      description: 'Weather unavailable',
      lastFetched: null
    };
  }
}

function assignWeatherToEvent(ev, weatherData = {}) {
  if (!ev.weather) ev.weather = {};
  ev.weather.condition = weatherData.condition || null;
  ev.weather.icon = weatherData.icon || null;
  ev.weather.temp = Number.isFinite(Number(weatherData.temp)) ? Number(weatherData.temp) : null;
  ev.weather.tempLow = Number.isFinite(Number(weatherData.tempLow)) ? Number(weatherData.tempLow) : null;
  ev.weather.tempHigh = Number.isFinite(Number(weatherData.tempHigh)) ? Number(weatherData.tempHigh) : null;
  ev.weather.rainChance = Number.isFinite(Number(weatherData.rainChance)) ? Number(weatherData.rainChance) : null;
  ev.weather.description = weatherData.description || null;
  ev.weather.lastFetched = weatherData.lastFetched || null;
}

/* ---------------- Email helpers ---------------- */
const nodemailer = require('nodemailer');
let transporter = null;

async function ensureTransporter() {
  if (transporter || !process.env.RESEND_API_KEY) return transporter;
  
  // Use Resend SMTP
  transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
      user: 'resend',
      pass: process.env.RESEND_API_KEY
    }
  });
  
  return transporter;
}

function normalizeEmailSubject(subject = '') {
  const raw = String(subject || '').trim();
  if (process.env.E2E_TEST_MODE === '1' && !/^THIS IS A TEST\b/i.test(raw)) {
    return `THIS IS A TEST - ${raw}`;
  }
  return raw;
}

function isE2ETestMode() {
  return process.env.E2E_TEST_MODE === '1';
}

async function sendEmail(to, subject, html) {
  if (isE2ETestMode()) {
    return { ok: true, simulated: true, data: { to, subject: normalizeEmailSubject(subject), bytes: String(html || '').length } };
  }
  const mailer = await ensureTransporter();
  if (!mailer || !process.env.RESEND_FROM) {
    console.warn(JSON.stringify({ level:'warn', msg:'Email disabled', reason:'missing key/from' }));
    return { ok:false, disabled:true };
  }
  
  try {
    const normalizedSubject = normalizeEmailSubject(subject);
    const info = await mailer.sendMail({
      from: process.env.RESEND_FROM,
      to: to,
      subject: normalizedSubject,
      html: html
    });
    return { ok: true, data: { id: info.messageId } };
  } catch (err) {
    return { ok: false, error: { message: err.message } };
  }
}

// HTTP fallback to Resend API (avoids SMTP egress issues)
async function sendEmailViaResendApi(to, subject, html, options = {}) {
  if (isE2ETestMode()) {
    const normalizedSubject = normalizeEmailSubject(subject);
    return { ok: true, simulated: true, data: { to, cc: options && options.cc, subject: normalizedSubject, bytes: String(html || '').length } };
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    return { ok: false, error: { message: 'Resend API key/from not configured' } };
  }
  const normalizedSubject = normalizeEmailSubject(subject);
  const payload = {
    from: process.env.RESEND_FROM,
    to: Array.isArray(to) ? to : [to],
    subject: normalizedSubject,
    html,
  };
  if (options.cc) payload.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: { message: `Resend HTTP ${resp.status}: ${text}` } };
    }
    const data = await resp.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: { message: err.message } };
  }
}

/* Helper to check if notifications are globally enabled */
async function areNotificationsEnabled() {
  if (!Settings) return true; // Default to enabled if Settings model not available
  try {
    const setting = await Settings.findOne({ key: 'notificationsEnabled' });
    return setting ? setting.value !== false : true; // Default to true if not set
  } catch (e) {
    console.error('Error checking notification settings:', e);
    return true; // Fail open - allow notifications
  }
}

const SCHEDULER_SETTINGS_CACHE_TTL_MS = 30 * 1000;
let schedulerEnabledCache = { value: !SCHEDULER_ENV_DISABLED, ts: 0 };
let scheduledEmailRulesCache = { value: { ...SCHEDULED_EMAIL_RULE_DEFAULTS }, ts: 0 };
const BACKUP_SETTINGS_DEFAULTS = Object.freeze({
  monthlyEnabled: true,
  monthlyDay: 1,
  monthlyHour: 2,
  monthlyMinute: 15,
  weeklyEnabled: false,
  weeklyDay: 0,
  weeklyHour: 2,
  weeklyMinute: 15,
  dailyEnabled: false,
  dailyHour: 2,
  dailyMinute: 15,
  activeSeasonOnly: false,
  activeSeasonStartMonth: 3,
  activeSeasonEndMonth: 10,
  retainCount: 12,
  offsiteCopyEnabled: false,
  offsiteLocation: '',
});
let backupSettingsCache = { value: { ...BACKUP_SETTINGS_DEFAULTS }, ts: 0 };
const BACKUP_STATUS_DEFAULTS = Object.freeze({
  lastSuccessfulBackupAt: null,
  lastSuccessfulBackupId: '',
  lastSuccessfulBackupBytes: 0,
  lastFailureAt: null,
  lastFailureMessage: '',
});
let backupStatusCache = { value: { ...BACKUP_STATUS_DEFAULTS }, ts: 0 };

async function areSchedulerJobsEnabled() {
  if (SCHEDULER_ENV_DISABLED) return false;
  const now = Date.now();
  if (now - schedulerEnabledCache.ts < SCHEDULER_SETTINGS_CACHE_TTL_MS) {
    return schedulerEnabledCache.value;
  }
  let enabled = true;
  if (Settings) {
    try {
      const setting = await Settings.findOne({ key: 'schedulerEnabled' });
      enabled = setting ? setting.value !== false : true;
    } catch (e) {
      console.error('Error checking scheduler settings:', e);
      enabled = true;
    }
  }
  schedulerEnabledCache = { value: enabled, ts: now };
  return enabled;
}

function normalizeScheduledEmailRules(rawValue) {
  const normalized = { ...SCHEDULED_EMAIL_RULE_DEFAULTS };
  if (!rawValue || typeof rawValue !== 'object') return normalized;
  for (const key of SCHEDULED_EMAIL_RULE_KEYS) {
    if (typeof rawValue[key] === 'boolean') {
      normalized[key] = rawValue[key];
    }
  }
  return normalized;
}

async function getScheduledEmailRules() {
  const now = Date.now();
  if (now - scheduledEmailRulesCache.ts < SCHEDULER_SETTINGS_CACHE_TTL_MS) {
    return scheduledEmailRulesCache.value;
  }
  let rules = { ...SCHEDULED_EMAIL_RULE_DEFAULTS };
  if (Settings) {
    try {
      const setting = await Settings.findOne({ key: 'scheduledEmailRules' });
      rules = normalizeScheduledEmailRules(setting && setting.value);
    } catch (e) {
      console.error('Error checking scheduled email rule settings:', e);
    }
  }
  scheduledEmailRulesCache = { value: rules, ts: now };
  return rules;
}

function normalizeBackupSettings(rawValue) {
  const base = { ...BACKUP_SETTINGS_DEFAULTS };
  if (!rawValue || typeof rawValue !== 'object') return base;
  if (typeof rawValue.monthlyEnabled === 'boolean') base.monthlyEnabled = rawValue.monthlyEnabled;
  const monthlyDay = Number(rawValue.monthlyDay);
  const monthlyHour = Number(rawValue.monthlyHour);
  const monthlyMinute = Number(rawValue.monthlyMinute);
  const weeklyDay = Number(rawValue.weeklyDay);
  const weeklyHour = Number(rawValue.weeklyHour);
  const weeklyMinute = Number(rawValue.weeklyMinute);
  const dailyHour = Number(rawValue.dailyHour);
  const dailyMinute = Number(rawValue.dailyMinute);
  const activeSeasonStartMonth = Number(rawValue.activeSeasonStartMonth);
  const activeSeasonEndMonth = Number(rawValue.activeSeasonEndMonth);
  const retainCount = Number(rawValue.retainCount);
  if (Number.isInteger(monthlyDay) && monthlyDay >= 1 && monthlyDay <= 28) base.monthlyDay = monthlyDay;
  if (Number.isInteger(monthlyHour) && monthlyHour >= 0 && monthlyHour <= 23) base.monthlyHour = monthlyHour;
  if (Number.isInteger(monthlyMinute) && monthlyMinute >= 0 && monthlyMinute <= 59) base.monthlyMinute = monthlyMinute;
  if (typeof rawValue.weeklyEnabled === 'boolean') base.weeklyEnabled = rawValue.weeklyEnabled;
  if (Number.isInteger(weeklyDay) && weeklyDay >= 0 && weeklyDay <= 6) base.weeklyDay = weeklyDay;
  if (Number.isInteger(weeklyHour) && weeklyHour >= 0 && weeklyHour <= 23) base.weeklyHour = weeklyHour;
  if (Number.isInteger(weeklyMinute) && weeklyMinute >= 0 && weeklyMinute <= 59) base.weeklyMinute = weeklyMinute;
  if (typeof rawValue.dailyEnabled === 'boolean') base.dailyEnabled = rawValue.dailyEnabled;
  if (Number.isInteger(dailyHour) && dailyHour >= 0 && dailyHour <= 23) base.dailyHour = dailyHour;
  if (Number.isInteger(dailyMinute) && dailyMinute >= 0 && dailyMinute <= 59) base.dailyMinute = dailyMinute;
  if (typeof rawValue.activeSeasonOnly === 'boolean') base.activeSeasonOnly = rawValue.activeSeasonOnly;
  if (Number.isInteger(activeSeasonStartMonth) && activeSeasonStartMonth >= 1 && activeSeasonStartMonth <= 12) base.activeSeasonStartMonth = activeSeasonStartMonth;
  if (Number.isInteger(activeSeasonEndMonth) && activeSeasonEndMonth >= 1 && activeSeasonEndMonth <= 12) base.activeSeasonEndMonth = activeSeasonEndMonth;
  if (Number.isInteger(retainCount) && retainCount >= 1 && retainCount <= 120) base.retainCount = retainCount;
  if (typeof rawValue.offsiteCopyEnabled === 'boolean') base.offsiteCopyEnabled = rawValue.offsiteCopyEnabled;
  if (typeof rawValue.offsiteLocation === 'string') base.offsiteLocation = rawValue.offsiteLocation.trim().slice(0, 200);
  return base;
}

async function getBackupSettings() {
  const now = Date.now();
  if (now - backupSettingsCache.ts < SCHEDULER_SETTINGS_CACHE_TTL_MS) {
    return backupSettingsCache.value;
  }
  let settings = { ...BACKUP_SETTINGS_DEFAULTS };
  if (Settings) {
    try {
      const setting = await Settings.findOne({ key: 'backupSettings' });
      settings = normalizeBackupSettings(setting && setting.value);
    } catch (e) {
      console.error('Error checking backup settings:', e);
    }
  }
  backupSettingsCache = { value: settings, ts: now };
  return settings;
}

function normalizeBackupStatus(rawValue) {
  const base = { ...BACKUP_STATUS_DEFAULTS };
  if (!rawValue || typeof rawValue !== 'object') return base;
  if (rawValue.lastSuccessfulBackupAt) base.lastSuccessfulBackupAt = String(rawValue.lastSuccessfulBackupAt);
  if (rawValue.lastSuccessfulBackupId) base.lastSuccessfulBackupId = String(rawValue.lastSuccessfulBackupId);
  if (Number.isFinite(Number(rawValue.lastSuccessfulBackupBytes))) base.lastSuccessfulBackupBytes = Number(rawValue.lastSuccessfulBackupBytes);
  if (rawValue.lastFailureAt) base.lastFailureAt = String(rawValue.lastFailureAt);
  if (rawValue.lastFailureMessage) base.lastFailureMessage = String(rawValue.lastFailureMessage).slice(0, 500);
  return base;
}

async function getBackupStatus() {
  const now = Date.now();
  if (now - backupStatusCache.ts < SCHEDULER_SETTINGS_CACHE_TTL_MS) {
    return backupStatusCache.value;
  }
  let status = { ...BACKUP_STATUS_DEFAULTS };
  if (Settings) {
    try {
      const setting = await Settings.findOne({ key: 'backupStatus' });
      status = normalizeBackupStatus(setting && setting.value);
    } catch (e) {
      console.error('Error checking backup status:', e);
    }
  }
  backupStatusCache = { value: status, ts: now };
  return status;
}

async function saveBackupStatus(nextStatus) {
  const status = normalizeBackupStatus(nextStatus);
  if (Settings) {
    await Settings.findOneAndUpdate(
      { key: 'backupStatus' },
      { key: 'backupStatus', value: status },
      { upsert: true, new: true }
    );
  }
  backupStatusCache = { value: status, ts: Date.now() };
  return status;
}

async function updateBackupStatus(patch = {}) {
  const current = await getBackupStatus();
  return saveBackupStatus({ ...current, ...patch });
}

async function recordBackupFailure(error) {
  const message = error && error.message ? error.message : String(error || 'Unknown backup error');
  return updateBackupStatus({
    lastFailureAt: new Date().toISOString(),
    lastFailureMessage: message,
  });
}

async function sendEmailToAll(subject, html) {
  if (!Subscriber) return { ok:false, reason:'no model' };
  // Check if notifications are globally enabled
  const notifEnabled = await areNotificationsEnabled();
  if (!notifEnabled) {
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Notifications disabled globally, skipping email' }));
    return { ok:true, sent:0, disabled:true };
  }
  const subs = await Subscriber.find({}).lean();
  if (!subs.length) return { ok:true, sent:0 };
  let sent = 0;
  for (const s of subs) {
    try {
      // Add personalized unsubscribe link
      const unsubLink = `${SITE_URL}api/unsubscribe/${s.unsubscribeToken}`;
      
      // Add unsubscribe link to the HTML
      const htmlWithUnsub = html.replace(
        /You received this because you subscribed to tee time updates\./,
        `You received this because you subscribed to tee time updates. <a href="${unsubLink}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>`
      );
      await sendEmail(s.email, subject, htmlWithUnsub);
      sent++; 
    } catch {}
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

function parseHHMMToMinutes(rawTime = '') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(rawTime).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function calendarDateParts(dateVal) {
  const d = asUTCDate(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    iso: d.toISOString().slice(0, 10),
  };
}

function eventCalendarTiming(ev, durationMinutes = CALENDAR_EVENT_DURATION_MINUTES) {
  const parts = calendarDateParts(ev && ev.date);
  if (!parts) return null;

  let startMinutes = null;
  for (const tt of (ev && ev.teeTimes) || []) {
    const mins = parseHHMMToMinutes(tt && tt.time);
    if (mins === null) continue;
    if (startMinutes === null || mins < startMinutes) startMinutes = mins;
  }

  if (startMinutes === null) {
    const startDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
    const endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
    return { allDay: true, dateISO: parts.iso, startDate, endDate };
  }

  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(startMinutes / 60), startMinutes % 60, 0));
  const end = new Date(start.getTime() + (durationMinutes * 60 * 1000));
  return { allDay: false, dateISO: parts.iso, start, end };
}

function twoDigits(n) {
  return String(n).padStart(2, '0');
}

function formatIcsUtcStamp(date) {
  return `${date.getUTCFullYear()}${twoDigits(date.getUTCMonth() + 1)}${twoDigits(date.getUTCDate())}T${twoDigits(date.getUTCHours())}${twoDigits(date.getUTCMinutes())}${twoDigits(date.getUTCSeconds())}Z`;
}

function formatIcsFloatingDateTime(date) {
  return `${date.getUTCFullYear()}${twoDigits(date.getUTCMonth() + 1)}${twoDigits(date.getUTCDate())}T${twoDigits(date.getUTCHours())}${twoDigits(date.getUTCMinutes())}${twoDigits(date.getUTCSeconds())}`;
}

function formatIcsDateValue(date) {
  return `${date.getUTCFullYear()}${twoDigits(date.getUTCMonth() + 1)}${twoDigits(date.getUTCDate())}`;
}

function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line) {
  const maxLen = 74;
  if (line.length <= maxLen) return line;
  const chunks = [];
  for (let i = 0; i < line.length; i += maxLen) {
    chunks.push(i === 0 ? line.slice(i, i + maxLen) : ` ${line.slice(i, i + maxLen)}`);
  }
  return chunks.join('\r\n');
}

function eventCalendarSummary(ev) {
  const mode = ev && ev.isTeamEvent ? 'Team Event' : 'Tee-Time Event';
  const course = ev && ev.course ? String(ev.course).trim() : 'Golf Event';
  return `${course} (${mode})`;
}

function eventCalendarDescription(ev) {
  const lines = ['Tee Time Manager Event'];
  if (ev && ev.course) lines.push(`Course: ${String(ev.course).trim()}`);
  lines.push(`Date: ${fmt.dateLong(ev && ev.date) || fmt.dateISO(ev && ev.date)}`);

  const slotTimes = ((ev && ev.teeTimes) || [])
    .map((tt, idx) => {
      if (tt && tt.time) {
        if (ev && ev.isTeamEvent) return `${tt.name || `Team ${idx + 1}`}: ${fmt.tee(tt.time)}`;
        return `Tee ${idx + 1}: ${fmt.tee(tt.time)}`;
      }
      if (ev && ev.isTeamEvent) return tt && tt.name ? String(tt.name) : `Team ${idx + 1}`;
      return '';
    })
    .filter(Boolean);
  if (slotTimes.length) lines.push(`${ev && ev.isTeamEvent ? 'Teams' : 'Tee Times'}: ${slotTimes.join(', ')}`);

  if (ev && ev.notes) lines.push(`Notes: ${String(ev.notes).trim()}`);
  if (ev && ev._id) lines.push(`Event Link: ${SITE_URL}?event=${String(ev._id)}`);
  return lines.join('\n');
}

function eventCalendarFileName(ev) {
  const dateISO = fmt.dateISO(ev && ev.date) || 'event';
  const courseSlug = String((ev && ev.course) || 'golf-event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'golf-event';
  return `tee-time-${dateISO}-${courseSlug}.ics`;
}

function buildIcsEventLines(ev, stampDate = new Date()) {
  const timing = eventCalendarTiming(ev);
  if (!timing) return null;

  const uid = `${(ev && ev._id) ? String(ev._id) : Date.now()}@tee-time-brs`;
  const summary = eventCalendarSummary(ev);
  const description = eventCalendarDescription(ev);
  const location = ev && ev.course ? String(ev.course).trim() : 'Golf Course';
  const url = `${SITE_URL}?event=${(ev && ev._id) ? String(ev._id) : ''}`;
  const alarms = ICS_REMINDER_MINUTES.flatMap((minutes) => ([
    'BEGIN:VALARM',
    `TRIGGER:-PT${minutes}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Tee time reminder: ${summary}`)}`,
    'END:VALARM',
  ]));

  return [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatIcsUtcStamp(stampDate)}`,
    timing.allDay
      ? `DTSTART;VALUE=DATE:${formatIcsDateValue(timing.startDate)}`
      : `DTSTART:${formatIcsFloatingDateTime(timing.start)}`,
    timing.allDay
      ? `DTEND;VALUE=DATE:${formatIcsDateValue(timing.endDate)}`
      : `DTEND:${formatIcsFloatingDateTime(timing.end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `URL:${escapeIcsText(url)}`,
    'STATUS:CONFIRMED',
    ...alarms,
    'END:VEVENT',
  ];
}

function buildEventIcs(ev) {
  const eventLines = buildIcsEventLines(ev);
  if (!eventLines) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tee Time Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventLines,
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function buildEventsIcs(events = [], opts = {}) {
  const calName = String(opts.calName || 'Tee Time Events').trim();
  const calDesc = String(opts.calDesc || 'Golf events from Tee Time Manager').trim();
  const stampDate = opts.stampDate instanceof Date ? opts.stampDate : new Date();
  const sorted = Array.isArray(events) ? events.slice() : [];
  sorted.sort((a, b) => {
    const ta = eventCalendarTiming(a);
    const tb = eventCalendarTiming(b);
    const aStamp = ta ? (ta.allDay ? ta.startDate.getTime() : ta.start.getTime()) : Number.MAX_SAFE_INTEGER;
    const bStamp = tb ? (tb.allDay ? tb.startDate.getTime() : tb.start.getTime()) : Number.MAX_SAFE_INTEGER;
    return aStamp - bStamp;
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tee Time Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    `X-WR-CALDESC:${escapeIcsText(calDesc)}`,
  ];
  for (const ev of sorted) {
    const eventLines = buildIcsEventLines(ev, stampDate);
    if (eventLines) lines.push(...eventLines);
  }
  lines.push(
    'END:VCALENDAR',
  );
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function getScopedAdminCode(req) {
  return String(req.headers['x-admin-code'] || req.query.code || req.body?.code || '').trim();
}

function getDestructiveAdminCode(req) {
  return String(
    req.headers['x-admin-delete-code']
      || req.query.deleteCode
      || req.body?.deleteCode
      || getScopedAdminCode(req)
      || ''
  ).trim();
}

function getDestructiveConfirmCode(req) {
  return String(
    req.headers['x-admin-confirm-code']
      || req.query.confirmCode
      || req.body?.confirmCode
      || ''
  ).trim();
}

function isSiteAdmin(req) {
  const code = getScopedAdminCode(req);
  return Boolean(SITE_ADMIN_WRITE_CODE && code === SITE_ADMIN_WRITE_CODE);
}

function isSiteAdminCode(code = '') {
  return Boolean(SITE_ADMIN_WRITE_CODE && String(code || '').trim() === SITE_ADMIN_WRITE_CODE);
}

function isAdminDelete(req) {
  const code = getDestructiveAdminCode(req);
  return Boolean(ADMIN_DESTRUCTIVE_CODE && code === ADMIN_DESTRUCTIVE_CODE);
}

function hasDeleteActionConfirmed(req) {
  const raw = String(
    req.headers['x-delete-confirmed']
      || req.query.confirmed
      || req.body?.confirmed
      || ''
  ).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function hasDestructiveConfirm(req) {
  if (!ADMIN_DESTRUCTIVE_CONFIRM_CODE) return true;
  return getDestructiveConfirmCode(req) === ADMIN_DESTRUCTIVE_CONFIRM_CODE;
}

function backupIdFromDate(date = new Date()) {
  const iso = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `backup-${iso.replace(/[:]/g, '-').replace(/\./g, '-').replace('T', '_')}`;
}

function formatDateKeyInTZ(date = new Date(), timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function weekKeyInTZ(date = new Date(), timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 1);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function isSafeBackupSegment(value = '') {
  return /^[A-Za-z0-9._-]+$/.test(String(value || ''));
}

async function ensureConnectionReady(conn) {
  if (!conn) throw new Error('Database connection is unavailable');
  if (conn.readyState === 1) return conn;
  if (conn.readyState === 2) {
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        conn.off('error', onError);
        resolve();
      };
      const onError = (error) => {
        conn.off('open', onOpen);
        reject(error);
      };
      conn.once('open', onOpen);
      conn.once('error', onError);
    });
    return conn;
  }
  throw new Error('Database connection is not ready');
}

async function walkSnapshotFiles(absPath, relPath = '', files = []) {
  const stat = await fsp.stat(absPath);
  if (stat.isDirectory()) {
    const entries = await fsp.readdir(absPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'backups') continue;
      await walkSnapshotFiles(path.join(absPath, entry.name), path.join(relPath, entry.name), files);
    }
    return files;
  }
  const raw = await fsp.readFile(absPath);
  files.push({
    path: relPath.replace(/\\/g, '/'),
    size: raw.length,
    encoding: 'base64',
    data: raw.toString('base64'),
  });
  return files;
}

async function buildSiteSnapshotFile(destFile) {
  const files = [];
  for (const target of SITE_BACKUP_TARGETS) {
    const absTarget = path.join(__dirname, target);
    try {
      await fsp.access(absTarget);
    } catch (_err) {
      continue;
    }
    await walkSnapshotFiles(absTarget, target, files);
  }
  const totalBytes = files.reduce((sum, entry) => sum + Number(entry.size || 0), 0);
  const payload = {
    createdAt: new Date().toISOString(),
    root: __dirname,
    targets: SITE_BACKUP_TARGETS.slice(),
    fileCount: files.length,
    totalBytes,
    files,
  };
  await fsp.writeFile(destFile, zlib.gzipSync(Buffer.from(JSON.stringify(payload))), 'binary');
  return {
    fileCount: files.length,
    totalBytes,
  };
}

async function buildDatabaseSnapshotFile(conn, label, destFile) {
  const readyConn = await ensureConnectionReady(conn);
  const db = readyConn.db;
  const collections = await db.listCollections().toArray();
  const collectionSummaries = [];
  const exportPayload = {
    label,
    createdAt: new Date().toISOString(),
    databaseName: db.databaseName,
    collections: {},
  };

  for (const collection of collections) {
    const name = String(collection && collection.name || '').trim();
    if (!name || name.startsWith('system.')) continue;
    const nativeCollection = db.collection(name);
    const [documents, indexes] = await Promise.all([
      nativeCollection.find({}).toArray(),
      nativeCollection.indexes().catch(() => ([])),
    ]);
    exportPayload.collections[name] = {
      indexes,
      documents,
    };
    collectionSummaries.push({
      name,
      count: documents.length,
    });
  }

  const serialized = EJSON.stringify(exportPayload, null, 2, { relaxed: false });
  await fsp.writeFile(destFile, zlib.gzipSync(Buffer.from(serialized, 'utf8')), 'binary');
  return {
    databaseName: db.databaseName,
    collectionCount: collectionSummaries.length,
    documentCount: collectionSummaries.reduce((sum, row) => sum + Number(row.count || 0), 0),
    collections: collectionSummaries,
  };
}

async function statFileSafe(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch (_err) {
    return null;
  }
}

async function loadBackupManifest(backupId) {
  if (!isSafeBackupSegment(backupId)) throw new Error('Invalid backup id');
  const manifestPath = path.join(BACKUP_ROOT, backupId, 'manifest.json');
  return JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
}

async function pruneBackupRetention(retainCount = BACKUP_SETTINGS_DEFAULTS.retainCount) {
  const keep = Math.max(1, Number(retainCount) || BACKUP_SETTINGS_DEFAULTS.retainCount);
  const backups = await listAdminBackups();
  if (backups.length <= keep) return { removed: [] };
  const removable = backups.slice(keep);
  const removed = [];
  for (const backup of removable) {
    const backupId = String(backup && backup.id || '').trim();
    if (!isSafeBackupSegment(backupId)) continue;
    const backupDir = path.join(BACKUP_ROOT, backupId);
    await fsp.rm(backupDir, { recursive: true, force: true });
    removed.push(backupId);
  }
  return { removed };
}

async function loadDatabaseSnapshotFile(filePath) {
  const raw = await fsp.readFile(filePath);
  return EJSON.parse(zlib.gunzipSync(raw).toString('utf8'), { relaxed: false });
}

function buildRestoreIndexes(indexes = []) {
  return indexes
    .filter((index) => index && index.name && index.name !== '_id_' && index.key)
    .map((index) => {
      const options = {
        name: index.name,
      };
      if (index.unique) options.unique = true;
      if (index.sparse) options.sparse = true;
      if (index.expireAfterSeconds !== undefined) options.expireAfterSeconds = index.expireAfterSeconds;
      return { key: index.key, ...options };
    });
}

async function restoreDatabaseFromSnapshot(conn, snapshot = {}, label = 'database') {
  const readyConn = await ensureConnectionReady(conn);
  const db = readyConn.db;
  const collectionEntries = Object.entries(snapshot && snapshot.collections && typeof snapshot.collections === 'object'
    ? snapshot.collections
    : {});
  const targetNames = new Set(collectionEntries.map(([name]) => name));
  const existing = await db.listCollections().toArray();
  for (const collection of existing) {
    const name = String(collection && collection.name || '').trim();
    if (!name || name.startsWith('system.')) continue;
    await db.collection(name).drop().catch(() => {});
  }

  for (const [name, payload] of collectionEntries) {
    const documents = Array.isArray(payload && payload.documents) ? payload.documents : [];
    const indexes = buildRestoreIndexes(Array.isArray(payload && payload.indexes) ? payload.indexes : []);
    await db.createCollection(name).catch((error) => {
      if (!/already exists/i.test(String(error && error.message || ''))) throw error;
    });
    const collection = db.collection(name);
    if (documents.length) {
      await collection.insertMany(documents, { ordered: true });
    }
    if (indexes.length) {
      await collection.createIndexes(indexes);
    }
  }

  return {
    label,
    databaseName: db.databaseName,
    collectionCount: targetNames.size,
    documentCount: collectionEntries.reduce((sum, [, payload]) => sum + (Array.isArray(payload && payload.documents) ? payload.documents.length : 0), 0),
  };
}

async function createAdminBackupBundle() {
  const backupSettings = await getBackupSettings();
  const id = backupIdFromDate(new Date());
  const backupDir = path.join(BACKUP_ROOT, id);
  await fsp.mkdir(backupDir, { recursive: true });

  const primaryFile = path.join(backupDir, 'primary-db.ejson.gz');
  const secondaryFile = path.join(backupDir, 'secondary-db.ejson.gz');
  const siteFile = path.join(backupDir, 'site-snapshot.json.gz');
  const manifestFile = path.join(backupDir, 'manifest.json');
  const secondaryConn = getSecondaryConn();

  const [primarySummary, secondarySummary, siteSummary] = await Promise.all([
    buildDatabaseSnapshotFile(mongoose.connection, 'primary', primaryFile),
    secondaryConn
      ? buildDatabaseSnapshotFile(secondaryConn, 'secondary', secondaryFile)
      : Promise.resolve({
        databaseName: null,
        collectionCount: 0,
        documentCount: 0,
        collections: [],
        available: false,
      }),
    buildSiteSnapshotFile(siteFile),
  ]);

  const primaryStat = await statFileSafe(primaryFile);
  const secondaryStat = await statFileSafe(secondaryFile);
  const siteStat = await statFileSafe(siteFile);
  const files = [
    { name: 'primary-db.ejson.gz', size: primaryStat ? primaryStat.size : 0 },
    { name: 'site-snapshot.json.gz', size: siteStat ? siteStat.size : 0 },
  ];
  if (secondaryStat) files.splice(1, 0, { name: 'secondary-db.ejson.gz', size: secondaryStat.size });
  const manifest = {
    id,
    createdAt: new Date().toISOString(),
    app: {
      siteUrl: SITE_URL,
      nodeVersion: process.version,
    },
    files,
    databases: {
      primary: primarySummary,
      secondary: secondarySummary,
    },
    site: siteSummary,
    retention: {
      retainCount: backupSettings.retainCount,
    },
    notes: [
      'Database files are EJSON gzip exports.',
      'Site snapshot file is a gzip JSON package of application files.',
      'Store a copy of this backup outside the server machine for disaster recovery.',
    ],
  };
  await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  const retention = await pruneBackupRetention(backupSettings.retainCount);
  if (retention.removed.length) manifest.retention.removed = retention.removed;
  await updateBackupStatus({
    lastSuccessfulBackupAt: manifest.createdAt,
    lastSuccessfulBackupId: manifest.id,
    lastSuccessfulBackupBytes: files.reduce((sum, file) => sum + Number(file && file.size || 0), 0),
    lastFailureAt: null,
    lastFailureMessage: '',
  });
  return manifest;
}

async function listAdminBackups() {
  await fsp.mkdir(BACKUP_ROOT, { recursive: true });
  const entries = await fsp.readdir(BACKUP_ROOT, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeBackupSegment(entry.name)) continue;
    const dirPath = path.join(BACKUP_ROOT, entry.name);
    const manifestPath = path.join(dirPath, 'manifest.json');
    try {
      const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
      backups.push(manifest);
    } catch (_err) {
      const stat = await fsp.stat(dirPath).catch(() => null);
      backups.push({
        id: entry.name,
        createdAt: stat ? stat.mtime.toISOString() : null,
        files: [],
        note: 'Manifest missing',
      });
    }
  }
  backups.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return backups;
}

function monthKeyInTZ(date = new Date(), timeZone = LOCAL_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  return `${year}-${month}`;
}

function monthInActiveSeason(settings, date = new Date(), timeZone = LOCAL_TZ) {
  if (!settings.activeSeasonOnly) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'numeric',
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
  const start = Number(settings.activeSeasonStartMonth || 1);
  const end = Number(settings.activeSeasonEndMonth || 12);
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

function nextScheduledBackupAt(settings, now = new Date(), timeZone = LOCAL_TZ) {
  const candidates = [];
  const start = new Date(now.getTime() + 60000);
  for (let dayOffset = 0; dayOffset < 400; dayOffset += 1) {
    const cursor = new Date(start.getTime() + (dayOffset * 86400000));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(cursor);
    const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
    const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
    const day = Number(parts.find((part) => part.type === 'day')?.value || 1);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (settings.monthlyEnabled && day === Number(settings.monthlyDay || 1)) {
      candidates.push(new Date(year, month - 1, day, Number(settings.monthlyHour || 0), Number(settings.monthlyMinute || 0), 0, 0));
    }
    if (settings.weeklyEnabled && weekday === Number(settings.weeklyDay || 0)) {
      candidates.push(new Date(year, month - 1, day, Number(settings.weeklyHour || 0), Number(settings.weeklyMinute || 0), 0, 0));
    }
    if (settings.dailyEnabled && monthInActiveSeason(settings, cursor, timeZone)) {
      candidates.push(new Date(year, month - 1, day, Number(settings.dailyHour || 0), Number(settings.dailyMinute || 0), 0, 0));
    }
    const valid = candidates.filter((candidate) => candidate.getTime() > now.getTime());
    if (valid.length) {
      valid.sort((a, b) => a.getTime() - b.getTime());
      return valid[0].toISOString();
    }
  }
  return null;
}

function buildBackupOverview(backups = [], settings = {}, status = {}) {
  const latest = Array.isArray(backups) && backups.length ? backups[0] : null;
  const lastSuccessfulBackupAt = status.lastSuccessfulBackupAt || (latest && latest.createdAt) || null;
  const lastSuccessfulBackupId = status.lastSuccessfulBackupId || (latest && latest.id) || '';
  const lastSuccessfulBackupBytes = Number(status.lastSuccessfulBackupBytes || 0) || (
    latest ? (Array.isArray(latest.files) ? latest.files.reduce((sum, file) => sum + Number(file && file.size || 0), 0) : 0) : 0
  );
  const warnings = [];
  if (!lastSuccessfulBackupAt) warnings.push('No successful backups have been recorded yet.');
  if (!settings.offsiteCopyEnabled) warnings.push('Off-machine copy is not configured.');
  if (status.lastFailureAt && (!lastSuccessfulBackupAt || new Date(status.lastFailureAt).getTime() > new Date(lastSuccessfulBackupAt).getTime())) {
    warnings.push(`Most recent backup failure: ${status.lastFailureMessage || status.lastFailureAt}`);
  }
  return {
    lastSuccessfulBackupAt,
    lastSuccessfulBackupId,
    lastSuccessfulBackupBytes,
    lastFailureAt: status.lastFailureAt || null,
    lastFailureMessage: status.lastFailureMessage || '',
    nextScheduledBackupAt: nextScheduledBackupAt(settings),
    warnings,
  };
}
function buildDedupeKey(dateVal, teeTimes = [], isTeam = false) {
  if (isTeam) return null;
  if (!dateVal || !Array.isArray(teeTimes) || !teeTimes.length) return null;
  const d = asUTCDate(dateVal);
  if (isNaN(d)) return null;
  const dateISO = d.toISOString().slice(0, 10);
  const times = teeTimes.map((t) => t && t.time).filter(Boolean).sort();
  if (!times.length) return null;
  return `${dateISO}|${times.join(',')}`;
}
function btn(label='Go to Sign-up Page'){
  return `<p style="margin:24px 0"><a href="${esc(SITE_URL)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`;
}
function frame(title, body){
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:10px;padding:24px;border:1px solid #e5e7eb"><tr><td><h2 style="margin:0 0 12px 0;color:#111827;font-size:20px">${esc(title)}</h2>${body}<p style="color:#6b7280;font-size:12px;margin-top:24px">You received this because you subscribed to tee time updates.</p></td></tr></table></td></tr></table>`;
}
function reminderEmail(blocks, opts = {}){
  // blocks: [{course, dateISO, dateLong, empties: ['08:18 AM','08:28 AM']}]
  if (!blocks.length) return '';
  const { daysAhead = 1 } = opts;
  const when = daysAhead === 2 ? 'in 2 days' : 'Tomorrow';
  const expl = daysAhead === 2
    ? '<p><strong>This is a 48-hour advance notice.</strong> These tee times are still empty for events happening in 2 days. Grab a spot if you want to play!</p>'
    : '<p>These tee times are still empty. Grab a spot:</p>';
  const rows = blocks.map(b=>{
    const list = b.empties.map(t=>`<li>${esc(t)}</li>`).join('');
    return `<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
      <p style="margin:0 0 6px 0"><strong>${esc(b.course)}</strong> — ${esc(b.dateLong)} (${esc(b.dateISO)})</p>
      <p style="margin:0 0 6px 0">Empty tee times:</p>
      <ul style="margin:0 0 0 18px">${list}</ul>
    </div>`;
  }).join('');
  return frame(`Reminder: Empty Tee Times ${when}`, `${expl}${rows}${btn('Go to Sign-up Page')}`);
}

function brianJonesEmptyTeeAlertEmail(blocks){
  if (!blocks.length) return '';
  const rows = blocks.map((b) => {
    const list = b.empties.map((t) => `<li>${esc(t)}</li>`).join('');
    return `<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
      <p style="margin:0 0 6px 0"><strong>${esc(b.course)}</strong> — ${esc(b.dateLong)} (${esc(b.dateISO)})</p>
      <p style="margin:0 0 6px 0">Empty tee times:</p>
      <ul style="margin:0 0 0 18px">${list}</ul>
    </div>`;
  }).join('');
  return frame('Alert: Empty Tee Times Tomorrow', `<p>The following tee times are still empty for tomorrow.</p>${rows}${btn('Go to Sign-up Page')}`);
}

async function runBrianJonesTomorrowEmptyTeeAlert(label = 'manual'){
  const blocks = await findEmptyTeeTimesForDay(1);
  if (!blocks.length) {
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'brian-empty-alert-skip', reason:'no empty tees', label }));
    return { ok: true, sent: 0, to: CLUB_EMAIL, message: 'No empty tee times for tomorrow' };
  }
  const subject = 'Alert: Empty Tee Times for Tomorrow';
  const html = brianJonesEmptyTeeAlertEmail(blocks);
  const httpRes = await sendEmailViaResendApi(CLUB_EMAIL, subject, html);
  if (httpRes && httpRes.ok) {
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'brian-empty-alert-sent', method:'http', label, to:CLUB_EMAIL, events: blocks.length }));
    return { ok: true, sent: 1, method: 'http', to: CLUB_EMAIL, events: blocks.length };
  }
  const smtpRes = await sendEmail(CLUB_EMAIL, subject, html);
  if (smtpRes && smtpRes.ok) {
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'brian-empty-alert-sent', method:'smtp', label, to:CLUB_EMAIL, events: blocks.length }));
    return { ok: true, sent: 1, method: 'smtp', to: CLUB_EMAIL, events: blocks.length };
  }
  const error = (httpRes && httpRes.error && httpRes.error.message) || (smtpRes && smtpRes.error && smtpRes.error.message) || 'Unknown email error';
  console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'brian-empty-alert-failed', label, to:CLUB_EMAIL, error }));
  return { ok: false, sent: 0, to: CLUB_EMAIL, error };
}

async function checkEmptyTeeTimesForAdminAlert() {
  const blocks24 = await findEmptyTeeTimesForDay(1);
  const blocks48 = await findEmptyTeeTimesForDay(2);

  if (!blocks24.length && !blocks48.length) {
    return { ok: true, sent: 0, message: 'No empty tee times' };
  }

  const renderSection = (blocks, title) => {
    if (!blocks.length) return '';
    const rows = blocks.map(b => {
      const list = b.empties.map(t => `<li>${esc(t)}</li>`).join('');
      return `<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
        <p style="margin:0 0 6px 0"><strong>${esc(b.course)}</strong> — ${esc(b.dateLong)} (${esc(b.dateISO)})</p>
        <p style="margin:0 0 6px 0">Empty tee times:</p>
        <ul style="margin:0 0 0 18px">${list}</ul>
      </div>`;
    }).join('');
    return `<h3 style="margin:8px 0 4px 0;">${title}</h3>${rows}`;
  };

  const body = `${renderSection(blocks24, 'Empty tee times in next 24 hours')}${renderSection(blocks48, 'Empty tee times in next 48 hours')}${btn('Go to Sign-up Page')}`;
  const res = await sendAdminAlert('Admin Alert: Empty Tee Times', body);
  return { ok: true, sent: res.sent, counts: { within24: blocks24.length, within48: blocks48.length } };
}

/* local YMD in a TZ */
function ymdInTZ(d=new Date(), tz='America/New_York'){
  const fmt = new Intl.DateTimeFormat('en-CA',{ timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(d); // YYYY-MM-DD
}
function addDaysUTC(d, days){ const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate()+days); return x; }

/* ---------------- Anti-chaos helpers ---------------- */
// Check if a player name already exists in any tee time (case-insensitive)
function isDuplicatePlayerName(ev, playerName, excludeTeeId = null) {
  const normalizedName = String(playerName).trim().toLowerCase();
  for (const tt of (ev.teeTimes || [])) {
    if (excludeTeeId && String(tt._id) === String(excludeTeeId)) continue;
    for (const p of (tt.players || [])) {
      if (String(p.name).trim().toLowerCase() === normalizedName) {
        return true;
      }
    }
  }
  return false;
}

// Check if a player is already on another tee time (case-insensitive)
function isPlayerOnAnotherTee(ev, playerName, currentTeeId) {
  const normalizedName = String(playerName).trim().toLowerCase();
  for (const tt of (ev.teeTimes || [])) {
    if (String(tt._id) === String(currentTeeId)) continue;
    for (const p of (tt.players || [])) {
      if (String(p.name).trim().toLowerCase() === normalizedName) {
        return { found: true, teeId: tt._id, teeName: tt.name || tt.time };
      }
    }
  }
  return { found: false };
}

// Get human-readable label for a tee/team
function getTeeLabel(ev, teeId) {
  const tt = ev.teeTimes.id(teeId);
  if (!tt) return 'Unknown';
  if (ev.isTeamEvent) {
    if (tt.name) return tt.name;
    const idx = ev.teeTimes.findIndex(t => String(t._id) === String(teeId));
    return `Team ${idx + 1}`;
  }
  return tt.time ? fmt.tee(tt.time) : 'Unknown';
}

function findNextOpenSlot(ev, preferredTeeId = null) {
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (preferredTeeId) {
    const preferred = ev.teeTimes.id(preferredTeeId);
    if (preferred) {
      if (!Array.isArray(preferred.players)) preferred.players = [];
      if (preferred.players.length < maxSize) return preferred;
      return null;
    }
  }
  for (const tt of (ev.teeTimes || [])) {
    if (!Array.isArray(tt.players)) tt.players = [];
    if (tt.players.length < maxSize) return tt;
  }
  return null;
}

// Log audit entry
async function logAudit(eventId, action, playerName, data = {}) {
  if (!AuditLog) return;
  try {
    await AuditLog.create({
      eventId,
      action,
      playerName: String(playerName).trim(),
      teeId: data.teeId,
      fromTeeId: data.fromTeeId,
      toTeeId: data.toTeeId,
      teeLabel: data.teeLabel,
      fromTeeLabel: data.fromTeeLabel,
      toTeeLabel: data.toTeeLabel,
      timestamp: new Date()
    });
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

/* ---------------- Core API (unchanged parts trimmed for brevity) ---------------- */
function genTeeTimes(startHHMM, count=3, mins=10) {
  if (!startHHMM) startHHMM = '08:00'; // Default to 08:00 if no time provided
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

/* Helper: compute next tee time by searching last valid time and adding mins (default 9), wrap at 24h */
function nextTeeTimeForEvent(ev, mins = 9, defaultTime = '07:00') {
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

function buildCalendarSummaryForEvents(events = []) {
  const summaryByDate = new Map();
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const ev of (events || [])) {
    const dateISO = fmt.dateISO(ev && ev.date);
    if (!dateISO) continue;
    const [year, month, day] = dateISO.split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) continue;
    const entry = summaryByDate.get(dateISO) || {
      date: dateISO,
      eventCount: 0,
      teamEventCount: 0,
      urgentTeeEventCount: 0,
      nonBlueRidgeTeeEventCount: 0,
    };
    entry.eventCount += 1;
    if (ev && ev.isTeamEvent) {
      entry.teamEventCount += 1;
    } else {
      const courseName = String((ev && ev.course) || '').trim().toLowerCase();
      const isBlueRidgeShadows = /blue\s*ridge\s*shadows/.test(courseName);
      if (courseName && !isBlueRidgeShadows) entry.nonBlueRidgeTeeEventCount += 1;
      const eventDayUtc = Date.UTC(year, month - 1, day);
      const daysUntil = Math.round((eventDayUtc - todayUtc) / DAY_MS);
      if (daysUntil >= 0 && daysUntil <= 3) entry.urgentTeeEventCount += 1;
    }
    summaryByDate.set(dateISO, entry);
  }

  return Array.from(summaryByDate.values()).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function normalizePlayerName(name = '') {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getHandicapIndexByNameMap(playerNames = []) {
  const byName = new Map();
  if (!Handicap || !playerNames.length) return byName;
  const normalizedWanted = new Set(playerNames.map((n) => normalizePlayerName(n)).filter(Boolean));
  if (!normalizedWanted.size) return byName;
  const handicaps = await Handicap.find({}, { name: 1, handicapIndex: 1 }).lean();
  for (const h of handicaps) {
    const key = normalizePlayerName(h.name);
    if (!key || !normalizedWanted.has(key) || byName.has(key)) continue;
    const idx = Number(h.handicapIndex);
    byName.set(key, Number.isFinite(idx) ? idx : null);
  }
  return byName;
}

async function buildPairingSuggestion(ev) {
  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  const sourcePlayers = [];
  for (const tt of (ev.teeTimes || [])) {
    for (const p of (tt.players || [])) {
      const playerId = String(p._id);
      const name = String(p.name || '').trim();
      if (!name) continue;
      const item = {
        playerId,
        name,
        sourceTeeId: String(tt._id),
        sourceLabel: ev.isTeamEvent ? (tt.name || 'Team') : fmt.tee(tt.time)
      };
      sourcePlayers.push(item);
    }
  }
  if (!sourcePlayers.length) {
    return { groupSize: maxSize, groups: [], totalPlayers: 0, unassignedPlayers: [] };
  }

  const handicapMap = await getHandicapIndexByNameMap(sourcePlayers.map((p) => p.name));
  const playersWithHcp = sourcePlayers.map((p) => {
    const normalized = normalizePlayerName(p.name);
    const handicapIndex = handicapMap.has(normalized) ? handicapMap.get(normalized) : null;
    return { ...p, handicapIndex };
  });

  playersWithHcp.sort((a, b) => {
    const aIdx = Number.isFinite(a.handicapIndex) ? a.handicapIndex : 999;
    const bIdx = Number.isFinite(b.handicapIndex) ? b.handicapIndex : 999;
    if (aIdx !== bIdx) return bIdx - aIdx;
    return a.name.localeCompare(b.name);
  });

  const groupCount = Math.max(1, Math.ceil(playersWithHcp.length / maxSize));
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    index,
    teeId: ev.teeTimes[index] ? String(ev.teeTimes[index]._id) : null,
    players: [],
    totalHandicap: 0,
    knownHandicapCount: 0
  }));

  for (const player of playersWithHcp) {
    const candidates = groups.filter((g) => g.players.length < maxSize);
    candidates.sort((a, b) => {
      if (a.totalHandicap !== b.totalHandicap) return a.totalHandicap - b.totalHandicap;
      return a.players.length - b.players.length;
    });
    const target = candidates[0];
    target.players.push(player);
    if (Number.isFinite(player.handicapIndex)) {
      target.totalHandicap += player.handicapIndex;
      target.knownHandicapCount += 1;
    }
  }

  const outputGroups = groups.map((g, index) => {
    const existingSlot = ev.teeTimes[index];
    const label = ev.isTeamEvent
      ? (existingSlot?.name || `Team ${index + 1}`)
      : (existingSlot?.time ? fmt.tee(existingSlot.time) : `Group ${index + 1}`);
    return {
      teeId: g.teeId,
      label,
      playerCount: g.players.length,
      avgHandicap: g.knownHandicapCount ? Number((g.totalHandicap / g.knownHandicapCount).toFixed(1)) : null,
      players: g.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        handicapIndex: p.handicapIndex,
        sourceTeeId: p.sourceTeeId,
        sourceLabel: p.sourceLabel
      }))
    };
  });

  return {
    groupSize: maxSize,
    groups: outputGroups,
    totalPlayers: playersWithHcp.length,
    unassignedPlayers: []
  };
}

app.get('/api/events', cacheJson(10 * 1000), async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

app.get('/api/events/calendar/summary', cacheJson(10 * 1000), async (req, res) => {
  try {
    const localYmd = ymdInTZ(new Date(), LOCAL_TZ);
    const [defaultYear, defaultMonth] = localYmd.split('-').map((v) => Number(v));
    const year = Number(req.query.year || defaultYear);
    const month = Number(req.query.month || defaultMonth);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year; use YYYY' });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month; use 1-12' });
    }
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const events = await Event.find(
      { date: { $gte: start, $lt: end } },
      { date: 1, isTeamEvent: 1, course: 1 }
    ).lean();
    res.json({
      year,
      month,
      days: buildCalendarSummaryForEvents(events),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events/calendar/month.ics', async (req, res) => {
  try {
    const localYmd = ymdInTZ(new Date(), LOCAL_TZ);
    const [defaultYear, defaultMonth] = localYmd.split('-').map((v) => Number(v));
    const year = Number(req.query.year || defaultYear);
    const month = Number(req.query.month || defaultMonth);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year; use YYYY' });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month; use 1-12' });
    }

    const includeTeamEvents = ['1', 'true', 'yes'].includes(String(req.query.includeTeams || '').trim().toLowerCase());
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const query = {
      date: { $gte: start, $lt: end },
      ...(includeTeamEvents ? {} : { isTeamEvent: false }),
    };
    const events = await Event.find(query).lean();

    const monthLabel = `${year}-${twoDigits(month)}`;
    const calName = includeTeamEvents ? `Golf Events ${monthLabel}` : `Tee Times ${monthLabel}`;
    const calDesc = includeTeamEvents
      ? `Monthly golf events export for ${monthLabel}`
      : `Monthly tee-time export for ${monthLabel}`;
    const icsBody = buildEventsIcs(events, { calName, calDesc });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tee-times-${monthLabel}.ics"`);
    res.send(icsBody);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events/by-date', cacheJson(10 * 1000), async (req, res) => {
  try {
    const dateISO = String(req.query.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return res.status(400).json({ error: 'Invalid date; use YYYY-MM-DD' });
    }
    const start = new Date(`${dateISO}T00:00:00.000Z`);
    const end = new Date(start.getTime() + (24 * 60 * 60 * 1000));
    const events = await Event.find({ date: { $gte: start, $lt: end } }).sort({ date: 1, createdAt: 1 }).lean();
    res.json({ date: dateISO, events });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch a single event by id for targeted refreshes
app.get('/api/events/:id', cacheJson(10 * 1000), async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id).lean();
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events/:id/calendar.ics', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id).lean();
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    const icsBody = buildEventIcs(ev);
    if (!icsBody) return res.status(400).json({ error: 'Unable to build calendar event' });
    const filename = eventCalendarFileName(ev);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(icsBody);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', validateBody(validateCreateEvent), async (req, res) => {
  try {
    const { course, courseInfo, date, teeTime, teeTimes, notes, isTeamEvent, teamSizeMax, teamStartType, teamStartTime } = req.body || {};
    let tt;
    if (isTeamEvent) {
      // Generate 3 default teams for team events
      const startType = teamStartType || 'shotgun';
      if (!teamStartTime) return res.status(400).json({ error: 'teamStartTime required for team events' });
      if (startType === 'shotgun') {
        // Shotgun start: all teams use the same time
        tt = [
          { name: 'Team 1', time: teamStartTime, players: [] },
          { name: 'Team 2', time: teamStartTime, players: [] },
          { name: 'Team 3', time: teamStartTime, players: [] }
        ];
      } else {
        // Tee time start: teams use staggered times (9 minutes apart)
        const times = genTeeTimes(teamStartTime, 3, 9);
        tt = [
          { name: 'Team 1', time: times[0].time, players: [] },
          { name: 'Team 2', time: times[1].time, players: [] },
          { name: 'Team 3', time: times[2].time, players: [] }
        ];
      }
    } else {
      // Generate 3 default tee times for tee-time events
      if (!teeTime) return res.status(400).json({ error: 'teeTime required for tee-time events' });
      tt = Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 9);
    }
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date||'')) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date);
    const dedupeKey = buildDedupeKey(eventDate, tt, !!isTeamEvent);
    const normalizedCourseInfo = normalizeCourseInfo(courseInfo || {});
    const weatherData = await fetchWeatherForEvent({
      course,
      courseInfo: normalizedCourseInfo,
      date: eventDate,
    });
    
    if (dedupeKey) {
      const existing = await Event.findOne({ dedupeKey });
      if (existing) {
        return res.status(200).json(existing);
      }
    }

    let created;
    try {
      created = await Event.create({
        course,
        courseInfo: normalizedCourseInfo,
        date: eventDate,
        notes,
        isTeamEvent: !!isTeamEvent,
        teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
        teeTimes: tt,
        dedupeKey: dedupeKey || undefined,
        weather: {
          condition: weatherData.condition,
          icon: weatherData.icon,
          temp: weatherData.temp,
          tempLow: weatherData.tempLow,
          tempHigh: weatherData.tempHigh,
          rainChance: weatherData.rainChance,
          description: weatherData.description,
          lastFetched: weatherData.lastFetched
        }
      });
    } catch (err) {
      // If another request created the event at the same time, return the existing one
      if (err && err.code === 11000 && dedupeKey) {
        const existing = await Event.findOne({ dedupeKey });
        if (existing) return res.status(200).json(existing);
      }
      throw err;
    }
    res.status(201).json(created);
    const eventUrl = `${SITE_URL}?event=${created._id}`;
    await sendEmailToAll(`New Event: ${created.course} (${fmt.dateISO(created.date)})`,
      frame('A New Golf Event Has Been Scheduled!',
            `<p>The following event is now open for sign-up:</p>
             <p><strong>Event:</strong> ${esc(fmt.dateShortTitle(created.date))}</p>
             <p><strong>Course:</strong> ${esc(created.course||'')}</p>
             <p><strong>Date:</strong> ${esc(fmt.dateLong(created.date))}</p>
             ${(!created.isTeamEvent && created.teeTimes?.[0]?.time) ? `<p><strong>First Tee Time:</strong> ${esc(fmt.tee(created.teeTimes[0].time))}</p>`:''}
             <p>Please <a href="${eventUrl}" style="color:#166534;text-decoration:underline">click here to view this event directly</a> or visit the sign-up page to secure your spot!</p>${btn('Go to Sign-up Page', eventUrl)}`));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const body = req.body || {};
    const { course, courseInfo, date, notes, isTeamEvent, teamSizeMax } = body;
    const hasCourseInfo = Object.prototype.hasOwnProperty.call(body, 'courseInfo');
    let weatherNeedsRefresh = false;

    if (course !== undefined) {
      const prevCourse = String(ev.course || '').trim().toLowerCase();
      const nextCourse = String(course || '').trim();
      const courseChanged = nextCourse.toLowerCase() !== prevCourse;
      ev.course = nextCourse;
      if (courseChanged) {
        weatherNeedsRefresh = true;
        // If the course changed and no courseInfo was provided, clear stale location metadata.
        if (!hasCourseInfo) ev.courseInfo = normalizeCourseInfo({});
      }
    }

    if (hasCourseInfo) {
      ev.courseInfo = normalizeCourseInfo(courseInfo || {});
      weatherNeedsRefresh = true;
    }

    if (date !== undefined) {
      ev.date = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date);
      weatherNeedsRefresh = true;
    }
    if (notes !== undefined) ev.notes = String(notes);
    if (isTeamEvent !== undefined) ev.isTeamEvent = !!isTeamEvent;
    if (teamSizeMax !== undefined) ev.teamSizeMax = Math.max(2, Math.min(4, Number(teamSizeMax || 4)));
    if (weatherNeedsRefresh) {
      const weatherData = await fetchWeatherForEvent(ev);
      assignWeatherToEvent(ev, weatherData);
    }
    // Recompute dedupeKey for tee-time events after changes
    ev.dedupeKey = buildDedupeKey(ev.date, ev.teeTimes, ev.isTeamEvent) || undefined;
    await ev.save();
    res.json(ev);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  if (!isAdminDelete(req)) return res.status(403).json({ error: 'Delete code required' });
  const del = await Event.findByIdAndDelete(req.params.id);
  if (!del) return res.status(404).json({ error: 'Not found' });
  
  // Send response immediately
  res.json({ ok: true });
  
  // Notify subscribers about the cancellation (non-blocking)
  sendEmailToAll(`Event Cancelled: ${del.course} (${fmt.dateISO(del.date)})`,
    frame('Golf Event Cancelled',
          `<p>The following event has been cancelled:</p>
           <p><strong>Event:</strong> ${esc(fmt.dateShortTitle(del.date))}</p>
           <p><strong>Course:</strong> ${esc(del.course||'')}</p>
           <p><strong>Date:</strong> ${esc(fmt.dateLong(del.date))}</p>
           <p>We apologize for any inconvenience.</p>${btn('View Other Events')}`))
    .catch(err => console.error('Failed to send deletion emails:', err));
});

app.post('/api/events/:id/request-extra-tee-time', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });

    const note = String(req.body?.note || '').trim();
    const teeCount = Array.isArray(ev.teeTimes) ? ev.teeTimes.length : 0;
    const teeLabels = (ev.teeTimes || [])
      .map((tt, idx) => {
        if (ev.isTeamEvent) return tt?.name || `Team ${idx + 1}`;
        if (!tt?.time) return `Tee ${idx + 1}`;
        return fmt.tee(tt.time);
      })
      .filter(Boolean)
      .join(', ');

    const clubEmail = CLUB_EMAIL;
    const defaultCcList = ['tommy.knight@gmail.com', 'jvhyers@gmail.com'];
    const envCcList = String(process.env.CLUB_CANCEL_CC || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const ccList = Array.from(new Set([...defaultCcList, ...envCcList]));
    const smtpRecipients = Array.from(new Set([clubEmail, ...ccList]));
    const subj = `Request additional tee time: ${ev.course || 'Course'} ${fmt.dateISO(ev.date)} - KNIGHT GROUP TEE TIMES`;
    const html = `<p>Please add an additional tee time for the event below:</p>
      <ul>
        <li><strong>Course:</strong> ${esc(ev.course || '')}</li>
        <li><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</li>
        <li><strong>Current ${ev.isTeamEvent ? 'teams' : 'tee times'}:</strong> ${teeCount}</li>
        <li><strong>Current list:</strong> ${esc(teeLabels || 'None')}</li>
        <li><strong>Group:</strong> KNIGHT GROUP TEE TIMES</li>
        <li><strong>Source:</strong> Tee Time booking app</li>
      </ul>
      ${note ? `<p><strong>Request note:</strong> ${esc(note)}</p>` : ''}
      <p>Thank you.</p>`;

    const httpRes = await sendEmailViaResendApi(clubEmail, subj, html, ccList.length ? { cc: ccList } : undefined);
    if (httpRes.ok) {
      return res.json({ ok: true, mailMethod: 'http', to: clubEmail, cc: ccList });
    }

    const smtpRes = await sendEmail(smtpRecipients, subj, html);
    if (smtpRes && smtpRes.ok) {
      return res.json({ ok: true, mailMethod: 'smtp', to: smtpRecipients });
    }

    return res.status(500).json({
      error: 'Failed to send additional tee time request',
      details: (smtpRes && smtpRes.error && smtpRes.error.message) || (httpRes.error && httpRes.error.message) || 'Unknown email error',
    });
  } catch (e) {
    console.error('[extra-tee-request] Error', { eventId: req.params.id, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/request-club-time', async (req, res) => {
  try {
    const requestDateRaw = String(req.body?.date || '').trim();
    const preferredTimeRaw = String(req.body?.preferredTime || '').trim();
    const requesterName = String(req.body?.requesterName || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!requestDateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(requestDateRaw)) {
      return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
    }
    if (!preferredTimeRaw || !/^\d{1,2}:\d{2}$/.test(preferredTimeRaw)) {
      return res.status(400).json({ error: 'preferredTime required (HH:MM)' });
    }
    const preferredMinutes = parseHHMMToMinutes(preferredTimeRaw);
    if (preferredMinutes === null) return res.status(400).json({ error: 'invalid preferredTime' });
    if (!requesterName) return res.status(400).json({ error: 'requesterName required' });

    const requestDate = asUTCDate(requestDateRaw);
    if (Number.isNaN(requestDate.getTime())) return res.status(400).json({ error: 'invalid date' });

    const clubEmail = CLUB_EMAIL;
    const defaultCcList = ['tommy.knight@gmail.com', 'jvhyers@gmail.com'];
    const envCcList = String(process.env.CLUB_CANCEL_CC || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const ccList = Array.from(new Set([...defaultCcList, ...envCcList]));
    const smtpRecipients = Array.from(new Set([clubEmail, ...ccList]));
    const preferredTimeText = fmt.tee(preferredTimeRaw);
    const subj = `Request additional tee time: ${fmt.dateISO(requestDate)} ${preferredTimeText} - KNIGHT GROUP TEE TIMES`;
    const html = `<p>Please add an additional tee time for the date below:</p>
      <ul>
        <li><strong>Date requested:</strong> ${esc(fmt.dateLong(requestDate))}</li>
        <li><strong>Preferred time:</strong> ${esc(preferredTimeText)}</li>
        <li><strong>Requested by:</strong> ${esc(requesterName)}</li>
        <li><strong>Group:</strong> KNIGHT GROUP TEE TIMES</li>
        <li><strong>Source:</strong> Monthly calendar request</li>
      </ul>
      ${note ? `<p><strong>Request note:</strong> ${esc(note)}</p>` : ''}
      <p>Thank you.</p>`;

    const httpRes = await sendEmailViaResendApi(clubEmail, subj, html, ccList.length ? { cc: ccList } : undefined);
    if (httpRes.ok) {
      return res.json({ ok: true, mailMethod: 'http', to: clubEmail, cc: ccList });
    }

    const smtpRes = await sendEmail(smtpRecipients, subj, html);
    if (smtpRes && smtpRes.ok) {
      return res.json({ ok: true, mailMethod: 'smtp', to: smtpRecipients });
    }

    return res.status(500).json({
      error: 'Failed to send club time request',
      details: (smtpRes && smtpRes.error && smtpRes.error.message) || (httpRes.error && httpRes.error.message) || 'Unknown email error',
    });
  } catch (e) {
    console.error('[calendar-club-request] Error', { error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

// Remove duplicate tee-time events for the same date/time/tee-count, keeping the requested event
app.post('/api/events/:id/dedupe', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    if (ev.isTeamEvent) return res.status(400).json({ error: 'Dedupe only supported for tee-time events' });
    if (!Array.isArray(ev.teeTimes) || !ev.teeTimes.length || !ev.teeTimes[0].time) {
      return res.status(400).json({ error: 'Event missing tee time data' });
    }

    const baseDate = asUTCDate(ev.date);
    if (isNaN(baseDate)) return res.status(400).json({ error: 'Invalid event date' });

    const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), 23, 59, 59, 999));

    const baseTimes = (ev.teeTimes || []).map((t) => t && t.time).filter(Boolean).sort();
    const baseCount = baseTimes.length;
    if (!baseCount) return res.status(400).json({ error: 'No tee times to match' });
    const baseKey = baseTimes.join('|');

    const candidates = await Event.find({
      isTeamEvent: false,
      date: { $gte: start, $lte: end }
    }).sort({ createdAt: 1 });

    const matches = candidates.filter((e) => {
      const times = (e.teeTimes || []).map((t) => t && t.time).filter(Boolean).sort();
      if (times.length !== baseCount) return false;
      return times.join('|') === baseKey;
    });

    if (matches.length <= 1) {
      return res.json({ ok: true, removed: 0, keptId: ev._id, matched: matches.length });
    }

    // Prefer to keep the requested event; if not in matches, keep the earliest
    const keepId = matches.some((m) => String(m._id) === String(ev._id))
      ? ev._id
      : matches[0]._id;

    const toRemove = matches.filter((m) => String(m._id) !== String(keepId)).map((m) => m._id);
    const delResult = await Event.deleteMany({ _id: { $in: toRemove } });
    console.log('[dedupe] Removed duplicate events', { keepId: String(keepId), removed: delResult.deletedCount, ids: toRemove.map(String) });

    return res.json({ ok: true, keptId: keepId, removed: delResult.deletedCount, removedIds: toRemove, matched: matches.length });
  } catch (e) {
    console.error('[dedupe] Error removing duplicates', e);
    return res.status(500).json({ error: 'Failed to remove duplicates', details: e.message });
  }
});

/* tee/team, players, move endpoints remain as in your current server.js */
app.post('/api/events/:id/tee-times', async (req, res) => {
  // Clean logging: only log errors or important info
  const ev = await Event.findById(req.params.id);
  if (!ev) {
    console.error('[tee-time] Add failed: event not found', { eventId: req.params.id });
    return res.status(404).json({ error: 'Not found' });
  }
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
    // Check if all existing teams have the same time (shotgun) or different times (staggered)
    let time = null;
    if (ev.teeTimes && ev.teeTimes.length > 0) {
      const firstTime = ev.teeTimes[0].time;
      const allSameTime = ev.teeTimes.every(t => t.time === firstTime);
      if (allSameTime) {
        // Shotgun start: use same time as existing teams
        time = firstTime;
      } else {
        // Staggered start: compute next time (9 minutes after last)
        time = nextTeeTimeForEvent(ev, 9, '07:00');
      }
    } else {
      // First team being added, default to 07:00
      time = '07:00';
    }
    // Use $push to add the new team atomically
    const pushResult = await Event.findByIdAndUpdate(
      req.params.id,
      { $push: { teeTimes: { name, time, players: [] } } },
      { new: true }
    );
    console.log('[tee-time] Team added', { eventId: ev._id, teamName: name, time });
    const eventUrl = `${SITE_URL}?event=${ev._id}`;
    sendEmailToAll(
      `New Team Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame('New Team Added!',
        `<p>A new team has been added:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>Team:</strong> ${esc(name)}</p>
         <p>Please <a href="${eventUrl}" style="color:#166534;text-decoration:underline">click here to view this event directly</a>.</p>${btn('View Event', eventUrl)}`)
    ).catch(err => console.error('[tee-time] Failed to send team add email:', err));
    const added = pushResult && pushResult.teeTimes ? pushResult.teeTimes[pushResult.teeTimes.length - 1] : null;
    await logTeeTimeChange({
      eventId: pushResult?._id,
      teeId: added?._id,
      action: 'add',
      labelAfter: added ? (added.name || '') : name,
      isTeamEvent: true,
      course: pushResult?.course,
      dateISO: fmt.dateISO(pushResult?.date),
    });
    return res.json(pushResult);
  }
  // For tee times: accept optional time. If missing, compute next time using event data.
  const { time } = req.body || {};
  let newTime = typeof time === 'string' && time.trim() ? time.trim() : null;
  if (!newTime) {
    newTime = nextTeeTimeForEvent(ev, 9, '07:00');
  }
  // Validate HH:MM and ranges
  const mTime = /^(\d{1,2}):(\d{2})$/.exec(newTime);
  if (!mTime) {
    console.error('[tee-time] Add failed: invalid time format', { eventId: ev._id, time: newTime });
    return res.status(400).json({ error: 'time required HH:MM' });
  }
  const hh = parseInt(mTime[1], 10); const mm = parseInt(mTime[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    console.error('[tee-time] Add failed: invalid time value', { eventId: ev._id, time: newTime });
    return res.status(400).json({ error: 'invalid time' });
  }
  if (ev.teeTimes.some(t => t.time === newTime)) {
    console.error('[tee-time] Add failed: duplicate time', { eventId: ev._id, time: newTime });
    return res.status(409).json({ error: 'duplicate time' });
  }
  ev.teeTimes.push({ time: newTime, players: [] });
  ev.teeTimes.sort((a, b) => {
    const [ah, am] = a.time.split(":").map(Number);
    const [bh, bm] = b.time.split(":").map(Number);
    return ah !== bh ? ah - bh : am - bm;
  });
  await ev.save();
  console.log('[tee-time] Tee time added', { eventId: ev._id, time: newTime });
  const eventUrl = `${SITE_URL}?event=${ev._id}&time=${encodeURIComponent(newTime)}`;
  sendEmailToAll(
    `New Tee Time Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
    frame('New Tee Time Added!',
      `<p>A new tee time has been added:</p>
       <p><strong>Event:</strong> ${esc(ev.course)}</p>
       <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
       <p><strong>Tee Time:</strong> ${esc(fmt.tee(newTime))}</p>
       <p>Please <a href="${eventUrl}" style="color:#166534;text-decoration:underline">click here to view this tee time directly</a>.</p>${btn('View Event', eventUrl)}`)
  ).catch(err => console.error('[tee-time] Failed to send tee add email:', err));
  const added = ev.teeTimes[ev.teeTimes.length - 1];
  await logTeeTimeChange({
    eventId: ev._id,
    teeId: added?._id,
    action: 'add',
    labelAfter: added ? (added.time || '') : newTime,
    isTeamEvent: false,
    course: ev.course,
    dateISO: fmt.dateISO(ev.date),
  });
  res.json(ev);
});


// Edit tee time or team name
app.put('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    const beforeLabel = ev.isTeamEvent ? (tt.name || '') : (tt.time || '');

    if (ev.isTeamEvent) {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
      tt.name = name.trim();
    } else {
      const { time } = req.body || {};
      if (!time || !time.trim()) return res.status(400).json({ error: 'time required' });
      const timeStr = time.trim();
      if (!/^\d{1,2}:\d{2}$/.test(timeStr)) {
        return res.status(400).json({ error: 'time must be HH:MM format' });
      }
      tt.time = timeStr;
    }
    await ev.save();
    const afterLabel = ev.isTeamEvent ? (tt.name || '') : (tt.time || '');
    await logTeeTimeChange({
      eventId: ev._id,
      teeId: tt._id,
      action: 'update',
      labelBefore: beforeLabel,
      labelAfter: afterLabel,
      isTeamEvent: ev.isTeamEvent,
      course: ev.course,
      dateISO: fmt.dateISO(ev.date),
    });
    res.json(ev);
  } catch (e) {
    console.error('Edit tee time error:', e);
    res.status(500).json({ error: e.message });
  }
});


app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const confirmedDelete = hasDeleteActionConfirmed(req);
    const hasDeleteCode = isAdminDelete(req);
    if (!hasDeleteCode && !confirmedDelete) return res.status(403).json({ error: 'Removal confirmation required' });
    const notifyClub = String(req.query.notifyClub || '0') === '1';
    console.log('[tee-time] Remove request', {
      eventId: req.params.id,
      teeId: req.params.teeId,
      notifyClub,
      hasDeleteCode,
      confirmedDelete,
    });

    const ev = await Event.findById(req.params.id);
    if (!ev) {
      console.error('[tee-time] Remove failed: event not found', { eventId: req.params.id });
      return res.status(404).json({ error: 'Not found' });
    }

    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) {
      console.error('[tee-time] Remove failed: tee/team not found', { eventId: req.params.id, teeId: req.params.teeId });
      return res.status(404).json({ error: 'Tee/team not found' });
    }

    const rawTime = tt.time || '';
    const teeLabel = ev.isTeamEvent ? (tt.name || 'Team') : (rawTime ? fmt.tee(rawTime) : 'Tee time');

    tt.deleteOne();
    await ev.save();

    // Notify subscribers (existing behavior) - fire and forget
    sendEmailToAll(
      `${ev.isTeamEvent ? 'Team' : 'Tee Time'} Removed: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame(`${ev.isTeamEvent ? 'Team' : 'Tee Time'} Removed`,
        `<p>A ${ev.isTeamEvent ? 'team' : 'tee time'} has been removed:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         ${btn('View Event')}`)
    ).catch(err => console.error('Failed to send tee/team removal email:', err));

    let mailMethod = null;
    let mailError = null;
    if (notifyClub) {
      const clubEmail = CLUB_EMAIL;
      const subj = `Cancel tee time: ${ev.course || 'Course'} ${fmt.dateISO(ev.date)} ${teeLabel} - KNIGHT GROUP TEE TIMES`;
      const html = `<p>Please cancel the tee time below:</p>
        <ul>
          <li><strong>Course:</strong> ${esc(ev.course || '')}</li>
          <li><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</li>
          <li><strong>Tee time:</strong> ${esc(teeLabel)}</li>
          <li><strong>Group:</strong> KNIGHT GROUP TEE TIMES</li>
          <li><strong>Source:</strong> Tee Time booking app</li>
        </ul>
        <p>Please remove this tee time from your system to release it back to inventory. If already cancelled, no further action needed.</p>`;
      const cc = process.env.CLUB_CANCEL_CC || 'tommy.knight@gmail.com';
      const httpRes = await sendEmailViaResendApi(clubEmail, subj, html, cc ? { cc } : undefined);
      if (httpRes.ok) {
        mailMethod = 'http';
        console.log('[tee-time] Club cancel email sent (HTTP)', { clubEmail, cc, subject: subj, result: httpRes });
      } else {
        console.warn('[tee-time] HTTP send failed, falling back to SMTP', httpRes.error);
        try {
          const mailRes = await sendEmail(clubEmail, subj, html, cc ? { cc } : undefined);
          mailMethod = 'smtp';
          console.log('[tee-time] Club cancel email sent (SMTP fallback)', { clubEmail, cc, subject: subj, result: mailRes });
        } catch (err) {
          mailError = err.message || 'SMTP send failed';
          console.error('Failed to send club cancel email (SMTP)', err);
        }
      }
    }

    await logTeeTimeChange({
      eventId: ev._id,
      teeId: req.params.teeId,
      action: 'delete',
      labelBefore: teeLabel,
      labelAfter: '',
      isTeamEvent: ev.isTeamEvent,
      course: ev.course,
      dateISO: fmt.dateISO(ev.date),
      notifyClub,
      mailMethod,
      mailError,
    });

    if (mailError) {
      return res.status(500).json({ error: 'Failed to send club cancel email', details: mailError, notifyClub: true, eventId: ev._id, teeLabel });
    }

    res.json({ ok: true, notifyClub, eventId: ev._id, teeLabel, mailMethod });
  } catch (e) {
    console.error('[tee-time] Remove error', { eventId: req.params.id, teeId: req.params.teeId, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events/:id/tee-times/:teeId/players', validateBody(validateAddPlayer), async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const trimmedName = String(name).trim();
  if (!trimmedName) return res.status(400).json({ error: 'name cannot be empty' });

  const ev = await Event.findById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const tt = ev.teeTimes.id(req.params.teeId);
  if (!tt) return res.status(404).json({ error: 'tee time not found' });
  if (!Array.isArray(tt.players)) tt.players = [];

  // Extra logging for debugging
  console.log('[add_player] Request', {
    eventId: req.params.id,
    teeId: req.params.teeId,
    playerName: trimmedName,
    eventDate: ev.date,
    now: new Date().toISOString(),
    players: tt.players.map(p => p.name)
  });
  // Special test message for event on 11/16
  const eventDateStr = ev.date instanceof Date ? ev.date.toISOString().slice(0,10) : String(ev.date).slice(0,10);
  if (eventDateStr === '2025-11-16') {
    console.log('[add_player][TEST] Adding player to 11/16 event:', trimmedName);
  }

  const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
  if (tt.players.length >= maxSize) return res.status(400).json({ error: ev.isTeamEvent ? 'team full' : 'tee time full' });

  // Anti-chaos check: duplicate name prevention
  if (isDuplicatePlayerName(ev, trimmedName)) {
    return res.status(409).json({ error: 'duplicate player name', message: 'A player with this name already exists. Use a nickname (e.g., "John S" or "John 2").' });
  }

  tt.players.push({ name: trimmedName, checkedIn: false });
  await ev.save();

  // Audit log
  await logAudit(ev._id, 'add_player', trimmedName, {
    teeId: tt._id,
    teeLabel: getTeeLabel(ev, tt._id)
  });

  // Send notification email only if notifications are enabled
  if (ev.notificationsEnabled !== false) {
    const teeLabel = getTeeLabel(ev, tt._id);
    sendEmailToAll(
      `Player Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame('Player Signed Up!',
        `<p><strong>${esc(trimmedName)}</strong> has signed up for:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>${ev.isTeamEvent ? 'Team' : 'Tee Time'}:</strong> ${esc(teeLabel)}</p>
         ${btn('View Event')}`)
    ).catch(err => console.error('Failed to send player add email:', err));

    const oneSpotLeft = tt.players.length === Math.max(1, maxSize - 1);
    if (oneSpotLeft) {
      sendEmailToAll(
        `Need 1 More: ${ev.course} (${fmt.dateISO(ev.date)})`,
        frame('One Spot Left',
          `<p>${esc(ev.isTeamEvent ? 'Team' : 'Tee time')} <strong>${esc(teeLabel)}</strong> has just one spot left.</p>
           <p><strong>Event:</strong> ${esc(ev.course)}</p>
           <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
           <p>Last call if you want in.</p>
           ${btn('Join This Event')}`)
      ).catch(err => console.error('Failed to send one-spot-left email:', err));
    }
  }

  res.json(ev);
});
app.delete('/api/events/:id/tee-times/:teeId/players/:playerId', async (req, res) => {
  try {
    const confirmedDelete = hasDeleteActionConfirmed(req);
    if (!isAdminDelete(req) && !confirmedDelete) return res.status(403).json({ error: 'Removal confirmation required' });
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    if (!Array.isArray(tt.players)) tt.players = [];
    const idx = tt.players.findIndex(p => String(p._id) === String(req.params.playerId));
    if (idx === -1) return res.status(404).json({ error: 'player not found' });

    // Extra logging for debugging
    const playerName = tt.players[idx].name;
    const teeLabel = getTeeLabel(ev, tt._id);
    console.log('[remove_player] Request', {
      eventId: req.params.id,
      teeId: req.params.teeId,
      playerId: req.params.playerId,
      playerName,
      eventDate: ev.date,
      now: new Date().toISOString(),
      players: tt.players.map(p => p.name)
    });
    // Special test message for event on 11/16
    const eventDateStr = ev.date instanceof Date ? ev.date.toISOString().slice(0,10) : String(ev.date).slice(0,10);
    if (eventDateStr === '2025-11-16') {
      console.log('[remove_player][TEST] Removing player from 11/16 event:', playerName);
    }

    tt.players.splice(idx, 1);
    await ev.save();

    // Audit log
  await logAudit(ev._id, 'remove_player', playerName, {
    teeId: tt._id,
    teeLabel: teeLabel
  });

    if (ev.notificationsEnabled !== false) {
      sendEmailToAll(
        `Player Removed: ${ev.course} (${fmt.dateISO(ev.date)})`,
        frame('Player Removed',
          `<p><strong>${esc(playerName)}</strong> has been removed from:</p>
           <p><strong>Event:</strong> ${esc(ev.course)}</p>
           <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
           <p><strong>${ev.isTeamEvent ? 'Team' : 'Tee Time'}:</strong> ${esc(teeLabel)}</p>
           ${btn('View Event')}`)
      ).catch(err => console.error('Failed to send player removal email:', err));
    }

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
  const playerName = player.name;
  
  // Anti-chaos check: ensure player isn't already on another tee (shouldn't happen, but defensive)
  const conflict = isPlayerOnAnotherTee(ev, playerName, toTeeId);
  if (conflict.found) {
    // Roll back the splice
    fromTT.players.splice(idx, 0, player);
    return res.status(409).json({ error: 'player conflict', message: `${playerName} is already on ${conflict.teeName}` });
  }
  
  toTT.players.push({ name: playerName, checkedIn: !!player.checkedIn });
  await ev.save();
  
  // Audit log
  await logAudit(ev._id, 'move_player', playerName, {
    fromTeeId: fromTT._id,
    toTeeId: toTT._id,
    fromTeeLabel: getTeeLabel(ev, fromTT._id),
    toTeeLabel: getTeeLabel(ev, toTT._id)
  });
  
  res.json(ev);
});

app.post('/api/events/:id/tee-times/:teeId/players/:playerId/check-in', async (req, res) => {
  try {
    const checkedIn = req.body && req.body.checkedIn;
    if (typeof checkedIn !== 'boolean') return res.status(400).json({ error: 'checkedIn boolean required' });

    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    if (!Array.isArray(tt.players)) tt.players = [];
    const p = tt.players.id(req.params.playerId);
    if (!p) return res.status(404).json({ error: 'player not found' });

    p.checkedIn = checkedIn;
    await ev.save();

    await logAudit(ev._id, checkedIn ? 'check_in_player' : 'undo_check_in_player', p.name, {
      teeId: tt._id,
      teeLabel: getTeeLabel(ev, tt._id)
    });

    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events/:id/tee-times/:teeId/check-in-all', async (req, res) => {
  try {
    const checkedIn = req.body && req.body.checkedIn;
    if (typeof checkedIn !== 'boolean') return res.status(400).json({ error: 'checkedIn boolean required' });

    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    if (!Array.isArray(tt.players) || !tt.players.length) return res.status(400).json({ error: 'no players in slot' });

    for (const p of tt.players) p.checkedIn = checkedIn;
    await ev.save();

    await logAudit(ev._id, checkedIn ? 'bulk_check_in' : 'bulk_clear_check_in', 'ALL_PLAYERS', {
      teeId: tt._id,
      teeLabel: getTeeLabel(ev, tt._id)
    });

    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events/:id/pairings/suggest', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id).lean();
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const suggestion = await buildPairingSuggestion(ev);
    res.json({
      eventId: String(ev._id),
      course: ev.course,
      date: ev.date,
      groupSize: suggestion.groupSize,
      totalPlayers: suggestion.totalPlayers,
      groups: suggestion.groups,
      unassignedPlayers: suggestion.unassignedPlayers
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events/:id/pairings/apply', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });

    const suggestion = await buildPairingSuggestion(ev);
    const requestedGroups = Array.isArray(req.body?.groups) ? req.body.groups : suggestion.groups;
    if (!requestedGroups.length) return res.status(400).json({ error: 'No suggested groups to apply' });

    const maxSize = ev.isTeamEvent ? (ev.teamSizeMax || 4) : 4;
    const playerIndex = new Map();
    for (const tt of (ev.teeTimes || [])) {
      for (const p of (tt.players || [])) {
        playerIndex.set(String(p._id), String(p.name || '').trim());
      }
    }

    const seenPlayerIds = new Set();
    const materialized = [];
    for (let i = 0; i < requestedGroups.length; i++) {
      const group = requestedGroups[i] || {};
      const ids = Array.isArray(group.playerIds)
        ? group.playerIds
        : Array.isArray(group.players)
          ? group.players.map((p) => p && (p.playerId || p._id)).filter(Boolean)
          : [];
      if (!ids.length) continue;
      if (ids.length > maxSize) return res.status(400).json({ error: `Group ${i + 1} exceeds max size (${maxSize})` });
      const names = [];
      for (const rawId of ids) {
        const id = String(rawId);
        if (!playerIndex.has(id)) return res.status(400).json({ error: `Unknown player in group ${i + 1}` });
        if (seenPlayerIds.has(id)) return res.status(400).json({ error: `Duplicate player assignment in group ${i + 1}` });
        seenPlayerIds.add(id);
        names.push(playerIndex.get(id));
      }
      materialized.push({ teeId: group.teeId ? String(group.teeId) : null, names });
    }

    for (const tt of (ev.teeTimes || [])) tt.players = [];

    let nextGeneratedTime = nextTeeTimeForEvent(ev, 9, '07:00');
    for (let i = 0; i < materialized.length; i++) {
      const group = materialized[i];
      let target = null;
      if (group.teeId) target = ev.teeTimes.id(group.teeId);
      if (!target) target = ev.teeTimes[i];

      if (!target) {
        const slotPayload = ev.isTeamEvent
          ? { name: `Team ${i + 1}`, players: [] }
          : { time: nextGeneratedTime, players: [] };
        ev.teeTimes.push(slotPayload);
        target = ev.teeTimes[ev.teeTimes.length - 1];
        if (!ev.isTeamEvent) {
          const tempEvent = { teeTimes: [{ time: nextGeneratedTime }] };
          nextGeneratedTime = nextTeeTimeForEvent(tempEvent, 9, nextGeneratedTime);
        }
      }

      target.players = group.names.map((name) => ({ name, checkedIn: false }));
      if (ev.isTeamEvent && !target.name) target.name = `Team ${i + 1}`;
      if (!ev.isTeamEvent && !target.time) target.time = nextTeeTimeForEvent(ev, 9, '07:00');
    }

    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Golf Course API ---------------- */
const GOLF_API_KEY = process.env.GOLF_API_KEY || '';
const GOLF_API_KEY_BACKUP = process.env.GOLF_API_KEY_BACKUP || '';
const GOLF_API_BASE = 'https://api.golfcourseapi.com/v1';

// Helper: Try API request with fallback to backup key
async function fetchGolfAPI(url, primaryKey = GOLF_API_KEY, backupKey = GOLF_API_KEY_BACKUP) {
  // Try primary key first
  if (primaryKey) {
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Key ${primaryKey}` }
      });
      
      // If successful or non-auth error, return it
      if (response.ok || (response.status !== 401 && response.status !== 403 && response.status !== 429)) {
        return { response, keyUsed: 'primary' };
      }
      
      console.warn(`Golf API primary key failed with ${response.status}, trying backup...`);
    } catch (err) {
      console.warn('Golf API primary key request failed:', err.message);
    }
  }
  
  // Try backup key if primary failed with auth/rate limit error
  if (backupKey) {
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Key ${backupKey}` }
      });
      return { response, keyUsed: 'backup' };
    } catch (err) {
      console.error('Golf API backup key also failed:', err.message);
      throw err;
    }
  }
  
  // No backup key available
  throw new Error('Golf API request failed and no backup key available');
}

// Validate course data consistency
function validateCourseData(course) {
  const issues = [];
  
  // Check if city/state matches common patterns for the course name
  if (course.name && course.city) {
    const nameLower = course.name.toLowerCase();
    const cityLower = (course.city || '').toLowerCase();
    
    // Flag if course name mentions a location that doesn't match city/state
    const locationKeywords = ['richmond', 'virginia beach', 'norfolk', 'roanoke', 'front royal', 'luray', 'new market'];
    for (const keyword of locationKeywords) {
      if (nameLower.includes(keyword) && !cityLower.includes(keyword)) {
        issues.push(`Course name mentions "${keyword}" but city is "${course.city}"`);
      }
    }
  }
  
  // Check if phone format is valid
  if (course.phone && !/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(course.phone)) {
    issues.push(`Invalid phone format: ${course.phone}`);
  }
  
  // Check for missing critical data
  if (!course.name) issues.push('Missing course name');
  if (!course.city && !course.state) issues.push('Missing location data');
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

app.get('/api/golf-courses/list', async (req, res) => {
  // Define local Shenandoah Valley courses (always included at top)
  const localCourses = [
    { 
      id: 'custom-1', 
      name: 'Blue Ridge Shadows Golf Club',
      city: 'Front Royal',
      state: 'VA',
      phone: '(540) 631-9661',
      website: 'https://blueridgeshadows.com',
      holes: 18,
      par: 72
    },
    { 
      id: 'custom-2', 
      name: 'Caverns Country Club Resort',
      city: 'Luray',
      state: 'VA',
      phone: '(540) 743-7111',
      website: 'https://cavernscc.com',
      holes: 18,
      par: 72
    },
    { 
      id: 'custom-3', 
      name: 'Rock Harbor Golf Club',
      city: 'Winchester',
      state: 'VA',
      phone: '(540) 722-7111',
      website: 'https://www.rockharborgolf.com',
      holes: 18,
      par: 72
    },
    { 
      id: 'custom-4', 
      name: 'Shenandoah Valley Golf Club',
      city: 'Front Royal',
      state: 'VA',
      phone: '(540) 636-4653',
      website: 'https://svgcgolf.com',
      holes: 27,
      par: 72
    },
    { 
      id: 'custom-5', 
      name: 'Shenvalee Golf Resort',
      city: 'New Market',
      state: 'VA',
      phone: '(540) 740-3181',
      website: 'https://shenvalee.com',
      holes: 27,
      par: 72
    },
    { 
      id: 'custom-6', 
      name: 'The Club at Ironwood',
      city: 'Greenville',
      state: 'VA',
      phone: '(540) 337-1234',
      website: null,
      holes: 18,
      par: 72
    },
    {
      id: 'custom-7',
      name: 'World Tour Golf Links',
      city: 'Myrtle Beach',
      state: 'SC',
      phone: null,
      website: null,
      holes: 18,
      par: 72
    },
    {
      id: 'custom-8',
      name: 'Wild Wing Avocet',
      city: 'Conway',
      state: 'SC',
      phone: null,
      website: null,
      holes: 18,
      par: 72
    },
    {
      id: 'custom-9',
      name: 'MB National Kings North',
      city: 'Myrtle Beach',
      state: 'SC',
      phone: null,
      website: null,
      holes: 18,
      par: 72
    },
    {
      id: 'custom-10',
      name: 'River Hills',
      city: 'Little River',
      state: 'SC',
      phone: null,
      website: null,
      holes: 18,
      par: 72
    },
    {
      id: 'custom-11',
      name: 'Long Bay',
      city: 'Longs',
      state: 'SC',
      phone: null,
      website: null,
      holes: 18,
      par: 72
    }
  ];

  // If no API keys, return only local courses
  if (!GOLF_API_KEY && !GOLF_API_KEY_BACKUP) {
    return res.json(localCourses);
  }
  
  try {
    // Allow state and limit to be passed as query params for testing
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    
    // Use search endpoint - the API searches by course name, so cast a wide net
    // Search for just "golf" to get many results, then filter by VA state
    const url = `${GOLF_API_BASE}/search?search_query=golf`;
    const { response, keyUsed } = await fetchGolfAPI(url);
    
    if (!response.ok) {
      throw new Error(`Golf API error: ${response.status} (used ${keyUsed} key)`);
    }
    
    console.log(`Golf API courses loaded using ${keyUsed} key`);
    
    const data = await response.json();
    const courses = (data.courses || [])
      .filter(c => {
        // Filter for Virginia state courses only
        const courseState = c.location?.state;
        return courseState && courseState.toUpperCase() === 'VA';
      })
      .filter(c => c.club_name || c.course_name) // Only courses with names
      .sort((a, b) => {
        const nameA = a.club_name || a.course_name || '';
        const nameB = b.club_name || b.course_name || '';
        return nameA.localeCompare(nameB);
      })
      .slice(0, limit) // Limit after sorting
      .map(c => {
        const latitude = toLatitude(c.location?.latitude ?? c.location?.lat);
        const longitude = toLongitude(c.location?.longitude ?? c.location?.lon ?? c.location?.lng);
        const course = {
          id: c.id,
          name: c.club_name || c.course_name || 'Unknown',
          city: c.location?.city || null,
          state: c.location?.state || null,
          address: c.location?.address || c.location?.address_1 || c.location?.street || null,
          phone: null, // API doesn't provide phone
          website: null, // API doesn't provide website
          holes: 18, // Default, API doesn't provide this in search
          par: null, // API doesn't provide this in search
          latitude,
          longitude
        };
        
        // Validate course data and log issues
        const validation = validateCourseData(course);
        if (!validation.isValid) {
          console.warn(`[Golf API] Data quality issue for "${course.name}":`, validation.issues);
        }
        
        return course;
      });
    
    // Combine local courses (first) with API courses
    // Filter out duplicates by name (case-insensitive)
    const localNames = new Set(localCourses.map(c => c.name.toLowerCase()));
    const apiCoursesFiltered = courses.filter(c => !localNames.has(c.name.toLowerCase()));
    
    const combinedCourses = [...localCourses, ...apiCoursesFiltered];
    res.json(combinedCourses);
  } catch (e) {
    console.error('Golf course list error:', e);
    // Return only local courses on error
    res.json(localCourses);
  }
});

// Search golf courses by query string
app.get('/api/golf-courses/search', async (req, res) => {
  const query = req.query.q || '';
  
  // Define local courses (same as above)
  const localCourses = [
    { id: 'custom-1', name: 'Blue Ridge Shadows Golf Club', city: 'Front Royal', state: 'VA', phone: '(540) 631-9661', website: 'https://blueridgeshadows.com', holes: 18, par: 72 },
    { id: 'custom-2', name: 'Caverns Country Club Resort', city: 'Luray', state: 'VA', phone: '(540) 743-7111', website: 'https://cavernscc.com', holes: 18, par: 72 },
    { id: 'custom-3', name: 'Rock Harbor Golf Club', city: 'Winchester', state: 'VA', phone: '(540) 722-7111', website: 'https://www.rockharborgolf.com', holes: 18, par: 72 },
    { id: 'custom-4', name: 'Shenandoah Valley Golf Club', city: 'Front Royal', state: 'VA', phone: '(540) 636-4653', website: 'https://svgcgolf.com', holes: 27, par: 72 },
    { id: 'custom-5', name: 'Shenvalee Golf Resort', city: 'New Market', state: 'VA', phone: '(540) 740-3181', website: 'https://shenvalee.com', holes: 27, par: 72 },
    { id: 'custom-6', name: 'The Club at Ironwood', city: 'Greenville', state: 'VA', phone: '(540) 337-1234', website: null, holes: 18, par: 72 },
    { id: 'custom-7', name: 'World Tour Golf Links', city: 'Myrtle Beach', state: 'SC', phone: null, website: null, holes: 18, par: 72 },
    { id: 'custom-8', name: 'Wild Wing Avocet', city: 'Conway', state: 'SC', phone: null, website: null, holes: 18, par: 72 },
    { id: 'custom-9', name: 'MB National Kings North', city: 'Myrtle Beach', state: 'SC', phone: null, website: null, holes: 18, par: 72 },
    { id: 'custom-10', name: 'River Hills', city: 'Little River', state: 'SC', phone: null, website: null, holes: 18, par: 72 },
    { id: 'custom-11', name: 'Long Bay', city: 'Longs', state: 'SC', phone: null, website: null, holes: 18, par: 72 }
  ];
  
  if (!query || query.length < 2) {
    // Return local courses for short/empty queries
    return res.json(localCourses);
  }
  
  // Filter local courses by query
  const queryLower = query.toLowerCase();
  const matchingLocal = localCourses.filter(c => 
    c.name.toLowerCase().includes(queryLower) ||
    (c.city && c.city.toLowerCase().includes(queryLower))
  );
  
  // If no API keys, return only local matches
  if (!GOLF_API_KEY && !GOLF_API_KEY_BACKUP) {
    return res.json(matchingLocal);
  }
  
  try {
    // Search API with the query
    const url = `${GOLF_API_BASE}/search?search_query=${encodeURIComponent(query)}`;
    const { response, keyUsed } = await fetchGolfAPI(url);
    
    if (!response.ok) {
      throw new Error(`Golf API error: ${response.status}`);
    }
    
    console.log(`Golf API search for "${query}" using ${keyUsed} key`);
    
    const data = await response.json();
    console.log(`  API returned ${data.courses ? data.courses.length : 0} total courses`);
    
    const apiCourses = (data.courses || [])
      .filter(c => {
        const courseState = c.location?.state;
        return courseState && courseState.toUpperCase() === 'VA';
      })
      .filter(c => c.club_name || c.course_name)
      .slice(0, 50) // Limit API results
      .map(c => ({
        id: c.id,
        name: c.club_name || c.course_name || 'Unknown',
        city: c.location?.city || null,
        state: c.location?.state || null,
        address: c.location?.address || c.location?.address_1 || c.location?.street || null,
        phone: null,
        website: null,
        holes: 18,
        par: null,
        latitude: toLatitude(c.location?.latitude ?? c.location?.lat),
        longitude: toLongitude(c.location?.longitude ?? c.location?.lon ?? c.location?.lng)
      }));
    
    console.log(`  Filtered to ${apiCourses.length} VA courses`);
    console.log(`  Local matches: ${matchingLocal.length}`);
    
    // Combine local matches first, then API results
    const localNames = new Set(matchingLocal.map(c => c.name.toLowerCase()));
    const apiFiltered = apiCourses.filter(c => !localNames.has(c.name.toLowerCase()));
    
    const results = [...matchingLocal, ...apiFiltered];
    console.log(`  Returning ${results.length} total courses (${matchingLocal.length} local + ${apiFiltered.length} API)`);
    res.json(results);
  } catch (e) {
    console.error('Golf course search error:', e);
    console.log(`  Returning ${matchingLocal.length} local matches only (error fallback)`);
    res.json(matchingLocal); // Return local matches on error
  }
});

/* ---------------- Weather ---------------- */
// Refresh weather for an event
app.post('/api/events/:id/weather', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    
    const weatherData = await fetchWeatherForEvent(ev);
    assignWeatherToEvent(ev, weatherData);
    
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refresh weather for all events
app.post('/api/events/weather/refresh-all', async (_req, res) => {
  try {
    const events = await Event.find();
    let updated = 0;
    let failed = 0;
    let errors = [];
    for (const ev of events) {
      try {
        if (!ev.date || !(ev.date instanceof Date) || isNaN(ev.date.getTime())) {
          failed++;
          errors.push({ eventId: ev._id, date: ev.date, reason: 'Missing or invalid event date' });
          console.error('Weather refresh skipped for event', ev._id, 'due to missing/invalid date:', ev.date);
          continue;
        }
        const weatherData = await fetchWeatherForEvent(ev);
        assignWeatherToEvent(ev, weatherData);
        await ev.save();
        if (weatherData.success) updated++;
        else {
          failed++;
          errors.push({ eventId: ev._id, date: ev.date, reason: weatherData.description || 'Unknown error' });
        }
      } catch (err) {
        failed++;
        errors.push({ eventId: ev._id, date: ev.date, reason: err.message });
        console.error('Weather refresh failed for event', ev._id, err);
      }
    }
    res.json({ ok: true, updated, failed, total: events.length, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Global error handler to prevent server crash on unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

/* ---------------- Maybe List ---------------- */
// Add player to maybe list
app.post('/api/events/:id/maybe', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    
    if (!Array.isArray(ev.maybeList)) ev.maybeList = [];
    
    const trimmedName = String(name).trim();
    // Check for duplicates (case-insensitive)
    const exists = ev.maybeList.some(n => String(n).toLowerCase() === trimmedName.toLowerCase());
    if (exists) return res.status(409).json({ error: 'Name already on maybe list' });
    
    ev.maybeList.push(trimmedName);
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Promote a maybe-list player into an open tee/team slot
app.post('/api/events/:id/maybe/fill', async (req, res) => {
  try {
    const { name, teeId } = req.body || {};
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    if (!Array.isArray(ev.maybeList)) ev.maybeList = [];
    if (!Array.isArray(ev.teeTimes) || !ev.teeTimes.length) {
      return res.status(400).json({ error: 'No tee/team slots available' });
    }
    if (!ev.maybeList.length) return res.status(400).json({ error: 'Maybe list is empty' });

    let maybeIndex = 0;
    if (name) {
      const normalized = String(name).trim().toLowerCase();
      maybeIndex = ev.maybeList.findIndex((n) => String(n).trim().toLowerCase() === normalized);
      if (maybeIndex === -1) return res.status(404).json({ error: 'Name not found on maybe list' });
    }

    const pickedName = String(ev.maybeList[maybeIndex] || '').trim();
    if (!pickedName) return res.status(400).json({ error: 'Invalid maybe list name' });
    if (isDuplicatePlayerName(ev, pickedName)) {
      return res.status(409).json({ error: 'duplicate player name', message: 'Player already registered on this event.' });
    }

    const slot = findNextOpenSlot(ev, teeId || null);
    if (!slot) {
      return res.status(409).json({ error: teeId ? 'selected slot full' : 'all slots full' });
    }

    slot.players.push({ name: pickedName, checkedIn: false });
    ev.maybeList.splice(maybeIndex, 1);
    await ev.save();

    const teeLabel = getTeeLabel(ev, slot._id);
    await logAudit(ev._id, 'add_player', pickedName, {
      teeId: slot._id,
      teeLabel,
      source: 'maybe_list'
    });

    if (ev.notificationsEnabled !== false) {
      sendEmailToAll(
        `Player Confirmed: ${ev.course} (${fmt.dateISO(ev.date)})`,
        frame('Maybe List Player Confirmed',
          `<p><strong>${esc(pickedName)}</strong> moved from maybe list to active ${esc(ev.isTeamEvent ? 'team' : 'tee time')}.</p>
           <p><strong>Event:</strong> ${esc(ev.course)}</p>
           <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
           <p><strong>${ev.isTeamEvent ? 'Team' : 'Tee Time'}:</strong> ${esc(teeLabel)}</p>
           ${btn('View Event')}`)
      ).catch((err) => console.error('Failed maybe fill email:', err));
    }

    return res.json({ ok: true, event: ev, addedName: pickedName, teeLabel });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});



// Remove player from maybe list
app.delete('/api/events/:id/maybe/:index', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    
    if (!Array.isArray(ev.maybeList)) ev.maybeList = [];
    const index = parseInt(req.params.index, 10);
    
    if (index < 0 || index >= ev.maybeList.length) {
      return res.status(404).json({ error: 'Invalid index' });
    }
    
    ev.maybeList.splice(index, 1);
    await ev.save();
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Audit Log ---------------- */
app.get('/api/events/:id/audit-log', async (req, res) => {
  try {
    if (!AuditLog) return res.status(501).json({ error: 'Audit log not available' });
    const logs = await AuditLog.find({ eventId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Subscribers ---------------- */
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body || {};
  
  console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'subscribe request received', email: email ? '***' : null }));
  
  if (!email) return res.status(400).json({ error: 'email required' });
  
  try {
    if (!Subscriber) {
      console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'Subscriber model not loaded' }));
      return res.status(500).json({ error: 'subscriber model missing' });
    }
    
    const subscriberData = { email: email.toLowerCase() };
    
    // Check if subscriber already exists
    let existing = await Subscriber.findOne({ email: subscriberData.email });
    
    let s;
    if (existing) {
      // Ensure existing subscriber has an unsubscribe token
      if (!existing.unsubscribeToken) {
        existing.unsubscribeToken = require('crypto').randomBytes(32).toString('hex');
        await existing.save();
      }
      s = existing;
    } else {
      // Create new subscriber (pre-save hook will generate token)
      s = new Subscriber(subscriberData);
      await s.save();
    }
    
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'subscriber added', email: subscriberData.email, isNew: !existing }));
    
    // Send response immediately
    res.json({ ok: true, id: s._id.toString(), isNew: !existing });
    
    // Send confirmation email asynchronously (don't block the response)
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'sending confirmation', to: subscriberData.email }));
    const unsubLink = `${SITE_URL}api/unsubscribe/${s.unsubscribeToken}`;
    const subject = 'Golf Notifications - Subscription Confirmed';
    const message = `<p>Thanks for subscribing! You'll receive email notifications when new golf events are posted.</p><p><a href="${unsubLink}">Click here to unsubscribe</a></p>`;
    
    sendEmail(subscriberData.email, subject, message)
      .then(result => {
        console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'confirmation sent', result }));
      })
      .catch(emailErr => {
        console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'confirmation failed', error:emailErr.message, stack:emailErr.stack }));
      });
  } catch (e) { 
    console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'subscribe error', error:e.message, stack:e.stack }));
    res.status(500).json({ error:e.message }); 
  }
});

/* Unsubscribe */
app.get('/api/unsubscribe/:token', async (req, res) => {
  try {
    if (!Subscriber) return res.status(500).send('Subscriber model not available');
    
    const subscriber = await Subscriber.findOne({ unsubscribeToken: req.params.token });
    if (!subscriber) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><title>Unsubscribe</title><style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px;text-align:center}</style></head>
        <body><h1>⚠️ Invalid Link</h1><p>This unsubscribe link is invalid or has expired.</p></body></html>
      `);
    }
    
    await Subscriber.findByIdAndDelete(subscriber._id);
    
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Unsubscribed</title><style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px;text-align:center}h1{color:#10b981}</style></head>
      <body><h1>✅ Unsubscribed Successfully</h1><p>You've been removed from the notification list.</p><p>You will no longer receive golf event updates.</p></body></html>
    `);
  } catch (e) {
    console.error('Unsubscribe error:', e);
    res.status(500).send('Error processing unsubscribe request');
  }
});

/* Admin - Get/Set Global Notification Setting */
app.get('/api/admin/settings/notifications', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const enabled = await areNotificationsEnabled();
    res.json({ notificationsEnabled: enabled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/settings/notifications', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    if (!Settings) return res.status(500).json({ error: 'Settings model not available' });
    
    const { notificationsEnabled } = req.body;
    await Settings.findOneAndUpdate(
      { key: 'notificationsEnabled' },
      { key: 'notificationsEnabled', value: notificationsEnabled },
      { upsert: true, new: true }
    );
    
    res.json({ ok: true, notificationsEnabled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Admin - Get/Set Scheduler Enable Setting */
app.get('/api/admin/settings/scheduler', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const schedulerEnabled = await areSchedulerJobsEnabled();
    res.json({ schedulerEnabled, lockedByEnv: SCHEDULER_ENV_DISABLED });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/settings/scheduler', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (SCHEDULER_ENV_DISABLED) {
    return res.status(409).json({
      error: 'Scheduler is locked off by environment setting ENABLE_SCHEDULER=0',
      lockedByEnv: true,
      schedulerEnabled: false,
    });
  }

  try {
    if (!Settings) return res.status(500).json({ error: 'Settings model not available' });
    const rawEnabled = req.body && req.body.schedulerEnabled;
    if (typeof rawEnabled !== 'boolean') {
      return res.status(400).json({ error: 'schedulerEnabled must be a boolean' });
    }
    const enabled = rawEnabled;
    await Settings.findOneAndUpdate(
      { key: 'schedulerEnabled' },
      { key: 'schedulerEnabled', value: enabled },
      { upsert: true, new: true }
    );
    schedulerEnabledCache = { value: enabled, ts: Date.now() };
    res.json({ ok: true, schedulerEnabled: enabled, lockedByEnv: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Admin - Get/Set Scheduled Email Rule Settings */
app.get('/api/admin/settings/scheduled-email-rules', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const rules = await getScheduledEmailRules();
    res.json({ rules, availableRules: SCHEDULED_EMAIL_RULE_KEYS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/settings/scheduled-email-rules', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    if (!Settings) return res.status(500).json({ error: 'Settings model not available' });
    const ruleKey = String((req.body && req.body.ruleKey) || '').trim();
    if (!SCHEDULED_EMAIL_RULE_KEYS.includes(ruleKey)) {
      return res.status(400).json({ error: 'Invalid ruleKey', availableRules: SCHEDULED_EMAIL_RULE_KEYS });
    }
    const rawEnabled = req.body && req.body.enabled;
    if (typeof rawEnabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const current = await getScheduledEmailRules();
    const updated = { ...current, [ruleKey]: rawEnabled };
    await Settings.findOneAndUpdate(
      { key: 'scheduledEmailRules' },
      { key: 'scheduledEmailRules', value: updated },
      { upsert: true, new: true }
    );
    scheduledEmailRulesCache = { value: updated, ts: Date.now() };
    res.json({ ok: true, rules: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Admin - List Subscribers */
app.get('/api/admin/subscribers', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    if (!Subscriber) return res.status(500).json({ error: 'Subscriber model not available' });
    
    // Migration: Add tokens to existing subscribers without them
    const crypto = require('crypto');
    const subsWithoutToken = await Subscriber.find({ unsubscribeToken: { $exists: false } });
    for (const sub of subsWithoutToken) {
      sub.unsubscribeToken = crypto.randomBytes(32).toString('hex');
      await sub.save();
    }
    
    const subscribers = await Subscriber.find({}).sort({ createdAt: -1 }).lean();
    res.json(subscribers);
  } catch (e) {
    console.error('List subscribers error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* Admin - Delete Subscriber */
app.delete('/api/admin/subscribers/:id', async (req, res) => {
  if (!isAdminDelete(req)) {
    return res.status(403).json({ error: 'Delete code required' });
  }
  
  try {
    if (!Subscriber) return res.status(500).json({ error: 'Subscriber model not available' });
    const deleted = await Subscriber.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Subscriber not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete subscriber error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin - Tee time change log
app.get('/api/admin/tee-time-log', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!TeeTimeLog) return res.status(500).json({ error: 'TeeTimeLog model not available' });
  try {
    const logs = await TeeTimeLog.find({}).sort({ createdAt: -1 }).limit(200).lean();
    res.json(logs);
  } catch (e) {
    console.error('Tee time log error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* Admin - Create/List/Download Backups */
app.get('/api/admin/backups', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const backups = await listAdminBackups();
    const settings = await getBackupSettings();
    const status = await getBackupStatus();
    return res.json({
      backupRoot: BACKUP_ROOT,
      backupInProgress: Boolean(backupJobPromise),
      restoreInProgress: Boolean(restoreJobPromise),
      settings,
      status,
      overview: buildBackupOverview(backups, settings, status),
      auth: {
        separateDeleteCode: ADMIN_DESTRUCTIVE_CODE !== SITE_ADMIN_WRITE_CODE,
        destructiveConfirmRequired: Boolean(ADMIN_DESTRUCTIVE_CONFIRM_CODE),
      },
      backups,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/settings/backups', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const settings = await getBackupSettings();
    const status = await getBackupStatus();
    return res.json({ settings, status, overview: buildBackupOverview(await listAdminBackups(), settings, status) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/settings/backups', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    if (!Settings) return res.status(500).json({ error: 'Settings model not available' });
    const settings = normalizeBackupSettings(req.body || {});
    await Settings.findOneAndUpdate(
      { key: 'backupSettings' },
      { key: 'backupSettings', value: settings },
      { upsert: true, new: true }
    );
    backupSettingsCache = { value: settings, ts: Date.now() };
    return res.json({ ok: true, settings });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/backups', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (backupJobPromise) {
    return res.status(409).json({ error: 'A backup is already in progress' });
  }
  try {
    backupJobPromise = createAdminBackupBundle();
    const manifest = await backupJobPromise;
    return res.json({
      ok: true,
      message: 'Backup created successfully',
      manifest,
    });
  } catch (e) {
    await recordBackupFailure(e).catch(() => {});
    return res.status(500).json({ error: e.message });
  } finally {
    backupJobPromise = null;
  }
});

app.post('/api/admin/backups/:backupId/restore', async (req, res) => {
  if (!isAdminDelete(req)) {
    return res.status(403).json({ error: 'Delete code required' });
  }
  if (!hasDestructiveConfirm(req)) {
    return res.status(403).json({ error: 'Destructive confirmation code required' });
  }
  if (backupJobPromise || restoreJobPromise) {
    return res.status(409).json({ error: 'Another backup or restore job is already in progress' });
  }
  const backupId = String(req.params.backupId || '').trim();
  const target = String(req.body?.target || 'both').trim().toLowerCase();
  const confirmBackupId = String(req.body?.confirmBackupId || '').trim();
  if (!['primary', 'secondary', 'both'].includes(target)) {
    return res.status(400).json({ error: 'target must be primary, secondary, or both' });
  }
  if (!backupId || confirmBackupId !== backupId) {
    return res.status(400).json({ error: 'confirmBackupId must exactly match the selected backup id' });
  }
  try {
    restoreJobPromise = (async () => {
      await loadBackupManifest(backupId);
      const backupDir = path.join(BACKUP_ROOT, backupId);
      const results = {};
      if (target === 'primary' || target === 'both') {
        const snapshot = await loadDatabaseSnapshotFile(path.join(backupDir, 'primary-db.ejson.gz'));
        results.primary = await restoreDatabaseFromSnapshot(mongoose.connection, snapshot, 'primary');
      }
      if (target === 'secondary' || target === 'both') {
        const secondaryConn = getSecondaryConn();
        if (!secondaryConn) throw new Error('Secondary database connection is unavailable');
        const snapshot = await loadDatabaseSnapshotFile(path.join(backupDir, 'secondary-db.ejson.gz'));
        results.secondary = await restoreDatabaseFromSnapshot(secondaryConn, snapshot, 'secondary');
      }
      return results;
    })();
    const results = await restoreJobPromise;
    return res.json({
      ok: true,
      message: `Restore completed for ${target}`,
      backupId,
      target,
      results,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    restoreJobPromise = null;
  }
});

app.get('/api/admin/backups/:backupId/files/:fileName', async (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const backupId = String(req.params.backupId || '').trim();
  const fileName = String(req.params.fileName || '').trim();
  if (!isSafeBackupSegment(backupId) || !isSafeBackupSegment(fileName)) {
    return res.status(400).json({ error: 'Invalid backup path' });
  }
  const filePath = path.join(BACKUP_ROOT, backupId, fileName);
  try {
    await fsp.access(filePath);
    return res.download(filePath);
  } catch (_err) {
    return res.status(404).json({ error: 'Backup file not found' });
  }
});

/* Admin - Send Custom Message to All Subscribers */
app.post('/api/admin/send-custom-message', async (req, res) => {
  const { code, subject, message } = req.body;
  
  if (!isSiteAdminCode(code)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }
  
  try {
    if (!Subscriber) return res.status(500).json({ error: 'Subscriber model not available' });
    
    // Get all subscribers (match admin page logic)
    const subscribers = await Subscriber.find({}).sort({ createdAt: -1 }).lean();
    if (subscribers.length === 0) {
      return res.json({ count: 0, message: 'No subscribers' });
    }
    // Send email to each subscriber
    let successCount = 0;
    const errors = [];
    for (const subscriber of subscribers) {
      try {
        const unsubLink = `${SITE_URL}unsubscribe?token=${subscriber.unsubscribeToken}`;
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1a5a1a 0%, #2d7a2d 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">⛳ ${subject}</h1>
            </div>
            <div style="background: white; padding: 30px; border: 2px solid #2d7a2d; border-top: none; border-radius: 0 0 12px 12px;">
              <div style="color: #1a5a1a; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${message}</div>
              <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 30px 0;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                This message was sent to all Tee Time BRS subscribers.
              </p>
              <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0 0;">
                <a href="${unsubLink}" style="color: #dc2626;">Unsubscribe from notifications</a>
              </p>
            </div>
          </div>
        `;
        
        await sendEmail(subscriber.email, subject, htmlContent);
        successCount++;
      } catch (emailError) {
        console.error(`Failed to send to ${subscriber.email}:`, emailError);
        errors.push({ email: subscriber.email, error: emailError.message });
      }
    }
    
    console.log(`Custom message sent: "${subject}" to ${successCount}/${subscribers.length} subscribers`);
    
    res.json({ 
      count: successCount,
      total: subscribers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e) {
    console.error('Send custom message error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Reminder logic ---------------- */
async function sendAdminAlert(subject, htmlBody) {
  if (!ADMIN_EMAILS || ADMIN_EMAILS.length === 0) {
    console.log('No admin emails configured');
    return { ok: false, reason: 'no admins' };
  }
  
  let sent = 0;
  for (const adminEmail of ADMIN_EMAILS) {
    try {
      await sendEmail(adminEmail, subject, frame('Admin Alert', htmlBody));
      sent++;
    } catch (e) {
      console.error(`Failed to send admin alert to ${adminEmail}:`, e.message);
    }
  }
  return { ok: true, sent };
}

function ymdLocalPlusDays(days=1){
  const now = new Date();
  const ymd = ymdInTZ(now, LOCAL_TZ);
  const [y,m,d] = ymd.split('-').map(Number);
  const baseUTCNoon = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
  const targetUTCNoon = addDaysUTC(baseUTCNoon, days);
  return ymdInTZ(targetUTCNoon, LOCAL_TZ);
}
async function findEmptyTeeTimesForDay(daysAhead = 1){
  const ymd = ymdLocalPlusDays(daysAhead); // 'YYYY-MM-DD' in local TZ
  // Robust window: include events from noon UTC previous day to noon UTC next day
  const base = new Date(ymd + 'T00:00:00' + 'Z');
  const start = new Date(base.getTime() - 12*60*60*1000); // noon previous day UTC
  const end = new Date(base.getTime() + 36*60*60*1000 - 1); // just before noon next day UTC
  const events = await Event.find({ isTeamEvent: false, date: { $gte: start, $lte: end } }).lean();
  const blocks = [];
  for (const ev of events) {
    const eventDateYMD = fmt.dateISO(ev.date);
    const empties = [];
    const malformed = [];
    for (const tt of (ev.teeTimes || [])) {
      if (!Array.isArray(tt.players)) {
        empties.push(fmt.tee(tt.time||''));
        malformed.push({ time: tt.time, players: tt.players });
      } else if (tt.players.length === 0) {
        empties.push(fmt.tee(tt.time||''));
      }
    }
    console.log('[reminder-check]', {
      eventId: ev._id,
      course: ev.course,
      eventDate: ev.date,
      eventDateYMD,
      ymd,
      teeTimes: (ev.teeTimes||[]).map(tt => ({ time: tt.time, players: Array.isArray(tt.players) ? tt.players.length : 'MALFORMED', rawPlayers: tt.players })),
      empties,
      malformed
    });
    if (empties.length) {
      blocks.push({ course: ev.course||'Course', dateISO: eventDateYMD, dateLong: fmt.dateLong(ev.date), empties });
    }
  }
  return blocks;
}


async function runReminderIfNeeded(label, daysAhead = 1){
  const blocks = await findEmptyTeeTimesForDay(daysAhead);
  if (!blocks.length) {
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'reminder-skip', reason:'no empty tees', label, daysAhead }));
    return { ok:true, sent:0 };
  }
  const html = reminderEmail(blocks, { daysAhead });
  const subj = daysAhead === 2 ? 'Reminder: Empty Tee Times in 2 Days' : 'Reminder: Empty Tee Times Tomorrow';
  const res = await sendEmailToAll(subj, html);
  console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'reminder-sent', sent:res.sent, label, daysAhead }));
  return res;
}

/* manual trigger: GET /admin/run-reminders?code=... */
app.get('/admin/run_reminders', async (req, res) => {
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  try {
    const r48 = await runReminderIfNeeded('manual-48hr', 2);
    const r24 = await runReminderIfNeeded('manual-24hr', 1);
    return res.json({ r48, r24 });
  }
  catch (e) { return res.status(500).json({ error: e.message }); }
});

/* manual trigger: GET /admin/run_brian_empty_alert?code=... */
app.get('/admin/run_brian_empty_alert', async (req, res) => {
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await runBrianJonesTomorrowEmptyTeeAlert('manual');
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});



/* Admin: GET /admin/empty-tee-report?code=... */
app.get('/admin/empty-tee-report', async (req, res) => {
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  try {
    const now = new Date();
    const nowPlus1 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nowPlus2 = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const nowPlus3 = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    // Only non-team events
    const events = await Event.find({ isTeamEvent: false }).lean();
    const within1Day = [];
    const within2Days = [];
    const within3Days = [];
    for (const ev of events) {
      if (!Array.isArray(ev.teeTimes)) continue;
      for (const tt of ev.teeTimes) {
        if (!tt.time) continue;
        const [hh, mm] = tt.time.split(':');
        const eventDate = asUTCDate(ev.date);
        if (isNaN(eventDate)) continue;
        const teeDate = new Date(Date.UTC(
          eventDate.getUTCFullYear(),
          eventDate.getUTCMonth(),
          eventDate.getUTCDate(),
          parseInt(hh, 10),
          parseInt(mm, 10)
        ));
        const isEmpty = !Array.isArray(tt.players) || tt.players.length === 0;
        if (!isEmpty) continue;
        if (teeDate > now && teeDate <= nowPlus1) {
          within1Day.push({
            eventId: String(ev._id),
            course: ev.course || '',
            dateISO: fmt.dateISO(ev.date),
            dateLong: fmt.dateLong(ev.date),
            teeTime: tt.time
          });
        } else if (teeDate > nowPlus1 && teeDate <= nowPlus2) {
          within2Days.push({
            eventId: String(ev._id),
            course: ev.course || '',
            dateISO: fmt.dateISO(ev.date),
            dateLong: fmt.dateLong(ev.date),
            teeTime: tt.time
          });
        } else if (teeDate > nowPlus2 && teeDate <= nowPlus3) {
          within3Days.push({
            eventId: String(ev._id),
            course: ev.course || '',
            dateISO: fmt.dateISO(ev.date),
            dateLong: fmt.dateLong(ev.date),
            teeTime: tt.time
          });
        }
      }
    }
    res.json({
      ok: true,
      within1Day,
      within2Days,
      within3Days,
      counts: {
        within1Day: within1Day.length,
        within2Days: within2Days.length,
        within3Days: within3Days.length
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


/* Verify golf course data quality: GET /admin/verify-courses?code=... */
app.get('/admin/verify-courses', async (req, res) => {
  if (!isSiteAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  
  if (!GOLF_API_KEY && !GOLF_API_KEY_BACKUP) {
    return res.json({ 
      message: 'Using fallback course list (no API keys)', 
      courses: [],
      issues: 0 
    });
  }
  
  try {
    const url = `${GOLF_API_BASE}/search?search_query=Virginia`;
    const { response, keyUsed } = await fetchGolfAPI(url);
    
    if (!response.ok) {
      throw new Error(`Golf API error: ${response.status}`);
    }
    
    const data = await response.json();
    const validationResults = (data.courses || [])
      .slice(0, 50) // Limit to 50 for verification
      .filter(c => c.club_name || c.course_name)
      .map(c => {
        const course = {
          id: c.id,
          name: c.club_name || c.course_name || 'Unknown',
          city: c.location?.city || null,
          state: c.location?.state || null,
          phone: null,
          website: null,
          holes: 18,
          par: null
        };
        const validation = validateCourseData(course);
        return {
          course,
          valid: validation.isValid,
          issues: validation.issues
        };
      });
    
    const coursesWithIssues = validationResults.filter(r => !r.valid);
    
    return res.json({
      message: `Verified ${validationResults.length} courses from Golf API (using ${keyUsed} key)`,
      totalCourses: validationResults.length,
      coursesWithIssues: coursesWithIssues.length,
      issues: coursesWithIssues,
      keyUsed: keyUsed,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('Golf course verification error:', e);
    return res.status(500).json({ error: e.message });
  }
});

/* Helper: refresh weather for events in next 7 days */
async function refreshWeatherForUpcomingEvents() {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const events = await Event.find({
      date: { $gte: now, $lte: sevenDaysFromNow }
    });
    
    let updated = 0;
    for (const ev of events) {
      try {
        const weatherData = await fetchWeatherForEvent(ev);
        assignWeatherToEvent(ev, weatherData);
        await ev.save();
        updated++;
      } catch (e) {
        console.error(`Weather refresh failed for event ${ev._id}:`, e.message);
      }
    }
    
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'weather-refresh', updated, total: events.length }));
    return { ok: true, updated, total: events.length };
  } catch (e) {
    console.error('Weather refresh error:', e);
    return { ok: false, error: e.message };
  }
}

/* Scheduler for reminders, admin alerts, and weather refresh
   Only enable when running as the entry point (not when imported by tests)
   and when ENABLE_SCHEDULER is not explicitly disabled. */
if (require.main === module && !SCHEDULER_ENV_DISABLED) {
  let lastRunForYMD_24 = null;
  let lastRunForYMD_48 = null;
  let lastBrianAlertForYMD = null;
  let lastAdminCheckHour = null;
  let lastWeatherRefreshHour = null;
  let lastMonthlyBackupKey = null;
  let lastWeeklyBackupKey = null;
  let lastDailyBackupKey = null;
  let lastSchedulerDisabledLogHour = null;

  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(now).split(':');
      const hour = Number(parts[0]), minute = Number(parts[1]);
      const schedulerEnabled = await areSchedulerJobsEnabled();
      if (!schedulerEnabled) {
        if (lastSchedulerDisabledLogHour !== hour) {
          lastSchedulerDisabledLogHour = hour;
          console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'scheduler-paused', reason:'admin-disabled' }));
        }
        return;
      }
      lastSchedulerDisabledLogHour = null;
      const emailRules = await getScheduledEmailRules();
      const backupSettings = await getBackupSettings();
      const todayLocalYMD = ymdInTZ(now, LOCAL_TZ);
      const ymdTomorrow = ymdLocalPlusDays(1);
      const ymd48 = ymdLocalPlusDays(2);
      const todayParts = todayLocalYMD.split('-').map(Number);
      const dayOfMonth = Number(todayParts[2] || 0);
      const currentMonthKey = monthKeyInTZ(now, LOCAL_TZ);
      const currentWeekKey = weekKeyInTZ(now, LOCAL_TZ);


      // Daily 4:00 PM Brian Jones alert for empty tee times tomorrow
      if (emailRules.brianTomorrowEmptyClubAlert && hour === 16 && minute === 0 && lastBrianAlertForYMD !== ymdTomorrow) {
        lastBrianAlertForYMD = ymdTomorrow;
        const result = await runBrianJonesTomorrowEmptyTeeAlert('auto-16:00');
        console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'brian-empty-alert-complete', targetYMD: ymdTomorrow, result }));
      }

      // Daily 5:00 PM reminders
      if (hour === 17 && minute === 0) {
        // Empty tee times 2 days ahead (48hr)
        if (emailRules.reminder48Hour && lastRunForYMD_48 !== ymd48) {
          lastRunForYMD_48 = ymd48;
          await runReminderIfNeeded('auto-17:00-48hr', 2);
        }
        // Empty tee times tomorrow (24hr)
        if (emailRules.reminder24Hour && lastRunForYMD_24 !== todayLocalYMD) {
          lastRunForYMD_24 = todayLocalYMD;
          await runReminderIfNeeded('auto-17:00-24hr', 1);
        }
        // Nearly full tee times (4 days out or less)
        if (emailRules.nearlyFullTeeTimes) {
          await alertNearlyFullTeeTimes();
        }
      }

      // Admin alerts for empty tee times (48hr and 24hr checks)
      // Run every 6 hours at: 6 AM, 12 PM, 6 PM, 12 AM
      if (emailRules.adminEmptyTeeAlerts && [0, 6, 12, 18].includes(hour) && minute === 0 && lastAdminCheckHour !== hour) {
        lastAdminCheckHour = hour;
        const result = await checkEmptyTeeTimesForAdminAlert();
        console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'admin-check-complete', result }));

        // Reset at end of day
        if (hour === 0) lastAdminCheckHour = null;
      }

      // Weather refresh for events in next 7 days
      // Run every 2 hours at: 12 AM, 2 AM, 4 AM, 6 AM, 8 AM, 10 AM, 12 PM, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM
      if (hour % 2 === 0 && minute === 0 && lastWeatherRefreshHour !== hour) {
        lastWeatherRefreshHour = hour;
        await refreshWeatherForUpcomingEvents();

        // Reset at end of day
        if (hour === 0) lastWeatherRefreshHour = null;
      }

      // Automated backups and retention cleanup
      if (
        backupSettings.monthlyEnabled
        && dayOfMonth === Number(backupSettings.monthlyDay)
        && hour === Number(backupSettings.monthlyHour)
        && minute === Number(backupSettings.monthlyMinute)
        && lastMonthlyBackupKey !== currentMonthKey
        && !backupJobPromise
        && !restoreJobPromise
      ) {
        lastMonthlyBackupKey = currentMonthKey;
        try {
          backupJobPromise = createAdminBackupBundle();
          const manifest = await backupJobPromise;
          console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'monthly-backup-complete', backupId: manifest.id, currentMonthKey }));
        } catch (error) {
          await recordBackupFailure(error).catch(() => {});
          console.error('monthly backup error', error);
        } finally {
          backupJobPromise = null;
        }
      }

      if (
        backupSettings.weeklyEnabled
        && now.getDay() === Number(backupSettings.weeklyDay)
        && hour === Number(backupSettings.weeklyHour)
        && minute === Number(backupSettings.weeklyMinute)
        && lastWeeklyBackupKey !== currentWeekKey
        && !backupJobPromise
        && !restoreJobPromise
      ) {
        lastWeeklyBackupKey = currentWeekKey;
        try {
          backupJobPromise = createAdminBackupBundle();
          const manifest = await backupJobPromise;
          console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'weekly-backup-complete', backupId: manifest.id, currentWeekKey }));
        } catch (error) {
          await recordBackupFailure(error).catch(() => {});
          console.error('weekly backup error', error);
        } finally {
          backupJobPromise = null;
        }
      }

      if (
        backupSettings.dailyEnabled
        && monthInActiveSeason(backupSettings, now, LOCAL_TZ)
        && hour === Number(backupSettings.dailyHour)
        && minute === Number(backupSettings.dailyMinute)
        && lastDailyBackupKey !== todayLocalYMD
        && !backupJobPromise
        && !restoreJobPromise
      ) {
        lastDailyBackupKey = todayLocalYMD;
        try {
          backupJobPromise = createAdminBackupBundle();
          const manifest = await backupJobPromise;
          console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'daily-backup-complete', backupId: manifest.id, todayLocalYMD }));
        } catch (error) {
          await recordBackupFailure(error).catch(() => {});
          console.error('daily backup error', error);
        } finally {
          backupJobPromise = null;
        }
      }
    } catch (e) {
      console.error('scheduler tick error', e);
    }
  }, 60 * 1000); // check once per minute

  console.log('Scheduler enabled: Brian empty-tee alert at 4 PM, daily reminders at 5 PM (24hr & 48hr), admin alerts every 6 hours, weather refresh every 2 hours, and scheduled backups by backup settings');
}

if (require.main === module) {
  app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));
}
module.exports = app;
// Export helpers for testing
module.exports.nextTeamNameForEvent = nextTeamNameForEvent;
module.exports.nextTeeTimeForEvent = nextTeeTimeForEvent;
module.exports.buildEventIcs = buildEventIcs;
module.exports.eventCalendarTiming = eventCalendarTiming;
module.exports.buildEventsIcs = buildEventsIcs;
