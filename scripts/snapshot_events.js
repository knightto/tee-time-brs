// scripts/snapshot_events.js
// Run this script to snapshot all Event documents to a dated JSON file in /logs/event_snapshots/

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Event = require('../models/Event');

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teetimes';
  const mongoDb = process.env.MONGO_DB || 'tee-times-dev';
  await mongoose.connect(mongoUri, { dbName: mongoDb });

  const events = await Event.find({}).lean();
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const outDir = path.join(__dirname, '../logs/event_snapshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `events_${dateStr}.json`);
  fs.writeFileSync(outFile, JSON.stringify(events, null, 2));
  console.log(`Snapshot saved: ${outFile} (${events.length} events)`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Snapshot failed:', err);
  process.exit(1);
});
