function copyPlayers(players = []) {
  return players.map((player) => ({ ...player }));
}

const MYRTLE_RYDER_CUP_SCHEDULE_VERSION = '2026-03-16-fixed-teams-gross-v4';
const MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT = 'Two-Man Net Total Match (75%)';
const MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT = 'Singles Net Total Match (75%)';
const MYRTLE_RYDER_CUP_DESCRIPTION = 'Team competition with every player playing his own ball and keeping his own score in every round, with fixed 75% handicaps applied automatically.';
const MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION = 'Fixed Ryder Cup teams stay intact, every golfer posts one gross total for the day, 75% handicaps are applied automatically, and the lower combined net side wins the point.';
const MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY = 'Enter one gross 18-hole total for every golfer. Gross totals, 75% handicap allowances, net match scores, and winners are calculated automatically.';
const MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION = 'Singles are grouped to preserve the hard foursome rules, each golfer posts one gross total for the day, 75% handicaps are applied automatically, and the lower net score wins the point.';
const MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY = 'Enter one gross 18-hole total for each player. Gross scores, 75% handicap allowances, net match scores, and winners are calculated automatically.';

function getDefaultRoundPlayStyle(format = '') {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized.includes('singles')) return MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT;
  if (normalized.includes('gross total') || normalized.includes('net total')) return MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT;
  return 'Own Ball Pod';
}

const MYRTLE_RYDER_CUP_PLAYERS = [
  { name: 'Joe Gillette', rank: 1, handicapIndex: 2 },
  { name: 'John Quimby', rank: 2, handicapIndex: 5 },
  { name: 'Josh Browne', rank: 3, handicapIndex: 6 },
  { name: 'Tommy Knight', rank: 4, handicapIndex: 9 },
  { name: 'Reny Butler', rank: 5, handicapIndex: 10 },
  { name: 'Thomas Lasik', rank: 6, handicapIndex: 10 },
  { name: 'John Hyers', rank: 7, handicapIndex: 11 },
  { name: 'Chris Manuel', rank: 8, handicapIndex: 12 },
  { name: 'Lance Darr', rank: 9, handicapIndex: 13 },
  { name: 'Caleb Hart', rank: 10, handicapIndex: 16 },
  { name: 'Chris Neff', rank: 11, handicapIndex: 16 },
  { name: 'Marcus Ordonez', rank: 12, handicapIndex: 15 },
  { name: 'Dennis Freeman', rank: 13, handicapIndex: 16 },
  { name: 'Chad Jones', rank: 14, handicapIndex: 16 },
  { name: 'Jeremy Bridges', rank: 15, handicapIndex: 18 },
  { name: 'Matt Shannon', rank: 16, handicapIndex: 18 },
  { name: 'Delmar Christian', rank: 17, handicapIndex: 20 },
  { name: 'Manuel Ordonez', rank: 18, handicapIndex: 20 },
  { name: 'Tommy Knight Sr', rank: 19, handicapIndex: 22 },
  { name: 'Duane Harris', rank: 20, handicapIndex: 22 },
];

const MYRTLE_RYDER_CUP_TEAMS = {
  teamA: [
    'Joe Gillette',
    'Josh Browne',
    'Tommy Knight',
    'Lance Darr',
    'Chris Neff',
    'Dennis Freeman',
    'Chad Jones',
    'Jeremy Bridges',
    'Matt Shannon',
    'Tommy Knight Sr',
  ],
  teamB: [
    'John Quimby',
    'Reny Butler',
    'Thomas Lasik',
    'John Hyers',
    'Chris Manuel',
    'Caleb Hart',
    'Marcus Ordonez',
    'Delmar Christian',
    'Manuel Ordonez',
    'Duane Harris',
  ],
};

