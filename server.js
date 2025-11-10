/* server.js v3.13 — daily 5pm empty-tee reminder + manual trigger */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const SITE_URL = process.env.SITE_URL || 'https://tee-time-brs.onrender.com/';
const LOCAL_TZ = process.env.LOCAL_TZ || 'America/New_York';

app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// Define routes before static middleware to ensure they take precedence
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Handicap tracking removed

app.use(express.static(path.join(__dirname, 'public')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'Mongo connected', uri:mongoUri })))
  .catch((e) => { console.error('Mongo connection error', e); process.exit(1); });

let Event; try { Event = require('./models/Event'); } catch { Event = require('./Event'); }
let Subscriber; try { Subscriber = require('./models/Subscriber'); } catch { Subscriber = null; }
let AuditLog; try { AuditLog = require('./models/AuditLog'); } catch { AuditLog = null; }
// Handicap model removed

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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather API error');
    
    const data = await response.json();
    if (!data.daily || !data.daily.weather_code || !data.daily.weather_code[0]) {
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
    console.error('Weather fetch error:', e.message);
    return {
      success: false,
      condition: null,
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
          .substring(0, 140); // SMS length limit
        await sendEmail(s.email, '', `Tee Times: ${plainText}`);
      } else {
        await sendEmail(s.email, subject, html);
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
    const tt = isTeamEvent ? [] : (Array.isArray(teeTimes) && teeTimes.length ? teeTimes : genTeeTimes(teeTime, 3, 9));
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
    await ev.save(); return res.json(ev);
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
  await ev.save(); res.json(ev);
});
app.delete('/api/events/:id/tee-times/:teeId', async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    const tt = ev.teeTimes.id(req.params.teeId);
    if (!tt) return res.status(404).json({ error: 'tee/team not found' });
    tt.deleteOne(); await ev.save(); res.json(ev);
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
    tt.players.splice(idx, 1);
    await ev.save();
    
    // Audit log
    await logAudit(ev._id, 'remove_player', playerName, {
      teeId: tt._id,
      teeLabel: getTeeLabel(ev, tt._id)
    });
    
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
const SMS_GATEWAYS = {
  verizon: 'vtext.com',
  att: 'txt.att.net',
  tmobile: 'tmomail.net',
  sprint: 'messaging.sprintpcs.com',
  uscellular: 'email.uscc.net',
  boost: 'sms.myboostmobile.com',
  cricket: 'sms.cricketwireless.net',
  metropcs: 'mymetropcs.com'
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
  
  if (!subscriptionType) return res.status(400).json({ error: 'subscriptionType required' });
  
  try {
    if (!Subscriber) return res.status(500).json({ error: 'subscriber model missing' });
    
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
    const subject = subscriptionType === 'email' ? 'Golf Notifications - Subscription Confirmed' : 'Golf Notifications';
    const message = subscriptionType === 'email' 
      ? `<p>Thanks for subscribing! You'll receive email notifications when new golf events are posted.</p><p>Reply STOP to unsubscribe.</p>`
      : `Thanks for subscribing! You'll get text notifications for new golf events. Reply STOP to unsubscribe.`;
    
    try {
      const result = await sendEmail(notifyAddress, subject, message);
      console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'confirmation sent', result }));
    } catch (emailErr) {
      console.error(JSON.stringify({ t:new Date().toISOString(), level:'error', msg:'confirmation failed', error:emailErr.message, stack:emailErr.stack }));
    }
    
    res.json({ ok: true, id: s._id.toString(), type: subscriptionType, isNew: !existing });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

/* ---------------- Reminder logic ---------------- */
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

/* 5:00 PM local scheduler without extra deps
   Only enable when running as the entry point (not when imported by tests)
   and when ENABLE_SCHEDULER is not explicitly disabled. */
if (require.main === module && process.env.ENABLE_SCHEDULER !== '0') {
  let lastRunForYMD = null;
  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(now).split(':');
      const hour = Number(parts[0]), minute = Number(parts[1]);
      const todayLocalYMD = ymdInTZ(now, LOCAL_TZ);
      if (hour === 17 && minute === 0 && lastRunForYMD !== todayLocalYMD) {
        lastRunForYMD = todayLocalYMD;
        await runReminderIfNeeded('auto-17:00');
      }
    } catch (e) {
      console.error('reminder tick error', e);
    }
  }, 60 * 1000); // check once per minute
}

if (require.main === module) {
  app.listen(PORT, () => console.log(JSON.stringify({ t:new Date().toISOString(), level:'info', msg:'listening', port:PORT })));
}
module.exports = app;
// Export helpers for testing
module.exports.nextTeamNameForEvent = nextTeamNameForEvent;
module.exports.nextTeeTimeForEvent = nextTeeTimeForEvent;
