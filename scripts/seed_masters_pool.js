require('dotenv').config();
const mongoose = require('mongoose');
const MastersPool = require('../models/MastersPool');
const MastersPoolEntry = require('../models/MastersPoolEntry');
const {
  buildDefaultPoolPayload,
  buildMockRoundResults,
  buildSampleField,
  buildPoolSummary,
} = require('../services/mastersPoolService');

function buildEntryPicks(pool, offsets = {}) {
  return (pool.tiers || []).map((tier) => {
    const golfers = (pool.golfers || []).filter((golfer) => golfer.tierKey === tier.key).sort((a, b) => a.seed - b.seed);
    const offset = Number(offsets[tier.key] || 0);
    const golfer = golfers[Math.min(offset, Math.max(0, golfers.length - 1))];
    return { tierKey: tier.key, golferId: golfer.golferId };
  });
}

function buildSampleEntrants(pool) {
  const entrantNames = [
    'Tommy', 'Mike', 'Chris', 'Brian', 'Matt',
    'Ryan', 'Danny', 'Scott', 'Kevin', 'Nick',
    'Sam', 'Ben', 'Jordan', 'Alex', 'Tyler',
    'Rob', 'Sean', 'Kyle', 'Zach', 'Evan',
  ];
  const tierKeys = (pool.tiers || []).map((tier) => tier.key);
  return entrantNames.map((entrantName, index) => {
    const offsets = Object.fromEntries(
      tierKeys.map((tierKey, tierIndex) => [tierKey, (index + tierIndex) % 6])
    );
    return {
      poolId: pool._id,
      entrantName,
      email: `${entrantName.toLowerCase()}@example.com`,
      entryFeeSnapshot: 10,
      predictedWinningScoreToPar: -11 + (index % 5),
      submittedAt: new Date(Date.UTC(2026, 3, 8, 9, index * 3, 0)),
      picks: buildEntryPicks(pool.toObject(), offsets),
    };
  });
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const golfers = buildSampleField();
  const slug = `masters-${new Date().getFullYear()}-demo`;
  const existingPools = await MastersPool.find({ slug }).select('_id').lean();
  if (existingPools.length) {
    await MastersPoolEntry.deleteMany({ poolId: { $in: existingPools.map((pool) => pool._id) } });
    await MastersPool.deleteMany({ slug });
  }
  const pool = await MastersPool.create(buildDefaultPoolPayload({
    name: `Masters Demo Pool ${new Date().getFullYear()}`,
    slug,
    season: new Date().getFullYear(),
    status: 'live',
    entryFee: 10,
    expectedEntrants: 20,
    accessCode: '1986',
    tierRules: { tierCount: 6, picksPerTier: 1 },
    lineupRules: { countMode: 'all', bestX: null },
    golfers,
    roundResults: buildMockRoundResults(golfers),
  }));

  const entries = await MastersPoolEntry.insertMany(buildSampleEntrants(pool));

  const summary = buildPoolSummary(pool.toObject(), entries.map((entry) => entry.toObject()));
  console.log(`Seeded Masters pool: ${pool.name} (${pool._id})`);
  console.log(`Access code: ${pool.accessCode}`);
  console.log(`Entries: ${summary.payouts.totalEntries} | Pot: $${summary.payouts.totalPot}`);
  summary.leaderboard.slice(0, 3).forEach((row) => {
    console.log(`${row.rank}. ${row.entrantName} - ${row.totalPoints} pts`);
  });
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
