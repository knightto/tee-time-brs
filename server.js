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
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
// Secondary connection for Myrtle Trip (kept in separate module to avoid circular requires)
const { initSecondaryConn, getSecondaryConn } = require('./secondary-conn');
initSecondaryConn();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { importHandicapsFromCsv } = require('./services/handicapImportService');

// Polyfill fetch for Node < 18
const fetch = global.fetch || require('node-fetch');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
const PORT = process.env.PORT || 5000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = (process.env.SITE_URL || 'https://tee-time-brs.onrender.com/').replace(/\/$/, '') + '/';
const LOCAL_TZ = process.env.LOCAL_TZ || 'America/New_York';
const processedEmailIds = new Map(); // simple idempotency guard for inbound emails

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// Define routes before static middleware to ensure they take precedence
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use('/api/reunion', require('./routes/reunion'));
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
// Handicap tracking removed

// Health check / debug endpoint
app.get('/api/health', (_req, res) => {
  let secondaryState = null;
  try {
    const secondaryConn = getSecondaryConn();
    secondaryState = secondaryConn ? secondaryConn.readyState : null;
  } catch { secondaryState = null; }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      mongoConnected: mongoose.connection.readyState === 1,
      secondaryMongoConnected: secondaryState === 1,
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasResendFrom: !!process.env.RESEND_FROM,
      hasSubscriberModel: !!Subscriber,
      hasHandicapModels: !!(Golfer && HandicapSnapshot && ImportBatch),
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// --- Handicap directory (manual list) ---
app.get('/api/handicaps', async (_req, res) => {
  try {
    if (!Handicap) return res.status(500).json({ error: 'Handicap model unavailable' });
    const list = await Handicap.find().sort({ name: 1 }).lean();
    const scrubbed = list.map(({ ownerCode, ...rest }) => rest);
    res.json(scrubbed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/handicaps', async (req, res) => {
  try {
    if (!Handicap) return res.status(500).json({ error: 'Handicap model unavailable' });
    const isAdminUser = isAdmin(req);
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
    const { ownerCode: _, ...rest } = created.toObject();
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
    const isAdminUser = isAdmin(req);
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
    const { ownerCode: _, ...rest } = h.toObject();
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
    const isAdminUser = isAdmin(req);
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
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
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
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
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
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
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
      let ttid = '';
      for (const line of (parsed.rawLines || [])) {
        if (/^facility:/i.test(line)) facility = line.replace(/^facility:/i, '').trim();
        if (/^ttid:/i.test(line)) ttid = line.replace(/^ttid:/i, '').trim();
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

      const dedupeExtras = async (matches, keepId) => {
        const extras = matches.filter((m) => String(m._id) !== String(keepId));
        if (!extras.length) return 0;
        await Event.deleteMany({ _id: { $in: extras.map((m) => m._id) } });
        return extras.length;
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

app.use(express.static(path.join(__dirname, 'public')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connected', uri:mongoUri })))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

let Event; try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
let Subscriber; try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = null; }
let AuditLog; try { AuditLog = require('./models/AuditLog'); } catch { AuditLog = null; }
let Settings; try { Settings = require('./models/Settings'); } catch { Settings = null; }
let Handicap; try { Handicap = require('./models/Handicap'); } catch { Handicap = null; }
let Golfer; try { Golfer = require('./models/Golfer'); } catch { Golfer = null; }
let HandicapSnapshot; try { HandicapSnapshot = require('./models/HandicapSnapshot'); } catch { HandicapSnapshot = null; }
let ImportBatch; try { ImportBatch = require('./models/ImportBatch'); } catch { ImportBatch = null; }

/* ---------------- Admin Configuration ---------------- */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'tommy.knight@gmail.com,jvhyers@gmail.com').split(',').map(e => e.trim()).filter(Boolean);

/* ---------------- Weather helpers ---------------- */
// Default location (Richmond, VA area - adjust for your region)
const DEFAULT_LAT = process.env.DEFAULT_LAT || '37.5407';
const DEFAULT_LON = process.env.DEFAULT_LON || '-77.4360';
const weatherCache = new Map(); // key: `${dateISO}|${lat}|${lon}` -> { data, ts }
const WEATHER_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

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

async function fetchWeatherForecast(date, lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      console.error('Weather fetch error: Invalid or missing date', date);
      return {
        success: false,
        condition: 'error',
        icon: '🌤️',
        temp: null,
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
        description: 'Forecast not yet available',
        lastFetched: null
      };
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
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
    const avgTemp = Math.round((tempMax + tempMin) / 2);
    const weatherInfo = getWeatherIcon(weatherCode, true);
    const out = {
      success: true,
      condition: weatherInfo.condition,
      icon: weatherInfo.icon,
      temp: avgTemp,
      description: `${weatherInfo.desc} • ${Math.round(tempMin)}°-${Math.round(tempMax)}°F`,
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
      description: 'Weather unavailable',
      lastFetched: null
    };
  }
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

async function sendEmail(to, subject, html) {
  const mailer = await ensureTransporter();
  if (!mailer || !process.env.RESEND_FROM) {
    console.warn(JSON.stringify({ level:'warn', msg:'Email disabled', reason:'missing key/from' }));
    return { ok:false, disabled:true };
  }
  
  try {
    const info = await mailer.sendMail({
      from: process.env.RESEND_FROM,
      to: to,
      subject: subject,
      html: html
    });
    return { ok: true, data: { id: info.messageId } };
  } catch (err) {
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
function isAdmin(req){
  const code = (req.headers['x-admin-code'] || req.query.code || req.body?.code || '').trim();
  return ADMIN_DELETE_CODE && code === ADMIN_DELETE_CODE;
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

app.get('/api/events', async (_req, res) => {
  const items = await Event.find().sort({ date: 1 }).lean();
  res.json(items);
});

// Fetch a single event by id for targeted refreshes
app.get('/api/events/:id', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id).lean();
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    res.json(ev);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', async (req, res) => {
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
    
    // Fetch weather forecast
    const weatherData = await fetchWeatherForecast(eventDate);
    
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
        courseInfo: courseInfo || {},
        date: eventDate,
        notes,
        isTeamEvent: !!isTeamEvent,
        teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
        teeTimes: tt,
        dedupeKey,
        weather: {
          condition: weatherData.condition,
          icon: weatherData.icon,
          temp: weatherData.temp,
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
    const { course, date, notes, isTeamEvent, teamSizeMax } = req.body || {};
    if (course !== undefined) ev.course = String(course);
    if (date !== undefined) ev.date = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date);
    if (notes !== undefined) ev.notes = String(notes);
    if (isTeamEvent !== undefined) ev.isTeamEvent = !!isTeamEvent;
    if (teamSizeMax !== undefined) ev.teamSizeMax = Math.max(2, Math.min(4, Number(teamSizeMax || 4)));
    // Recompute dedupeKey for tee-time events after changes
    ev.dedupeKey = buildDedupeKey(ev.date, ev.teeTimes, ev.isTeamEvent);
    await ev.save();
    res.json(ev);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  const code = req.query.code || req.body?.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
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
    // Send notification for new team
    const eventUrl = `${SITE_URL}?event=${ev._id}`;
    await sendEmailToAll(
      `New Team Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame('New Team Added!',
        `<p>A new team has been added:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>Team:</strong> ${esc(name)}</p>
         <p>Please <a href="${eventUrl}" style="color:#166534;text-decoration:underline">click here to view this event directly</a>.</p>${btn('View Event', eventUrl)}`)
    );
    return res.json(pushResult);
  }
  // For tee times: accept optional time. If missing, compute next time using event data.
  const { time } = req.body || {};
  let newTime = typeof time === 'string' && time.trim() ? time.trim() : null;
  if (!newTime) {
    newTime = nextTeeTimeForEvent(ev, 9, '07:00');
  }
  // Validate HH:MM and ranges
  const m = /^(\d{1,2}):(\d{2})$/.exec(newTime);
  if (!m) {
    console.error('[tee-time] Add failed: invalid time format', { eventId: ev._id, time: newTime });
    return res.status(400).json({ error: 'time required HH:MM' });
  }
  const hh = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    console.error('[tee-time] Add failed: invalid time value', { eventId: ev._id, time: newTime });
    return res.status(400).json({ error: 'invalid time' });
  }
  if (ev.teeTimes.some(t => t.time === newTime)) {
    console.error('[tee-time] Add failed: duplicate time', { eventId: ev._id, time: newTime });
    return res.status(409).json({ error: 'duplicate time' });
  }
  // Add the new tee time, then sort all teeTimes by time ascending
  ev.teeTimes.push({ time: newTime, players: [] });
  ev.teeTimes.sort((a, b) => {
    // Compare times as HH:MM
    const [ah, am] = a.time.split(":").map(Number);
    const [bh, bm] = b.time.split(":").map(Number);
    return ah !== bh ? ah - bh : am - bm;
  });
  await ev.save();
  console.log('[tee-time] Tee time added', { eventId: ev._id, time: newTime });
  // Send notification for new tee time
  const eventUrl = `${SITE_URL}?event=${ev._id}&time=${encodeURIComponent(newTime)}`;
  await sendEmailToAll(
    `New Tee Time Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
    frame('New Tee Time Added!',
      `<p>A new tee time has been added:</p>
       <p><strong>Event:</strong> ${esc(ev.course)}</p>
       <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
       <p><strong>Tee Time:</strong> ${esc(fmt.tee(newTime))}</p>
       <p>Please <a href="${eventUrl}" style="color:#166534;text-decoration:underline">click here to view this tee time directly</a>.</p>${btn('View Event', eventUrl)}`)
  );
  res.json(ev);
});

// Edit tee time or team name
app.put('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    
    if (ev.isTeamEvent) {
      // Edit team name
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
      tt.name = name.trim();
    } else {
      // Edit tee time - accept any HH:MM format without validation
      const { time } = req.body || {};
      if (!time || !time.trim()) return res.status(400).json({ error: 'time required' });
      const timeStr = time.trim();
      // Basic format check only - allow any HH:MM
      if (!/^\d{1,2}:\d{2}$/.test(timeStr)) {
        return res.status(400).json({ error: 'time must be HH:MM format' });
      }
      tt.time = timeStr;
    }
    
    await ev.save();
    res.json(ev);
  } catch (e) {
    console.error('Edit tee time error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    console.log('[tee-time] Remove request', { eventId: req.params.id, teeId: req.params.teeId });

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

  // Notify subscribers (existing behavior)
  sendEmailToAll(
    `${ev.isTeamEvent ? 'Team' : 'Tee Time'} Removed: ${ev.course} (${fmt.dateISO(ev.date)})`,
    frame(`${ev.isTeamEvent ? 'Team' : 'Tee Time'} Removed`,
      `<p>A ${ev.isTeamEvent ? 'team' : 'tee time'} has been removed:</p>
       <p><strong>Event:</strong> ${esc(ev.course)}</p>
       <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
       ${btn('View Event')}`)
  ).catch(err => console.error('Failed to send tee/team removal email:', err));

  // Send club cancellation email via Resend configuration when requested
  const notifyClub = String(req.query.notifyClub || '0') === '1';
  if (notifyClub) {
    const clubEmail = process.env.CLUB_CANCEL_EMAIL || 'Brian.Jones@blueridgeshadows.com';
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
    sendEmail(clubEmail, subj, html, cc ? { cc } : undefined)
      .then(mailRes => console.log('[tee-time] Club cancel email sent', { clubEmail, cc, subject: subj, result: mailRes }))
      .catch(err => console.error('Failed to send club cancel email:', err));
  }

  res.json({ ok: true, notifyClub, eventId: ev._id, teeLabel });
} catch (e) {
  console.error('[tee-time] Remove error', { eventId: req.params.id, teeId: req.params.teeId, error: e.message });
  res.status(500).json({ error: e.message });
}
});
app.post('/api/events/:id/tee-times/:teeId/players', async (req, res) => {
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

  tt.players.push({ name: trimmedName });
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
  }

  res.json(ev);
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
  
  toTT.players.push({ name: playerName });
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
    }
  ];

  // If no API keys, return only local courses
  if (!GOLF_API_KEY && !GOLF_API_KEY_BACKUP) {
    return res.json(localCourses);
  }
  
  try {
    // Allow state and limit to be passed as query params for testing
    const state = req.query.state || 'Virginia';
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
        const course = {
          id: c.id,
          name: c.club_name || c.course_name || 'Unknown',
          city: c.location?.city || null,
          state: c.location?.state || null,
          phone: null, // API doesn't provide phone
          website: null, // API doesn't provide website
          holes: 18, // Default, API doesn't provide this in search
          par: null // API doesn't provide this in search
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
    { id: 'custom-6', name: 'The Club at Ironwood', city: 'Greenville', state: 'VA', phone: '(540) 337-1234', website: null, holes: 18, par: 72 }
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
        phone: null,
        website: null,
        holes: 18,
        par: null
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
    
    const weatherData = await fetchWeatherForecast(ev.date);
    
    if (!ev.weather) ev.weather = {};
    ev.weather.condition = weatherData.condition;
    ev.weather.icon = weatherData.icon;
    ev.weather.temp = weatherData.temp;
    ev.weather.description = weatherData.description;
    ev.weather.lastFetched = weatherData.lastFetched;
    
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
    const weatherByDate = new Map();
    for (const ev of events) {
      try {
        if (!ev.date || !(ev.date instanceof Date) || isNaN(ev.date.getTime())) {
          failed++;
          errors.push({ eventId: ev._id, date: ev.date, reason: 'Missing or invalid event date' });
          console.error('Weather refresh skipped for event', ev._id, 'due to missing/invalid date:', ev.date);
          continue;
        }
        const dateKey = ev.date.toISOString().slice(0, 10);
        if (!weatherByDate.has(dateKey)) {
          weatherByDate.set(dateKey, fetchWeatherForecast(ev.date));
        }
        const weatherData = await weatherByDate.get(dateKey);
        if (!ev.weather) ev.weather = {};
        ev.weather.condition = weatherData.condition;
        ev.weather.icon = weatherData.icon;
        ev.weather.temp = weatherData.temp;
        ev.weather.description = weatherData.description;
        ev.weather.lastFetched = weatherData.lastFetched;
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
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) {
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
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) {
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

/* Admin - List Subscribers */
app.get('/api/admin/subscribers', async (req, res) => {
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) {
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
  const code = req.query.code || req.body?.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) {
    return res.status(403).json({ error: 'Forbidden' });
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

/* Admin - Send Custom Message to All Subscribers */
app.post('/api/admin/send-custom-message', async (req, res) => {
  const { code, subject, message } = req.body;
  
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) {
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
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  
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
    const weatherByDate = new Map();
    for (const ev of events) {
      try {
        const dateKey = ev.date.toISOString().slice(0, 10);
        if (!weatherByDate.has(dateKey)) {
          weatherByDate.set(dateKey, fetchWeatherForecast(ev.date));
        }
        const weatherData = await weatherByDate.get(dateKey);
        
        if (!ev.weather) ev.weather = {};
        ev.weather.condition = weatherData.condition;
        ev.weather.icon = weatherData.icon;
        ev.weather.temp = weatherData.temp;
        ev.weather.description = weatherData.description;
        ev.weather.lastFetched = weatherData.lastFetched;
        
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
if (require.main === module && process.env.ENABLE_SCHEDULER !== '0') {
  let lastRunForYMD_24 = null;
  let lastRunForYMD_48 = null;
  let lastAdminCheckHour = null;
  let lastWeatherRefreshHour = null;

  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(now).split(':');
      const hour = Number(parts[0]), minute = Number(parts[1]);
      const todayLocalYMD = ymdInTZ(now, LOCAL_TZ);
      const ymd48 = ymdLocalPlusDays(2);


      // Daily 5:00 PM reminders
      if (hour === 17 && minute === 0) {
        // Empty tee times 2 days ahead (48hr)
        if (lastRunForYMD_48 !== ymd48) {
          lastRunForYMD_48 = ymd48;
          await runReminderIfNeeded('auto-17:00-48hr', 2);
        }
        // Empty tee times tomorrow (24hr)
        if (lastRunForYMD_24 !== todayLocalYMD) {
          lastRunForYMD_24 = todayLocalYMD;
          await runReminderIfNeeded('auto-17:00-24hr', 1);
        }
        // Nearly full tee times (4 days out or less)
        await alertNearlyFullTeeTimes();
      }

      // Admin alerts for empty tee times (48hr and 24hr checks)
      // Run every 6 hours at: 6 AM, 12 PM, 6 PM, 12 AM
      if ([0, 6, 12, 18].includes(hour) && minute === 0 && lastAdminCheckHour !== hour) {
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
    } catch (e) {
      console.error('scheduler tick error', e);
    }
  }, 60 * 1000); // check once per minute

  console.log('Scheduler enabled: Daily reminders at 5 PM (24hr & 48hr), Admin alerts every 6 hours, Weather refresh every 2 hours');
}

if (require.main === module) {
  app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));
}
module.exports = app;
// Export helpers for testing
module.exports.nextTeamNameForEvent = nextTeamNameForEvent;
module.exports.nextTeeTimeForEvent = nextTeeTimeForEvent;
