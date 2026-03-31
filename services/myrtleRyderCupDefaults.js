function copyPlayers(players = []) {
  return players.map((player) => ({ ...player }));
}

const MYRTLE_RYDER_CUP_SCHEDULE_VERSION = '2026-03-16-fixed-teams-gross-v4';
const MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT = 'Two-Man Net Total Match';
const MYRTLE_RYDER_CUP_FOUR_BALL_FORMAT = 'Four-Ball Net Total Match';
const MYRTLE_RYDER_CUP_THREE_BALL_FORMAT = 'Three-Ball Net Total Match';
const MYRTLE_RYDER_CUP_BEST_BALL_FORMAT = 'Best-Ball Match';
const MYRTLE_RYDER_CUP_STABLEFORD_FORMAT = 'Stableford Points Match';
const MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT = 'Singles Net Total Match';
const MYRTLE_RYDER_CUP_DESCRIPTION = 'Team competition with every player playing his own ball and keeping his own score in every round, with full handicaps applied automatically.';
const MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION = 'Fixed Ryder Cup teams stay intact, every golfer posts one gross total for the day, full handicaps are applied automatically, and the lower combined net side wins the point.';
const MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY = 'Enter one gross 18-hole total for every golfer. Gross totals, handicap strokes, net match scores, and winners are calculated automatically.';
const MYRTLE_RYDER_CUP_FOUR_BALL_DESCRIPTION = 'Teams of two play their own balls, comparing net scores hole-by-hole. Best net score per hole wins the hole for the team. Four players compete with maximum partner variety.';
const MYRTLE_RYDER_CUP_FOUR_BALL_ENTRY_SUMMARY = 'Enter one gross 18-hole total for every golfer. Gross totals, handicap strokes, and per-hole net winners are calculated automatically.';
const MYRTLE_RYDER_CUP_THREE_BALL_DESCRIPTION = 'Three players compete individually, each posting a gross total. Full handicaps are applied automatically, and the player with the lowest net score wins.';
const MYRTLE_RYDER_CUP_THREE_BALL_ENTRY_SUMMARY = 'Enter one gross 18-hole total for each player. Gross scores, handicap strokes, and the net winner are calculated automatically.';
const MYRTLE_RYDER_CUP_BEST_BALL_DESCRIPTION = 'Teams of two play their own balls. Best net score from the team per hole counts toward the team total. Lower team aggregate net wins the match.';
const MYRTLE_RYDER_CUP_BEST_BALL_ENTRY_SUMMARY = 'Enter one gross 18-hole total for every golfer. Handicaps are applied, and the best net per hole is summed for each team.';
const MYRTLE_RYDER_CUP_STABLEFORD_DESCRIPTION = 'Each player plays their own ball and scores Stableford points based on net score relative to par. Full handicaps applied. Higher point total wins.';
const MYRTLE_RYDER_CUP_STABLEFORD_ENTRY_SUMMARY = 'Enter one gross 18-hole total for every golfer. Stableford points are calculated automatically based on net vs. par (Birdie=3, Par=2, Bogey=1, Double+=0).';
const MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION = 'Singles are grouped to preserve the hard foursome rules, each golfer posts one gross total for the day, full handicaps are applied automatically, and the lower net score wins the point.';
const MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY = 'Enter one gross 18-hole total for each player. Gross scores, handicap strokes, net match scores, and winners are calculated automatically.';
const RYDER_CUP_MIN_PLAYER_COUNT = 12;
const RYDER_CUP_DEFAULT_PLAYER_COUNT = 20;

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeRyderCupHandicapIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 10) / 10;
}

function normalizeRyderCupRank(value, fallback = null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : fallback;
}

function isValidRyderCupPlayerList(players = []) {
  if (!Array.isArray(players) || players.length < RYDER_CUP_MIN_PLAYER_COUNT || players.length % 4 !== 0) return false;
  const seenNames = new Set();
  const seenRanks = new Set();
  for (let index = 0; index < players.length; index += 1) {
    const player = players[index] || {};
    const name = cleanString(player.name);
    const rank = normalizeRyderCupRank(player.rank, index + 1);
    if (!name || seenNames.has(name.toLowerCase()) || seenRanks.has(rank)) return false;
    seenNames.add(name.toLowerCase());
    seenRanks.add(rank);
  }
  return true;
}