const MYRTLE_RYDER_CUP_HARD_CONSTRAINTS = [
  {
    id: 'final-round-knights',
    type: 'must-group-final',
    text: 'Tommy Knight Sr must play with Tommy Knight Jr in the final round.',
    players: ['Tommy Knight', 'Tommy Knight Sr'],
  },
  {
    id: 'neff-with-caleb-once',
    type: 'must-group-once',
    text: 'Chris Neff must be in the same foursome as Caleb Hart at least once.',
    players: ['Chris Neff', 'Caleb Hart'],
  },
  {
    id: 'neff-with-jeremy-once',
    type: 'must-group-once',
    text: 'Chris Neff must be in the same foursome as Jeremy Bridges at least once.',
    players: ['Chris Neff', 'Jeremy Bridges'],
  },
  {
    id: 'marcus-not-caleb',
    type: 'never-group',
    text: 'Marcus Ordonez must never be in the same foursome as Caleb Hart.',
    players: ['Marcus Ordonez', 'Caleb Hart'],
  },
  {
    id: 'duane-not-tommy',
    type: 'never-group',
    text: 'Duane Harris must never be in the same foursome as Tommy Knight Jr.',
    players: ['Duane Harris', 'Tommy Knight'],
  },
  {
    id: 'duane-not-tommy-sr',
    type: 'never-group',
    text: 'Duane Harris must never be in the same foursome as Tommy Knight Sr.',
    players: ['Duane Harris', 'Tommy Knight Sr'],
  },
  {
    id: 'duane-not-reny',
    type: 'never-group',
    text: 'Duane Harris must never be in the same foursome as Reny Butler.',
    players: ['Duane Harris', 'Reny Butler'],
  },
  {
    id: 'duane-not-matt',
    type: 'never-group',
    text: 'Duane Harris must never be in the same foursome as Matt Shannon.',
    players: ['Duane Harris', 'Matt Shannon'],
  },
  {
    id: 'neff-not-manuel',
    type: 'never-group',
    text: 'Chris Neff must never be in the same foursome as Manuel Ordonez.',
    players: ['Chris Neff', 'Manuel Ordonez'],
  },
  {
    id: 'josh-not-tommy',
    type: 'never-group',
    text: 'Josh Browne must never be in the same foursome as Tommy Knight Jr.',
    players: ['Josh Browne', 'Tommy Knight'],
  },
  {
    id: 'josh-not-manuel',
    type: 'never-group',
    text: 'Josh Browne must never be in the same foursome as Manuel Ordonez.',
    players: ['Josh Browne', 'Manuel Ordonez'],
  },
  {
    id: 'josh-not-hyers',
    type: 'never-group',
    text: 'Josh Browne must never be in the same foursome as John Hyers.',
    players: ['Josh Browne', 'John Hyers'],
  },
  {
    id: 'no-repeat-two-man-teammates',
    type: 'no-repeat-teammates',
    text: 'No two players should be on the same 2-man Ryder Cup team more than once across the four team rounds.',
    players: [],
  },
  {
    id: 'josh-not-matt-team',
    type: 'never-team-pair',
    text: 'Josh Browne and Matt Shannon should never be the same 2-man Ryder Cup side.',
    players: ['Josh Browne', 'Matt Shannon'],
  },
];

const MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS = [
  {
    id: 'lance-chris-manuel',
    label: 'Lance Darr / Chris Manuel',
    players: ['Lance Darr', 'Chris Manuel'],
  },
  {
    id: 'lance-reny',
    label: 'Lance Darr / Reny Butler',
    players: ['Lance Darr', 'Reny Butler'],
  },
  {
    id: 'knights',
    label: 'Tommy Knight Jr / Tommy Knight Sr',
    players: ['Tommy Knight', 'Tommy Knight Sr'],
  },
  {
    id: 'tommy-dennis',
    label: 'Tommy Knight Jr / Dennis Freeman',
    players: ['Tommy Knight', 'Dennis Freeman'],
  },
  {
    id: 'tommy-hyers',
    label: 'Tommy Knight Jr / John Hyers',
    players: ['Tommy Knight', 'John Hyers'],
  },
  {
    id: 'tommy-matt',
    label: 'Tommy Knight Jr / Matt Shannon',
    players: ['Tommy Knight', 'Matt Shannon'],
  },
  {
    id: 'tommy-neff',
    label: 'Tommy Knight Jr / Chris Neff',
    players: ['Tommy Knight', 'Chris Neff'],
  },
  {
    id: 'neff-jeremy',
    label: 'Chris Neff / Jeremy Bridges',
    players: ['Chris Neff', 'Jeremy Bridges'],
  },
  {
    id: 'neff-caleb',
    label: 'Chris Neff / Caleb Hart',
    players: ['Chris Neff', 'Caleb Hart'],
  },
  {
    id: 'neff-marcus',
    label: 'Chris Neff / Marcus Ordonez',
    players: ['Chris Neff', 'Marcus Ordonez'],
  },
  {
    id: 'neff-delmar',
    label: 'Chris Neff / Delmar Christian',
    players: ['Chris Neff', 'Delmar Christian'],
  },
  {
    id: 'delmar-chad',
    label: 'Delmar Christian / Chad Jones',
    players: ['Delmar Christian', 'Chad Jones'],
  },
  {
    id: 'delmar-marcus',
    label: 'Delmar Christian / Marcus Ordonez',
    players: ['Delmar Christian', 'Marcus Ordonez'],
  },
  {
    id: 'marcus-manuel',
    label: 'Marcus Ordonez / Manuel Ordonez',
    players: ['Marcus Ordonez', 'Manuel Ordonez'],
  },
  {
    id: 'tommy-manuel',
    label: 'Tommy Knight Jr / Manuel Ordonez',
    players: ['Tommy Knight', 'Manuel Ordonez'],
  },
  {
    id: 'tommy-marcus',
    label: 'Tommy Knight Jr / Marcus Ordonez',
    players: ['Tommy Knight', 'Marcus Ordonez'],
  },
  {
    id: 'thomas-reny',
    label: 'Thomas Lasik / Reny Butler',
    players: ['Thomas Lasik', 'Reny Butler'],
  },
  {
    id: 'dennis-reny',
    label: 'Dennis Freeman / Reny Butler',
    players: ['Dennis Freeman', 'Reny Butler'],
  },
  {
    id: 'jeremy-marcus',
    label: 'Jeremy Bridges / Marcus Ordonez',
    players: ['Jeremy Bridges', 'Marcus Ordonez'],
  },
  {
    id: 'duane-dennis',
    label: 'Duane Harris / Dennis Freeman',
    players: ['Duane Harris', 'Dennis Freeman'],
  },
  {
    id: 'duane-hyers',
    label: 'Duane Harris / John Hyers',
    players: ['Duane Harris', 'John Hyers'],
  },
  {
    id: 'tommy-sr-marcus',
    label: 'Tommy Knight Sr / Marcus Ordonez',
    players: ['Tommy Knight Sr', 'Marcus Ordonez'],
  },
  {
    id: 'matt-hyers',
    label: 'Matt Shannon / John Hyers',
    players: ['Matt Shannon', 'John Hyers'],
  },
  {
    id: 'matt-dennis',
    label: 'Matt Shannon / Dennis Freeman',
    players: ['Matt Shannon', 'Dennis Freeman'],
  },
];

