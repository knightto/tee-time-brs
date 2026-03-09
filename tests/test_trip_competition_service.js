const assert = require('assert');
const {
  buildTripCompetitionView,
  computeCountedRounds,
  getDefaultScorecard,
} = require('../services/tripCompetitionService');

function makeScorecard() {
  return Array.from({ length: 18 }, (_, index) => ({
    hole: index + 1,
    par: 4,
    handicap: index + 1,
  }));
}

function makeRound(course, playerScores, teeTimes = []) {
  return {
    course,
    date: new Date('2026-03-18'),
    time: '08:00',
    scorecard: makeScorecard(),
    teeTimes,
    playerScores,
    teamMatches: [],
    ctpWinners: [],
    skinsResults: [],
    unassignedPlayers: [],
  };
}

function repeatScore(value, count = 18) {
  return Array.from({ length: count }, () => value);
}

function mixedScores(frontValue, backValue) {
  return repeatScore(frontValue, 9).concat(repeatScore(backValue, 9));
}

function run() {
  const leaderboardTrip = {
    competition: { scoringMode: 'best4' },
    rounds: [
      makeRound('Round 1', [
        { playerName: 'Alice', holes: repeatScore(4) },
        { playerName: 'Bob', holes: repeatScore(5) },
      ]),
      makeRound('Round 2', [
        { playerName: 'Alice', holes: repeatScore(4) },
        { playerName: 'Bob', holes: mixedScores(4, 5) },
      ]),
      makeRound('Round 3', [
        { playerName: 'Alice', holes: repeatScore(5) },
        { playerName: 'Bob', holes: repeatScore(4) },
      ]),
      makeRound('Round 4', [
        { playerName: 'Alice', holes: repeatScore(3) },
        { playerName: 'Bob', holes: repeatScore(5) },
      ]),
      makeRound('Round 5', [
        { playerName: 'Alice', holes: mixedScores(4, 5) },
        { playerName: 'Bob', holes: repeatScore(4) },
      ]),
    ],
  };
  const leaderboardParticipants = [
    { _id: 'a1', name: 'Alice', status: 'in', handicapIndex: 0 },
    { _id: 'b1', name: 'Bob', status: 'in', handicapIndex: 0 },
  ];
  const leaderboardView = buildTripCompetitionView(leaderboardTrip, leaderboardParticipants);
  const alice = leaderboardView.leaderboard.find((entry) => entry.name === 'Alice');
  const bob = leaderboardView.leaderboard.find((entry) => entry.name === 'Bob');

  assert(alice, 'Alice leaderboard row should exist');
  assert(bob, 'Bob leaderboard row should exist');
  assert.strictEqual(alice.countedTotal, 153, 'Alice should count her best four complete rounds');
  assert.deepStrictEqual(alice.countedFlags, [true, true, false, true, true], 'Alice should drop the lowest round in best-four mode');
  assert.strictEqual(bob.countedTotal, 117, 'Bob total should be based on his best four rounds');
  assert.deepStrictEqual(bob.countedFlags, [true, true, true, false, true], 'Bob should drop his lowest round in best-four mode');
  assert.strictEqual(leaderboardView.leaderboard[0].name, 'Alice', 'Leaderboard should sort highest counted total first');
  const aliceRoundOne = leaderboardView.rounds[0].playerScores.find((entry) => entry.playerName === 'Alice');
  assert(aliceRoundOne, 'Round score detail should include Alice');
  assert.strictEqual(aliceRoundOne.playingHandicap, 0, 'Playing handicap should be exposed for score detail rendering');
  assert.strictEqual(aliceRoundOne.strokeAdjustments[0], 0, 'Scratch golfers should not receive hole strokes');
  assert.strictEqual(aliceRoundOne.netHoles[0], 4, 'Net hole scores should be exposed for score detail rendering');
  assert.strictEqual(aliceRoundOne.stablefordPointsByHole[0], 2, 'Hole-level Stableford points should be exposed for score detail rendering');

  const matchTrip = {
    competition: { scoringMode: 'all5' },
    rounds: [
      makeRound('Match Round', [
        { playerName: 'Alice', holes: repeatScore(3) },
        { playerName: 'Bob', holes: repeatScore(7) },
        { playerName: 'Charlie', holes: repeatScore(5) },
        { playerName: 'Dan', holes: repeatScore(5) },
      ], [
        { label: 'TT#1', time: '08:00', players: ['Alice', 'Bob', 'Charlie', 'Dan'] },
      ]),
    ],
  };
  matchTrip.rounds[0].teamMatches = [{ slotIndex: 0, teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dan'] }];
  const matchParticipants = [
    { _id: '1', name: 'Alice', status: 'in', handicapIndex: 0 },
    { _id: '2', name: 'Bob', status: 'in', handicapIndex: 0 },
    { _id: '3', name: 'Charlie', status: 'in', handicapIndex: 0 },
    { _id: '4', name: 'Dan', status: 'in', handicapIndex: 0 },
  ];
  const matchView = buildTripCompetitionView(matchTrip, matchParticipants);
  const match = matchView.dailyMatches[0].matches[0];

  assert.strictEqual(match.result.status, 'complete', 'Complete scorecards should yield a complete match result');
  assert.strictEqual(match.result.pointsA, 1, 'Winning team should receive one point');
  assert.strictEqual(match.result.pointsB, 0, 'Losing team should receive zero points');
  assert.strictEqual(match.result.teamAHolesWon, 18, 'Team A should win every hole in this fixture');

  const worldTourScorecard = getDefaultScorecard('World Tour');
  assert.strictEqual(worldTourScorecard.length, 18, 'World Tour default scorecard should contain 18 holes');
  assert.deepStrictEqual(worldTourScorecard[0], { hole: 1, par: 4, handicap: 15 }, 'World Tour hole 1 defaults should match the stored scorecard');

  const scoringRounds = [
    { stablefordTotal: 10, isComplete: true },
    { stablefordTotal: 20, isComplete: true },
    { stablefordTotal: 30, isComplete: true },
    { stablefordTotal: 40, isComplete: true },
    { stablefordTotal: 50, isComplete: true },
  ];
  const first4 = computeCountedRounds(scoringRounds, 'first4of5');
  assert.deepStrictEqual(first4.countedFlags, [true, true, true, true, false], 'First-4 mode should count rounds 1 through 4');
  assert.strictEqual(first4.countedTotal, 100, 'First-4 mode total should equal the first four complete rounds');
  const last4 = computeCountedRounds(scoringRounds, 'last4of5');
  assert.deepStrictEqual(last4.countedFlags, [false, true, true, true, true], 'Last-4 mode should count rounds 2 through 5');
  assert.strictEqual(last4.countedTotal, 140, 'Last-4 mode total should equal the last four complete rounds');

  const bucketTrip = {
    competition: {
      scoringMode: 'best4',
      handicapBuckets: [
        { label: 'Bucket A', players: ['Alice', 'Bob', 'Charlie', 'Dan', 'Evan', 'Frank'] },
        { label: 'Bucket B', players: ['Gary'] },
        { label: 'Bucket C', players: [] },
        { label: 'Bucket D', players: [] },
      ],
    },
    rounds: [],
  };
  const bucketParticipants = [
    { _id: 'p1', name: 'Alice', status: 'in', handicapIndex: 4.2 },
    { _id: 'p2', name: 'Bob', status: 'in', handicapIndex: 8.1 },
    { _id: 'p3', name: 'Charlie', status: 'in', handicapIndex: 12.4 },
    { _id: 'p4', name: 'Dan', status: 'in', handicapIndex: 14.7 },
    { _id: 'p5', name: 'Evan', status: 'in', handicapIndex: 16.8 },
    { _id: 'p6', name: 'Frank', status: 'in', handicapIndex: 18.2 },
    { _id: 'p7', name: 'Gary', status: 'in', handicapIndex: 21.5 },
  ];
  const bucketView = buildTripCompetitionView(bucketTrip, bucketParticipants);
  assert.strictEqual(bucketView.buckets[0].players.length, 6, 'Bucket assignments should not enforce a max size');
  assert.deepStrictEqual(bucketView.buckets[0].players.map((player) => player.name), ['Alice', 'Bob', 'Charlie', 'Dan', 'Evan', 'Frank'], 'Saved bucket player order should be preserved');
  assert.deepStrictEqual(bucketView.buckets[1].players.map((player) => player.name), ['Gary'], 'Saved bucket placements should be respected');

  console.log('test_trip_competition_service.js passed');
}

run();
