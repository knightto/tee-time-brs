function copyPlayers(players = []) {
  return players.map((player) => ({ ...player }));
}

const MYRTLE_RYDER_CUP_SCHEDULE_VERSION = '2026-03-16-rank-seeded-gross-v2';

function getDefaultRoundPlayStyle(format = '') {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized.includes('singles')) return 'Singles Gross Total Match';
  if (normalized.includes('gross total') || normalized.includes('net total')) return 'Two-Man Gross Total Match';
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
    id: 'no-repeat-two-man-teammates',
    text: 'No two players should be on the same 2-man Ryder Cup team more than once.',
    players: [],
  },
  {
    id: 'josh-not-matt-team',
    text: 'Josh Browne and Matt Shannon should not be on the same 2-man team.',
    players: ['Josh Browne', 'Matt Shannon'],
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
    format: 'Two-Man Gross Total Match',
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams are seeded by ranking, every golfer posts one gross total for the day, and the lower combined gross side wins the point.',
    entrySummary: 'Enter one gross 18-hole total for every golfer. Gross team totals and match winners are calculated automatically.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Chris Manuel', 'Tommy Knight Sr'],
        teamBPlayers: ['Caleb Hart', 'Matt Shannon'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Delmar Christian', 'Jeremy Bridges'],
        teamBPlayers: ['Marcus Ordonez', 'Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Dennis Freeman', 'Thomas Lasik'],
        teamBPlayers: ['Chris Neff', 'John Hyers'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Duane Harris', 'John Quimby'],
        teamBPlayers: ['Chad Jones', 'Lance Darr'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Joe Gillette', 'Tommy Knight'],
        teamBPlayers: ['Josh Browne', 'Reny Butler'],
        notes: 'Requested grouping: Tommy Knight Jr / Reny Butler.',
      },
    ],
  },
  {
    title: 'Round 2',
    format: 'Two-Man Gross Total Match',
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams are seeded by ranking, every golfer posts one gross total for the day, and the lower combined gross side wins the point.',
    entrySummary: 'Enter one gross 18-hole total for every golfer. Gross team totals and match winners are calculated automatically.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Chris Manuel', 'Duane Harris'],
        teamBPlayers: ['Lance Darr', 'Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Delmar Christian', 'Thomas Lasik'],
        teamBPlayers: ['Chad Jones', 'John Hyers'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Dennis Freeman', 'John Quimby'],
        teamBPlayers: ['Marcus Ordonez', 'Reny Butler'],
        notes: 'Requested grouping: Dennis Freeman / Reny Butler.',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Jeremy Bridges', 'Joe Gillette'],
        teamBPlayers: ['Caleb Hart', 'Josh Browne'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Tommy Knight', 'Tommy Knight Sr'],
        teamBPlayers: ['Chris Neff', 'Matt Shannon'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 3',
    format: 'Two-Man Gross Total Match',
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams are seeded by ranking, every golfer posts one gross total for the day, and the lower combined gross side wins the point.',
    entrySummary: 'Enter one gross 18-hole total for every golfer. Gross team totals and match winners are calculated automatically.',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Chris Manuel', 'Joe Gillette'],
        teamBPlayers: ['Josh Browne', 'Lance Darr'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Delmar Christian', 'Tommy Knight'],
        teamBPlayers: ['Matt Shannon', 'Reny Butler'],
        notes: 'Requested grouping: Tommy Knight Jr / Reny Butler.',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Dennis Freeman', 'Duane Harris'],
        teamBPlayers: ['Chad Jones', 'Manuel Ordonez'],
        notes: 'Requested grouping: Dennis Freeman / Duane Harris.',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Jeremy Bridges', 'John Quimby'],
        teamBPlayers: ['Caleb Hart', 'John Hyers'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Thomas Lasik', 'Tommy Knight Sr'],
        teamBPlayers: ['Chris Neff', 'Marcus Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 4',
    format: 'Two-Man Gross Total Match',
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: '2-man teams are seeded by ranking, every golfer posts one gross total for the day, and the lower combined gross side wins the point.',
    entrySummary: 'Enter one gross 18-hole total for every golfer. Gross team totals and match winners are calculated automatically.',
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
    format: 'Singles Gross Total Match',
    formatKey: 'grossSinglesMatch',
    resultMode: 'match',
    pointValue: 1,
    description: 'Singles are seeded as closely by ranking as possible, each golfer posts one gross total for the day, and the lower gross score wins the point.',
    entrySummary: 'Enter one gross 18-hole total for each player. Gross scores and winners are calculated automatically.',
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
        teamBPlayers: ['Caleb Hart'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Jeremy Bridges'],
        teamBPlayers: ['Matt Shannon'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Delmar Christian'],
        teamBPlayers: ['Chris Neff'],
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

const MYRTLE_LEGACY_TEE_SHEET_GROUPS = [
  [
    ['Joe Gillette', 'Duane Harris', 'Josh Browne', 'Manuel Ordonez'],
    ['John Quimby', 'Tommy Knight Sr', 'Lance Darr', 'Marcus Ordonez'],
    ['Tommy Knight', 'Jeremy Bridges', 'Reny Butler', 'Chad Jones'],
    ['Thomas Lasik', 'Delmar Christian', 'John Hyers', 'Matt Shannon'],
    ['Chris Manuel', 'Dennis Freeman', 'Caleb Hart', 'Chris Neff'],
  ],
  [
    ['Joe Gillette', 'Tommy Knight Sr', 'Chris Neff', 'Lance Darr'],
    ['John Quimby', 'Delmar Christian', 'Josh Browne', 'Matt Shannon'],
    ['Tommy Knight', 'Dennis Freeman', 'Reny Butler', 'Marcus Ordonez'],
    ['Thomas Lasik', 'Jeremy Bridges', 'John Hyers', 'Chad Jones'],
    ['Chris Manuel', 'Duane Harris', 'Caleb Hart', 'Manuel Ordonez'],
  ],
  [
    ['Joe Gillette', 'Delmar Christian', 'Reny Butler', 'Matt Shannon'],
    ['John Quimby', 'Jeremy Bridges', 'Caleb Hart', 'John Hyers'],
    ['Tommy Knight', 'Tommy Knight Sr', 'Lance Darr', 'Chad Jones'],
    ['Thomas Lasik', 'Chris Manuel', 'Josh Browne', 'Chris Neff'],
    ['Dennis Freeman', 'Duane Harris', 'Marcus Ordonez', 'Manuel Ordonez'],
  ],
  [
    ['Jeremy Bridges', 'Duane Harris', 'Caleb Hart', 'Chris Neff'],
    ['Tommy Knight', 'Dennis Freeman', 'Matt Shannon', 'John Hyers'],
    ['John Quimby', 'Delmar Christian', 'Marcus Ordonez', 'Chad Jones'],
    ['Thomas Lasik', 'Chris Manuel', 'Reny Butler', 'Lance Darr'],
    ['Joe Gillette', 'Tommy Knight Sr', 'Josh Browne', 'Manuel Ordonez'],
  ],
  [
    ['Tommy Knight', 'Marcus Ordonez', 'Tommy Knight Sr', 'Manuel Ordonez'],
    ['Joe Gillette', 'Josh Browne', 'John Quimby', 'Reny Butler'],
    ['Thomas Lasik', 'John Hyers', 'Chris Manuel', 'Lance Darr'],
    ['Dennis Freeman', 'Caleb Hart', 'Jeremy Bridges', 'Matt Shannon'],
    ['Delmar Christian', 'Chris Neff', 'Duane Harris', 'Chad Jones'],
  ],
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
          label: match.label || (String(seed.formatKey || '').toLowerCase().includes('singles') ? `Singles ${matchIndex + 1}` : `Match ${matchIndex + 1}`),
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
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Low Gross`,
        winnerName: '',
        amount: null,
        notes: 'Use the best gross round from the day.',
      })),
      weeklyLowGross: {
        winnerName: '',
        amount: null,
        notes: 'Use the best gross trip total or the gross scoring method you want to pay out.',
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
        notes: 'Track gross birdies or better.',
      },
      mvp: {
        overrideWinners: [],
        amount: null,
        notes: 'Match points stay balanced by the seeded rank-based pairings.',
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
        'This 10-vs-10 split is the only 105-vs-105 team setup that also satisfies the requested Myrtle foursome relationships cleanly.',
        'Every Ryder Cup round is now an own-ball format. No alternate shot, scramble, shamble, or partner pickup formats are used.',
        'Every Ryder Cup match now uses the same daily gross-total scoring model so the trip admin only enters one gross score per golfer each day.',
        'The seeded tee sheets mirror Ryder Cup-style pods so the day-of tee times match the competition board.',
        'The seeded own-ball pods keep the pair matches as even as possible by rank while still covering the key requested foursomes and hard constraints.',
        'No 2-man teammate pair is repeated across the four team-match rounds, and Josh Browne / Matt Shannon are kept off the same side entirely.',
        'Singles stay close to a Ryder Cup ladder: top-vs-top where possible, with the final requested Tommy / Tommy Sr / Marcus / Manuel pod preserved.',
        'With no handicap layer in the Ryder Cup, side games can stay gross all week as well.',
        'Final-round singles stay grouped into five four-man tee groups so Tommy Knight and Tommy Knight Sr finish in the same group.',
      ],
    },
  };
}

function buildMyrtleRyderCupTeeSheetGroups(roundSeeds = MYRTLE_RYDER_CUP_ROUND_SEEDS) {
  return (roundSeeds || []).map((seed = {}) => {
    const groupNumbers = Array.from(new Set((seed.matches || []).map((match, matchIndex) => Number(match.groupNumber) || (matchIndex + 1))))
      .sort((left, right) => left - right);
    return groupNumbers.map((groupNumber) => {
      const players = [];
      (seed.matches || []).forEach((match, matchIndex) => {
        const matchGroupNumber = Number(match && match.groupNumber) || (matchIndex + 1);
        if (matchGroupNumber !== groupNumber) return;
        (match.teamAPlayers || []).forEach((name) => {
          if (!players.includes(name)) players.push(name);
        });
        (match.teamBPlayers || []).forEach((name) => {
          if (!players.includes(name)) players.push(name);
        });
      });
      return players;
    });
  });
}

module.exports = {
  MYRTLE_LEGACY_TEE_SHEET_GROUPS,
  MYRTLE_RYDER_CUP_HARD_CONSTRAINTS,
  MYRTLE_RYDER_CUP_PLAYERS,
  MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS,
  MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
  buildMyrtleRyderCupTeeSheetGroups,
  buildDefaultMyrtleRyderCup,
};
