
// scripts/backfill_titles.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

function friendly(s){ try{ const d = new Date(/\d{4}-\d{2}-\d{2}T/.test(s)?s:s+'T00:00:00'); return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});}catch{return s||'';} }

(async ()=>{
  try{
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    const items = await Event.find({ $or: [{ title: { $exists: false } }, { title: '' }] }).exec();
    for (const ev of items){
      ev.title = `Event ${friendly(ev.date)}`;
      await ev.save();
      console.log('Set', ev._id, '->', ev.title);
    }
    console.log('Done', items.length);
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
})();