function buildRyderCupPlayerRows(rawPlayers = []) {
  const source = Array.isArray(rawPlayers) && rawPlayers.length ? rawPlayers : MYRTLE_RYDER_CUP_PLAYERS;
  const normalized = source.map((player, index) => ({
    name: cleanString(player && player.name),
    rank: normalizeRyderCupRank(player && player.rank, index + 1),
    handicapIndex: normalizeRyderCupHandicapIndex(player && player.handicapIndex),
  }));
  return isValidRyderCupPlayerList(normalized) ? normalized : copyPlayers(MYRTLE_RYDER_CUP_PLAYERS);
}

function buildPlayersByRank(players = []) {
  return new Map((players || []).map((player) => [Number(player.rank), { ...player }]));
}

function rotateList(values = [], offset = 0) {
  if (!Array.isArray(values) || !values.length) return [];
  const normalizedOffset = ((offset % values.length) + values.length) % values.length;
  return values.slice(normalizedOffset).concat(values.slice(0, normalizedOffset));
}

function buildOpposedPairs(players = [], offset = 0) {
  const rotated = rotateList(players, offset);
  const pairs = [];
  for (let leftIndex = 0, rightIndex = rotated.length - 1; leftIndex < rightIndex; leftIndex += 1, rightIndex -= 1) {
    pairs.push([rotated[leftIndex], rotated[rightIndex]]);
  }
  return pairs;
}

function scaleRyderCupAmount(baseAmount = 0, playerCount = RYDER_CUP_DEFAULT_PLAYER_COUNT) {
  const amount = Number(baseAmount);
  if (!Number.isFinite(amount)) return 0;
  const scaled = amount * (Number(playerCount) / RYDER_CUP_DEFAULT_PLAYER_COUNT);
  return Math.max(0, Math.round(scaled / 5) * 5);
}

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
const CANONICAL_TEAM_A_RANKS = MYRTLE_RYDER_CUP_TEAMS.teamA.map((name) => {
  const player = MYRTLE_RYDER_CUP_PLAYERS.find((entry) => entry.name === name);
  return player ? player.rank : null;
}).filter(Number.isInteger);
const CANONICAL_TEAM_B_RANKS = MYRTLE_RYDER_CUP_TEAMS.teamB.map((name) => {
  const player = MYRTLE_RYDER_CUP_PLAYERS.find((entry) => entry.name === name);
  return player ? player.rank : null;
}).filter(Number.isInteger);
const CANONICAL_RANK_BY_NAME = new Map(MYRTLE_RYDER_CUP_PLAYERS.map((player) => [player.name, player.rank]));

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

