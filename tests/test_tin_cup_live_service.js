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
  getScrambleResults,
  buildSkinsResults,
  buildScoreRankings,
  buildHandicapSummary,
  buildPayoutSummary,
  updateScrambleHoleScore,
  updateWorkbookConfig,
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
  assert(leaderboard.scramble && Array.isArray(leaderboard.scramble.teams) && leaderboard.scramble.teams.length === 4, 'Seeded leaderboard should expose scramble teams');
  assert(leaderboard.skins && Array.isArray(leaderboard.skins.days) && leaderboard.skins.days.length >= 5, 'Seeded leaderboard should expose skins summaries');
  assert(leaderboard.sideGames && leaderboard.sideGames.longPutt && leaderboard.sideGames.secretSnowman, 'Seeded leaderboard should expose side game summaries');
  assert(leaderboard.payouts && Array.isArray(leaderboard.payouts.rows), 'Seeded leaderboard should expose payout summary');
  assert(Array.isArray(leaderboard.scoreRankings) && leaderboard.scoreRankings.length > 0, 'Seeded leaderboard should expose average score rankings');
  assert(Array.isArray(leaderboard.handicapSummary) && leaderboard.handicapSummary.length === 16, 'Seeded leaderboard should expose handicap summary rows');
  assert(Array.isArray(leaderboard.workbookResults) && leaderboard.workbookResults.length === 16, 'Seeded leaderboard should expose workbook audit rows');

  const scramble = getScrambleResults(state);
  assert(scramble.teams.every((team) => team.played === 18), 'Seeded scramble teams should have 18 entered holes');
  assert(scramble.teams.some((team) => team.rank === 1), 'Seeded scramble teams should rank teams automatically');

  const skins = buildSkinsResults(state);
  assert(skins.days.some((day) => day.skinCount > 0), 'Seeded skins data should produce at least one winning skin day');

  const rankings = buildScoreRankings(state);
  assert(rankings[0] && rankings[0].label === 'Winner', 'Average score rankings should label the winner');

  const handicapSummary = buildHandicapSummary(state);
  const mattHandicap = handicapSummary.find((row) => row.name === 'Matt');
  assert(mattHandicap && mattHandicap.eighteenHole > 0 && mattHandicap.par3 > 0, 'Handicap summary should include converted values');

  const payouts = buildPayoutSummary(state, leaderboard);
  assert.strictEqual(typeof payouts.balance, 'number', 'Payout summary should compute remaining balance');

  const mattWorkbookRow = leaderboard.workbookResults.find((row) => row.name === 'Matt');
  assert(mattWorkbookRow && typeof mattWorkbookRow.ctpWins === 'number' && typeof mattWorkbookRow.longDriveWins === 'number', 'Workbook audit rows should include marker counts');

  const updatedConfig = updateWorkbookConfig(state, {
    accounting: { entryFee: 225, markerPayouts: { ctp: 30 } },
    handicap: { maxHandicap: 30 }
  });
  assert.strictEqual(updatedConfig.accounting.entryFee, 225, 'Workbook config updates should persist entry fee changes');
  assert.strictEqual(updatedConfig.accounting.markerPayouts.ctp, 30, 'Workbook config updates should merge nested marker payouts');
  assert.strictEqual(updatedConfig.accounting.markerPayouts.longPutt, 25, 'Workbook config should retain long putt defaults when not overridden');
  assert.strictEqual(updatedConfig.handicap.maxHandicap, 30, 'Workbook config updates should persist handicap config changes');

  const recalculatedPayouts = buildPayoutSummary(state);
  assert.strictEqual(recalculatedPayouts.mainPot, 3600, 'Updated entry fee should flow into payout pot calculations');
  const mattPayout = recalculatedPayouts.rows.find((row) => row.name === 'Matt');
  assert(mattPayout && mattPayout.longPutt >= 25, 'Long putt winnings should flow into payout rows');
  const spiroAudit = leaderboard.workbookResults.find((row) => row.name === 'Spiro');
  assert(spiroAudit && spiroAudit.secretSnowmanWins >= 1, 'Workbook audit rows should include secret snowman wins');

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

  const scrambleUpdate = updateScrambleHoleScore(state, { teamIndex: 0, hole: 1, gross: 3 });
  assert.strictEqual(scrambleUpdate.teams[0].holes[0], 3, 'Scramble hole updates should persist team hole scores');

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
