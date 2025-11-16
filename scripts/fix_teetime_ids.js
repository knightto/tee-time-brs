// scripts/fix_teetime_ids.js
// Usage: node scripts/fix_teetime_ids.js
// Ensures all teeTimes subdocs have valid ObjectId _id fields

const mongoose = require('mongoose');
const { Types } = mongoose;
const Event = require('../models/Event');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
const MONGO_DB = process.env.MONGO_DB || 'tee-times-dev';

async function fixTeeTimeIds() {
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
  const events = await Event.find({});
  let fixedEvents = 0, fixedTeeTimes = 0;
  for (const ev of events) {
    let changed = false;
    if (Array.isArray(ev.teeTimes)) {
      for (const tt of ev.teeTimes) {
        if (!tt._id || !Types.ObjectId.isValid(tt._id)) {
          tt._id = new Types.ObjectId();
          changed = true;
          fixedTeeTimes++;
        }
      }
    }
    if (changed) {
      await ev.save();
      fixedEvents++;
      console.log(`Fixed event ${ev._id} (${ev.date}): teeTimes IDs updated.`);
    }
  }
  console.log(`Done. Fixed ${fixedTeeTimes} teeTimes in ${fixedEvents} events.`);
  await mongoose.disconnect();
}

fixTeeTimeIds().catch(e => {
  console.error('Error fixing teeTime IDs:', e);
  process.exit(1);
});