const MYRTLE_RYDER_CUP_ROUND_SEEDS = [
  {
    title: 'Round 1',
    format: MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Jeremy Bridges'],
        teamBPlayers: ['Duane Harris', 'Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Josh Browne', 'Chris Neff'],
        teamBPlayers: ['Chris Manuel', 'Delmar Christian'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Lance Darr', 'Tommy Knight'],
        teamBPlayers: ['John Hyers', 'Marcus Ordonez'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Dennis Freeman', 'Chad Jones'],
        teamBPlayers: ['Caleb Hart', 'John Quimby'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Matt Shannon', 'Tommy Knight Sr'],
        teamBPlayers: ['Reny Butler', 'Thomas Lasik'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 2',
    format: MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Tommy Knight Sr'],
        teamBPlayers: ['Chris Manuel', 'Marcus Ordonez'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Josh Browne', 'Jeremy Bridges'],
        teamBPlayers: ['John Quimby', 'Thomas Lasik'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Matt Shannon', 'Tommy Knight'],
        teamBPlayers: ['Caleb Hart', 'Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Dennis Freeman', 'Lance Darr'],
        teamBPlayers: ['Delmar Christian', 'Duane Harris'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Chad Jones', 'Chris Neff'],
        teamBPlayers: ['John Hyers', 'Reny Butler'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 3',
    format: MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Tommy Knight'],
        teamBPlayers: ['Delmar Christian', 'Thomas Lasik'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Josh Browne', 'Chad Jones'],
        teamBPlayers: ['Duane Harris', 'Marcus Ordonez'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Lance Darr', 'Matt Shannon'],
        teamBPlayers: ['John Quimby', 'Reny Butler'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Chris Neff', 'Jeremy Bridges'],
        teamBPlayers: ['Caleb Hart', 'Chris Manuel'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Dennis Freeman', 'Tommy Knight Sr'],
        teamBPlayers: ['John Hyers', 'Manuel Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 4',
    format: MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
    matches: [
      {
        label: 'Pod 1',
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette', 'Josh Browne'],
        teamBPlayers: ['Duane Harris', 'John Quimby'],
        notes: '',
      },
      {
        label: 'Pod 2',
        groupNumber: 2,
        teamAPlayers: ['Jeremy Bridges', 'Tommy Knight'],
        teamBPlayers: ['Manuel Ordonez', 'Reny Butler'],
        notes: '',
      },
      {
        label: 'Pod 3',
        groupNumber: 3,
        teamAPlayers: ['Lance Darr', 'Tommy Knight Sr'],
        teamBPlayers: ['Caleb Hart', 'Delmar Christian'],
        notes: '',
      },
      {
        label: 'Pod 4',
        groupNumber: 4,
        teamAPlayers: ['Chris Neff', 'Dennis Freeman'],
        teamBPlayers: ['Marcus Ordonez', 'Thomas Lasik'],
        notes: '',
      },
      {
        label: 'Pod 5',
        groupNumber: 5,
        teamAPlayers: ['Chad Jones', 'Matt Shannon'],
        teamBPlayers: ['Chris Manuel', 'John Hyers'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 5',
    format: MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT,
    formatKey: 'grossSinglesMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY,
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Chris Neff'],
        teamBPlayers: ['John Hyers'],
        notes: '',
      },
      {
        groupNumber: 1,
        teamAPlayers: ['Joe Gillette'],
        teamBPlayers: ['Duane Harris'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Josh Browne'],
        teamBPlayers: ['Reny Butler'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Dennis Freeman'],
        teamBPlayers: ['Caleb Hart'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Tommy Knight'],
        teamBPlayers: ['John Quimby'],
        notes: 'Final-round group keeps Tommy Knight and Tommy Knight Sr together.',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Tommy Knight Sr'],
        teamBPlayers: ['Chris Manuel'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Chad Jones'],
        teamBPlayers: ['Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Lance Darr'],
        teamBPlayers: ['Thomas Lasik'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Jeremy Bridges'],
        teamBPlayers: ['Marcus Ordonez'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Matt Shannon'],
        teamBPlayers: ['Delmar Christian'],
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
    description: MYRTLE_RYDER_CUP_DESCRIPTION,
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
      dailyNet: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Net`,
        winnerNames: [],
        amount: null,
        notes: 'Auto winner uses the best net round from the saved gross totals and 75% allowance.',
      })),
      dailyLongestPuttLastHole: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Longest Made Putt on Last Hole`,
        winnerNames: [],
        distance: '',
        amount: null,
        notes: 'Manual daily side prize for the longest made putt on the last hole.',
      })),
      dailyBirdiePot: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Birdie Pot`,
        counts: [],
        winnerNames: [],
        amount: null,
        notes: 'Manual daily side prize for gross birdies or better.',
      })),
      dailyNetBirdiePot: MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Net Birdie Pot`,
        counts: [],
        winnerNames: [],
        amount: null,
        notes: 'Manual daily side prize for net birdies.',
      })),
      weeklyNet: {
        winnerNames: [],
        amount: null,
        notes: 'Auto winner uses the best trip-long net total from the saved Ryder Cup scores.',
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
        weeklyNet: 20,
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
        'Fixed teams stay balanced at 105 seed points per side.',
        'The saved Ryder Cup board now uses the same fixed Team A / Team B split shown in the roster overlay.',
        'Every Ryder Cup round is now an own-ball format. No alternate shot, scramble, shamble, or partner pickup formats are used.',
        'Every Ryder Cup match now uses one gross score per golfer, then applies the fixed 75% handicap allowance automatically before awarding the point.',
        'The seeded tee sheets mirror the Ryder Cup pods exactly, so the day-of tee times match the saved competition board.',
        'The pairings were rebuilt around the current hard do-not-play list first, then tuned to improve preferred pair coverage and overall variety.',
        'No 2-man teammate pair is repeated across the four team-match rounds, and Josh Browne / Matt Shannon are kept off the same 2-man side entirely.',
        'Final-round singles keep Tommy Knight Jr and Tommy Knight Sr in the same foursome while still following the fixed-team setup.',
        'The Ryder Cup now uses fixed 75% handicap allowances for fairness, and the trip payout now uses daily net, longest made putt on the last hole, weekly net, and MVP-friendly side games instead of gross-only prizes.',
        'The new seed increases foursome variety across the week and sharply cuts down repeat same-group pairings.',
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
  MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
  MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_DESCRIPTION,
  buildMyrtleRyderCupTeeSheetGroups,
  buildDefaultMyrtleRyderCup,
};
