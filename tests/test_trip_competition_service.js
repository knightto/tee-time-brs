const assert = require('assert');
const {
  buildTripCompetitionView,
  computeCountedRounds,
  getDefaultScorecard,
  normalizeLegacyMyrtleTripTeeSheet,
  setTripRyderCupRound,
  setTripRyderCupSettings,
  syncTripRyderCupOverlayToCompetition,
  swapTripRyderCupTeamPlayers,
} = require('../services/tripCompetitionService');
const { buildDefaultMyrtleRyderCup } = require('../services/myrtleRyderCupDefaults');
const { getDefaultTripRyderCupState } = require('../services/tripRyderCupService');

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

function makeTeeTimes(groups = []) {
  return groups.map((players, index) => ({
    label: `TT#${index + 1}`,
    time: `${String(8 + Math.floor((index * 9) / 60)).padStart(2, '0')}:${String((index * 9) % 60).padStart(2, '0')}`,
    players: players.slice(),
  }));
}

function repeatScore(value, count = 18) {
  return Array.from({ length: count }, () => value);
}

function mixedScores(frontValue, backValue) {
  return repeatScore(frontValue, 9).concat(repeatScore(backValue, 9));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  assert.deepStrictEqual(migratedView.ryderCup.rounds[0].matches[0].teamAPlayers, ['Joe Gillette', 'Jeremy Bridges'], 'Unstarted legacy Myrtle schedules should reseed to the lower-repeat fixed-team opener');
  swapTripRyderCupTeamPlayers(freshMyrtleTrip, 'Tommy Knight', 'Reny Butler');
  const swappedView = buildTripCompetitionView(freshMyrtleTrip, myrtleParticipants);
  assert(swappedView.ryderCup.teams[0].players.some((entry) => entry.name === 'Reny Butler'), 'Swapped Team A should include the incoming player');
  assert(swappedView.ryderCup.teams[1].players.some((entry) => entry.name === 'Tommy Knight'), 'Swapped Team B should include the outgoing player');
  assert.strictEqual(swappedView.ryderCup.rounds[0].matches[2].teamAPlayers.includes('Reny Butler'), true, 'Round slots should swap with the team move');
  assert.strictEqual(swappedView.ryderCup.rounds[0].matches[4].teamBPlayers.includes('Tommy Knight'), true, 'Opposite round slots should swap with the team move');
  const syncedOverlayTrip = {
    name: 'Myrtle Beach - Barefoot Group 3/18-3/22/26',
    location: 'Myrtle Beach, SC',
    arrivalDate: new Date('2026-03-18'),
    competition: {
      scoringMode: 'best4',
      ryderCup: buildDefaultMyrtleRyderCup(),
    },
    rounds: [
      makeRound('World Tour', []),
      makeRound('Wild Wing Avocet', []),
      makeRound('Kings North', []),
      makeRound('River Hills', []),
      makeRound('Long Bay', []),
    ],
  };
  syncTripRyderCupOverlayToCompetition(syncedOverlayTrip, {
    teamAName: 'Overlay Alpha',
    teamBName: 'Overlay Beta',
    teamAPlayers: [
      { name: 'John Quimby', seedRank: 2 },
      { name: 'Josh Browne', seedRank: 3 },
      { name: 'Tommy Knight', seedRank: 4 },
      { name: 'Lance Darr', seedRank: 9 },
      { name: 'Chris Neff', seedRank: 11 },
      { name: 'Dennis Freeman', seedRank: 13 },
      { name: 'Chad Jones', seedRank: 14 },
      { name: 'Jeremy Bridges', seedRank: 15 },
      { name: 'Matt Shannon', seedRank: 16 },
      { name: 'Tommy Knight Sr', seedRank: 19 },
    ],
    teamBPlayers: [
      { name: 'Joe Gillette', seedRank: 1 },
      { name: 'Reny Butler', seedRank: 5 },
      { name: 'Thomas Lasik', seedRank: 6 },
      { name: 'John Hyers', seedRank: 7 },
      { name: 'Chris Manuel', seedRank: 8 },
      { name: 'Caleb Hart', seedRank: 10 },
      { name: 'Marcus Ordonez', seedRank: 12 },
      { name: 'Delmar Christian', seedRank: 17 },
      { name: 'Manuel Ordonez', seedRank: 18 },
      { name: 'Duane Harris', seedRank: 20 },
    ],
  });
  const syncedOverlayView = buildTripCompetitionView(syncedOverlayTrip, myrtleParticipants);
  assert.strictEqual(syncedOverlayView.ryderCup.teams[0].name, 'Overlay Alpha', 'Overlay team name changes should sync to the live Ryder Cup board');
  assert.strictEqual(syncedOverlayView.ryderCup.teams[1].name, 'Overlay Beta', 'Overlay opposite team name should sync to the live Ryder Cup board');
  assert.strictEqual(syncedOverlayView.ryderCup.teams[0].players.some((entry) => entry.name === 'John Quimby'), true, 'Overlay roster Team A changes should sync to the live Ryder Cup board');
  assert.strictEqual(syncedOverlayView.ryderCup.teams[1].players.some((entry) => entry.name === 'Joe Gillette'), true, 'Overlay roster Team B changes should sync to the live Ryder Cup board');
  assert.deepStrictEqual(syncedOverlayView.ryderCup.rounds[0].matches[0].teamAPlayers, ['John Quimby', 'Jeremy Bridges'], 'Overlay roster sync should swap the saved round match players across every round');
  assert.deepStrictEqual(syncedOverlayView.ryderCup.rounds[0].matches[3].teamBPlayers, ['Caleb Hart', 'Joe Gillette'], 'Overlay roster sync should also update the opposite side pairing that traded players');
  assert.strictEqual(freshView.ryderCup.rounds[0].plan.groups.length, 5, 'Each Ryder Cup round should expose five daily plan groups');
  assert.strictEqual(freshView.ryderCup.rounds[0].plan.groups[0].players.length, 4, 'Daily plan groups should cover full foursomes');
  assert.strictEqual(freshView.ryderCup.description, 'Team competition with every player playing his own ball and keeping his own score in every round, with full handicaps applied automatically.', 'The Ryder Cup intro should explain the own-ball full-handicap setup');
  assert.strictEqual(freshView.ryderCup.rounds[1].format, 'Two-Man Net Total Match', 'Round 2 should now be seeded as the shared full-handicap team format');
  assert.strictEqual(freshView.ryderCup.rounds[1].plan.groups[0].playStyle, 'Two-Man Net Total Match', 'Team rounds should seed with the shared full-handicap play style');
  assert.strictEqual(freshView.ryderCup.rounds[3].format, 'Two-Man Net Total Match', 'Round 4 should now use the same full-handicap scoring format as the other team rounds');
  assert.strictEqual(freshView.ryderCup.rounds[3].pointValue, 1, 'Each Round 4 pod should now be worth one point');
  assert.strictEqual(freshView.ryderCup.rounds[4].plan.groups[0].playStyle, 'Singles Net Total Match', 'Singles rounds should seed with the full-handicap singles play style');
  const myrtleView = buildTripCompetitionView(myrtleTrip, myrtleParticipants);
  assert(myrtleView.ryderCup, 'Myrtle trips should expose a Ryder Cup view');
  assert.strictEqual(myrtleView.ryderCup.canEditTeams, false, 'Ryder Cup teams should lock once results have been entered');
  assert.strictEqual(myrtleView.ryderCup.teams[0].rankSum, 105, 'Team A rank sum should be seeded to 105');
  assert.strictEqual(myrtleView.ryderCup.teams[1].rankSum, 105, 'Team B rank sum should be seeded to 105');
  assert.strictEqual(myrtleView.ryderCup.fairness.status, 'Very balanced', 'Balanced seed should report a very balanced fairness note');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].format, 'Two-Man Net Total Match', 'Saved legacy round formats should normalize to the full-handicap match label');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].formatKey, 'grossTeamMatch', 'Saved legacy net-total round keys should keep the gross-entry engine under the full-handicap view');
  assert.strictEqual(myrtleView.ryderCup.standings.teamAPoints, 1, 'Full-handicap Ryder Cup rounds should roll up completed daily matches correctly');
  assert.strictEqual(myrtleView.ryderCup.standings.teamBPoints, 4, 'Completed full-handicap Ryder Cup matches should update Team B points');
  assert.strictEqual(myrtleView.ryderCup.standings.remainingPoints, 25, 'Remaining points should reflect unfinished matches after five scored matches');
  assert.strictEqual(myrtleView.ryderCup.totalPointsAvailable, 30, 'Ryder Cup total points should stay fixed at 30');
  assert(myrtleView.overview.formatSummary.includes('lower net side'), 'Myrtle overview should explain the full-handicap match flow');
  assert.strictEqual(myrtleView.ryderCup.teams[0].players[0].handicapIndex, 2, 'Seeded Ryder Cup players should expose their fixed handicap index');
  assert.strictEqual(myrtleView.ryderCup.teams[0].players[0].matchHandicap, 2, 'Seeded Ryder Cup players should expose their full match handicap');
  const joeGilletteRow = myrtleView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Joe Gillette');
  assert(joeGilletteRow, 'Individual Ryder Cup rows should be present');
  assert.strictEqual(joeGilletteRow.pointsWon, 1, 'Completed full-handicap matches should feed the individual leaderboard');
  const joshRow = myrtleView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Josh Browne');
  assert(joshRow, 'Scored Ryder Cup players should be present');
  assert.strictEqual(joshRow.pointsWon, 0, 'Losing full-handicap matches should award zero points');
  const hardConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'neff-not-manuel');
  assert(!hardConstraint, 'Hard constraints have been removed for pure competition focus');
  const noRepeatConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'no-repeat-two-man-teammates');
  assert(!noRepeatConstraint, 'No-repeat teammate rules have been removed');
  const joshMattConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'josh-not-matt-team');
  assert(!joshMattConstraint, 'Specific teammate bans have been removed');
  const requestedGrouping = myrtleView.ryderCup.admin.requestedGroupings.find((entry) => entry.id === 'duane-hyers');
  assert(!requestedGrouping, 'Requested groupings have been removed for pure competition focus');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.dayNote, 'Warm up at the range before the opener.', 'Round-level planning notes should be exposed');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.groups[0].playStyle, 'Two-Man Net Total Match', 'Saved complex or legacy plan styles should normalize to the full-handicap play style');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.groups[0].notes, 'Opening match uses the saved gross-score setup.', 'Saved daily plan group notes should survive normalization');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].matches[0].teamAGrossScore, 166, 'Full-handicap rounds should still expose calculated team gross totals');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].matches[0].teamAHandicapAllowance, 20, 'Full-handicap rounds should expose the applied team allowance');
  assert.strictEqual(myrtleView.ryderCup.rounds[1].matches[0].teamAScore, 142, 'Full-handicap rounds should expose the adjusted team net score');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyOver100Draw.length, 5, 'Myrtle Ryder Cup should seed a daily over-100 draw for each round');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyLongestPuttLastHole.length, 5, 'Myrtle Ryder Cup should seed a daily last-hole longest-putt prize for each round');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyBirdiePot.length, 5, 'Myrtle Ryder Cup should seed a daily gross birdie pot for each round');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyGross.length, 5, 'Myrtle Ryder Cup should seed a daily gross prize for each round');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(myrtleView.ryderCup.sideGames, 'dailyNetBirdiePot'), false, 'Myrtle Ryder Cup should not expose a net birdie pot anymore');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyNet[0].amount, 25, 'Daily net should default to a $25 round prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyGross[0].amount, 25, 'Daily gross should default to a $25 round prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyOver100Draw[0].amount, 20, 'Daily over-100 draw should default to a $20 round prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyBirdiePot[0].amount, 50, 'Daily gross birdies should default to a $50 round prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.dailyLongestPuttLastHole[0].amount, 15, 'Daily last-hole longest putt should default to a $15 round prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.weeklyNet.amount, 250, 'Weekly net should default to a $250 prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.weeklyOver100Draw.amount, 120, 'Weekly over-100 draw should default to a $120 prize');
  assert.strictEqual(myrtleView.ryderCup.sideGames.birdiePool.amount, 200, 'Trip birdie pool should default to a $200 prize (includes the payout cleanup amount)');
  assert.strictEqual(myrtleView.ryderCup.sideGames.leftoverPot.amount, 0, 'Leftover pot should default to a $0 reserve (redistributed to birdie pool)');
  assert.strictEqual(myrtleView.ryderCup.sideGames.mvp.amount, 125, 'MVP should default to a $125 prize');
  assert.strictEqual(myrtleView.ryderCup.payout.totalPot, 2000, 'Myrtle payout should default to the full $2,000 pot');
  assert.strictEqual(myrtleView.ryderCup.payout.nonTeamAmount, 1500, 'Configured non-team Myrtle prizes should total $1,500');
  assert.strictEqual(myrtleView.ryderCup.payout.teamAmount, 500, 'Winning team should receive a fixed $500 share so each winner gets $50.00');
  assert.deepStrictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'winningTeam').winners, [], 'Winning-team payouts should stay undistributed until the Ryder Cup is complete');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'winningTeam').winnerLabel, 'Pending Ryder Cup finish', 'Winning-team payout should remain pending while points are still available');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'dailyNet').amount, 125, 'Five daily net payouts should total $125');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'dailyGross').amount, 125, 'Five daily gross payouts should total $125');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'dailyOver100Draw').amount, 100, 'Five daily over-100 draws should total $100');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'dailyBirdiePot').amount, 250, 'Five daily gross birdie payouts should total $250');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.some((row) => row.key === 'dailyNetBirdiePot'), false, 'Net birdie payouts should be removed from the Myrtle payout summary');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'dailyLongestPuttLastHole').amount, 75, 'Five daily last-hole putt payouts should total $75');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'weeklyOver100Draw').amount, 120, 'Weekly over-100 draw should total $120');
  assert.strictEqual(myrtleView.ryderCup.payout.rows.find((row) => row.key === 'leftoverPot').amount, 0, 'Leftover pot should be $0 (redistributed to birdie pool)');
  const zeroClosestToPinTrip = clone(myrtleTrip);
  zeroClosestToPinTrip.competition.ryderCup.payout = {
    ...(zeroClosestToPinTrip.competition.ryderCup.payout || {}),
    allocationPercentages: {
      ...((zeroClosestToPinTrip.competition.ryderCup.payout && zeroClosestToPinTrip.competition.ryderCup.payout.allocationPercentages) || {}),
      closestToPin: 0,
    },
  };
  const zeroClosestToPinView = buildTripCompetitionView(zeroClosestToPinTrip, []);
  assert.strictEqual(zeroClosestToPinView.ryderCup.payout.allocationPercentages.closestToPin, 0, 'Closest-to-pin payout allocation should preserve an explicit zero');
  assert.strictEqual(zeroClosestToPinView.ryderCup.payout.rows.find((row) => row.key === 'closestToPin').amount, 0, 'Explicitly disabling closest-to-pin should zero out the prize amount');
  assert.match(myrtleView.overview.sideGamesSummary, /longest made putt on the last hole/i, 'Myrtle overview should mention the daily last-hole putt prize');
  assert.match(myrtleView.overview.sideGamesSummary, /over-100 team draws/i, 'Myrtle overview should mention the over-100 draws');
  assert.match(myrtleView.overview.sideGamesSummary, /daily birdie pot/i, 'Myrtle overview should mention the daily birdie pots');
  assert.match(myrtleView.overview.sideGamesSummary, /daily gross/i, 'Myrtle overview should mention the daily gross prize');
  assert.strictEqual(myrtleView.ryderCup.rounds[2].matches[0].teamAScore, 161, 'Full-handicap rounds should derive later net totals from saved gross scores');
  assert.strictEqual(myrtleView.ryderCup.rounds[3].matches[0].teamAGrossScore, 180, 'Round 4 should still expose the pod gross total on the match itself');
  assert.strictEqual(myrtleView.ryderCup.rounds[3].matches[0].pointsB, 1, 'Round 4 pod matches should award one point to the lower net side');
  assert.strictEqual(myrtleView.ryderCup.admin.roundRules.length, 5, 'Admin rules should explain each own-ball round format');
  assert.throws(() => swapTripRyderCupTeamPlayers(myrtleTrip, 'Tommy Knight', 'Reny Butler'), /locked/i, 'Team swaps should be rejected after Ryder Cup results exist');

  const makeEditableMyrtleTrip = () => {
    const defaultRyderCup = buildDefaultMyrtleRyderCup();
    const rounds = [
      makeRound('World Tour', []),
      makeRound('Wild Wing Avocet', []),
      makeRound('Kings North', []),
      makeRound('River Hills', []),
      makeRound('Long Bay', []),
    ];
    rounds.forEach((round, roundIndex) => {
      const matches = defaultRyderCup.rounds?.[roundIndex]?.matches || [];
      const groups = new Map();
      matches.forEach((match, matchIndex) => {
        const groupNumber = Number(match && match.groupNumber) || (matchIndex + 1);
        const existing = groups.get(groupNumber) || [];
        const players = []
          .concat(match && match.teamAPlayers ? match.teamAPlayers : [])
          .concat(match && match.teamBPlayers ? match.teamBPlayers : []);
        groups.set(groupNumber, Array.from(new Set(existing.concat(players))));
      });
      round.teeTimes = makeTeeTimes(Array.from(groups.values()));
    });
    return {
      name: 'Myrtle Beach - Barefoot Group 3/18-3/22/26',
      location: 'Myrtle Beach, SC',
      arrivalDate: new Date('2026-03-18'),
      competition: {
        scoringMode: 'best4',
        ryderCup: defaultRyderCup,
      },
      rounds,
    };
  };
  const roundedPrizeTrip = makeEditableMyrtleTrip();
  setTripRyderCupSettings(roundedPrizeTrip, {
    sideGames: {
      ...(roundedPrizeTrip.competition.ryderCup.sideGames || {}),
      dailyNet: (roundedPrizeTrip.competition.ryderCup.sideGames.dailyNet || []).map((entry, index) => (
        index === 0 ? { ...entry, amount: 73 } : entry
      )),
      dailyGross: (roundedPrizeTrip.competition.ryderCup.sideGames.dailyGross || []).map((entry, index) => (
        index === 0 ? { ...entry, amount: 28 } : entry
      )),
      dailyBirdiePot: (roundedPrizeTrip.competition.ryderCup.sideGames.dailyBirdiePot || []).map((entry, index) => (
        index === 0 ? { ...entry, amount: 52 } : entry
      )),
      dailyLongestPuttLastHole: (roundedPrizeTrip.competition.ryderCup.sideGames.dailyLongestPuttLastHole || []).map((entry, index) => (
        index === 0 ? { ...entry, amount: 12 } : entry
      )),
      weeklyNet: {
        ...(roundedPrizeTrip.competition.ryderCup.sideGames.weeklyNet || {}),
        amount: 248,
      },
      weeklyOver100Draw: {
        ...(roundedPrizeTrip.competition.ryderCup.sideGames.weeklyOver100Draw || {}),
        amount: 118,
      },
      birdiePool: {
        ...(roundedPrizeTrip.competition.ryderCup.sideGames.birdiePool || {}),
        amount: 124,
      },
      mvp: {
        ...(roundedPrizeTrip.competition.ryderCup.sideGames.mvp || {}),
        amount: 127,
      },
      closestToPin: {
        entries: [{ roundNumber: 1, hole: 7, playerName: 'Joe Gillette', distance: '6 ft 2 in', amount: 12 }],
      },
    },
    payout: {
      ...(roundedPrizeTrip.competition.ryderCup.payout || {}),
      totalPot: 1998,
    },
  });
  const roundedPrizeView = buildTripCompetitionView(roundedPrizeTrip, myrtleParticipants);
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.dailyNet[0].amount, 75, 'Myrtle daily net prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.dailyGross[0].amount, 30, 'Myrtle daily gross prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.dailyBirdiePot[0].amount, 50, 'Myrtle daily birdie prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.dailyLongestPuttLastHole[0].amount, 10, 'Myrtle daily longest-putt prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.weeklyNet.amount, 250, 'Myrtle weekly net prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.weeklyOver100Draw.amount, 120, 'Myrtle weekly over-100 prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.birdiePool.amount, 125, 'Myrtle trip birdie prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.mvp.amount, 125, 'Myrtle MVP prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.sideGames.closestToPin.entries[0].amount, 10, 'Myrtle closest-to-pin entry prizes should round to the nearest $5');
  assert.strictEqual(roundedPrizeView.ryderCup.payout.totalPot, 2000, 'Myrtle total pot should round to the nearest $5');
  const assignUniqueRyderCupScores = (round) => {
    let nextScore = 70;
    const scoreByName = new Map();
    return {
      scoreByName,
      round: {
        ...round,
        matches: (round.matches || []).map((match) => {
          const assignScore = (playerName) => {
            if (!scoreByName.has(playerName)) {
              scoreByName.set(playerName, nextScore);
              nextScore += 1;
            }
            return scoreByName.get(playerName);
          };
          return {
            ...match,
            teamAPlayerScores: (match.teamAPlayers || []).map(assignScore),
            teamBPlayerScores: (match.teamBPlayers || []).map(assignScore),
            result: '',
          };
        }),
      },
    };
  };

  const overlayHandicapTrip = makeEditableMyrtleTrip();
  overlayHandicapTrip.ryderCup = getDefaultTripRyderCupState(myrtleParticipants);
  overlayHandicapTrip.ryderCup.teamAPlayers = overlayHandicapTrip.ryderCup.teamAPlayers.map((player) => (
    player.name === 'Joe Gillette'
      ? { ...player, handicapIndex: 4.5 }
      : player
  ));
  const overlayHandicapView = buildTripCompetitionView(overlayHandicapTrip, myrtleParticipants);
  const overlayHandicapJoe = overlayHandicapView.ryderCup.teams[0].players.find((entry) => entry.name === 'Joe Gillette');
  assert(overlayHandicapJoe, 'Overlay handicap override player should be present');
  assert.strictEqual(overlayHandicapJoe.handicapIndex, 4.5, 'Saved Ryder Cup overlay handicaps should override the seeded Myrtle handicap');
  assert.strictEqual(overlayHandicapJoe.matchHandicap, 5, 'Saved Ryder Cup overlay handicaps should drive the full handicap allowance');
  assert.strictEqual(overlayHandicapView.ryderCup.rounds[0].matches[0].teamAHandicapAllowance, 23, 'Match allowances should recalculate from saved Ryder Cup overlay handicap edits');

  const allRoundsHandicapTrip = makeEditableMyrtleTrip();
  allRoundsHandicapTrip.ryderCup = getDefaultTripRyderCupState(myrtleParticipants);
  const { round: handicapRoundOne } = assignUniqueRyderCupScores(clone(allRoundsHandicapTrip.competition.ryderCup.rounds[0]));
  const { round: handicapRoundTwo } = assignUniqueRyderCupScores(clone(allRoundsHandicapTrip.competition.ryderCup.rounds[1]));
  setTripRyderCupRound(allRoundsHandicapTrip, 0, handicapRoundOne);
  setTripRyderCupRound(allRoundsHandicapTrip, 1, handicapRoundTwo);
  const beforeAllRoundsHandicapView = buildTripCompetitionView(allRoundsHandicapTrip, myrtleParticipants);
  const findMatchForPlayer = (round, playerName) => (round.matches || []).find((match) => (match.teamAPlayers || []).includes(playerName) || (match.teamBPlayers || []).includes(playerName));
  const beforeJoeRoundOne = findMatchForPlayer(beforeAllRoundsHandicapView.ryderCup.rounds[0], 'Joe Gillette');
  const beforeJoeRoundTwo = findMatchForPlayer(beforeAllRoundsHandicapView.ryderCup.rounds[1], 'Joe Gillette');
  const beforeJoeRoundThree = findMatchForPlayer(beforeAllRoundsHandicapView.ryderCup.rounds[2], 'Joe Gillette');
  allRoundsHandicapTrip.ryderCup = {
    ...allRoundsHandicapTrip.ryderCup,
    teamAPlayers: (allRoundsHandicapTrip.ryderCup.teamAPlayers || []).map((player) => (
      player.name === 'Joe Gillette'
        ? { ...player, handicapIndex: 20 }
        : player
    )),
  };
  syncTripRyderCupOverlayToCompetition(allRoundsHandicapTrip, allRoundsHandicapTrip.ryderCup);
  const afterAllRoundsHandicapView = buildTripCompetitionView(allRoundsHandicapTrip, myrtleParticipants);
  const beforeJoeAllowance = beforeAllRoundsHandicapView.ryderCup.teams[0].players.find((entry) => entry.name === 'Joe Gillette').matchHandicap;
  const afterJoeAllowance = afterAllRoundsHandicapView.ryderCup.teams[0].players.find((entry) => entry.name === 'Joe Gillette').matchHandicap;
  const joeAllowanceDelta = afterJoeAllowance - beforeJoeAllowance;
  const afterJoeRoundOne = findMatchForPlayer(afterAllRoundsHandicapView.ryderCup.rounds[0], 'Joe Gillette');
  const afterJoeRoundTwo = findMatchForPlayer(afterAllRoundsHandicapView.ryderCup.rounds[1], 'Joe Gillette');
  const afterJoeRoundThree = findMatchForPlayer(afterAllRoundsHandicapView.ryderCup.rounds[2], 'Joe Gillette');
  assert.strictEqual(afterJoeAllowance, 20, 'Overlay handicap edits should update Joe\'s current full allowance');
  assert.strictEqual(afterJoeRoundOne.teamAHandicapAllowance, beforeJoeRoundOne.teamAHandicapAllowance + joeAllowanceDelta, 'Completed Round 1 allowances should recalculate after a handicap edit');
  assert.strictEqual(afterJoeRoundOne.teamAScore, beforeJoeRoundOne.teamAScore - joeAllowanceDelta, 'Completed Round 1 net totals should recalculate after a handicap edit');
  assert.strictEqual(afterJoeRoundTwo.teamAHandicapAllowance, beforeJoeRoundTwo.teamAHandicapAllowance + joeAllowanceDelta, 'Completed Round 2 allowances should recalculate after a handicap edit');
  assert.strictEqual(afterJoeRoundTwo.teamAScore, beforeJoeRoundTwo.teamAScore - joeAllowanceDelta, 'Completed Round 2 net totals should recalculate after a handicap edit');
  assert.strictEqual(afterJoeRoundThree.teamAHandicapAllowance, beforeJoeRoundThree.teamAHandicapAllowance + joeAllowanceDelta, 'Future rounds should also pick up the edited handicap allowance');

  const dailyBirdieTrip = makeEditableMyrtleTrip();
  dailyBirdieTrip.competition.ryderCup.sideGames.dailyBirdiePot[0] = {
    ...dailyBirdieTrip.competition.ryderCup.sideGames.dailyBirdiePot[0],
    counts: [
      { playerName: 'Joe Gillette', count: 2 },
      { playerName: 'John Quimby', count: 1 },
    ],
    amount: 20,
    notes: 'Gross birdies',
  };
  dailyBirdieTrip.competition.ryderCup.sideGames.birdiePool = {
    ...dailyBirdieTrip.competition.ryderCup.sideGames.birdiePool,
    counts: [
      { playerName: 'Joe Gillette', count: 4 },
      { playerName: 'John Quimby', count: 2 },
    ],
    amount: 30,
  };
  const dailyBirdieView = buildTripCompetitionView(dailyBirdieTrip, myrtleParticipants);
  assert.deepStrictEqual(dailyBirdieView.ryderCup.sideGames.dailyBirdiePot[0].winnerNames, ['Joe Gillette', 'John Quimby'], 'Daily birdie pot should pay every golfer who recorded a birdie');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.dailyBirdiePot[0].totalBirdies, 3, 'Daily birdie pot should expose the total number of birdies in the pool');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.dailyBirdiePot[0].perBirdieAmount, 6.67, 'Daily birdie pot should expose the per-birdie payout rate');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.dailyBirdiePot[0].awardedAmount, 19, 'Daily birdie pot should round player payouts down to whole dollars');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.dailyBirdiePot[0].leftoverAmount, 1, 'Daily birdie pot should keep the leftover dollars in the leftover pot');
  assert.deepStrictEqual(dailyBirdieView.ryderCup.sideGames.dailyBirdiePot[0].shareRows, [
    { name: 'Joe Gillette', birdies: 2, amount: 13 },
    { name: 'John Quimby', birdies: 1, amount: 6 },
  ], 'Daily birdie pot should split the pool by birdie count and round each player down to the lower whole dollar');
  assert.deepStrictEqual(dailyBirdieView.ryderCup.sideGames.birdiePool.winners, ['Joe Gillette', 'John Quimby'], 'Trip birdie pool should pay every golfer who made a trip birdie');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.birdiePool.totalBirdies, 6, 'Trip birdie pool should expose the total trip birdie count');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.birdiePool.perBirdieAmount, 5, 'Trip birdie pool should expose the per-birdie payout rate');
  assert.strictEqual(dailyBirdieView.ryderCup.sideGames.birdiePool.leftoverAmount, 0, 'Trip birdie pool should show no leftover when the birdie split lands on whole dollars');
  assert.deepStrictEqual(dailyBirdieView.ryderCup.sideGames.birdiePool.shareRows, [
    { name: 'Joe Gillette', birdies: 4, amount: 20 },
    { name: 'John Quimby', birdies: 2, amount: 10 },
  ], 'Trip birdie pool should split the pool by trip birdie count');

  const over100Trip = makeEditableMyrtleTrip();
  const over100Round = clone(over100Trip.competition.ryderCup.rounds[0]);
  const teamAQualifier = over100Round.matches[0].teamAPlayers[0];
  const teamBQualifier = over100Round.matches[0].teamBPlayers[0];
  over100Trip.competition.ryderCup.rounds.forEach((savedRound, roundIndex) => {
    const completedRound = clone(savedRound);
    completedRound.matches = completedRound.matches.map((match, matchIndex) => ({
      ...match,
      teamAPlayerScores: match.teamAPlayers.map((_name, playerIndex) => (
        roundIndex === 0 && matchIndex === 0 && playerIndex === 0 ? 101 : 92
      )),
      teamBPlayerScores: match.teamBPlayers.map((_name, playerIndex) => (
        roundIndex === 0 && matchIndex === 0 && playerIndex === 0 ? 108 : 89
      )),
    }));
    setTripRyderCupRound(over100Trip, roundIndex, completedRound);
  });
  over100Trip.competition.ryderCup.sideGames.dailyOver100Draw[0] = {
    ...over100Trip.competition.ryderCup.sideGames.dailyOver100Draw[0],
    teamAWinnerNames: ['Manual Team A Winner'],
    teamBWinnerNames: ['Manual Team B Winner'],
    winnerNames: ['Manual Team A Winner', 'Manual Team B Winner'],
    amount: 20,
  };
  over100Trip.competition.ryderCup.sideGames.weeklyOver100Draw = {
    ...over100Trip.competition.ryderCup.sideGames.weeklyOver100Draw,
    teamAWinnerNames: ['Manual Team A Winner'],
    teamBWinnerNames: ['Manual Team B Winner'],
    winnerNames: ['Manual Team A Winner', 'Manual Team B Winner'],
    amount: 100,
  };
  const over100View = buildTripCompetitionView(over100Trip, myrtleParticipants);
  assert.deepStrictEqual(over100View.ryderCup.sideGames.dailyOver100Draw[0].teamAEligible, [teamAQualifier], 'Daily over-100 draw should expose Team A qualifiers from saved gross scores');
  assert.deepStrictEqual(over100View.ryderCup.sideGames.dailyOver100Draw[0].teamBEligible, [teamBQualifier], 'Daily over-100 draw should expose Team B qualifiers from saved gross scores');
  assert.deepStrictEqual(over100View.ryderCup.sideGames.dailyOver100Draw[0].teamAWinnerNames, [teamAQualifier], 'Daily over-100 draw should auto-pick a Team A winner from the eligible pool');
  assert.deepStrictEqual(over100View.ryderCup.sideGames.dailyOver100Draw[0].teamBWinnerNames, [teamBQualifier], 'Daily over-100 draw should auto-pick a Team B winner from the eligible pool');
  assert.strictEqual(over100View.ryderCup.sideGames.dailyOver100Draw[0].manualOverride, false, 'Daily over-100 draw should not use manual winner overrides');
  assert.deepStrictEqual(over100View.ryderCup.sideGames.weeklyOver100Draw.teamAWinnerNames, [teamAQualifier], 'Weekly over-100 draw should auto-pick a Team A winner from the eligible pool');
  assert.deepStrictEqual(over100View.ryderCup.sideGames.weeklyOver100Draw.teamBWinnerNames, [teamBQualifier], 'Weekly over-100 draw should auto-pick a Team B winner from the eligible pool');
  assert.strictEqual(over100View.ryderCup.sideGames.weeklyOver100Draw.manualOverride, false, 'Weekly over-100 draw should not use manual winner overrides');

  const excludedOver100Trip = makeEditableMyrtleTrip();
  const excludedOver100Round = clone(excludedOver100Trip.competition.ryderCup.rounds[0]);
  const extraTeamAQualifiers = [];
  const extraTeamBQualifiers = [];
  excludedOver100Round.matches = excludedOver100Round.matches.map((match, matchIndex) => {
    const nextMatch = { ...match };
    nextMatch.teamAPlayerScores = match.teamAPlayers.map((_name, playerIndex) => {
      const gross = matchIndex === 0 && playerIndex < 2 ? (101 + playerIndex) : 92;
      if (matchIndex === 0 && playerIndex < 2) extraTeamAQualifiers.push(match.teamAPlayers[playerIndex]);
      return gross;
    });
    nextMatch.teamBPlayerScores = match.teamBPlayers.map((_name, playerIndex) => {
      const gross = matchIndex === 0 && playerIndex < 2 ? (108 + playerIndex) : 89;
      if (matchIndex === 0 && playerIndex < 2) extraTeamBQualifiers.push(match.teamBPlayers[playerIndex]);
      return gross;
    });
    return nextMatch;
  });
  setTripRyderCupRound(excludedOver100Trip, 0, excludedOver100Round);
  excludedOver100Trip.competition.ryderCup.sideGames.dailyOver100Draw[0] = {
    ...excludedOver100Trip.competition.ryderCup.sideGames.dailyOver100Draw[0],
    notes: `Exclude: ${extraTeamAQualifiers[0]}, ${extraTeamBQualifiers[0]}`,
  };
  const excludedOver100View = buildTripCompetitionView(excludedOver100Trip, myrtleParticipants);
  assert.deepStrictEqual(excludedOver100View.ryderCup.sideGames.dailyOver100Draw[0].teamAEligible, extraTeamAQualifiers.slice().sort((left, right) => left.localeCompare(right)), 'Excluded daily over-100 draws should still show the full Team A eligible pool');
  assert.deepStrictEqual(excludedOver100View.ryderCup.sideGames.dailyOver100Draw[0].teamBEligible, extraTeamBQualifiers.slice().sort((left, right) => left.localeCompare(right)), 'Excluded daily over-100 draws should still show the full Team B eligible pool');
  assert.deepStrictEqual(excludedOver100View.ryderCup.sideGames.dailyOver100Draw[0].excludedNames, [extraTeamAQualifiers[0], extraTeamBQualifiers[0]], 'Excluded daily over-100 draws should expose the excluded names');
  assert.deepStrictEqual(excludedOver100View.ryderCup.sideGames.dailyOver100Draw[0].teamAWinnerNames, [extraTeamAQualifiers[1]], 'Excluded Team A winners should reroll to another eligible golfer');
  assert.deepStrictEqual(excludedOver100View.ryderCup.sideGames.dailyOver100Draw[0].teamBWinnerNames, [extraTeamBQualifiers[1]], 'Excluded Team B winners should reroll to another eligible golfer');

  const grossOnlyTrip = makeEditableMyrtleTrip();
  const grossOnlyRound = clone(grossOnlyTrip.competition.ryderCup.rounds[0]);
  grossOnlyRound.matches = grossOnlyRound.matches.map((match, index) => (index === 0
    ? {
        ...match,
        teamAPlayerScores: [null, null],
        teamBPlayerScores: [null, null],
        teamAScore: 150,
        teamBScore: 170,
        result: '',
        notes: 'Gross totals only',
      }
    : match));
  setTripRyderCupRound(grossOnlyTrip, 0, grossOnlyRound);
  const grossOnlyView = buildTripCompetitionView(grossOnlyTrip, myrtleParticipants);
  const grossOnlyMatch = grossOnlyView.ryderCup.rounds[0].matches[0];
  assert.strictEqual(grossOnlyMatch.teamAGrossScore, 150, 'Manual team-total entry should keep the saved gross number visible');
  assert.strictEqual(grossOnlyMatch.teamBGrossScore, 170, 'Manual team-total entry should keep the opponent gross number visible');
  assert.strictEqual(grossOnlyMatch.teamAScore, 130, 'Manual team-total entry should still apply Team A full handicap allowance');
  assert.strictEqual(grossOnlyMatch.teamBScore, 128, 'Manual team-total entry should still apply Team B full handicap allowance');
  assert.strictEqual(grossOnlyMatch.result, 'teamB', 'Manual gross team totals should still auto-resolve the lower net side');

  const grossOnlyRoundTripPayload = clone(grossOnlyView.ryderCup.rounds[0]);
  setTripRyderCupRound(grossOnlyTrip, 0, grossOnlyRoundTripPayload);
  const grossOnlyRoundTripView = buildTripCompetitionView(grossOnlyTrip, myrtleParticipants);
  const grossOnlyRoundTripMatch = grossOnlyRoundTripView.ryderCup.rounds[0].matches[0];
  assert.strictEqual(grossOnlyRoundTripMatch.teamAGrossScore, 150, 'Round payloads coming back from the view should not double-subtract Team A handicap');
  assert.strictEqual(grossOnlyRoundTripMatch.teamBGrossScore, 170, 'Round payloads coming back from the view should not double-subtract Team B handicap');
  assert.strictEqual(grossOnlyRoundTripMatch.teamAScore, 130, 'Round payload round-trips should preserve Team A net totals');
  assert.strictEqual(grossOnlyRoundTripMatch.teamBScore, 128, 'Round payload round-trips should preserve Team B net totals');

  const noShowTrip = makeEditableMyrtleTrip();
  const noShowRoundIndex = noShowTrip.competition.ryderCup.rounds.findIndex((round) => (round.matches || []).some((match) => []
    .concat(match.teamAPlayers || [])
    .concat(match.teamBPlayers || [])
    .includes('Jeremy Bridges')));
  assert(noShowRoundIndex >= 0, 'Editable Myrtle trip should include a Jeremy Bridges match');
  const noShowRound = clone(noShowTrip.competition.ryderCup.rounds[noShowRoundIndex]);
  let noShowMatchIndex = -1;
  let noShowPartnerName = '';
  let noShowSideKey = '';
  noShowRound.matches = noShowRound.matches.map((match, matchIndex) => {
    const hasJeremyTeamA = (match.teamAPlayers || []).includes('Jeremy Bridges');
    const hasJeremyTeamB = (match.teamBPlayers || []).includes('Jeremy Bridges');
    const nextMatch = {
      ...match,
      teamAPlayerScores: (match.teamAPlayers || []).map((_name, playerIndex) => 84 + (matchIndex * 4) + playerIndex),
      teamBPlayerScores: (match.teamBPlayers || []).map((_name, playerIndex) => 92 + (matchIndex * 4) + playerIndex),
      notes: String(match.notes || '').trim(),
    };
    if (hasJeremyTeamA || hasJeremyTeamB) {
      noShowMatchIndex = matchIndex;
      noShowSideKey = hasJeremyTeamA ? 'teamA' : 'teamB';
      const sidePlayers = hasJeremyTeamA ? (match.teamAPlayers || []) : (match.teamBPlayers || []);
      const sideScoresKey = hasJeremyTeamA ? 'teamAPlayerScores' : 'teamBPlayerScores';
      noShowPartnerName = sidePlayers.find((name) => name !== 'Jeremy Bridges') || '';
      nextMatch[sideScoresKey] = sidePlayers.map((name) => (name === 'Jeremy Bridges' ? null : 95));
      nextMatch[hasJeremyTeamA ? 'teamBPlayerScores' : 'teamAPlayerScores'] = [100, 101];
      nextMatch.notes = 'No show: Jeremy Bridges';
    }
    return nextMatch;
  });
  setTripRyderCupRound(noShowTrip, noShowRoundIndex, noShowRound);
  const noShowView = buildTripCompetitionView(noShowTrip, myrtleParticipants);
  const noShowMatch = noShowView.ryderCup.rounds[noShowRoundIndex].matches[noShowMatchIndex];
  const noShowTeam = noShowView.ryderCup.teams.find((team) => team.id === noShowSideKey);
  const noShowPartnerMeta = noShowTeam && noShowTeam.players.find((player) => player.name === noShowPartnerName);
  const noShowJeremy = noShowView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Jeremy Bridges');
  assert(noShowMatch, 'No-show match should be present in the Ryder Cup view');
  assert(noShowPartnerMeta, 'Jeremy no-show match should still have the partner metadata available');
  assert(noShowJeremy, 'Jeremy should still appear on the individual leaderboard');
  assert.deepStrictEqual(noShowSideKey === 'teamA' ? noShowMatch.teamANoContributionPlayers : noShowMatch.teamBNoContributionPlayers, ['Jeremy Bridges'], 'Jeremy should be marked as a no-contribution player on the saved match');
  assert.strictEqual(noShowSideKey === 'teamA' ? noShowMatch.teamAGrossScore : noShowMatch.teamBGrossScore, 95, 'A no-show should contribute zero gross to the team total');
  assert.strictEqual(noShowSideKey === 'teamA' ? noShowMatch.teamAHandicapAllowance : noShowMatch.teamBHandicapAllowance, noShowPartnerMeta.matchHandicap, 'A no-show should not receive handicap strokes in the team total');
  assert.strictEqual(noShowMatch.result, noShowSideKey === 'teamA' ? 'teamB' : 'teamA', 'A no-show side should forfeit a combined-score match');
  assert.strictEqual(noShowView.ryderCup.sideGames.dailyNet[noShowRoundIndex].isComplete, true, 'Daily net should treat a marked no-show as a completed round slot');
  assert.strictEqual(noShowJeremy.matchesPlayed, 0, 'A no-show should not receive individual match credit for rounds they missed');
  assert.strictEqual(noShowJeremy.pointsWon, 0, 'A no-show should not receive Ryder Cup points for rounds they missed');

  const singlesNoShowTrip = makeEditableMyrtleTrip();
  const singlesNoShowRoundIndex = singlesNoShowTrip.competition.ryderCup.rounds.findIndex((round) => String(round.format || '').toLowerCase().includes('singles'));
  assert(singlesNoShowRoundIndex >= 0, 'Editable Myrtle trip should include a singles round');
  const singlesNoShowRound = clone(singlesNoShowTrip.competition.ryderCup.rounds[singlesNoShowRoundIndex]);
  let singlesNoShowMatchIndex = -1;
  let singlesNoShowSideKey = '';
  singlesNoShowRound.matches = singlesNoShowRound.matches.map((match, matchIndex) => {
    const hasJeremyTeamA = (match.teamAPlayers || []).includes('Jeremy Bridges');
    const hasJeremyTeamB = (match.teamBPlayers || []).includes('Jeremy Bridges');
    const nextMatch = {
      ...match,
      teamAPlayerScores: (match.teamAPlayers || []).map(() => null),
      teamBPlayerScores: (match.teamBPlayers || []).map(() => null),
      notes: String(match.notes || '').trim(),
    };
    if (hasJeremyTeamA || hasJeremyTeamB) {
      singlesNoShowMatchIndex = matchIndex;
      singlesNoShowSideKey = hasJeremyTeamA ? 'teamA' : 'teamB';
      nextMatch.notes = 'No show: Jeremy Bridges';
    }
    return nextMatch;
  });
  setTripRyderCupRound(singlesNoShowTrip, singlesNoShowRoundIndex, singlesNoShowRound);
  const singlesNoShowView = buildTripCompetitionView(singlesNoShowTrip, myrtleParticipants);
  const singlesNoShowMatch = singlesNoShowView.ryderCup.rounds[singlesNoShowRoundIndex].matches[singlesNoShowMatchIndex];
  assert(singlesNoShowMatch, 'Singles no-show match should be present in the Ryder Cup view');
  assert.strictEqual(singlesNoShowMatch.result, singlesNoShowSideKey === 'teamA' ? 'teamB' : 'teamA', 'A no-show golfer should forfeit a singles match even without an opponent score');

  const movedPlayersTrip = makeEditableMyrtleTrip();
  const movedPlayersRound = clone(movedPlayersTrip.competition.ryderCup.rounds[0]);
  const originalMatchZero = clone(movedPlayersRound.matches[0]);
  const originalMatchOne = clone(movedPlayersRound.matches[1]);
  movedPlayersRound.matches = movedPlayersRound.matches.map((match, index) => {
    if (index === 0) {
      return {
        ...match,
        teamAPlayers: originalMatchOne.teamAPlayers.slice(),
        teamBPlayers: originalMatchOne.teamBPlayers.slice(),
        teamAPlayerScores: [74, 76],
        teamBPlayerScores: [84, 86],
        result: '',
      };
    }
    if (index === 1) {
      return {
        ...match,
        teamAPlayers: originalMatchZero.teamAPlayers.slice(),
        teamBPlayers: originalMatchZero.teamBPlayers.slice(),
        teamAPlayerScores: [null, null],
        teamBPlayerScores: [null, null],
        result: '',
      };
    }
    return match;
  });
  setTripRyderCupRound(movedPlayersTrip, 0, movedPlayersRound);
  const movedPlayersView = buildTripCompetitionView(movedPlayersTrip, myrtleParticipants);
  const movedPlayersMatch = movedPlayersView.ryderCup.rounds[0].matches[0];
  const movedPlayersMatchOne = movedPlayersView.ryderCup.rounds[0].matches[1];
  const movedPlayerHandicaps = new Map(movedPlayersView.ryderCup.teams.flatMap((team) => team.players.map((player) => [player.name, player.matchHandicap])));
  const expectedMovedTeamAAllowance = movedPlayersMatchOne.teamAPlayers.reduce((sum, name) => sum + (movedPlayerHandicaps.get(name) || 0), 0);
  const expectedMovedTeamBAllowance = movedPlayersMatchOne.teamBPlayers.reduce((sum, name) => sum + (movedPlayerHandicaps.get(name) || 0), 0);
  assert.deepStrictEqual(movedPlayersMatch.teamAPlayers, originalMatchZero.teamAPlayers, 'Manual matchup edits should be ignored when the tee sheet still has the original foursome');
  assert.deepStrictEqual(movedPlayersMatch.teamBPlayers, originalMatchZero.teamBPlayers, 'The saved Ryder Cup view should stay aligned to the tee sheet, not the posted payload order');
  assert.strictEqual(movedPlayersMatch.teamAScore, null, 'Scores should not stay attached to a manually swapped match that is no longer on the tee sheet');
  assert.strictEqual(movedPlayersMatch.teamBScore, null, 'Opponent scores should not stay attached to a manually swapped match that is no longer on the tee sheet');
  assert.deepStrictEqual(movedPlayersMatchOne.teamAPlayers, originalMatchOne.teamAPlayers, 'Scores should land back on the tee-sheet-aligned Team A pairing');
  assert.deepStrictEqual(movedPlayersMatchOne.teamBPlayers, originalMatchOne.teamBPlayers, 'Scores should land back on the tee-sheet-aligned Team B pairing');
  assert.strictEqual(movedPlayersMatchOne.teamAHandicapAllowance, expectedMovedTeamAAllowance, 'Tee-sheet-aligned Team A golfers should still carry their full allowances');
  assert.strictEqual(movedPlayersMatchOne.teamBHandicapAllowance, expectedMovedTeamBAllowance, 'Tee-sheet-aligned Team B golfers should still carry their full allowances');
  assert.strictEqual(movedPlayersMatchOne.teamAScore, 150 - expectedMovedTeamAAllowance, 'Gross scores should reattach to the correct tee-sheet Team A pairing');
  assert.strictEqual(movedPlayersMatchOne.teamBScore, 170 - expectedMovedTeamBAllowance, 'Gross scores should reattach to the correct tee-sheet Team B pairing');

  const teeSheetSyncedTrip = makeEditableMyrtleTrip();
  teeSheetSyncedTrip.rounds[0].teeTimes = makeTeeTimes([
    ['Joe Gillette', 'Tommy Knight Sr', 'Chris Manuel', 'Marcus Ordonez'],
    ['Josh Browne', 'Jeremy Bridges', 'John Quimby', 'Thomas Lasik'],
    ['Matt Shannon', 'Tommy Knight', 'Caleb Hart', 'Manuel Ordonez'],
    ['Dennis Freeman', 'Lance Darr', 'Delmar Christian', 'Duane Harris'],
    ['Chad Jones', 'Chris Neff', 'John Hyers', 'Reny Butler'],
  ]);
  const { round: teeSheetSyncedRound, scoreByName: teeSheetRoundScores } = assignUniqueRyderCupScores(clone(teeSheetSyncedTrip.competition.ryderCup.rounds[0]));
  setTripRyderCupRound(teeSheetSyncedTrip, 0, teeSheetSyncedRound);
  const teeSheetSyncedView = buildTripCompetitionView(teeSheetSyncedTrip, myrtleParticipants);
  const syncedTeamMatch = teeSheetSyncedView.ryderCup.rounds[0].matches[0];
  assert.deepStrictEqual(syncedTeamMatch.teamAPlayers, ['Joe Gillette', 'Tommy Knight Sr'], 'Team-match pairings should follow the live tee sheet instead of stale saved matchups');
  assert.deepStrictEqual(syncedTeamMatch.teamBPlayers, ['Chris Manuel', 'Marcus Ordonez'], 'Opponent sides should be rebuilt from the live tee sheet');
  assert.deepStrictEqual(syncedTeamMatch.teamAPlayerScores, [teeSheetRoundScores.get('Joe Gillette'), teeSheetRoundScores.get('Tommy Knight Sr')], 'Saved gross scores should stay attached to the golfer after a tee-sheet move');
  assert.deepStrictEqual(syncedTeamMatch.teamBPlayerScores, [teeSheetRoundScores.get('Chris Manuel'), teeSheetRoundScores.get('Marcus Ordonez')], 'Opponent gross scores should stay attached to the golfer after a tee-sheet move');

  const teeSheetSinglesTrip = makeEditableMyrtleTrip();
  teeSheetSinglesTrip.rounds[4].teeTimes = makeTeeTimes([
    ['Joe Gillette', 'Duane Harris', 'Josh Browne', 'John Quimby'],
    ['Jeremy Bridges', 'Manuel Ordonez', 'Tommy Knight', 'Reny Butler'],
    ['Lance Darr', 'Caleb Hart', 'Tommy Knight Sr', 'Delmar Christian'],
    ['Chris Neff', 'Marcus Ordonez', 'Dennis Freeman', 'Thomas Lasik'],
    ['Chad Jones', 'Chris Manuel', 'Matt Shannon', 'John Hyers'],
  ]);
  const { round: teeSheetSinglesRound, scoreByName: teeSheetSinglesScores } = assignUniqueRyderCupScores(clone(teeSheetSinglesTrip.competition.ryderCup.rounds[4]));
  setTripRyderCupRound(teeSheetSinglesTrip, 4, teeSheetSinglesRound);
  const teeSheetSinglesView = buildTripCompetitionView(teeSheetSinglesTrip, myrtleParticipants);
  const syncedSinglesMatchA = teeSheetSinglesView.ryderCup.rounds[4].matches[0];
  const syncedSinglesMatchB = teeSheetSinglesView.ryderCup.rounds[4].matches[1];
  assert.deepStrictEqual(syncedSinglesMatchA.teamAPlayers, ['Joe Gillette'], 'Singles should use the first Team A golfer in the scheduled foursome');
  assert.deepStrictEqual(syncedSinglesMatchA.teamBPlayers, ['Duane Harris'], 'Singles should use the first Team B golfer in the scheduled foursome');
  assert.deepStrictEqual(syncedSinglesMatchB.teamAPlayers, ['Josh Browne'], 'Singles should use the second Team A golfer in the scheduled foursome');
  assert.deepStrictEqual(syncedSinglesMatchB.teamBPlayers, ['John Quimby'], 'Singles should use the second Team B golfer in the scheduled foursome');
  assert.deepStrictEqual(syncedSinglesMatchA.teamAPlayerScores, [teeSheetSinglesScores.get('Joe Gillette')], 'Singles gross scores should stay tied to the golfer after the tee sheet changes');
  assert.deepStrictEqual(syncedSinglesMatchB.teamBPlayerScores, [teeSheetSinglesScores.get('John Quimby')], 'Singles opponent gross scores should stay tied to the golfer after the tee sheet changes');

  const invalidScheduleTrip = makeEditableMyrtleTrip();
  invalidScheduleTrip.rounds[0].teeTimes = makeTeeTimes([
    ['Joe Gillette', 'Jeremy Bridges', 'Duane Harris'],
    ['Josh Browne', 'Chris Neff', 'Chris Manuel', 'Delmar Christian', 'John Quimby'],
    ['Lance Darr', 'Tommy Knight', 'John Hyers', 'Marcus Ordonez'],
    ['Dennis Freeman', 'Chad Jones', 'Caleb Hart', 'Thomas Lasik'],
    ['Matt Shannon', 'Tommy Knight Sr', 'Reny Butler', 'Manuel Ordonez'],
  ]);
  const invalidScheduleRound = clone(invalidScheduleTrip.competition.ryderCup.rounds[0]);
  assert.throws(
    () => setTripRyderCupRound(invalidScheduleTrip, 0, invalidScheduleRound),
    /Fix the scheduled foursomes before saving Ryder Cup scores/i,
    'Invalid tee-sheet group sizes should block Ryder Cup score saves instead of falling back to stale pairings',
  );
  const invalidScheduleView = buildTripCompetitionView(invalidScheduleTrip, myrtleParticipants);
  assert.strictEqual(invalidScheduleView.ryderCup.rounds[0].scheduleSync.status, 'invalid', 'Invalid tee sheets should be flagged in the Ryder Cup round view');
  assert.match(invalidScheduleView.ryderCup.rounds[0].scheduleSync.issues[0], /should have 4 golfers|should have 2/i, 'Invalid tee sheets should explain the schedule-sync problem');

  const singlesTieTrip = makeEditableMyrtleTrip();
  const singlesTieRound = clone(singlesTieTrip.competition.ryderCup.rounds[4]);
  singlesTieRound.matches = singlesTieRound.matches.map((match, index) => (index === 0
    ? {
        ...match,
        teamAPlayerScores: [84],
        teamBPlayerScores: [80],
        result: '',
      }
    : match));
  setTripRyderCupRound(singlesTieTrip, 4, singlesTieRound);
  const singlesTieView = buildTripCompetitionView(singlesTieTrip, myrtleParticipants);
  const singlesTieMatch = singlesTieView.ryderCup.rounds[4].matches[0];
  assert.strictEqual(singlesTieMatch.teamAGrossScore, 84, 'Singles should expose the entered gross score for Team A');
  assert.strictEqual(singlesTieMatch.teamBGrossScore, 80, 'Singles should expose the entered gross score for Team B');
  assert.strictEqual(singlesTieMatch.teamAScore, 68, 'Singles should subtract Team A full handicap allowance from gross');
  assert.strictEqual(singlesTieMatch.teamBScore, 69, 'Singles should subtract Team B full handicap allowance from gross');
  assert.strictEqual(singlesTieMatch.result, 'teamA', 'Lower net singles should resolve to Team A');
  assert.strictEqual(singlesTieMatch.pointsA, 1, 'Winning singles should award the point to Team A');
  assert.strictEqual(singlesTieMatch.pointsB, 0, 'Losing singles should award zero points to Team B');

  const manualOverrideTrip = makeEditableMyrtleTrip();
  const manualOverrideRound = clone(manualOverrideTrip.competition.ryderCup.rounds[0]);
  manualOverrideRound.matches = manualOverrideRound.matches.map((match, index) => (index === 0
    ? {
        ...match,
        teamAPlayerScores: [74, 76],
        teamBPlayerScores: [84, 86],
        result: 'teamB',
        notes: 'Manual ruling',
      }
    : match));
  setTripRyderCupRound(manualOverrideTrip, 0, manualOverrideRound);
  const manualOverrideView = buildTripCompetitionView(manualOverrideTrip, myrtleParticipants);
  const manualOverrideMatch = manualOverrideView.ryderCup.rounds[0].matches[0];
  assert.strictEqual(manualOverrideMatch.teamAScore, 150 - 20, 'Manual-result matches should still calculate Team A net correctly');
  assert.strictEqual(manualOverrideMatch.teamBScore, 170 - 42, 'Manual-result matches should still calculate Team B net correctly');
  assert.strictEqual(manualOverrideMatch.result, 'teamB', 'Manual result selection should override the inferred lower-net winner');
  assert.strictEqual(manualOverrideMatch.resultSource, 'manual', 'Manual result selection should be labeled as manual');
  assert.strictEqual(manualOverrideMatch.pointsA, 0, 'Manual result overrides should award zero points to the losing side');
  assert.strictEqual(manualOverrideMatch.pointsB, 1, 'Manual result overrides should award the point to the selected winner');

  const legacyTeeSheetTrip = {
    name: 'Myrtle Beach - Barefoot Group 3/18-3/22/26',
    location: 'Myrtle Beach, SC',
    arrivalDate: new Date('2026-03-18'),
    competition: { scoringMode: 'best4' },
    rounds: [
      makeRound('World Tour', [], makeTeeTimes([
        ['Joe Gillette', 'Duane Harris', 'Josh Browne', 'Manuel Ordonez'],
        ['John Quimby', 'Tommy Knight Sr', 'Lance Darr', 'Marcus Ordonez'],
        ['Tommy Knight', 'Jeremy Bridges', 'Reny Butler', 'Chad Jones'],
        ['Thomas Lasik', 'Delmar Christian', 'John Hyers', 'Matt Shannon'],
        ['Chris Manuel', 'Dennis Freeman', 'Caleb Hart', 'Chris Neff'],
      ])),
      makeRound('Wild Wing Avocet', [], makeTeeTimes([
        ['Joe Gillette', 'Tommy Knight Sr', 'Chris Neff', 'Lance Darr'],
        ['John Quimby', 'Delmar Christian', 'Josh Browne', 'Matt Shannon'],
        ['Tommy Knight', 'Dennis Freeman', 'Reny Butler', 'Marcus Ordonez'],
        ['Thomas Lasik', 'Jeremy Bridges', 'John Hyers', 'Chad Jones'],
        ['Chris Manuel', 'Duane Harris', 'Caleb Hart', 'Manuel Ordonez'],
      ])),
      makeRound('Kings North', [], makeTeeTimes([
        ['Joe Gillette', 'Delmar Christian', 'Reny Butler', 'Matt Shannon'],
        ['John Quimby', 'Jeremy Bridges', 'Caleb Hart', 'John Hyers'],
        ['Tommy Knight', 'Tommy Knight Sr', 'Lance Darr', 'Chad Jones'],
        ['Thomas Lasik', 'Chris Manuel', 'Josh Browne', 'Chris Neff'],
        ['Dennis Freeman', 'Duane Harris', 'Marcus Ordonez', 'Manuel Ordonez'],
      ])),
      makeRound('River Hills', [], makeTeeTimes([
        ['Jeremy Bridges', 'Duane Harris', 'Caleb Hart', 'Chris Neff'],
        ['Tommy Knight', 'Dennis Freeman', 'Matt Shannon', 'John Hyers'],
        ['John Quimby', 'Delmar Christian', 'Marcus Ordonez', 'Chad Jones'],
        ['Thomas Lasik', 'Chris Manuel', 'Reny Butler', 'Lance Darr'],
        ['Joe Gillette', 'Tommy Knight Sr', 'Josh Browne', 'Manuel Ordonez'],
      ])),
      makeRound('Long Bay', [], makeTeeTimes([
        ['Tommy Knight', 'Marcus Ordonez', 'Tommy Knight Sr', 'Manuel Ordonez'],
        ['Joe Gillette', 'Josh Browne', 'John Quimby', 'Reny Butler'],
        ['Thomas Lasik', 'John Hyers', 'Chris Manuel', 'Lance Darr'],
        ['Dennis Freeman', 'Caleb Hart', 'Jeremy Bridges', 'Matt Shannon'],
        ['Delmar Christian', 'Chris Neff', 'Duane Harris', 'Chad Jones'],
      ])),
    ],
  };
  const normalizedTeeSheetTrip = normalizeLegacyMyrtleTripTeeSheet(legacyTeeSheetTrip);
  assert.deepStrictEqual(normalizedTeeSheetTrip.rounds[0].teeTimes[0].players, ['Joe Gillette', 'Jeremy Bridges', 'Duane Harris', 'Manuel Ordonez'], 'Legacy Myrtle tee sheets should migrate to the lower-repeat fixed-team opener');
  assert.deepStrictEqual(normalizedTeeSheetTrip.rounds[1].teeTimes[1].players, ['Josh Browne', 'Jeremy Bridges', 'John Quimby', 'Thomas Lasik'], 'Legacy Myrtle tee sheets should align to the lower-repeat round-two foursomes');
  assert.deepStrictEqual(normalizedTeeSheetTrip.rounds[2].teeTimes[4].players, ['Dennis Freeman', 'Tommy Knight Sr', 'John Hyers', 'Manuel Ordonez'], 'Legacy Myrtle tee sheets should align later rounds with the rebuilt lower-repeat foursomes');

  console.log('test_trip_competition_service.js passed');
}

run();
