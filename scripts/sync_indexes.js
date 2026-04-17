require('dotenv').config();
const mongoose = require('mongoose');
const { initSecondaryConn, getSecondaryConn } = require('../secondary-conn');

const AuditLog = require('../models/AuditLog');
const DeletedTeeTimeArchive = require('../models/DeletedTeeTimeArchive');
const Event = require('../models/Event');
const Subscriber = require('../models/Subscriber');
const Handicap = require('../models/Handicap');
const TeeTimeLog = require('../models/TeeTimeLog');
const BlueRidgeOuting = require('../models/BlueRidgeOuting');
const BlueRidgeRegistration = require('../models/BlueRidgeRegistration');
const BlueRidgeTeam = require('../models/BlueRidgeTeam');
const BlueRidgeTeamMember = require('../models/BlueRidgeTeamMember');
const BlueRidgeWaitlist = require('../models/BlueRidgeWaitlist');

async function sync(label, model) {
  const result = await model.syncIndexes();
  console.log(`[${label}] ${model.modelName} synced`, result);
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || undefined,
  });

  await sync('primary', AuditLog);
  await sync('primary', DeletedTeeTimeArchive);
  await sync('primary', Event);
  await sync('primary', Subscriber);
  await sync('primary', Handicap);
  await sync('primary', TeeTimeLog);

  initSecondaryConn();
  const secondary = getSecondaryConn();
  if (secondary && secondary.readyState !== 1) {
    await new Promise((resolve) => secondary.once('open', resolve));
  }

  if (secondary && secondary.readyState === 1) {
    const SOuting = secondary.model('BlueRidgeOuting', BlueRidgeOuting.schema);
    const SReg = secondary.model('BlueRidgeRegistration', BlueRidgeRegistration.schema);
    const STeam = secondary.model('BlueRidgeTeam', BlueRidgeTeam.schema);
    const SMember = secondary.model('BlueRidgeTeamMember', BlueRidgeTeamMember.schema);
    const SWait = secondary.model('BlueRidgeWaitlist', BlueRidgeWaitlist.schema);
    await sync('secondary', SOuting);
    await sync('secondary', SReg);
    await sync('secondary', STeam);
    await sync('secondary', SMember);
    await sync('secondary', SWait);
  } else {
    console.warn('Secondary DB unavailable; skipping secondary index sync');
  }

  await mongoose.disconnect();
  if (secondary) await secondary.close().catch(() => {});
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
