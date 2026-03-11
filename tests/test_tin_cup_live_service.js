const assert = require('assert');
const {
  defaultTinCupLiveState,
  getScorecardView,
  buildLeaderboard,
  buildDayRows,
  setScorecardScorer,
  updateHoleScore,
  updateMarker,
  submitScorecard,
  seedAllScores,
} = require('../services/tinCupLiveService');

function run() {
  const state = defaultTinCupLiveState();
  const leaderboard = seedAllScores(state, { reset: true });

  assert.strictEqual(Object.keys(state.scorecards || {}).length, 24, 'Seeding should populate all 24 Tin Cup scorecards');
  const holeCount = Object.values(state.scorecards || {}).reduce((sum, card) => {
    const players = card && card.players && typeof card.players === 'object' ? Object.values(card.players) : [];
    return sum + players.reduce((playerSum, player) => playerSum + (Array.isArray(player && player.holes) ? player.holes.filter((gross) => Number.isFinite(Number(gross))).length : 0), 0);
  }, 0);
  assert.strictEqual(holeCount, 1728, 'Seeding should create 1,728 gross scores across all rounds');

  assert.strictEqual((leaderboard.totals || []).length, 16, 'Leaderboard should contain all 16 Tin Cup players');
  assert.strictEqual(leaderboard.matchBoards['Day 1'].length, 16, 'Day 1 match board should contain all players');
  assert.strictEqual(leaderboard.matchBoards['Practice'].length, 16, 'Practice match board should contain all players');

  const matt = leaderboard.totals.find((row) => row.name === 'Matt');
  const spiro = leaderboard.totals.find((row) => row.name === 'Spiro');
  assert(matt, 'Matt leaderboard row should exist');
  assert(spiro, 'Spiro leaderboard row should exist');
  assert.strictEqual(matt.penaltyTotal, 2, 'Matt seed penalty should be reflected in totals');
  assert.strictEqual(spiro.penaltyTotal, 1, 'Spiro seed penalty should be reflected in totals');
  assert.notStrictEqual(matt.day1Net, null, 'Seeded stroke totals should populate Day 1 net totals');
  assert.notStrictEqual(spiro.day4Net, null, 'Seeded stroke totals should populate Day 4 net totals');

  const day3Rows = buildDayRows(leaderboard, 'Day 3');
  const mattDay3 = day3Rows.find((row) => row.name === 'Matt');
  assert(mattDay3, 'Matt day-row entry should exist');
  assert(/pen \+2/.test(mattDay3.detail), 'Penalty-adjusted day detail should include Matt\'s seeded penalty');

  const scorecard = getScorecardView(state, 'Day 1', 0);
  assert.strictEqual(scorecard.players.length, 4, 'Seeded scorecard view should expose foursome players');
  assert(scorecard.players.every((player) => player.complete18 === true), 'Seeded scorecards should be complete for every player');
  assert(scorecard.players.every((player) => Array.isArray(player.holes) && player.holes.length === 18), 'Each seeded player should have 18 holes');
  assert.deepStrictEqual(scorecard.markerHoles.ctp, [3, 7, 12, 17], 'Scorecard view should expose the allowed CTP holes');

  assert.throws(() => {
    updateMarker(state, { dayKey: 'Day 1', slotIndex: 0, type: 'ctp', hole: 5, winner: 'Matt' });
  }, /CTP is only allowed on par-3 holes/, 'Non-par-3 CTP holes should be rejected');

  const updatedScorecard = updateMarker(state, { dayKey: 'Day 1', slotIndex: 0, type: 'ctp', hole: 3, winner: 'Matt' });
  assert.strictEqual(updatedScorecard.markers.ctp['3'], 'Matt', 'Par-3 CTP holes should still save normally');
  const replacedScorecard = updateMarker(state, { dayKey: 'Day 1', slotIndex: 1, type: 'ctp', hole: 3, winner: 'Steve' });
  assert.strictEqual(replacedScorecard.markers.ctp['3'], 'Steve', 'Later CTP picks should replace earlier picks for the same day and hole');
  assert.strictEqual(getScorecardView(state, 'Day 1', 0).markers.ctp['3'], 'Steve', 'Replaced CTP winner should show on other scorecards for that day');
  assert.strictEqual((state.scorecards['Day 1|0'] && state.scorecards['Day 1|0'].markers && state.scorecards['Day 1|0'].markers.ctp['3']) || '', '', 'Previous scorecard should no longer keep the old CTP winner');

  const updatedLongDrive = updateMarker(state, { dayKey: 'Day 1', slotIndex: 0, type: 'longDrive', hole: 5, winner: 'Matt' });
  assert.strictEqual(updatedLongDrive.markers.longDrive['5'], 'Matt', 'Long drive should save normally');
  const replacedLongDrive = updateMarker(state, { dayKey: 'Day 1', slotIndex: 2, type: 'longDrive', hole: 5, winner: 'Brian' });
  assert.strictEqual(replacedLongDrive.markers.longDrive['5'], 'Brian', 'Later long-drive picks should replace earlier picks for the same day and hole');
  assert.strictEqual(getScorecardView(state, 'Day 1', 1).markers.longDrive['5'], 'Brian', 'Replaced long-drive winner should show across other scorecards for that day');

  const opened = setScorecardScorer(state, { dayKey: 'Day 1', slotIndex: 0, scorerName: 'Rick' });
  assert.strictEqual(opened.scorerName, 'Rick', 'Scorecard should persist the golfer who opened it to keep score');

  const submitted = submitScorecard(state, { dayKey: 'Day 1', slotIndex: 0, scorerName: 'Matt' });
  assert.strictEqual(submitted.submitted, true, 'Submitted scorecards should be marked submitted');
  assert.strictEqual(submitted.submittedBy, 'Matt', 'Submitted scorecards should record the scorer name');
  assert(submitted.submittedAt, 'Submitted scorecards should record the submission timestamp');

  assert.throws(() => {
    updateHoleScore(state, { dayKey: 'Day 1', slotIndex: 0, playerName: 'Matt', hole: 18, gross: 4 });
  }, /Admin code required/, 'Submitted scorecards should reject normal edits');

  const adminEdited = updateHoleScore(state, {
    dayKey: 'Day 1',
    slotIndex: 0,
    playerName: 'Matt',
    hole: 18,
    gross: 4,
    allowSubmittedEdit: true,
  });
  assert.strictEqual(adminEdited.players[0].holes[17], 4, 'Admin override should still allow submitted scorecard edits');

  console.log('test_tin_cup_live_service.js passed');
}

run();
