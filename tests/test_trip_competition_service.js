const assert = require('assert');
const {
  buildTripCompetitionView,
  computeCountedRounds,
  getDefaultScorecard,
  normalizeLegacyMyrtleTripTeeSheet,
  setTripRyderCupRound,
  syncTripRyderCupOverlayToCompetition,
  swapTripRyderCupTeamPlayers,
} = require('../services/tripCompetitionService');
const { buildDefaultMyrtleRyderCup } = require('../services/myrtleRyderCupDefaults');

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
  assert.strictEqual(freshView.ryderCup.description, 'Team competition with every player playing his own ball and keeping his own score in every round, with fixed 75% handicaps applied automatically.', 'The Ryder Cup intro should explain the own-ball 75% handicap setup');
  assert.strictEqual(freshView.ryderCup.rounds[1].format, 'Two-Man Net Total Match (75%)', 'Round 2 should now be seeded as the shared 75% handicap team format');
  assert.strictEqual(freshView.ryderCup.rounds[1].plan.groups[0].playStyle, 'Two-Man Net Total Match (75%)', 'Team rounds should seed with the shared 75% handicap play style');
  assert.strictEqual(freshView.ryderCup.rounds[3].format, 'Two-Man Net Total Match (75%)', 'Round 4 should now use the same 75% handicap scoring format as the other team rounds');
  assert.strictEqual(freshView.ryderCup.rounds[3].pointValue, 1, 'Each Round 4 pod should now be worth one point');
  assert.strictEqual(freshView.ryderCup.rounds[4].plan.groups[0].playStyle, 'Singles Net Total Match (75%)', 'Singles rounds should seed with the 75% handicap singles play style');
  const myrtleView = buildTripCompetitionView(myrtleTrip, myrtleParticipants);
  assert(myrtleView.ryderCup, 'Myrtle trips should expose a Ryder Cup view');
  assert.strictEqual(myrtleView.ryderCup.canEditTeams, false, 'Ryder Cup teams should lock once results have been entered');
  assert.strictEqual(myrtleView.ryderCup.teams[0].rankSum, 105, 'Team A rank sum should be seeded to 105');
  assert.strictEqual(myrtleView.ryderCup.teams[1].rankSum, 105, 'Team B rank sum should be seeded to 105');
  assert.strictEqual(myrtleView.ryderCup.fairness.status, 'Very balanced', 'Balanced seed should report a very balanced fairness note');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].format, 'Two-Man Net Total Match (75%)', 'Saved legacy round formats should normalize to the 75% handicap match label');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].formatKey, 'grossTeamMatch', 'Saved legacy net-total round keys should keep the gross-entry engine under the 75% handicap view');
  assert.strictEqual(myrtleView.ryderCup.standings.teamAPoints, 1, '75% handicap Ryder Cup rounds should roll up completed daily matches correctly');
  assert.strictEqual(myrtleView.ryderCup.standings.teamBPoints, 4, 'Completed 75% handicap Ryder Cup matches should update Team B points');
  assert.strictEqual(myrtleView.ryderCup.standings.remainingPoints, 25, 'Remaining points should reflect unfinished matches after five scored matches');
  assert.strictEqual(myrtleView.ryderCup.totalPointsAvailable, 30, 'Ryder Cup total points should stay fixed at 30');
  assert(myrtleView.overview.formatSummary.includes('lower net side'), 'Myrtle overview should explain the fixed 75% handicap match flow');
  assert.strictEqual(myrtleView.ryderCup.teams[0].players[0].handicapIndex, 2, 'Seeded Ryder Cup players should expose their fixed handicap index');
  assert.strictEqual(myrtleView.ryderCup.teams[0].players[0].matchHandicap, 2, 'Seeded Ryder Cup players should expose their 75% match allowance');
  const joeGilletteRow = myrtleView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Joe Gillette');
  assert(joeGilletteRow, 'Individual Ryder Cup rows should be present');
  assert.strictEqual(joeGilletteRow.pointsWon, 1, 'Completed 75% handicap matches should feed the individual leaderboard');
  const joshRow = myrtleView.ryderCup.individualLeaderboard.find((entry) => entry.name === 'Josh Browne');
  assert(joshRow, 'Scored Ryder Cup players should be present');
  assert.strictEqual(joshRow.pointsWon, 0, 'Losing 75% handicap matches should award zero points');
  const hardConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'neff-not-manuel');
  assert(hardConstraint, 'Hard constraint rows should be exposed');
  assert.strictEqual(hardConstraint.status, 'clear', 'Seeded Ryder Cup schedule should keep Chris Neff away from Manuel Ordonez');
  const noRepeatConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'no-repeat-two-man-teammates');
  assert(noRepeatConstraint, 'No-repeat teammate rules should be exposed');
  assert.strictEqual(noRepeatConstraint.status, 'clear', 'Seeded Ryder Cup schedule should avoid repeating the same 2-man team');
  const joshMattConstraint = myrtleView.ryderCup.admin.hardConstraints.find((entry) => entry.id === 'josh-not-matt-team');
  assert(joshMattConstraint, 'Specific teammate bans should be exposed');
  assert.strictEqual(joshMattConstraint.status, 'clear', 'Josh Browne and Matt Shannon should not be paired together');
  const requestedGrouping = myrtleView.ryderCup.admin.requestedGroupings.find((entry) => entry.id === 'duane-hyers');
  assert(requestedGrouping, 'Requested grouping coverage should be exposed');
  assert.strictEqual(requestedGrouping.status, 'scheduled', 'Requested grouping coverage should be tracked');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.dayNote, 'Warm up at the range before the opener.', 'Round-level planning notes should be exposed');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.groups[0].playStyle, 'Two-Man Net Total Match (75%)', 'Saved complex or legacy plan styles should normalize to the 75% handicap play style');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].plan.groups[0].notes, 'Opening match uses the saved gross-score setup.', 'Saved daily plan group notes should survive normalization');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].matches[0].teamAGrossScore, 166, '75% handicap rounds should still expose calculated team gross totals');
  assert.strictEqual(myrtleView.ryderCup.rounds[0].matches[0].teamAHandicapAllowance, 16, '75% handicap rounds should expose the applied team allowance');
  assert.strictEqual(myrtleView.ryderCup.rounds[1].matches[0].teamAScore, 147, '75% handicap rounds should expose the adjusted team net score');
  assert.strictEqual(myrtleView.ryderCup.rounds[2].matches[0].teamAScore, 163, '75% handicap rounds should derive later net totals from saved gross scores');
  assert.strictEqual(myrtleView.ryderCup.rounds[3].matches[0].teamAGrossScore, 180, 'Round 4 should still expose the pod gross total on the match itself');
  assert.strictEqual(myrtleView.ryderCup.rounds[3].matches[0].pointsB, 1, 'Round 4 pod matches should award one point to the lower net side');
  assert.strictEqual(myrtleView.ryderCup.admin.roundRules.length, 5, 'Admin rules should explain each own-ball round format');
  assert.throws(() => swapTripRyderCupTeamPlayers(myrtleTrip, 'Tommy Knight', 'Reny Butler'), /locked/i, 'Team swaps should be rejected after Ryder Cup results exist');

  const makeEditableMyrtleTrip = () => ({
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
  });

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
  assert.strictEqual(grossOnlyMatch.teamAScore, 134, 'Manual team-total entry should still apply Team A 75% handicap allowance');
  assert.strictEqual(grossOnlyMatch.teamBScore, 138, 'Manual team-total entry should still apply Team B 75% handicap allowance');
  assert.strictEqual(grossOnlyMatch.result, 'teamA', 'Manual gross team totals should still auto-resolve the lower net side');

  const grossOnlyRoundTripPayload = clone(grossOnlyView.ryderCup.rounds[0]);
  setTripRyderCupRound(grossOnlyTrip, 0, grossOnlyRoundTripPayload);
  const grossOnlyRoundTripView = buildTripCompetitionView(grossOnlyTrip, myrtleParticipants);
  const grossOnlyRoundTripMatch = grossOnlyRoundTripView.ryderCup.rounds[0].matches[0];
  assert.strictEqual(grossOnlyRoundTripMatch.teamAGrossScore, 150, 'Round payloads coming back from the view should not double-subtract Team A handicap');
  assert.strictEqual(grossOnlyRoundTripMatch.teamBGrossScore, 170, 'Round payloads coming back from the view should not double-subtract Team B handicap');
  assert.strictEqual(grossOnlyRoundTripMatch.teamAScore, 134, 'Round payload round-trips should preserve Team A net totals');
  assert.strictEqual(grossOnlyRoundTripMatch.teamBScore, 138, 'Round payload round-trips should preserve Team B net totals');

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
  assert.strictEqual(singlesTieMatch.teamAScore, 72, 'Singles should subtract Team A 75% allowance from gross');
  assert.strictEqual(singlesTieMatch.teamBScore, 72, 'Singles should subtract Team B 75% allowance from gross');
  assert.strictEqual(singlesTieMatch.result, 'halved', 'Equal net singles should resolve as halved');
  assert.strictEqual(singlesTieMatch.pointsA, 0.5, 'Halved singles should split the point for Team A');
  assert.strictEqual(singlesTieMatch.pointsB, 0.5, 'Halved singles should split the point for Team B');

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
  assert.strictEqual(manualOverrideMatch.teamAScore, 150 - 16, 'Manual-result matches should still calculate Team A net correctly');
  assert.strictEqual(manualOverrideMatch.teamBScore, 170 - 32, 'Manual-result matches should still calculate Team B net correctly');
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
