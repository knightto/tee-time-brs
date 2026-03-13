function copyPlayers(players = []) {
  return players.map((player) => ({ ...player }));
}

const MYRTLE_RYDER_CUP_SCHEDULE_VERSION = '2026-03-13-even-match-seed';

function getDefaultRoundPlayStyle(format = '') {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized.includes('singles')) return 'Singles Match Play';
  if (normalized.includes('1-2-3')) return '1-2-3 Team Game';
  if (normalized.includes('two-man combined')) return 'Two-Man Combined Score';
  if (normalized.includes('best ball stroke')) return 'Best Ball Stroke Play';
  if (normalized.includes('four-ball')) return 'Four-Ball Match Play';
  return 'Own Ball Pod';
}

const MYRTLE_RYDER_CUP_PLAYERS = [
  { name: 'Joe Gillette', rank: 1 },
  { name: 'John Quimby', rank: 2 },
  { name: 'Josh Browne', rank: 3 },
  { name: 'Tommy Knight', rank: 4 },
  { name: 'Reny Butler', rank: 5 },
  { name: 'Thomas Lasik', rank: 6 },
  { name: 'John Hyers', rank: 7 },
  { name: 'Chris Manuel', rank: 8 },
  { name: 'Lance Darr', rank: 9 },
  { name: 'Caleb Hart', rank: 10 },
  { name: 'Chris Neff', rank: 11 },
  { name: 'Marcus Ordonez', rank: 12 },
  { name: 'Dennis Freeman', rank: 13 },
  { name: 'Chad Jones', rank: 14 },
  { name: 'Jeremy Bridges', rank: 15 },
  { name: 'Matt Shannon', rank: 16 },
  { name: 'Delmar Christian', rank: 17 },
  { name: 'Manuel Ordonez', rank: 18 },
  { name: 'Tommy Knight Sr', rank: 19 },
  { name: 'Duane Harris', rank: 20 },
];

const MYRTLE_RYDER_CUP_TEAMS = {
  teamA: [
    'Joe Gillette',
    'John Quimby',
    'Tommy Knight',
    'Thomas Lasik',
    'Chris Manuel',
    'Dennis Freeman',
    'Jeremy Bridges',
    'Delmar Christian',
    'Tommy Knight Sr',
    'Duane Harris',
  ],
  teamB: [
    'Josh Browne',
    'Reny Butler',
    'John Hyers',
    'Lance Darr',
    'Caleb Hart',
    'Chris Neff',
    'Marcus Ordonez',
    'Chad Jones',
    'Matt Shannon',
    'Manuel Ordonez',
  ],
};

const MYRTLE_RYDER_CUP_HARD_CONSTRAINTS = [
  {
    id: 'final-round-knights',
    text: 'Tommy Knight Sr must play with Tommy Knight Jr in the final round.',
    players: ['Tommy Knight', 'Tommy Knight Sr'],
  },
  {
    id: 'marcus-not-caleb',
    text: 'Marcus Ordonez must never be in the same foursome as Caleb Hart.',
    players: ['Marcus Ordonez', 'Caleb Hart'],
  },
  {
    id: 'duane-foursome-limits',
    text: 'Duane Harris cannot be in the same foursome as Tommy Knight Jr, Tommy Knight Sr, Reny Butler, or Matt Shannon.',
    players: ['Duane Harris', 'Tommy Knight', 'Tommy Knight Sr', 'Reny Butler', 'Matt Shannon'],
  },
  {
    id: 'neff-with-jeremy-once',
    text: 'Chris Neff must be in the same foursome as Jeremy Bridges once.',
    players: ['Chris Neff', 'Jeremy Bridges'],
  },
  {
    id: 'neff-not-manuel',
    text: 'Chris Neff cannot be in the same foursome as Manuel Ordonez.',
    players: ['Chris Neff', 'Manuel Ordonez'],
  },
];

const MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS = [
  {
    id: 'knights',
    label: 'Tommy Knight Jr and Tommy Knight Sr',
    players: ['Tommy Knight', 'Tommy Knight Sr'],
  },
  {
    id: 'caleb-neff-jeremy-duane',
    label: 'Caleb Hart / Chris Neff / Jeremy Bridges / Duane Harris',
    players: ['Caleb Hart', 'Chris Neff', 'Jeremy Bridges', 'Duane Harris'],
  },
  {
    id: 'tommy-matt-dennis-john',
    label: 'Tommy Knight Jr / Matt Shannon / Dennis Freeman / John Hyers',
    players: ['Tommy Knight', 'Matt Shannon', 'Dennis Freeman', 'John Hyers'],
  },
  {
    id: 'marcus-manuel-tommy',
    label: 'Marcus Ordonez / Manuel Ordonez / Tommy Knight Jr',
    players: ['Marcus Ordonez', 'Manuel Ordonez', 'Tommy Knight'],
  },
  {
    id: 'marcus-delmar-chad',
    label: 'Marcus Ordonez / Delmar Christian / Chad Jones',
    players: ['Marcus Ordonez', 'Delmar Christian', 'Chad Jones'],
  },
  {
    id: 'lance-chris-reny-thomas',
    label: 'Lance Darr / Chris Manuel / Reny Butler / Thomas Lasik',
    players: ['Lance Darr', 'Chris Manuel', 'Reny Butler', 'Thomas Lasik'],
  },
  {
    id: 'dennis-reny',
    label: 'Dennis Freeman / Reny Butler',
    players: ['Dennis Freeman', 'Reny Butler'],
  },
  {
    id: 'tommy-reny',
    label: 'Tommy Knight Jr / Reny Butler',
    players: ['Tommy Knight', 'Reny Butler'],
  },
  {
    id: 'dennis-duane',
    label: 'Dennis Freeman / Duane Harris',
    players: ['Dennis Freeman', 'Duane Harris'],
  },
];

