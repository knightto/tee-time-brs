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
const PORT = process.env.PORT || 5000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = (process.env.SITE_URL || 'https://tee-time-brs.onrender.com/').replace(/\/$/, '') + '/';
const LOCAL_TZ = process.env.LOCAL_TZ || 'America/New_York';

app.use(express.json());
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

app.use(express.static(path.join(__dirname, 'public')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connected', uri:mongoUri })))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

let Event; try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
let Subscriber; try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = null; }
let AuditLog; try { AuditLog = require('./models/AuditLog'); } catch { AuditLog = null; }
let Settings; try { Settings = require('./models/Settings'); } catch { Settings = null; }
// Handicap model removed

/* ---------------- Admin Configuration ---------------- */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'tommy.knight@gmail.com,jvhyers@gmail.com').split(',').map(e => e.trim()).filter(Boolean);

/* ---------------- Weather helpers ---------------- */
// Default location (Richmond, VA area - adjust for your region)
const DEFAULT_LAT = process.env.DEFAULT_LAT || '37.5407';
const DEFAULT_LON = process.env.DEFAULT_LON || '-77.4360';

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
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
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
    
    return {
      success: true,
      condition: weatherInfo.condition,
      icon: weatherInfo.icon,
      temp: avgTemp,
      description: `${weatherInfo.desc} • ${Math.round(tempMin)}°-${Math.round(tempMax)}°F`,
      lastFetched: new Date()
    };
  } catch (e) {
    console.error('Weather fetch error:', e.message, '(Date:', date.toISOString().split('T')[0], 'Lat:', lat, 'Lon:', lon, ')');
    return {
      success: false,
      condition: 'error',
      icon: '🌤️',
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
    
    // Fetch weather forecast
    const weatherData = await fetchWeatherForecast(eventDate);
    
    const created = await Event.create({
      course,
      courseInfo: courseInfo || {},
      date: eventDate,
      notes,
      isTeamEvent: !!isTeamEvent,
      teamSizeMax: Math.max(2, Math.min(4, Number(teamSizeMax || 4))),
      teeTimes: tt,
      weather: {
        condition: weatherData.condition,
        icon: weatherData.icon,
        temp: weatherData.temp,
        description: weatherData.description,
        lastFetched: weatherData.lastFetched
      }
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
    
    ev.teeTimes.push({ name, time, players: [] });
    await ev.save();
    
    // Send notification for new team
    await sendEmailToAll(
      `New Team Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame('New Team Added!',
        `<p>A new team has been added:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>Team:</strong> ${esc(name)}</p>
         ${btn('View Event')}`)
    );
    
    return res.json(ev);
  }
  // For tee times: accept optional time. If missing, compute next time using event data.
  const { time } = req.body || {};
  let newTime = typeof time === 'string' && time.trim() ? time.trim() : null;
  if (!newTime) {
    newTime = nextTeeTimeForEvent(ev, 9, '07:00');
  }
  // Validate HH:MM and ranges
  const m = /^(\d{1,2}):(\d{2})$/.exec(newTime);
  if (!m) return res.status(400).json({ error: 'time required HH:MM' });
  const hh = parseInt(m[1], 10); const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return res.status(400).json({ error: 'invalid time' });
  if (ev.teeTimes.some(t => t.time === newTime)) return res.status(409).json({ error: 'duplicate time' });
  ev.teeTimes.push({ time: newTime, players: [] });
  await ev.save();
  
  // Send notification for new tee time
  await sendEmailToAll(
    `New Tee Time Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
    frame('New Tee Time Added!',
      `<p>A new tee time has been added:</p>
       <p><strong>Event:</strong> ${esc(ev.course)}</p>
       <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
       <p><strong>Tee Time:</strong> ${esc(fmt.tee(newTime))}</p>
       ${btn('View Event')}`)
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
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    
    const teeLabel = getTeeLabel(ev, tt._id);
    tt.deleteOne();
    await ev.save();
    
    // Send notification for tee time/team deletion
    await sendEmailToAll(
      `${ev.isTeamEvent ? 'Team' : 'Tee Time'} Removed: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame(`${ev.isTeamEvent ? 'Team' : 'Tee Time'} Removed`,
        `<p>A ${ev.isTeamEvent ? 'team' : 'tee time'} has been removed:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>${ev.isTeamEvent ? 'Team' : 'Tee Time'}:</strong> ${esc(teeLabel)}</p>
         ${btn('View Event')}`)
    );
    
    res.json(ev);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    await sendEmailToAll(
      `Player Added: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame('Player Signed Up!',
        `<p><strong>${esc(trimmedName)}</strong> has signed up for:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>${ev.isTeamEvent ? 'Team' : 'Tee Time'}:</strong> ${esc(teeLabel)}</p>
         ${btn('View Event')}`)
    );
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
    
    const playerName = tt.players[idx].name;
    const teeLabel = getTeeLabel(ev, tt._id);
    tt.players.splice(idx, 1);
    await ev.save();
    
    // Audit log
    await logAudit(ev._id, 'remove_player', playerName, {
      teeId: tt._id,
      teeLabel: teeLabel
    });
    
    // Send notification email
    await sendEmailToAll(
      `Player Removed: ${ev.course} (${fmt.dateISO(ev.date)})`,
      frame('Player Removed',
        `<p><strong>${esc(playerName)}</strong> has been removed from:</p>
         <p><strong>Event:</strong> ${esc(ev.course)}</p>
         <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
         <p><strong>${ev.isTeamEvent ? 'Team' : 'Tee Time'}:</strong> ${esc(teeLabel)}</p>
         ${btn('View Event')}`)
    );
    
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
    
    for (const ev of events) {
      const weatherData = await fetchWeatherForecast(ev.date);
      if (!ev.weather) ev.weather = {};
      ev.weather.condition = weatherData.condition;
      ev.weather.icon = weatherData.icon;
      ev.weather.temp = weatherData.temp;
      ev.weather.description = weatherData.description;
      ev.weather.lastFetched = weatherData.lastFetched;
      await ev.save();
      if (weatherData.success) updated++;
    }
    
    res.json({ ok: true, updated, total: events.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    
    // Get all active subscribers (with email enabled)
    const subscribers = await Subscriber.find({ emailEnabled: true });
    
    if (subscribers.length === 0) {
      return res.json({ count: 0, message: 'No active subscribers' });
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

async function checkEmptyTeeTimesForAdminAlert(){
  const now = new Date();
  
  // Check for events 48 hours from now
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const in48HoursDate = in48Hours.toISOString().split('T')[0];
  
  // Check for events 24 hours from now
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in24HoursDate = in24Hours.toISOString().split('T')[0];
  
  const start48 = new Date(in48HoursDate + 'T00:00:00Z');
  const end48 = new Date(in48HoursDate + 'T23:59:59Z');
  const start24 = new Date(in24HoursDate + 'T00:00:00Z');
  const end24 = new Date(in24HoursDate + 'T23:59:59Z');
  
  // Find events in both windows
  const events48 = await Event.find({ isTeamEvent: false, date: { $gte: start48, $lte: end48 } }).lean();
  const events24 = await Event.find({ isTeamEvent: false, date: { $gte: start24, $lte: end24 } }).lean();
  
  let alertsSent = 0;
  
  // Check 48-hour events
  for (const ev of events48) {
    const empties = (ev.teeTimes||[]).filter(tt => !tt.players || !tt.players.length);
    if (empties.length > 0) {
      const emptyTimes = empties.map(tt => fmt.tee(tt.time||'')).join(', ');
      const html = `
        <p><strong>⚠️ 48-Hour Alert: Empty Tee Times</strong></p>
        <p><strong>Event:</strong> ${esc(ev.course||'Course')}</p>
        <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
        <p><strong>Empty Tee Times:</strong> ${esc(emptyTimes)}</p>
        <p><strong>Total Empty:</strong> ${empties.length} of ${ev.teeTimes.length}</p>
        <p>This event is 48 hours away and has empty tee times. Consider reaching out to members.</p>
        ${btn('View Event')}
      `;
      await sendAdminAlert(`48hr Alert: Empty Tee Times - ${ev.course}`, html);
      alertsSent++;
      console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'admin-alert-48hr', event:ev._id, empties:empties.length }));
    }
  }
  
  // Check 24-hour events
  for (const ev of events24) {
    const empties = (ev.teeTimes||[]).filter(tt => !tt.players || !tt.players.length);
    if (empties.length > 0) {
      const emptyTimes = empties.map(tt => fmt.tee(tt.time||'')).join(', ');
      const html = `
        <p><strong>🚨 24-Hour Alert: Empty Tee Times</strong></p>
        <p><strong>Event:</strong> ${esc(ev.course||'Course')}</p>
        <p><strong>Date:</strong> ${esc(fmt.dateLong(ev.date))}</p>
        <p><strong>Empty Tee Times:</strong> ${esc(emptyTimes)}</p>
        <p><strong>Total Empty:</strong> ${empties.length} of ${ev.teeTimes.length}</p>
        <p>This event is 24 hours away and still has empty tee times. Urgent action may be needed.</p>
        ${btn('View Event')}
      `;
      await sendAdminAlert(`24hr Alert: Empty Tee Times - ${ev.course}`, html);
      alertsSent++;
      console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'admin-alert-24hr', event:ev._id, empties:empties.length }));
    }
  }
  
  return { ok: true, alertsSent, events48: events48.length, events24: events24.length };
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

/* manual trigger for admin alerts: GET /admin/check-empty-tees?code=... */
app.get('/admin/check-empty-tees', async (req, res) => {
  const code = req.query.code || '';
  if (!ADMIN_DELETE_CODE || code !== ADMIN_DELETE_CODE) return res.status(403).json({ error: 'Forbidden' });
  try { 
    const r = await checkEmptyTeeTimesForAdminAlert(); 
    return res.json(r); 
  } catch (e) { 
    return res.status(500).json({ error: e.message }); 
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
    for (const ev of events) {
      try {
        const weatherData = await fetchWeatherForecast(ev.date);
        
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
  let lastRunForYMD = null;
  let lastAdminCheckHour = null;
  let lastWeatherRefreshHour = null;
  
  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(now).split(':');
      const hour = Number(parts[0]), minute = Number(parts[1]);
      const todayLocalYMD = ymdInTZ(now, LOCAL_TZ);
      
      // Daily 5:00 PM reminder for tomorrow's empty tee times (sent to subscribers)
      if (hour === 17 && minute === 0 && lastRunForYMD !== todayLocalYMD) {
        lastRunForYMD = todayLocalYMD;
        await runReminderIfNeeded('auto-17:00');
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
  
  console.log('Scheduler enabled: Daily reminders at 5 PM, Admin alerts every 6 hours, Weather refresh every 2 hours');
}

if (require.main === module) {
  app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));
}
module.exports = app;
// Export helpers for testing
module.exports.nextTeamNameForEvent = nextTeamNameForEvent;
module.exports.nextTeeTimeForEvent = nextTeeTimeForEvent;
