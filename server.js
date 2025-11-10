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
const PORT = process.env.PORT || 300;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = process.env.SITE_URL || 'https://tee-time-brs.onrender.com/';
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
async function sendEmailToAll(subject, html) {
  if (!Subscriber) return { ok:false, reason:'no model' };
  const subs = await Subscriber.find({}).lean();
  if (!subs.length) return { ok:true, sent:0 };
  let sent = 0;
  for (const s of subs) {
    try {
      // Add personalized unsubscribe link
      const unsubLink = `${SITE_URL}api/unsubscribe/${s.unsubscribeToken}`;
      
      // For SMS subscribers, send plain text version (SMS gateways ignore HTML)
      if (s.subscriptionType === 'sms') {
        // Convert HTML to simple text for SMS
        const plainText = html
          .replace(/<[^>]*>/g, '') // Strip HTML tags
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ') // Collapse whitespace
          .trim()
          .substring(0, 120); // SMS length limit (leave room for unsub link)
        await sendEmail(s.email, '', `Tee Times: ${plainText} Unsub: ${unsubLink}`);
      } else {
        // For email, add unsubscribe link to the HTML
        const htmlWithUnsub = html.replace(
          /You received this because you subscribed to tee time updates\./,
          `You received this because you subscribed to tee time updates. <a href="${unsubLink}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>`
        );
        await sendEmail(s.email, subject, htmlWithUnsub);
      }
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
    const { course, date, teeTime, teeTimes, notes, isTeamEvent, teamSizeMax } = req.body || {};
    let tt;
    if (isTeamEvent) {
      // Generate 3 default teams for team events
      tt = [
        { name: 'Team 1', players: [] },
        { name: 'Team 2', players: [] },
        { name: 'Team 3', players: [] }
      ];
    } else {
      // Generate 3 default tee times for tee-time events
      tt = Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 9);
    }
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date||'')) ? new Date(String(date)+'T12:00:00Z') : asUTCDate(date);
    
    // Fetch weather forecast
    const weatherData = await fetchWeatherForecast(eventDate);
    
    const created = await Event.create({
      course,
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
  
  // Notify subscribers about the cancellation
  await sendEmailToAll(`Event Cancelled: ${del.course} (${fmt.dateISO(del.date)})`,
    frame('Golf Event Cancelled',
          `<p>The following event has been cancelled:</p>
           <p><strong>Event:</strong> ${esc(fmt.dateShortTitle(del.date))}</p>
           <p><strong>Course:</strong> ${esc(del.course||'')}</p>
           <p><strong>Date:</strong> ${esc(fmt.dateLong(del.date))}</p>
           <p>We apologize for any inconvenience.</p>${btn('View Other Events')}`));
  
  res.json({ ok: true });
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
    ev.teeTimes.push({ name, players: [] });
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
  
  // Send notification email
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

/* ---------------- SMS Gateway Mapping ---------------- */
// Updated 2025-11-10 - Verified carrier SMS email gateways
// Format: number@gateway (e.g., 5551234567@txt.att.net)
const SMS_GATEWAYS = {
  // Major carriers
  verizon: 'vtext.com',                    // Verizon Wireless
  att: 'txt.att.net',                       // AT&T (SMS - 160 char)
  'att-mms': 'mms.att.net',                 // AT&T (MMS - longer messages, images)
  tmobile: 'tmomail.net',                   // T-Mobile
  sprint: 'messaging.sprintpcs.com',        // Sprint (now part of T-Mobile but still works)
  
  // Regional & MVNOs
  uscellular: 'email.uscc.net',             // U.S. Cellular
  boost: 'sms.myboostmobile.com',           // Boost Mobile
  cricket: 'sms.cricketwireless.net',       // Cricket Wireless (AT&T owned)
  metropcs: 'mymetropcs.com',               // Metro by T-Mobile
  
  // Other carriers
  virgin: 'vmobl.com',                      // Virgin Mobile
  tracfone: 'mmst5.tracfone.com',           // Tracfone
  mint: 'mailmymobile.net',                 // Mint Mobile (uses T-Mobile)
  visible: 'vtext.com',                     // Visible (uses Verizon)
  straighttalk: 'vtext.com',                // Straight Talk (varies by network)
  'consumer-cellular': 'mailmymobile.net',  // Consumer Cellular
  xfinity: 'vtext.com',                     // Xfinity Mobile (uses Verizon)
  spectrum: 'vtext.com',                    // Spectrum Mobile (uses Verizon)
  googlefi: 'msg.fi.google.com',            // Google Fi
  
  // Legacy (may still work)
  alltel: 'text.wireless.alltel.com',
  nextel: 'messaging.nextel.com'
};

function getSMSEmail(phone, carrier) {
  const gateway = SMS_GATEWAYS[carrier];
  if (!gateway) return null;
  // Remove any non-digit characters from phone
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.length !== 10) return null;
  return `${cleanPhone}@${gateway}`;
}

/* ---------------- Subscribers ---------------- */
app.post('/api/subscribe', async (req, res) => {
  const { subscriptionType, email, phone, carrier } = req.body || {};
  
  console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'subscribe request received', subscriptionType, email: email ? '***' : null, phone: phone ? '***' : null }));
  
  if (!subscriptionType) return res.status(400).json({ error: 'subscriptionType required' });
  
  try {
    if (!Subscriber) {
      console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'Subscriber model not loaded' }));
      return res.status(500).json({ error: 'subscriber model missing' });
    }
    
    let subscriberData = { subscriptionType };
    let notifyAddress;
    
    if (subscriptionType === 'email') {
      if (!email) return res.status(400).json({ error: 'email required for email subscription' });
      subscriberData.email = email.toLowerCase();
      notifyAddress = email.toLowerCase();
    } else if (subscriptionType === 'sms') {
      if (!phone || !carrier) return res.status(400).json({ error: 'phone and carrier required for SMS subscription' });
      
      const smsEmail = getSMSEmail(phone, carrier);
      if (!smsEmail) return res.status(400).json({ error: 'Invalid phone number or unsupported carrier' });
      
      subscriberData.email = smsEmail; // Store SMS gateway email
      subscriberData.phone = phone.replace(/\D/g, '');
      subscriberData.carrier = carrier;
      notifyAddress = smsEmail;
    } else {
      return res.status(400).json({ error: 'Invalid subscription type' });
    }
    
    // Check if subscriber already exists
    const existing = await Subscriber.findOne({ email: subscriberData.email });
    
    const s = await Subscriber.findOneAndUpdate(
      { email: subscriberData.email }, 
      { $set: subscriberData }, 
      { upsert: true, new: true }
    );
    
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'subscriber added', type:subscriptionType, address:notifyAddress, isNew: !existing }));
    
    // Send confirmation (always send for testing; in production you might want to only send if !existing)
    console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'sending confirmation', to:notifyAddress, type:subscriptionType }));
    const unsubLink = `${SITE_URL}api/unsubscribe/${s.unsubscribeToken}`;
    const subject = subscriptionType === 'email' ? 'Golf Notifications - Subscription Confirmed' : 'Golf Notifications';
    const message = subscriptionType === 'email' 
      ? `<p>Thanks for subscribing! You'll receive email notifications when new golf events are posted.</p><p><a href="${unsubLink}">Click here to unsubscribe</a></p>`
      : `Thanks for subscribing! You'll get text notifications for new golf events. Reply STOP to unsubscribe or visit: ${unsubLink}`;
    
    try {
      const result = await sendEmail(notifyAddress, subject, message);
      console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'confirmation sent', result }));
    } catch (emailErr) {
      console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'confirmation failed', error:emailErr.message, stack:emailErr.stack }));
    }
    
    res.json({ ok: true, id: s._id.toString(), type: subscriptionType, isNew: !existing });
  } catch (e) { 
    console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'subscribe error', error:e.message, stack:e.stack }));
    res.status(500).json({ error:e.message }); 
  }
});

/* Test SMS/Email delivery */
app.post('/api/test-sms', async (req, res) => {
  const { phone, carrier } = req.body || {};
  if (!phone || !carrier) return res.status(400).json({ error: 'phone and carrier required' });
  
  const smsEmail = getSMSEmail(phone, carrier);
  if (!smsEmail) return res.status(400).json({ error: 'Invalid phone number or unsupported carrier' });
  
  try {
    const testMessage = `Test from Tee Times (golfgroup.online). If you received this, SMS alerts are working! Reply STOP to unsubscribe.`;
    const result = await sendEmail(smsEmail, 'Tee Times Test', testMessage);
    
    if (result.ok) {
      return res.json({ 
        ok: true, 
        message: 'Test sent successfully',
        gateway: smsEmail,
        id: result.data?.id 
      });
    } else if (result.disabled) {
      return res.status(503).json({ error: 'Email disabled - check RESEND_API_KEY and RESEND_FROM' });
    } else {
      return res.status(500).json({ error: 'Failed to send test message' });
    }
  } catch (e) {
    console.error('Test SMS error:', e);
    return res.status(500).json({ error: e.message });
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
