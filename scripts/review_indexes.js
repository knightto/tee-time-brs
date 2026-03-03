require('dotenv').config();
const mongoose = require('mongoose');
const { initSecondaryConn, getSecondaryConn } = require('../secondary-conn');

const Event = require('../models/Event');
const Subscriber = require('../models/Subscriber');
const Handicap = require('../models/Handicap');
const Trip = require('../models/Trip');
const TripParticipant = require('../models/TripParticipant');
const BlueRidgeOuting = require('../models/BlueRidgeOuting');
const BlueRidgeRegistration = require('../models/BlueRidgeRegistration');

async function printIndexes(label, model) {
  try {
    const indexes = await model.collection.indexes();
    console.log(`\n[${label}] ${model.collection.collectionName}`);
    indexes.forEach((idx) => console.log(JSON.stringify(idx)));
  } catch (e) {
    console.warn(`[${label}] skipped ${model.modelName}: ${e.message}`);
  }
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || undefined,
  });

  initSecondaryConn();
  const secondary = getSecondaryConn();
  if (secondary && secondary.readyState !== 1) {
    await new Promise((resolve) => secondary.once('open', resolve));
  }

  await printIndexes('primary', Event);
  await printIndexes('primary', Subscriber);
  await printIndexes('primary', Handicap);

  if (secondary && secondary.readyState === 1) {
    const SecondaryTrip = secondary.model('Trip', Trip.schema);
    const SecondaryTripParticipant = secondary.model('TripParticipant', TripParticipant.schema);
    const SecondaryOuting = secondary.model('BlueRidgeOuting', BlueRidgeOuting.schema);
    const SecondaryReg = secondary.model('BlueRidgeRegistration', BlueRidgeRegistration.schema);
    await printIndexes('secondary', SecondaryTrip);
    await printIndexes('secondary', SecondaryTripParticipant);
    await printIndexes('secondary', SecondaryOuting);
    await printIndexes('secondary', SecondaryReg);
  } else {
    console.warn('Secondary DB unavailable; skipping secondary index review');
  }

  await mongoose.disconnect();
  if (secondary) await secondary.close().catch(() => {});
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
