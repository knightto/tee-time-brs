// Seed handicaps with a static list
require('dotenv').config();
const mongoose = require('mongoose');
const Handicap = require('../models/Handicap');

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';

const SEED_OWNER = 'seed';
const DATA = [
  ['steven bradley', 'Blue Ridge Shadows Golf Club', 12.6],
  ['Joshua Brown', 'Laurel Hill Golf Club', 9.7],
  ['Daniel Burstock', 'Blue Ridge Shadows Golf Club', 5.6],
  ['Nick Cassiano', 'Blue Ridge Shadows Golf Club', 9.2],
  ['Vinni Cassiano', 'Blue Ridge Shadows Golf Club', 4.4],
  ['Tim Chapman', 'Blue Ridge Shadows Golf Club', 23.7],
  ['Glen Dietz', 'Blue Ridge Shadows Golf Club', 15.0],
  ['Dennis Freeman', 'Blue Ridge Shadows Golf Club', 15.0],
  ['Duane Harris', 'Blue Ridge Shadows Golf Club', 22.1],
  ['John Hyers', 'Blue Ridge Shadows Golf Club', 11.2],
  ['Gary Knight', 'Blue Ridge Shadows Golf Club', 19.1],
  ['Tommy Knight Jr', 'Blue Ridge Shadows Golf Club', 9.1],
  ['Tommy Knight', 'Blue Ridge Shadows Golf Club', 20.7],
  ['Chad Lang', 'Blue Ridge Shadows Golf Club', 3.7],
  ['Thomas Lasik', 'Herndon Centennial Golf Course', 9.1],
  ['Pete Licklider', 'Blue Ridge Shadows Golf Club', 5.5],
  ['Lenny Long', 'Blue Ridge Shadows Golf Club', 7.0],
  ['Kolby Madigan', 'Blue Ridge Shadows Golf Club', 2.0],
  ['Matthew Meehan', 'USGA/VSGA GC', 19.1],
  ['Lawrence Morikawa', 'Blue Ridge Shadows Golf Club', 20.2],
  ['manny ordonez', 'Blue Ridge Shadows Golf Club', 24.3],
  ['Marcus Ordonez', 'Blue Ridge Shadows Golf Club', 16.3],
  ['Ty Ordonez', 'YOC Virginia', 18.5],
  ['Pat Palmer', 'Loudoun Golf & Country Club', 17.6],
  ['John Quimby', 'Blue Ridge Shadows Golf Club', 1.7],
  ['matthew shannon', 'Blue Ridge Shadows Golf Club', 19.8],
];

async function run() {
  await mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || undefined });
  let added = 0;
  for (const [name, clubName, handicapIndex] of DATA) {
    const existing = await Handicap.findOne({ name });
    if (existing) continue;
    await Handicap.create({
      name,
      clubName,
      handicapIndex,
      ownerCode: SEED_OWNER,
    });
    added++;
  }
  console.log(`Seed complete: added ${added} records`);
  await mongoose.connection.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
