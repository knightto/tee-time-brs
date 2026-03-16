const assert = require('assert');
const {
  buildTripCompetitionView,
  computeCountedRounds,
  getDefaultScorecard,
  swapTripRyderCupTeamPlayers,
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

  const myrtlePlayers = [
    'Joe Gillette',
    'John Quimby',
    'Josh Browne',
    'Tommy Knight',
    'Reny Butler',
    'Thomas Lasik',
    'John Hyers',
    'Chris Manuel',
    'Lance Darr',
    'Caleb Hart',
    'Chris Neff',
    'Marcus Ordonez',
    'Dennis Freeman',
    'Chad Jones',
    'Jeremy Bridges',
    'Matt Shannon',
    'Delmar Christian',
    'Manuel Ordonez',
    'Tommy Knight Sr',
    'Duane Harris',
  ];
  const myrtleTrip = {
    name: 'Myrtle Beach - Barefoot Group 3/18-3/22/26',
    location: 'Myrtle Beach, SC',
    arrivalDate: new Date('2026-03-18'),
    competition: {
      scoringMode: 'best4',
      ryderCup: {
        rounds: [
          {
            format: 'Two-Man Net Total Match',
            formatKey: 'netTeamMatch',
            plan: {
              dayNote: 'Warm up at the range before the opener.',
              groups: [
                { groupNumber: 1, playStyle: 'Four-Ball Match Play', notes: 'Opening match uses the saved gross-score setup.' },
              ],
            },
            matches: [
              { teamAPlayerScores: [82, 84], teamBPlayerScores: [90, 91], notes: 'Team A took the opener on gross totals.' },
              { teamAPlayerScores: [83, 84], teamBPlayerScores: [85, 82] },
            ],
          },
          {
            matches: [
              { teamAPlayerScores: [82, 84], teamBPlayerScores: [86, 85] },
            ],
          },
          {
            matches: [
              { teamAPlayerScores: [82, 90], teamBPlayerScores: [86, 88] },
            ],
          },
          {
            matches: [
              { teamAPlayerScores: [90, 90], teamBPlayerScores: [87, 88], notes: 'Round 4 still uses the seeded pods, but now scores as a gross-total match.' },
            ],
          },
        ],
      },
    },
    rounds: [
      makeRound('World Tour', []),
      makeRound('Wild Wing Avocet', []),
      makeRound('Kings North', []),
      makeRound('River Hills', []),
      makeRound('Long Bay', []),
    ],
  };
  const myrtleParticipants = myrtlePlayers.map((name, index) => ({
    _id: `myrtle-${index + 1}`,
    name,
    status: 'in',
    handicapIndex: 10 + index,
  }));
  const freshMyrtleTrip = {
    name: 'Myrtle Beach - Barefoot Group 3/18-3/22/26',
    location: 'Myrtle Beach, SC',
    arrivalDate: new Date('2026-03-18'),
    competition: { scoringMode: 'best4' },
    rounds: [
      makeRound('World Tour', []),
      makeRound('Wild Wing Avocet', []),
      makeRound('Kings North', []),
      makeRound('River Hills', []),
      makeRound('Long Bay', []),
    ],
  };
  const freshView = buildTripCompetitionView(freshMyrtleTrip, myrtleParticipants);
  assert.strictEqual(freshView.ryderCup.canEditTeams, true, 'Seeded Ryder Cup teams should be editable before results are entered');
  const legacySeedTrip = {
    name: 'Myrtle Beach - Barefoot Group 3/18-3/22/26',
    location: 'Myrtle Beach, SC',
    arrivalDate: new Date('2026-03-18'),
    competition: {
      scoringMode: 'best4',
      ryderCup: {
        rounds: [
          {
            matches: [
              {
                teamAPlayers: ['Thomas Lasik', 'Chris Manuel'],
                teamBPlayers: ['Reny Butler', 'Lance Darr'],
              },
            ],
          },
        ],
      },
    },
    rounds: [
      makeRound('World Tour', []),
      makeRound('Wild Wing Avocet', []),
      makeRound('Kings North', []),
      makeRound('River Hills', []),
      makeRound('Long Bay', []),
    ],
  };
  const migratedView = buildTripCompetitionView(legacySeedTrip, myrtleParticipants);
  assert.deepStrictEqual(migratedView.ryderCup.rounds[0].matches[0].teamAPlayers, ['Chris Manuel', 'Tommy Knight Sr'], 'Unstarted legacy Myrtle schedules should reseed to the newer balanced opener');
  swapTripRyderCupTeamPlayers(freshMyrtleTrip, 'Tommy Knight', 'Reny Butler');
  const swappedView = buildTripCompetitionView(freshMyrtleTrip, myrtleParticipants);
  assert(swappedView.ryderCup.teams[0].players.some((entry) => entry.name === 'Reny Butler'), 'Swapped Team A should include the incoming player');
  assert(swappedView.ryderCup.teams[1].players.some((entry) => entry.name === 'Tommy Knight'), 'Swapped Team B should include the outgoing player');
  assert.strictEqual(swappedView.ryderCup.rounds[0].matches[4].teamAPlayers.includes('Reny Butler'), true, 'Round slots should swap with the team move');
  assert.strictEqual(swappedView.ryderCup.rounds[0].matches[4].teamBPlayers.includes('Tommy Knight'), true, 'Opposite round slots should swap with the team move');
  assert.strictEqual(freshView.ryderCup.rounds[0].plan.groups.length, 5, 'Each Ryder Cup round should expose five daily plan groups');
  assert.strictEqual(freshView.ryderCup.rounds[0].plan.groups[0].players.length, 4, 'Daily plan groups should cover full foursomes');
  assert.strictEqual(freshView.ryderCup.description, 'Team competition with every player playing their own ball in every round.', 'The Ryder Cup intro should explain the own-ball competition setup');
  assert.strictEqual(freshView.ryderCup.rounds[1].format, 'Two-Man Gross Total Match', 'Round 2 should now be seeded as the shared gross-total team format');
  assert.strictEqual(freshView.ryderCup.rounds[1].plan.groups[0].playStyle, 'Two-Man Gross Total Match', 'Team rounds should seed with the shared gross-total play style');
  assert.strictEqual(freshView.ryderCup.rounds[3].format, 'Two-Man Gross Total Match', 'Round 4 should now use the same gross-total scoring format as the other team rounds');
  assert.strictEqual(freshView.ryderCup.rounds[3].pointValue, 1, 'Each Round 4 pod should now be worth one point');
  assert.strictEqual(freshView.ryderCup.rounds[4].plan.groups[0].playStyle, 'Singles Gross Total Match', 'Singles rounds should seed with the gross-total singles play style');
  const myrtleView = buildTripCompetitionView(myrtleTrip, myrtleParticipants);
  assert(myrtleView.ryderCup, 'Myrtle trips should expose a Ryder Cup view');
  assert.strictEqual(myrtleView.ryderCup.canEditTeams, false, 'Ryder Cup teams should lock once results have been entered');
  assert.strictEqual(myrtleView.ryderCup.teams[0].rankSum, 105, 'Team A rank sum should be seeded to 105');
  assert.strictEqual(myrtleView.ryderCup.teams[1].rankSum, 105, 'Team B rank sum should be seeded to 105');
  assert.strictEqual(myrtleView.ryderCup.fairness.status, 'Very balanced', 'Balanced seed should report a very balanced fairness note');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].format, 'Two-Man Gross Total Match', 'Saved legacy net-total round formats should normalize to gross-total matches');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].formatKey, 'grossTeamMatch', 'Saved legacy net-total round keys should normalize to gross-total keys');
  assert.strictEqual(myrtleView.ryderCup.standings.teamAPoints, 3.5, 'Gross-total Ryder Cup rounds should roll up completed daily matches correctly');
  assert.strictEqual(myrtleView.ryderCup.standings.teamBPoints, 1.5, 'Completed gross-total Ryder Cup matches should update Team B points');
  assert.strictEqual(myrtleView.ryderCup.standings.remainingPoints, 25, 'Remaining points should reflect unfinished matches after five scored matches');
  assert.strictEqual(myrtleView.ryderCup.totalPointsAvailable, 30, 'Ryder Cup total points should stay fixed at 30');
  assert(myrtleView.overview.formatSummary.includes('lower gross side wins'), 'Myrtle overview should explain the new rank-seeded gross match flow');
  const chrisManuelRow = myrtleView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Chris Manuel');
  assert(chrisManuelRow, 'Individual Ryder Cup rows should be present');
  assert.strictEqual(chrisManuelRow.pointsWon, 3, 'Completed gross-total matches should feed the individual leaderboard');
  const delmarRow = myrtleView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Delmar Christian');
  assert(delmarRow, 'Halved match players should be present');
  assert.strictEqual(delmarRow.pointsWon, 0.5, 'Halved gross-total matches should award a half point to each player');
  const hardConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'neff-not-manuel');
  assert(hardConstraint, 'Hard constraint rows should be exposed');
  assert.strictEqual(hardConstraint.status, 'clear', 'Seeded Ryder Cup schedule should keep Chris Neff away from Manuel Ordonez');
  const noRepeatConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'no-repeat-two-man-teammates');
  assert(noRepeatConstraint, 'No-repeat teammate rules should be exposed');
  assert.strictEqual(noRepeatConstraint.status, 'clear', 'Seeded Ryder Cup schedule should avoid repeating the same 2-man team');
  const joshMattConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'josh-not-matt-team');
  assert(joshMattConstraint, 'Specific teammate bans should be exposed');
  assert.strictEqual(joshMattConstraint.status, 'clear', 'Josh Browne and Matt Shannon should not be paired together');
  const requestedGrouping = myrtleView.ryderCup.admin.requestedGroupings.find((entry) => entry.id === 'lance-chris-reny-thomas');
  assert(requestedGrouping, 'Requested grouping coverage should be exposed');
  assert.strictEqual(requestedGrouping.status, 'scheduled', 'Requested grouping coverage should be tracked');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.dayNote, 'Warm up at the range before the opener.', 'Round-level planning notes should be exposed');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.groups[0].playStyle, 'Two-Man Gross Total Match', 'Saved complex or legacy plan styles should normalize to the gross-total play style');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.groups[0].notes, 'Opening match uses the saved gross-score setup.', 'Saved daily plan group notes should survive normalization');
  assert.strictEqual(myrtleView.ryderCup.rounds[1].matches[0].teamAScore, 166, 'Gross-total rounds should expose calculated team gross totals');
  assert.strictEqual(myrtleView.ryderCup.rounds[2].matches[0].teamAScore, 172, 'Gross-total rounds should derive team totals from saved gross scores');
  assert.strictEqual(myrtleView.ryderCup.rounds[3].matches[0].teamAScore, 180, 'Round 4 should now expose the pod gross total on the match itself');
  assert.strictEqual(myrtleView.ryderCup.rounds[3].matches[0].pointsB, 1, 'Round 4 pod matches should now award one point to the lower gross side');
  assert.strictEqual(myrtleView.ryderCup.admin.roundRules.length, 5, 'Admin rules should explain each own-ball round format');
  assert.throws(() => swapTripRyderCupTeamPlayers(myrtleTrip, 'Tommy Knight', 'Reny Butler'), /locked/i, 'Team swaps should be rejected after Ryder Cup results exist');

  console.log('test_trip_competition_service.js passed');
}

run();
