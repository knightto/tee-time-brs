
/**
 * scripts/migrate_existing_db.js
 * In-place migration to align existing events with the new schema used by v3.5.x.
 *
 * New schema per models/Event.js (v3.5):
 *   course: String (required)
 *   date: String (YYYY-MM-DD)
 *   notes: String (optional)
 *   teeTimes: [{ time: 'HH:MM', players: [{name}] }] with max 4 players per tee time
 *
 * This script:
 *   - Moves legacy "eventName"/"title" to "course" if course is missing.
 *   - Converts date to 'YYYY-MM-DD' string.
 *   - If legacy root "teeTime" and "players" exist, generates teeTimes (3 slots, 10-min interval),
 *     puts legacy players into the first tee time (trimmed, max 4).
 *   - Ensures teeTimes exists (array); removes legacy fields (title, eventName, teeTime, players).
 *
 * Usage:
 *   node scripts/migrate_existing_db.js
 *
 * Requires:
 *   MONGO_URI in environment (or in .env next to the repo).
 */
require('dotenv').config();
const mongoose = require('mongoose');

// Load your app's Event model
const Event = require('../models/Event');

function toYMDString(input) {
  try {
    // If it's already 'YYYY-MM-DD'
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    // If it's ISO-like string
    if (typeof input === 'string' && /\d{4}-\d{2}-\d{2}T/.test(input)) {
      const d = new Date(input);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    // If it's a Date object
    if (input instanceof Date && !isNaN(input)) {
      const y = input.getUTCFullYear();
      const m = String(input.getUTCMonth() + 1).padStart(2, '0');
      const day = String(input.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    // Fallback: try constructing from string as date-only
    if (typeof input === 'string') {
      const d = new Date(input + 'T00:00:00');
      if (!isNaN(d)) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  } catch (_) {}
  return null;
}

function genTeeTimes(startHHMM, count = 3, mins = 10) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startHHMM || '');
  if (!m) return [];
  let h = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  const out = [];
  for (let i = 0; i < count; i++) {
    const tMin = h * 60 + mm + i * mins;
    const H = String(Math.floor(tMin / 60) % 24).padStart(2, '0');
    const M = String(tMin % 60).padStart(2, '0');
    out.push({ time: `${H}:${M}`, players: [] });
  }
  return out;
}

(async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error('Missing MONGO_URI');
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined });

    const items = await Event.find({}).exec();
    let changed = 0;

    for (const ev of items) {
      let dirty = false;

      // 1) Promote legacy title/eventName -> course if course missing
      if ((!ev.course || !String(ev.course).trim()) && (ev.eventName || ev.title)) {
        ev.course = String(ev.eventName || ev.title).trim();
        dirty = true;
      }

      // 2) Coerce date -> 'YYYY-MM-DD' string
      const coerced = toYMDString(ev.date);
      if (coerced && ev.date !== coerced) {
        ev.date = coerced;
        dirty = true;
      }

      // 3) Migrate legacy root teeTime + players -> teeTimes[]
      const hasLegacyPlayers = Array.isArray(ev.players) && ev.players.length > 0;
      if ((!Array.isArray(ev.teeTimes) || ev.teeTimes.length === 0) && (ev.teeTime || hasLegacyPlayers)) {
        const start = ev.teeTime || '09:00';
        ev.teeTimes = genTeeTimes(start, 3, 10);
        // move legacy players into the first tee time (trimmed, max 4)
        if (hasLegacyPlayers) {
          const first = ev.teeTimes[0];
          first.players = ev.players.slice(0, 4).map(p => {
            if (typeof p === 'string') return { name: p.trim() };
            if (p && typeof p.name === 'string') return { name: p.name.trim() };
            return null;
          }).filter(Boolean);
        }
        dirty = true;
      }

      // 4) Ensure teeTimes players <= 4 and {name} shape
      if (Array.isArray(ev.teeTimes)) {
        for (const tt of ev.teeTimes) {
          if (!Array.isArray(tt.players)) tt.players = [];
          tt.players = tt.players.slice(0, 4).map(p => {
            if (typeof p === 'string') return { name: p.trim() };
            if (p && typeof p.name === 'string') return { name: p.name.trim() };
            return null;
          }).filter(Boolean);
        }
      }

      // 5) Strip legacy fields if present
      if (Object.prototype.hasOwnProperty.call(ev.toObject(), 'title')) {
        ev.set('title', undefined, { strict: false });
        dirty = true;
      }
      if (Object.prototype.hasOwnProperty.call(ev.toObject(), 'eventName')) {
        ev.set('eventName', undefined, { strict: false });
        dirty = true;
      }
      if (Object.prototype.hasOwnProperty.call(ev.toObject(), 'teeTime')) {
        ev.set('teeTime', undefined, { strict: false });
        dirty = true;
      }
      if (Object.prototype.hasOwnProperty.call(ev.toObject(), 'players')) {
        ev.set('players', undefined, { strict: false });
        dirty = true;
      }

      if (dirty) {
        await ev.save();
        changed++;
      }
    }

    console.log(`Migrated ${changed} / ${items.length} events`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[migrate_existing_db] error:', e.message);
    process.exit(1);
  }
})();