const MYRTLE_RYDER_CUP_ROUND_SEEDS_VARIETY = [
  {
    title: 'Round 1',
    format: MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
    formatKey: 'grossTeamMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
    matches: [
      { groupNumber: 1, teamAPlayers: ['Joe Gillette', 'Jeremy Bridges'], teamBPlayers: ['Duane Harris', 'Manuel Ordonez'], notes: '' },
      { groupNumber: 2, teamAPlayers: ['Josh Browne', 'Chris Neff'], teamBPlayers: ['Chris Manuel', 'Delmar Christian'], notes: '' },
      { groupNumber: 3, teamAPlayers: ['Lance Darr', 'Tommy Knight'], teamBPlayers: ['John Hyers', 'Marcus Ordonez'], notes: '' },
      { groupNumber: 4, teamAPlayers: ['Dennis Freeman', 'Chad Jones'], teamBPlayers: ['Caleb Hart', 'John Quimby'], notes: '' },
      { groupNumber: 5, teamAPlayers: ['Matt Shannon', 'Tommy Knight Sr'], teamBPlayers: ['Reny Butler', 'Thomas Lasik'], notes: '' },
    ],
  },
  {
    title: 'Round 2',
    format: MYRTLE_RYDER_CUP_FOUR_BALL_FORMAT,
    formatKey: 'fourBallMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_FOUR_BALL_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_FOUR_BALL_ENTRY_SUMMARY,
    matches: [
      { groupNumber: 1, teamAPlayers: ['Joe Gillette', 'Tommy Knight Sr'], teamBPlayers: ['Chris Manuel', 'Marcus Ordonez'], notes: '' },
      { groupNumber: 2, teamAPlayers: ['Josh Browne', 'Jeremy Bridges'], teamBPlayers: ['John Quimby', 'Thomas Lasik'], notes: '' },
      { groupNumber: 3, teamAPlayers: ['Matt Shannon', 'Tommy Knight'], teamBPlayers: ['Caleb Hart', 'Manuel Ordonez'], notes: '' },
      { groupNumber: 4, teamAPlayers: ['Dennis Freeman', 'Lance Darr'], teamBPlayers: ['Delmar Christian', 'Duane Harris'], notes: '' },
      { groupNumber: 5, teamAPlayers: ['Chad Jones', 'Chris Neff'], teamBPlayers: ['John Hyers', 'Reny Butler'], notes: '' },
    ],
  },
  {
    title: 'Round 3',
    format: MYRTLE_RYDER_CUP_THREE_BALL_FORMAT,
    formatKey: 'threeBallMatch',
    resultMode: 'individual',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_THREE_BALL_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_THREE_BALL_ENTRY_SUMMARY,
    matches: [
      { groupNumber: 1, teamAPlayers: ['Joe Gillette', 'Josh Browne', 'Duane Harris'], teamBPlayers: [], notes: '' },
      { groupNumber: 2, teamAPlayers: ['Tommy Knight', 'Dennis Freeman', 'John Quimby'], teamBPlayers: [], notes: '' },
      { groupNumber: 3, teamAPlayers: ['Lance Darr', 'Matt Shannon', 'John Hyers'], teamBPlayers: [], notes: '' },
      { groupNumber: 4, teamAPlayers: ['Chris Neff', 'Jeremy Bridges', 'Caleb Hart'], teamBPlayers: [], notes: '' },
      { groupNumber: 5, teamAPlayers: ['Chris Manuel', 'Chad Jones', 'Tommy Knight Sr'], teamBPlayers: [], notes: 'Five three-ball matches cover all 20 players with individual competition.' },
      { groupNumber: 6, teamAPlayers: ['Thomas Lasik', 'Delmar Christian', 'Marcus Ordonez'], teamBPlayers: [], notes: '' },
      { groupNumber: 7, teamAPlayers: ['Reny Butler', 'Manuel Ordonez'], teamBPlayers: [], notes: 'Remaining two players form a two-man match.' },
    ],
  },
  {
    title: 'Round 4',
    format: MYRTLE_RYDER_CUP_BEST_BALL_FORMAT,
    formatKey: 'bestBallMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_BEST_BALL_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_BEST_BALL_ENTRY_SUMMARY,
    matches: [
      { groupNumber: 1, teamAPlayers: ['Joe Gillette', 'Josh Browne'], teamBPlayers: ['Duane Harris', 'John Quimby'], notes: '' },
      { groupNumber: 2, teamAPlayers: ['Jeremy Bridges', 'Tommy Knight'], teamBPlayers: ['Manuel Ordonez', 'Reny Butler'], notes: '' },
      { groupNumber: 3, teamAPlayers: ['Lance Darr', 'Tommy Knight Sr'], teamBPlayers: ['Caleb Hart', 'Delmar Christian'], notes: '' },
      { groupNumber: 4, teamAPlayers: ['Chris Neff', 'Dennis Freeman'], teamBPlayers: ['Marcus Ordonez', 'Thomas Lasik'], notes: '' },
      { groupNumber: 5, teamAPlayers: ['Chad Jones', 'Matt Shannon'], teamBPlayers: ['Chris Manuel', 'John Hyers'], notes: '' },
    ],
  },
  {
    title: 'Round 5',
    format: MYRTLE_RYDER_CUP_STABLEFORD_FORMAT,
    formatKey: 'stablefordMatch',
    resultMode: 'stableford',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_STABLEFORD_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_STABLEFORD_ENTRY_SUMMARY,
    matches: [
      { groupNumber: 1, teamAPlayers: ['Chris Neff', 'Joe Gillette', 'Josh Browne', 'John Hyers'], teamBPlayers: [], notes: '' },
      { groupNumber: 2, teamAPlayers: ['Tommy Knight', 'Dennis Freeman', 'Matt Shannon', 'Reny Butler'], teamBPlayers: [], notes: '' },
      { groupNumber: 3, teamAPlayers: ['Lance Darr', 'Tommy Knight Sr', 'Caleb Hart', 'Thomas Lasik'], teamBPlayers: [], notes: '' },
      { groupNumber: 4, teamAPlayers: ['Chris Manuel', 'Chad Jones', 'Delmar Christian', 'Marcus Ordonez'], teamBPlayers: [], notes: '' },
      { groupNumber: 5, teamAPlayers: ['Jeremy Bridges', 'Duane Harris', 'Manuel Ordonez', 'John Quimby'], teamBPlayers: [], notes: 'Final round Stableford: Birdie=3pts, Par=2pts, Bogey=1pt, Double+=0pts.' },
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

function usesCanonicalTwentyPlayerSchedule(players = []) {
  return Array.isArray(players) && players.length === MYRTLE_RYDER_CUP_PLAYERS.length;
}

function remapCanonicalName(name = '', playersByRank = new Map()) {
  const rank = CANONICAL_RANK_BY_NAME.get(cleanString(name));
  if (!Number.isInteger(rank)) return cleanString(name);
  const mapped = playersByRank.get(rank);
  return mapped && mapped.name ? mapped.name : cleanString(name);
}

function buildBalancedTeamRanks(playerCount = 0) {
  const teamA = [];
  const teamB = [];
  for (let rank = 1; rank <= playerCount; rank += 2) {
    const pairIndex = Math.floor((rank - 1) / 2);
    const firstRank = rank;
    const secondRank = rank + 1;
    if (pairIndex % 2 === 0) {
      teamA.push(firstRank);
      if (secondRank <= playerCount) teamB.push(secondRank);
    } else {
      teamB.push(firstRank);
      if (secondRank <= playerCount) teamA.push(secondRank);
    }
  }
  return { teamA, teamB };
}

function buildRyderCupTeamsForPlayers(players = [], options = {}) {
  const playersByRank = buildPlayersByRank(players);
  const count = Array.isArray(players) ? players.length : 0;
  const teamRanks = usesCanonicalTwentyPlayerSchedule(players)
    ? { teamA: CANONICAL_TEAM_A_RANKS, teamB: CANONICAL_TEAM_B_RANKS }
    : buildBalancedTeamRanks(count);
  return [
    {
      id: 'teamA',
      name: cleanString(options.teamAName) || 'Team A',
      players: teamRanks.teamA.map((rank) => playersByRank.get(rank)?.name).filter(Boolean),
    },
    {
      id: 'teamB',
      name: cleanString(options.teamBName) || 'Team B',
      players: teamRanks.teamB.map((rank) => playersByRank.get(rank)?.name).filter(Boolean),
    },
  ];
}

function remapCanonicalRoundSeeds(players = []) {
  const playersByRank = buildPlayersByRank(players);
  return MYRTLE_RYDER_CUP_ROUND_SEEDS.map((seed) => ({
    ...seed,
    matches: (seed.matches || []).map((match) => ({
      ...match,
      teamAPlayers: (match.teamAPlayers || []).map((name) => remapCanonicalName(name, playersByRank)),
      teamBPlayers: (match.teamBPlayers || []).map((name) => remapCanonicalName(name, playersByRank)),
    })),
  }));
}

function buildDynamicRoundSeeds(teams = []) {
  const teamA = (teams[0] && teams[0].players) || [];
  const teamB = (teams[1] && teams[1].players) || [];
  const teamRounds = Array.from({ length: 4 }, (_, roundIndex) => {
    const teamAPairs = buildOpposedPairs(teamA, roundIndex);
    const teamBBase = roundIndex % 2 === 0 ? teamB.slice().reverse() : teamB.slice();
    const teamBPairs = buildOpposedPairs(teamBBase, roundIndex + 1);
    return {
      title: `Round ${roundIndex + 1}`,
      format: MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
      formatKey: 'grossTeamMatch',
      resultMode: 'match',
      pointValue: 1,
      description: MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
      entrySummary: MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
      matches: teamAPairs.map((teamAPlayers, groupIndex) => ({
        groupNumber: groupIndex + 1,
        teamAPlayers: teamAPlayers.slice(),
        teamBPlayers: Array.isArray(teamBPairs[groupIndex]) ? teamBPairs[groupIndex].slice() : [],
        notes: '',
      })),
    };
  });
  const singlesOrderA = rotateList(teamA, 1);
  const singlesOrderB = rotateList(teamB.slice().reverse(), 2);
  const singlesMatches = singlesOrderA.map((playerName, index) => ({
    groupNumber: Math.floor(index / 2) + 1,
    teamAPlayers: [playerName],
    teamBPlayers: [singlesOrderB[index]],
    notes: '',
  }));
  return teamRounds.concat({
    title: 'Round 5',
    format: MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT,
    formatKey: 'grossSinglesMatch',
    resultMode: 'match',
    pointValue: 1,
    description: MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION,
    entrySummary: MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY,
    matches: singlesMatches,
  });
}

function buildRyderCupRoundSeeds(players = [], teams = []) {
  return usesCanonicalTwentyPlayerSchedule(players)
    ? remapCanonicalRoundSeeds(players)
    : buildDynamicRoundSeeds(teams);
}

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

function buildDefaultMyrtleRyderCup(rounds = [], options = {}) {
  const players = buildRyderCupPlayerRows(options.players);
  const teams = buildRyderCupTeamsForPlayers(players, options);
  const roundSeeds = buildRyderCupRoundSeeds(players, teams);
  const playerCount = players.length;
  const finalRoundNumber = roundSeeds.length;
  const finalRoundLabel = buildRoundLabel(finalRoundNumber, Array.isArray(rounds) ? rounds[finalRoundNumber - 1] || {} : {});
  const teamSeedSums = teams.map((team) => (team.players || []).reduce((sum, playerName) => {
    const player = players.find((entry) => entry.name === playerName);
    return sum + (player ? Number(player.rank) || 0 : 0);
  }, 0));
  return {
    title: cleanString(options.title) || 'Myrtle Ryder Cup',
    description: MYRTLE_RYDER_CUP_DESCRIPTION,
    scheduleVersion: MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
    players: copyPlayers(players),
    teams: teams.map((team) => ({
      ...team,
      players: (team.players || []).slice(),
    })),
    rounds: roundSeeds.map((seed, index) => {
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
      dailyNet: roundSeeds.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Net`,
        winnerNames: [],
        amount: scaleRyderCupAmount(25, playerCount),
        notes: 'Auto winner uses the best net round from the saved gross totals and full handicap strokes.',
      })),
      dailyGross: roundSeeds.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Gross`,
        winnerNames: [],
        amount: scaleRyderCupAmount(25, playerCount),
        notes: 'Auto winner uses the lowest gross round from the saved gross totals.',
      })),
      dailyOver100Draw: roundSeeds.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Over-100 Team Draw`,
        winnerNames: [],
        teamAWinnerNames: [],
        teamBWinnerNames: [],
        amount: scaleRyderCupAmount(20, playerCount),
        notes: 'Use the saved gross scores to find every golfer over 100, then draw one random winner from each team.',
      })),
      dailyLongestPuttLastHole: roundSeeds.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Longest Made Putt on Last Hole`,
        winnerNames: [],
        distance: '',
        amount: scaleRyderCupAmount(15, playerCount),
        notes: 'Manual daily side prize for the longest made putt on the last hole.',
      })),
      dailyBirdiePot: roundSeeds.map((seed, index) => ({
        roundNumber: index + 1,
        label: `${buildRoundLabel(index + 1, Array.isArray(rounds) ? rounds[index] || {} : {})} Birdie Pot`,
        counts: [],
        winnerNames: [],
        amount: scaleRyderCupAmount(50, playerCount),
        notes: 'Daily birdie pool split across every gross birdie or better recorded that round.',
      })),
      lastChanceRedemptionPot: {
        roundNumber: finalRoundNumber,
        label: `${finalRoundLabel} Last-Chance Redemption Pot`,
        winnerNames: [],
        amount: 0,
        notes: 'Merged into redemption birdie pot.',
      },
      redemptionBirdiePot: {
        roundNumber: finalRoundNumber,
        label: `${finalRoundLabel} Redemption Birdie Pot`,
        amount: scaleRyderCupAmount(50, playerCount),
        notes: 'Final-day birdie pool for golfers who have not won another saved prize before the last round starts.',
      },
      finalDayHighHole: {
        roundNumber: finalRoundNumber,
        label: `${finalRoundLabel} Single-Hole High Score`,
        winnerNames: [],
        hole: null,
        score: null,
        amount: 0,
        notes: 'Removed from payout structure.',
      },
      weeklyNet: {
        winnerNames: [],
        amount: scaleRyderCupAmount(250, playerCount),
        notes: 'Auto winner uses the best trip-long net total from the saved Ryder Cup scores.',
      },
      weeklyOver100Draw: {
        winnerNames: [],
        teamAWinnerNames: [],
        teamBWinnerNames: [],
        amount: scaleRyderCupAmount(120, playerCount),
        notes: 'Pick one random golfer from each team who posted at least one gross score over 100 during the trip.',
      },
      closestToPin: {
        entries: [],
      },
      birdiePool: {
        counts: players.map((player) => ({
          playerName: player.name,
          count: 0,
        })),
        winners: [],
        amount: scaleRyderCupAmount(200, playerCount),
        notes: 'Trip-long birdie pool split across every gross birdie or better recorded during the trip. Includes the final payout cleanup amount.',
      },
      leftoverPot: {
        amount: 0,
        notes: 'No separate leftover pot. Cleanup money is folded into the trip birdie pool.',
      },
      mvp: {
        overrideWinners: [],
        amount: scaleRyderCupAmount(125, playerCount),
        notes: 'Match points stay balanced by the seeded rank-based pairings.',
      },
    },
    payout: {
      totalPot: scaleRyderCupAmount(2000, playerCount),
      allocationPercentages: {
        winningTeam: 25,
        weeklyNet: 12.5,
        birdiePool: 6.25,
        closestToPin: 4,
        mvp: 6.25,
      },
    },
    adminNotes: {
      hardConstraints: [],
      requestedGroupings: [],
      roundRules: roundSeeds.map((seed) => ({
        title: seed.title,
        format: seed.format,
        description: seed.description,
      })),
      notes: [
        `Seeded teams stay balanced at ${teamSeedSums[0] || 0} seed points per side.`,
        'The saved Ryder Cup board uses the fixed Team A / Team B split shown in the roster overlay.',
        'Every Ryder Cup round is an own-ball format. No alternate shot, scramble, shamble, or partner pickup formats are used.',
        'Every Ryder Cup match uses one gross score per golfer, then applies full handicap strokes automatically before awarding the point.',
        'The seeded tee sheets match the Ryder Cup pods exactly, so the day-of tee times match the saved competition board.',
        'The Ryder Cup uses full handicaps, and the trip payout uses daily net, over-100 draws, birdie pots, longest made putt on the last hole, weekly net, and MVP-friendly side games.',
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
  MYRTLE_RYDER_CUP_PLAYERS,
  MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
  MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
  MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_FOUR_BALL_FORMAT,
  MYRTLE_RYDER_CUP_FOUR_BALL_DESCRIPTION,
  MYRTLE_RYDER_CUP_FOUR_BALL_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_THREE_BALL_FORMAT,
  MYRTLE_RYDER_CUP_THREE_BALL_DESCRIPTION,
  MYRTLE_RYDER_CUP_THREE_BALL_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_BEST_BALL_FORMAT,
  MYRTLE_RYDER_CUP_BEST_BALL_DESCRIPTION,
  MYRTLE_RYDER_CUP_BEST_BALL_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_STABLEFORD_FORMAT,
  MYRTLE_RYDER_CUP_STABLEFORD_DESCRIPTION,
  MYRTLE_RYDER_CUP_STABLEFORD_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_DESCRIPTION,
  MYRTLE_RYDER_CUP_ROUND_SEEDS_VARIETY,
  RYDER_CUP_MIN_PLAYER_COUNT,
  buildRyderCupPlayerRows,
  buildRyderCupTeamsForPlayers,
  buildRyderCupRoundSeeds,
  buildMyrtleRyderCupTeeSheetGroups,
  buildDefaultMyrtleRyderCup,
};
