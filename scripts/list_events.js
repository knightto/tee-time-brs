// scripts/list_events.js
// Usage: node scripts/list_events.js
// Lists all event IDs and dates in the current database

const mongoose = require('mongoose');
const Event = require('../models/Event');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
const MONGO_DB = process.env.MONGO_DB || 'tee-times-dev';

async function listEvents() {
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
  const events = await Event.find({}).sort({ date: 1 });
  if (!events.length) {
    console.log('No events found.');
  } else {
    console.log(`Found ${events.length} events:`);
    for (const ev of events) {
      console.log(`- ID: ${ev._id} | Date: ${ev.date instanceof Date ? ev.date.toISOString().slice(0,10) : ev.date}`);
    }
  }
  await mongoose.disconnect();
}

listEvents().catch(e => {
  console.error('Error listing events:', e);
  process.exit(1);
});