const MYRTLE_RYDER_CUP_ROUND_SEEDS = [
  {
    title: 'Round 1',
    format: 'Four-Ball Match Play',
    formatKey: 'fourBallMatch',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams, both players play their own ball, and the better ball on each hole wins the hole for match play.',
    entrySummary: 'Select Team A, Team B, or Halved for each match.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Dennis Freeman'],
        teamBPlayers: ['Reny Butler', 'Lance Darr'],
        notes: 'Requested grouping: Dennis Freeman / Reny Butler.',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['John Quimby', 'Chris Manuel'],
        teamBPlayers: ['Josh Browne', 'John Hyers'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Tommy Knight', 'Delmar Christian'],
        teamBPlayers: ['Caleb Hart', 'Chris Neff'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Thomas Lasik', 'Duane Harris'],
        teamBPlayers: ['Marcus Ordonez', 'Chad Jones'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Jeremy Bridges', 'Tommy Knight Sr'],
        teamBPlayers: ['Matt Shannon', 'Manuel Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 2',
    format: 'Best Ball Stroke Play',
    formatKey: 'bestBallStroke',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams, everyone plays their own ball, and the lower best-ball team total wins the point.',
    entrySummary: 'Enter optional player totals for reference and the team best-ball total for each side, or select the winner directly.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Dennis Freeman'],
        teamBPlayers: ['Josh Browne', 'Chris Neff'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['John Quimby', 'Jeremy Bridges'],
        teamBPlayers: ['John Hyers', 'Caleb Hart'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Tommy Knight', 'Delmar Christian'],
        teamBPlayers: ['Reny Butler', 'Matt Shannon'],
        notes: 'Requested grouping: Tommy Knight Jr / Reny Butler.',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Thomas Lasik', 'Duane Harris'],
        teamBPlayers: ['Marcus Ordonez', 'Chad Jones'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Chris Manuel', 'Tommy Knight Sr'],
        teamBPlayers: ['Lance Darr', 'Manuel Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 3',
    format: 'Two-Man Combined Score',
    formatKey: 'combinedScore',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams, everyone plays their own ball, and both player totals count toward the side score.',
    entrySummary: 'Enter both player totals to auto-build the team score, or enter the combined team totals directly.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Thomas Lasik'],
        teamBPlayers: ['Josh Browne', 'Reny Butler'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['John Quimby', 'Jeremy Bridges'],
        teamBPlayers: ['John Hyers', 'Caleb Hart'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Tommy Knight', 'Delmar Christian'],
        teamBPlayers: ['Lance Darr', 'Marcus Ordonez'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Chris Manuel', 'Tommy Knight Sr'],
        teamBPlayers: ['Chris Neff', 'Matt Shannon'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Dennis Freeman', 'Duane Harris'],
        teamBPlayers: ['Chad Jones', 'Manuel Ordonez'],
        notes: 'Requested grouping: Dennis Freeman / Duane Harris.',
      },
    ],
  },
  {
    title: 'Round 4',
    format: '1-2-3 Team Game',
    formatKey: 'oneTwoThree',
    resultMode: 'teamRound',
    pointValue: 5,
    description: 'All 20 players keep their own ball. Team scoring rotates 1 best ball, then 2 best balls, then 3 best balls by hole.',
    entrySummary: 'Use the five foursome pods for the day plan and enter the final Team A and Team B round totals for the 5-point team game.',
    matches: [
      {
        label: 'Pod 1',
        groupNumber: 1,
        teamAPlayers: ['Jeremy Bridges', 'Duane Harris'],
        teamBPlayers: ['Caleb Hart', 'Chris Neff'],
        notes: 'Requested grouping: Caleb Hart / Chris Neff / Jeremy Bridges / Duane Harris.',
      },
      {
        label: 'Pod 2',
        groupNumber: 2,
        teamAPlayers: ['Tommy Knight', 'Dennis Freeman'],
        teamBPlayers: ['Matt Shannon', 'John Hyers'],
        notes: 'Requested grouping: Tommy Knight Jr / Matt Shannon / Dennis Freeman / John Hyers.',
      },
      {
        label: 'Pod 3',
        groupNumber: 3,
        teamAPlayers: ['John Quimby', 'Delmar Christian'],
        teamBPlayers: ['Marcus Ordonez', 'Chad Jones'],
        notes: 'Requested grouping: Marcus Ordonez / Delmar Christian / Chad Jones.',
      },
      {
        label: 'Pod 4',
        groupNumber: 4,
        teamAPlayers: ['Thomas Lasik', 'Chris Manuel'],
        teamBPlayers: ['Reny Butler', 'Lance Darr'],
        notes: 'Requested grouping: Lance Darr / Chris Manuel / Reny Butler / Thomas Lasik.',
      },
      {
        label: 'Pod 5',
        groupNumber: 5,
        teamAPlayers: ['Joe Gillette', 'Tommy Knight Sr'],
        teamBPlayers: ['Josh Browne', 'Manuel Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 5',
    format: 'Singles Match Play',
    formatKey: 'singlesMatch',
    resultMode: 'match',
    pointValue: 1,
    description: 'One player vs one player, with every golfer playing their own ball all the way through the match.',
    entrySummary: 'Select Team A, Team B, or Halved for each singles match.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Tommy Knight'],
        teamBPlayers: ['Marcus Ordonez'],
        notes: 'Requested grouping: Marcus Ordonez / Manuel Ordonez / Tommy Knight Jr. Final-round group keeps Tommy Knight and Tommy Knight Sr together.',
      },
      {
        groupNumber: 1,
        teamAPlayers: ['Tommy Knight Sr'],
        teamBPlayers: ['Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Joe Gillette'],
        teamBPlayers: ['Josh Browne'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['John Quimby'],
        teamBPlayers: ['Reny Butler'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Thomas Lasik'],
        teamBPlayers: ['John Hyers'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Chris Manuel'],
        teamBPlayers: ['Lance Darr'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Dennis Freeman'],
        teamBPlayers: ['Chris Neff'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Delmar Christian'],
        teamBPlayers: ['Matt Shannon'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Jeremy Bridges'],
        teamBPlayers: ['Caleb Hart'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Duane Harris'],
        teamBPlayers: ['Chad Jones'],
        notes: '',
      },
    ],
  },
];

function buildRoundLabel(roundNumber, round = {}) {
  const course = String(round.course || '').trim();
  if (!course) return `Round ${roundNumber}`;
  return `Round ${roundNumber} - ${course}`;
}

function buildRoundPlan(seed = {}) {
  const groupNumbers = Array.from(new Set((seed.matches || []).map((match, matchIndex) => Number(match.groupNumber) || (matchIndex + 1))))
    .sort((left, right) => left - right);
  const playStyle = getDefaultRoundPlayStyle(seed.format);
  return {
    dayNote: '',
    groups: groupNumbers.map((groupNumber) => ({
      groupNumber,
      playStyle,
      notes: '',
    })),
  };
}

function buildDefaultMyrtleRyderCup(rounds = []) {
  return {
    title: 'Myrtle Ryder Cup',
    description: 'Team competition with every player playing their own ball in every round.',
    scheduleVersion: MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
    players: copyPlayers(MYRTLE_RYDER_CUP_PLAYERS),
    teams: [
      {
        id: 'teamA',
        name: 'Team A',
        players: MYRTLE_RYDER_CUP_TEAMS.teamA.slice(),
      },
      {
        id: 'teamB',
        name: 'Team B',
        players: MYRTLE_RYDER_CUP_TEAMS.teamB.slice(),
      },
    ],
    rounds: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed, index) => {
      const tripRound = Array.isArray(rounds) ? rounds[index] || {} : {};
      return {
        roundNumber: index + 1,
        title: seed.title,
        format: seed.format,
        formatKey: seed.formatKey,
        resultMode: seed.resultMode,
        description: seed.description,
        entrySummary: seed.entrySummary,
        pointValue: seed.pointValue,
        course: String(tripRound.course || '').trim(),
        date: tripRound.date ? new Date(tripRound.date).toISOString() : null,
        label: buildRoundLabel(index + 1, tripRound),
        plan: buildRoundPlan(seed),
        roundScore: {
          teamAScore: null,
          teamBScore: null,
          result: '',
          notes: '',
        },
        matches: seed.matches.map((match, matchIndex) => ({
          matchNumber: matchIndex + 1,
          label: match.label || (seed.formatKey === 'singlesMatch' ? `Singles ${matchIndex + 1}` : `Match ${matchIndex + 1}`),
          groupNumber: Number(match.groupNumber) || matchIndex + 1,
          teamAPlayers: match.teamAPlayers.slice(),
          teamBPlayers: match.teamBPlayers.slice(),
          teamAPlayerScores: Array.from({ length: match.teamAPlayers.length }, () => null),
          teamBPlayerScores: Array.from({ length: match.teamBPlayers.length }, () => null),
          teamAScore: null,
          teamBScore: null,
          result: '',
          notes: match.notes || '',
        })),
      };
    }),
    sideGames: {
      dailyLowGross: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed, index) => ({
        roundNumber: index + 1,
        label: buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {}),
        winnerName: '',
        amount: null,
        notes: '',
      })),
      weeklyLowGross: {
        winnerName: '',
        amount: null,
        notes: '',
      },
      closestToPin: {
        entries: [],
      },
      birdiePool: {
        counts: MYRTLE_RYDER_CUP_PLAYERS.map((player) => ({
          playerName: player.name,
          count: 0,
        })),
        winners: [],
        amount: null,
        notes: '',
      },
      mvp: {
        overrideWinners: [],
        amount: null,
        notes: '',
      },
    },
    payout: {
      totalPot: 1000,
      allocationPercentages: {
        winningTeam: 50,
        weeklyLowGross: 20,
        birdiePool: 10,
        closestToPin: 10,
        mvp: 10,
      },
    },
    adminNotes: {
      hardConstraints: MYRTLE_RYDER_CUP_HARD_CONSTRAINTS.map((entry) => ({ ...entry })),
      requestedGroupings: MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS.map((entry) => ({ ...entry })),
      roundRules: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed) => ({
        title: seed.title,
        format: seed.format,
        description: seed.description,
      })),
      notes: [
        'Seed teams are balanced at 105 rank points per side.',
        'Every Ryder Cup round is now an own-ball format. No alternate shot, scramble, shamble, or partner pickup formats are used.',
        'The seeded tee sheets now mirror the Ryder Cup foursomes so the day-of trip tee times match the competition board.',
        'The seeded own-ball pods keep the pair matches as even as possible while still covering the key requested foursomes and hard constraints.',
        'Final-round singles stay grouped into five four-man tee groups so Tommy Knight and Tommy Knight Sr finish in the same group.',
      ],
    },
  };
}

module.exports = {
  MYRTLE_RYDER_CUP_HARD_CONSTRAINTS,
  MYRTLE_RYDER_CUP_PLAYERS,
  MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS,
  MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
  buildDefaultMyrtleRyderCup,
};
