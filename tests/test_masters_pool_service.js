const assert = require('assert');
const {
  buildDefaultPoolPayload,
  buildMockRoundResults,
  buildPoolSummary,
  buildSampleField,
  computeGolferScores,
  computePayouts,
  rankEntries,
  scoreEntry,
  upsertRoundResult,
  validateEntrySubmission,
} = require('../services/mastersPoolService');

function buildTierPicks(pool, offsetByTier = {}) {
  return (pool.tiers || []).flatMap((tier) => {
    const golfers = (pool.golfers || []).filter((golfer) => golfer.tierKey === tier.key).sort((a, b) => a.seed - b.seed);
    const startOffset = Number(offsetByTier[tier.key] || 0);
    return golfers.slice(startOffset, startOffset + 4).map((golfer) => ({ tierKey: tier.key, golferId: golfer.golferId }));
  });
}

function run() {
  const golfers = buildSampleField();
  const pool = buildDefaultPoolPayload({
    name: 'Masters Tier Test Pool',
    accessCode: 'sunday-red',
    entryFee: 10,
    expectedEntrants: 3,
    golfers,
    roundResults: buildMockRoundResults(golfers),
  });

  assert.strictEqual(pool.poolFormat, 'tiered_picks', 'Tiered picks should be the default format');
  assert.strictEqual(pool.selectionMode, 'tiers', 'Tier selection should be the active mode');
  assert.strictEqual(pool.tiers.length, 6, 'Default official field should be split into six tiers');
  assert.strictEqual(pool.golfers.length, golfers.length, 'All official players should remain in the field');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(pool, '_id'), false, 'Default payload should omit ids until persistence');

  const updated = {
    ...pool,
    _id: 'pool-1',
    roundResults: upsertRoundResult(pool, 4, pool.golfers.map((golfer, index) => ({
      golferId: golfer.golferId,
      name: golfer.name,
      position: index + 1,
      madeCut: index < 50,
      scoreToPar: index === 0 ? -11 : -(12 - (index % 8)),
      status: index < 50 ? 'finished' : 'missed_cut',
    })), { actualWinningScoreToPar: -11 }),
  };

  const scores = computeGolferScores(updated);
  assert(scores.golfers[0].cumulative[4] > 0, 'Golfers should accumulate points across rounds');
  assert.strictEqual(scores.latestCompletedRound, 4, 'Mock scoring should report four completed rounds');

  const validPicks = buildTierPicks(updated);
  const validation = validateEntrySubmission(updated, {
    entrantName: 'Tommy',
    accessCode: 'sunday-red',
    picks: validPicks,
  });
  assert.strictEqual(validation.ok, true, 'Four golfers from each tier should validate');

  const invalidValidation = validateEntrySubmission(updated, {
    entrantName: 'Tommy',
    accessCode: 'wrong-code',
    picks: validPicks,
  });
  assert.strictEqual(invalidValidation.ok, false, 'Wrong access code should fail validation');

  const incompleteValidation = validateEntrySubmission(updated, {
    entrantName: 'Tommy',
    accessCode: 'sunday-red',
    picks: validPicks.slice(0, 5),
  });
  assert.strictEqual(incompleteValidation.ok, false, 'Missing one tier pick should fail validation');

  const entryA = {
    _id: 'a',
    entrantName: 'Entry A',
    predictedWinningScoreToPar: -11,
    submittedAt: new Date('2026-04-07T10:00:00Z'),
    picks: validPicks,
  };
  const entryB = {
    _id: 'b',
    entrantName: 'Entry B',
    predictedWinningScoreToPar: -10,
    submittedAt: new Date('2026-04-07T09:00:00Z'),
    picks: buildTierPicks(updated, { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 }),
  };
  const entryC = {
    _id: 'c',
    entrantName: 'Entry C',
    predictedWinningScoreToPar: -11,
    submittedAt: new Date('2026-04-07T08:00:00Z'),
    picks: validPicks,
  };

  const scoreA = scoreEntry(updated, entryA);
  assert.strictEqual(scoreA.golferBreakdown.length, updated.tiers.length * 4, 'Tier entry should score four golfers per tier');
  assert(scoreA.totalPoints > 0, 'Tier entry should accumulate positive points');
  assert(scoreA.sundayPoints > 0, 'Tier entry should expose Sunday points for tiebreakers');

  const ranked = rankEntries(updated, [entryB, entryA]);
  assert.strictEqual(ranked[0].entry.entrantName, 'Entry A', 'Higher-scoring roster should rank first');
  const tiedRanked = rankEntries(updated, [entryA, entryC]);
  assert.strictEqual(tiedRanked[0].entry.entrantName, 'Entry C', 'Earlier valid submission should break a full tie');

  const payouts = computePayouts(updated, ranked);
  assert.strictEqual(payouts.totalPot, 20, 'Two entries at $10 should create a $20 pot');
  assert.strictEqual(payouts.rows[0].amount, 12, 'First-place default payout should be 60%');

  const summary = buildPoolSummary(updated, [entryA, entryB]);
  assert.strictEqual(summary.pool._id, 'pool-1', 'Summary should preserve pool ids for routing');
  assert.strictEqual(summary.tiers.length, 6, 'Summary should expose six tiers by default');
  assert.strictEqual(summary.leaderboard[0].entrantName, 'Entry A', 'Summary leaderboard should preserve ranking');
  assert.strictEqual(summary.leaderboard[0].madeCutCount >= 0, true, 'Summary leaderboard should expose cut counts');

  console.log('test_masters_pool_service.js passed');
}

run();
