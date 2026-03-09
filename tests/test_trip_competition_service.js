const assert = require('assert');
const {
  buildTripCompetitionView,
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

  console.log('test_trip_competition_service.js passed');
}

run();
