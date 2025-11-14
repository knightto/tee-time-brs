// Usage: node scripts/seed_november_events.js
const mongoose = require('mongoose');
const { MONGO_URI, MONGO_DB } = process.env;
const uri = MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
const db = MONGO_DB || 'tee-times-dev';

const Event = require('../models/Event');

function asUTCNoon(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T12:00:00Z');
  return d;
}

async function main() {
  await mongoose.connect(uri, { dbName: db });
  const novDates = ['2025-11-08', '2025-11-14', '2025-11-18', '2025-11-22', '2025-11-28'];
  const teeTimesList = [
    ['07:00', '07:09', '07:18'],
    ['08:00', '08:09', '08:18', '08:27'],
    ['09:00', '09:09', '09:18'],
    ['10:00', '10:09', '10:18', '10:27'],
    ['11:00', '11:09', '11:18']
  ];
  const courses = ['Blue Ridge Shadows', 'Caverns', 'Rock Harbor', 'Shenandoah Valley', 'Ironwood'];
  const notes = ['Test event A', 'Test event B', 'Test event C', 'Test event D', 'Test event E'];

  for (let i = 0; i < novDates.length; i++) {
    const teeTimes = teeTimesList[i].map(time => ({ time, players: [] }));
    const ev = new Event({
      course: courses[i],
      date: asUTCNoon(novDates[i]),
      notes: notes[i],
      isTeamEvent: false,
      teeTimes
    });
    await ev.save();
    console.log(`Created event for ${courses[i]} on ${novDates[i]}`);
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
