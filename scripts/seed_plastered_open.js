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
  entryFee: 90,
  feeSchedule: [
    { key: 'entry_fee', label: 'Player entry fee', amount: 90, basis: 'per_player', category: 'income', enabled: true, notes: 'Amount collected from each player.' },
    { key: 'course_fee', label: 'Course fee', amount: 65, basis: 'per_player', category: 'course', enabled: true, notes: 'Amount owed to the course for each player.' },
    { key: 'prize_pool', label: 'Prize pool', amount: 25, basis: 'per_player', category: 'prize', enabled: true, notes: 'Amount reserved for player payouts.' },
    { key: 'tournament_fees', label: 'Tourney fees', amount: 0, basis: 'flat', category: 'tournament', enabled: true, notes: 'Optional tournament-side costs.' },
    { key: 'raffle_income', label: 'Raffle income', amount: 0, basis: 'flat', category: 'raffle', enabled: true, notes: 'Track actual raffle money in the ledger.' },
    { key: 'raffle_purchases', label: 'Raffle purchases', amount: 0, basis: 'flat', category: 'expense', enabled: true, notes: 'Track actual raffle purchases in the ledger.' },
    { key: 'other_expenses', label: 'Other expenses', amount: 0, basis: 'flat', category: 'expense', enabled: true, notes: 'Food, supplies, signs, and other outing costs.' },
  ],
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
