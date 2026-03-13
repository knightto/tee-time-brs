function copyPlayers(players = []) {
  return players.map((player) => ({ ...player }));
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
    format: 'Four-Ball',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Thomas Lasik', 'Chris Manuel'],
        teamBPlayers: ['Reny Butler', 'Lance Darr'],
        notes: 'Requested grouping: Lance Darr / Chris Manuel / Reny Butler / Thomas Lasik',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Jeremy Bridges', 'Duane Harris'],
        teamBPlayers: ['Caleb Hart', 'Chris Neff'],
        notes: 'Requested grouping: Caleb Hart / Chris Neff / Jeremy Bridges / Duane Harris',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Tommy Knight', 'Dennis Freeman'],
        teamBPlayers: ['Matt Shannon', 'John Hyers'],
        notes: 'Requested grouping: Tommy Knight Jr / Matt Shannon / Dennis Freeman / John Hyers',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Joe Gillette', 'Tommy Knight Sr'],
        teamBPlayers: ['Josh Browne', 'Chad Jones'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['John Quimby', 'Delmar Christian'],
        teamBPlayers: ['Marcus Ordonez', 'Manuel Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 2',
    format: 'Alternate Shot / Foursomes',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Tommy Knight', 'Thomas Lasik'],
        teamBPlayers: ['Marcus Ordonez', 'Manuel Ordonez'],
        notes: 'Requested grouping: Marcus Ordonez / Manuel Ordonez / Tommy Knight Jr',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Joe Gillette', 'John Quimby'],
        teamBPlayers: ['Josh Browne', 'Reny Butler'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Jeremy Bridges', 'Duane Harris'],
        teamBPlayers: ['Caleb Hart', 'Chris Neff'],
        notes: 'Chris Neff and Jeremy Bridges share a foursome here.',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Chris Manuel', 'Delmar Christian'],
        teamBPlayers: ['Lance Darr', 'Chad Jones'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Dennis Freeman', 'Tommy Knight Sr'],
        teamBPlayers: ['John Hyers', 'Matt Shannon'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 3',
    format: 'Four-Ball',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Delmar Christian', 'Joe Gillette'],
        teamBPlayers: ['Marcus Ordonez', 'Chad Jones'],
        notes: 'Requested grouping: Marcus Ordonez / Delmar Christian / Chad Jones',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Tommy Knight', 'Dennis Freeman'],
        teamBPlayers: ['Reny Butler', 'Josh Browne'],
        notes: 'Requested grouping: Dennis Freeman / Reny Butler and Tommy Knight Jr / Reny Butler',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Thomas Lasik', 'Chris Manuel'],
        teamBPlayers: ['Lance Darr', 'John Hyers'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['John Quimby', 'Tommy Knight Sr'],
        teamBPlayers: ['Matt Shannon', 'Chris Neff'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Jeremy Bridges', 'Duane Harris'],
        teamBPlayers: ['Caleb Hart', 'Manuel Ordonez'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 4',
    format: 'Alternate Shot / Foursomes',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Dennis Freeman', 'Duane Harris'],
        teamBPlayers: ['Caleb Hart', 'Chris Neff'],
        notes: 'Requested grouping: Dennis Freeman / Duane Harris',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Tommy Knight', 'Joe Gillette'],
        teamBPlayers: ['Marcus Ordonez', 'Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Thomas Lasik', 'Chris Manuel'],
        teamBPlayers: ['Reny Butler', 'Lance Darr'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['John Quimby', 'Jeremy Bridges'],
        teamBPlayers: ['Josh Browne', 'John Hyers'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Delmar Christian', 'Tommy Knight Sr'],
        teamBPlayers: ['Chad Jones', 'Matt Shannon'],
        notes: '',
      },
    ],
  },
  {
    title: 'Round 5',
    format: 'Singles',
    matches: [
      {
        groupNumber: 1,
        teamAPlayers: ['Tommy Knight'],
        teamBPlayers: ['Marcus Ordonez'],
        notes: 'Final-round group keeps Tommy Knight and Tommy Knight Sr together.',
      },
      {
        groupNumber: 1,
        teamAPlayers: ['Tommy Knight Sr'],
        teamBPlayers: ['Manuel Ordonez'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Jeremy Bridges'],
        teamBPlayers: ['Chris Neff'],
        notes: '',
      },
      {
        groupNumber: 2,
        teamAPlayers: ['Duane Harris'],
        teamBPlayers: ['Caleb Hart'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Thomas Lasik'],
        teamBPlayers: ['Reny Butler'],
        notes: '',
      },
      {
        groupNumber: 3,
        teamAPlayers: ['Dennis Freeman'],
        teamBPlayers: ['John Hyers'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Chris Manuel'],
        teamBPlayers: ['Lance Darr'],
        notes: '',
      },
      {
        groupNumber: 4,
        teamAPlayers: ['Delmar Christian'],
        teamBPlayers: ['Chad Jones'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['Joe Gillette'],
        teamBPlayers: ['Josh Browne'],
        notes: '',
      },
      {
        groupNumber: 5,
        teamAPlayers: ['John Quimby'],
        teamBPlayers: ['Matt Shannon'],
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

function buildDefaultMyrtleRyderCup(rounds = []) {
  return {
    title: 'Myrtle Ryder Cup',
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
        pointValue: 1,
        course: String(tripRound.course || '').trim(),
        date: tripRound.date ? new Date(tripRound.date).toISOString() : null,
        label: buildRoundLabel(index + 1, tripRound),
        matches: seed.matches.map((match, matchIndex) => ({
          matchNumber: matchIndex + 1,
          label: seed.format === 'Singles' ? `Singles ${matchIndex + 1}` : `Match ${matchIndex + 1}`,
          groupNumber: Number(match.groupNumber) || matchIndex + 1,
          teamAPlayers: match.teamAPlayers.slice(),
          teamBPlayers: match.teamBPlayers.slice(),
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
      notes: [
        'Seed teams are balanced at 105 rank points per side.',
        'Four-ball and alternate-shot rounds are seeded to cover the requested foursomes while preserving the hard constraints.',
        'Final-round singles are grouped into five four-man tee groups so Tommy Knight and Tommy Knight Sr finish in the same group.',
      ],
    },
  };
}

module.exports = {
  MYRTLE_RYDER_CUP_HARD_CONSTRAINTS,
  MYRTLE_RYDER_CUP_PLAYERS,
  MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS,
  buildDefaultMyrtleRyderCup,
};
