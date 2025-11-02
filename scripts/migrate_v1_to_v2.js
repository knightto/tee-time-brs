
// scripts/migrate_v1_to_v2.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

function gen(start, players) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start || '');
  if (!m) return [];
  let h = parseInt(m[1],10), mm = parseInt(m[2],10);
  const out = [];
  for (let i=0;i<3;i++){ const t=h*60+mm+i*10; const H=String(Math.floor(t/60)%24).padStart(2,'0'); const M=String(t%60).padStart(2,'0'); out.push({ time:`${H}:${M}`, players: i===0 ? (players||[]) : [] }); }
  return out;
}
(async ()=>{
  try{
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    const items = await Event.find({ teeTimes: { $size: 0 } }).exec();
    for (const ev of items){
      const players = ev.players || [];
      const time = ev.teeTime || '';
      ev.teeTimes = gen(time, players);
      ev.set('players', undefined, { strict:false });
      ev.set('teeTime', undefined, { strict:false });
      await ev.save();
    }
    console.log('Migrated', items.length);
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
})();
