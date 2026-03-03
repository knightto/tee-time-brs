require('dotenv').config();
const mongoose = require('mongoose');
const { initSecondaryConn, getSecondaryConn } = require('../secondary-conn');

const Event = require('../models/Event');
const ValleyAttendee = require('../models/ValleyAttendee');
const ValleyReserveRequest = require('../models/ValleyReserveRequest');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || undefined,
  });

  const eventDelete = await Event.deleteMany({
    $or: [{ course: /^E2E Tee / }, { course: /^E2E Team / }],
  });
  console.log('Primary test events removed:', eventDelete.deletedCount);

  initSecondaryConn();
  const secondary = getSecondaryConn();
  if (secondary && secondary.readyState !== 1) {
    await new Promise((resolve) => secondary.once('open', resolve));
  }

  if (secondary && secondary.readyState === 1) {
    const SValleyAttendee = secondary.model('ValleyAttendee', ValleyAttendee.schema);
    const SValleyReserveRequest = secondary.model('ValleyReserveRequest', ValleyReserveRequest.schema);
    const attendeeDelete = await SValleyAttendee.deleteMany({ name: /^E2E Attendee / });
    const reserveDelete = await SValleyReserveRequest.deleteMany({ name: /^E2E / });
    console.log('Secondary valley attendees removed:', attendeeDelete.deletedCount);
    console.log('Secondary valley reserve requests removed:', reserveDelete.deletedCount);
  } else {
    console.warn('Secondary DB unavailable; skipped secondary cleanup');
  }

  await mongoose.disconnect();
  if (secondary) await secondary.close().catch(() => {});
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
