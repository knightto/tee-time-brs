// Alert for nearly full tee times (4 days out or less, >50% full)
async function alertNearlyFullTeeTimes() {
  const now = new Date();
  const fourDaysOut = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  // Find all tee-time events (not team events) within next 4 days (inclusive)
  const events = await Event.find({ isTeamEvent: false, date: { $gte: now, $lte: fourDaysOut } }).lean();
  let alertsSent = 0;

  for (const event of events) {
    // Build tee time occupancy map
    const teeTimeSlots = {};
    const totalSlots = event.maxPlayersPerTeeTime || 4; // assume 4 players per tee time by default

    for (const teeTime of event.teeTimes) {
      const key = `${teeTime.date.toISOString().slice(0, 10)}_${teeTime.time}`;
      if (!teeTimeSlots[key]) {
        teeTimeSlots[key] = { total: 0, filled: 0 };
      }
      teeTimeSlots[key].total += totalSlots;
      teeTimeSlots[key].filled += teeTime.players.length;
    }

    // Determine if any tee time is more than 50% full
    let shouldAlert = false;
    for (const key of Object.keys(teeTimeSlots)) {
      const { total, filled } = teeTimeSlots[key];
      if (total > 0 && filled / total > 0.5) {
        shouldAlert = true;
        break;
      }
    }

    if (shouldAlert) {
      try {
        await sendNearlyFullAlert(event, teeTimeSlots);
        alertsSent++;
      } catch (err) {
        console.error('Error sending nearly full tee time alert:', err);
      }
    }
  }

  console.log(`Nearly full tee time alerts sent: ${alertsSent}`);
}

/* server.js v3.13 — daily 5pm empty-tee reminder + manual trigger */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Polyfill fetch for Node < 18
const fetch = global.fetch || require('node-fetch');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
const PORT = process.env.PORT || 5000;

const MONGO_DB_DEFAULT = 'teetimes';

// Email configuration and resend client
let resend = null;
let fromEmail = null;
if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
  const { Resend } = require('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
  fromEmail = process.env.RESEND_FROM;
} else {
  console.warn('RESEND_API_KEY or RESEND_FROM not set; email notifications disabled.');
}

const Subscriber = require('./models/Subscriber');
const Event = require('./models/Event');

// Same CORS + rate limit rules as before
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// Define routes before static middleware to ensure they take precedence
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Handicap tracking removed

