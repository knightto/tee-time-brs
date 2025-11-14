// Usage: node scripts/list_event_dates.js
const mongoose = require('mongoose');
const { MONGO_URI, MONGO_DB } = process.env;
const uri = MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
const db = MONGO_DB || 'tee-times-dev';

const Event = require('../models/Event');

async function main() {
  await mongoose.connect(uri, { dbName: db });
  const events = await Event.find().sort({ date: 1 }).lean();
  for (const ev of events) {
    console.log({
      _id: ev._id,
      course: ev.course,
      date: ev.date,
      dateISO: ev.date ? new Date(ev.date).toISOString() : null,
      isTeamEvent: ev.isTeamEvent,
      teeTimes: (ev.teeTimes||[]).map(tt => ({ time: tt.time, players: (tt.players||[]).length })),
      notes: ev.notes
    });
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
