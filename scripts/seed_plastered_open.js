require('dotenv').config();
const mongoose = require('mongoose');

const NAME = 'Plastered "Open"';
const START_DATE = new Date('2026-06-19');
const END_DATE = new Date('2026-06-19');
const SIGNUP_OPEN_AT = new Date('2026-04-18T08:00:00-04:00');
const SIGNUP_CLOSE_AT = new Date('2026-06-17T18:00:00-04:00');

const secondaryUri = String(process.env.MONGO_URI_SECONDARY || '').trim();
const secondaryDb = process.env.MONGO_DB_SECONDARY || undefined;

if (!secondaryUri) {
  console.error('Missing MONGO_URI_SECONDARY in environment');
  process.exit(1);
}

const payload = {
  name: NAME,
  formatType: '2-Man Scramble',
  startDate: START_DATE,
  endDate: END_DATE,
  signupOpenAt: SIGNUP_OPEN_AT,
  signupCloseAt: SIGNUP_CLOSE_AT,
  status: 'open',
  teamSizeMin: 1,
  teamSizeMax: 2,
  teamSizeExact: 2,
  requirePartner: false,
  maxTeams: 60,
  maxPlayers: 120,
  allowSingles: false,
  allowSeekingPartner: false,
  allowSeekingTeam: false,
  allowPartialTeamSignup: false,
  allowFullTeamSignup: true,
  allowMemberGuestSignup: false,
  allowCaptainSignup: false,
  allowJoinExistingTeam: true,
  allowGuests: true,
  memberOnly: false,
  handicapRequired: false,
  flights: 'Flights and payouts scale to the final field size.',
  entryFee: 85,
  registrationNotes: 'Friday, June 19, 2026 in Front Royal, Virginia. 9:00 AM shotgun, 2-man scramble teams, lunch, cash prizes, drawings, flights, and post-round U.S. Open viewing. After signing up, contact the organizer within 2 days or your team may be removed.',
  cancellationPolicy: 'If you need to back out, do it before signup closes so the spot can be reassigned.',
  autoWaitlist: true,
};

async function main() {
  const conn = await mongoose.createConnection(secondaryUri, { dbName: secondaryDb }).asPromise();
  try {
    const BlueRidgeOuting = conn.model('BlueRidgeOuting', require('../models/BlueRidgeOuting').schema);
    const doc = await BlueRidgeOuting.findOneAndUpdate(
      { name: NAME, startDate: START_DATE },
      { $set: payload },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    console.log(JSON.stringify({
      ok: true,
      id: String(doc._id),
      name: doc.name,
      status: doc.status,
      startDate: doc.startDate,
      signupOpenAt: doc.signupOpenAt,
      signupCloseAt: doc.signupCloseAt,
      maxTeams: doc.maxTeams,
      maxPlayers: doc.maxPlayers,
      teamSizeExact: doc.teamSizeExact,
      entryFee: doc.entryFee,
    }, null, 2));
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