// Health check / debug endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      mongoConnected: mongoose.connection.readyState === 1,
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasResendFrom: !!process.env.RESEND_FROM,
      hasSubscriberModel: !!Subscriber,
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// --- Place webhook code at the safest location: after all middleware/routes, before app.listen/module.exports ---
if (process.env.RESEND_API_KEY) {
  const { Resend } = require('resend');
  const TeeTime = require('./models/TeeTime');
  const { parseTeeTimeEmail } = require('./utils/parseTeeTimeEmail');
  const resendClient = new Resend(process.env.RESEND_API_KEY);

  const ALLOWED_TO = ['teetime@xenailexou.resend.app'];
  const ALLOWED_FROM = ['tommy.knight@gmail.com'];

  // Resend email.received webhook: parses tee time emails and creates/updates/cancels tee times in MongoDB based on the email content.
  app.post('/webhooks/resend', async (req, res) => {
    try {
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

      // Fetch full email from Resend
      let email;
      try {
        // NOTE: this assumes resend.inbound.get(emailId) is the correct Receiving API call for your Resend SDK version.
        // If your SDK uses a different method name (e.g., resend.emails.get or resend.emails.receiving.get),
        // update the call accordingly.
        email = await resendClient.inbound.get(emailId);
      } catch (err) {
        console.error('[webhook] Error fetching email from Resend:', err);
        if (err && err.response) {
          console.error('[webhook] Resend API error response:', err.response.status, err.response.data);
        }
        return res.status(500).send('Error fetching email');
      }

      const from = (email.from && email.from.address) || email.from || '';
      const toList = Array.isArray(email.to) ? email.to : [email.to];
      const subject = email.subject || '';
      const text = email.text || '';
      const html = email.html || '';

      // Only process if to and from are allowed
      const toAllowed = toList.some(addr =>
        typeof addr === 'string' &&
        ALLOWED_TO.some(allowed => addr.toLowerCase() === allowed.toLowerCase())
      );
      const fromAllowed = ALLOWED_FROM.some(
        allowed => from.toLowerCase() === allowed.toLowerCase()
      );
      if (!toAllowed || !fromAllowed) {
        console.log('[webhook] Ignored: to/from not allowed', { from, to: toList });
        return res.status(200).send('Ignored: to/from not allowed');
      }

      // Prefer text, fallback to html (strip tags)
      let bodyText = text;
      if (!bodyText && html) {
        bodyText = html
          .replace(/<br\s*\/?/gi, '\n')
          .replace(/<[^>]+>/g, ' ');
      }

      // Parse the email
      const parsed = parseTeeTimeEmail(bodyText, subject);
      console.log('[webhook] Parsed command:', parsed);
      if (!parsed || !parsed.action) {
        console.warn('[webhook] No valid tee time action found');
        return res.status(200).send('No valid tee time data');
      }

      // Compose eventDate from dateStr and timeStr
      let eventDate = null;
      if (parsed.dateStr && parsed.timeStr) {
        const dtStr = parsed.dateStr + ' ' + parsed.timeStr;
        const dt = new Date(dtStr);
        if (!isNaN(dt)) {
          eventDate = dt;
        }
      }
      if (!eventDate) {
        console.warn('[webhook] No valid date/time found');
        return res.status(200).send('No valid date/time');
      }

      // Find existing tee time matching date + time + course
      let teeTime = await TeeTime.findOne({
        dateStr: parsed.dateStr,
        timeStr: parsed.timeStr,
        course: parsed.course
      });

      if (parsed.action === 'CREATE') {
        if (!teeTime) {
          teeTime = await TeeTime.create({
            eventDate,
            dateStr: parsed.dateStr,
            timeStr: parsed.timeStr,
            holes: parsed.holes,
            players: parsed.players,
            course: parsed.course,
            status: 'active',
            source: 'email',
            rawEmail: {
              from,
              to: toList,
              subject,
              body: bodyText.slice(0, 2000)
            }
          });
          console.log('[webhook] Tee time created', teeTime._id);
          return res.status(200).send('Tee time created');
        } else {
          console.log('[webhook] Tee time already exists', teeTime._id);
          return res.status(200).send('Tee time already exists');
        }
      } else if (parsed.action === 'CANCEL') {
        if (teeTime) {
          teeTime.status = 'cancelled';
          await teeTime.save();
          console.log('[webhook] Tee time cancelled', teeTime._id);
          return res.status(200).send('Tee time cancelled');
        } else {
          console.log('[webhook] Cancel received but no matching tee time');
          return res.status(200).send('Cancel: no matching tee time');
        }
      } else if (parsed.action === 'MODIFY') {
        if (teeTime) {
          teeTime.holes = parsed.holes;
          teeTime.players = parsed.players;
          await teeTime.save();
          console.log('[webhook] Tee time modified', teeTime._id);
          return res.status(200).send('Tee time modified');
        } else {
          teeTime = await TeeTime.create({
            eventDate,
            dateStr: parsed.dateStr,
            timeStr: parsed.timeStr,
            holes: parsed.holes,
            players: parsed.players,
            course: parsed.course,
            status: 'active',
            source: 'email',
            rawEmail: {
              from,
              to: toList,
              subject,
              body: bodyText.slice(0, 2000)
            }
          });
          console.log('[webhook] Modify received but no matching tee time; created new', teeTime._id);
          return res.status(200).send('Modify: created new tee time');
        }
      } else {
        console.warn('[webhook] Unknown action', parsed.action);
        return res.status(200).send('Unknown action');
      }
    } catch (err) {
      console.error('[webhook] Internal error:', err);
      return res.status(500).send('Internal server error');
    }
  });
} else {
  console.warn('[webhook] RESEND_API_KEY not set; /webhooks/resend endpoint not registered');
}

app.use(express.static(path.join(__dirname, 'public')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || MONGO_DB_DEFAULT }).then(() => {
  console.log(
    JSON.stringify({
      msg: 'Mongo connected',
      uri: `${mongoUri}\n`,
      dbName: process.env.MONGO_DB || MONGO_DB_DEFAULT
    })
  );
}).catch(err => {
  console.error('Mongo connection error:', err);
});

// ... rest of your existing server.js (routes, scheduler, app.listen, module.exports, etc.) ...
