
// scripts/normalize.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    const items = await Event.find({}).exec();
    for (const ev of items) {
      if (typeof ev.date === 'string' && /\d{4}-\d{2}-\d{2}T/.test(ev.date)) {
        const dd = new Date(ev.date);
        ev.date = `${dd.getUTCFullYear()}-${String(dd.getUTCMonth()+1).padStart(2,'0')}-${String(dd.getUTCDate()).padStart(2,'0')}`;
      }
      await ev.save();
    }
    console.log('Normalized', items.length);
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
})();
