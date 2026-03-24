const { getDefaultScorecard } = require('./tripCompetitionService');
const {
  MYRTLE_RYDER_CUP_PLAYERS,
  buildMyrtleRyderCupTeeSheetGroups,
  buildDefaultMyrtleRyderCup,
} = require('./myrtleRyderCupDefaults');

const DEFAULT_TEMPLATE_NAME = 'Fairway Forge Trip Template';
const DEFAULT_TEMPLATE_GROUP = 'Future Golf Trip Group';
const DEFAULT_TEMPLATE_LOCATION = 'Destination TBD';
const DEFAULT_TEMPLATE_PACKAGE = '4 Nights / 5 Rounds';
const DEFAULT_TEMPLATE_ROUND_COUNT = 5;
const DEFAULT_TEMPLATE_BUCKET_LABELS = ['Bucket A', 'Bucket B', 'Bucket C', 'Bucket D'];
const RYDER_CUP_TEMPLATE_NAME = 'Ryder Cup Template';
const RYDER_CUP_TEMPLATE_GROUP = 'Ryder Cup Group';
const RYDER_CUP_TEMPLATE_LOCATION = 'Destination TBD';
const RYDER_CUP_TEMPLATE_PACKAGE = '5 Rounds Ryder Cup';
const RYDER_CUP_DEFAULT_TEAM_A = 'Team A';
const RYDER_CUP_DEFAULT_TEAM_B = 'Team B';
const RYDER_CUP_DEFAULT_FIRST_TEE_TIME = '08:00';
const RYDER_CUP_DEFAULT_TEE_TIME_COUNT = 5;
const RYDER_CUP_DEFAULT_TEE_INTERVAL_MINUTES = 9;
const DEFAULT_RYDER_RANK_BY_NAME = new Map(MYRTLE_RYDER_CUP_PLAYERS.map((player) => [String(player.name || '').trim(), Number(player.rank)]));

function toDateOnly(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeWholeNumber(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : fallback;
}

function normalizeMaybeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 10) / 10;
}

function parseTimeString(value, fallback = RYDER_CUP_DEFAULT_FIRST_TEE_TIME) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(cleanString(value));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseOptionalStringList(value) {
  if (Array.isArray(value)) return value.map((entry) => cleanString(entry)).filter(Boolean);
  return cleanString(value)
    .split(/\r?\n/)
    .map((entry) => cleanString(entry))
    .filter(Boolean);
}

function normalizeSeededPlayers(input = {}) {
  const requestedNames = parseOptionalStringList(input.playerNames);
  const requestedHandicaps = Array.isArray(input.handicapIndexes) ? input.handicapIndexes : [];
  return MYRTLE_RYDER_CUP_PLAYERS.map((defaultPlayer, index) => {
    const rank = index + 1;
    const customName = cleanString(requestedNames[index]);
    const name = customName || defaultPlayer.name;
    const parsedHandicap = normalizeMaybeNumber(requestedHandicaps[index]);
    const handicapIndex = parsedHandicap !== null
      ? parsedHandicap
      : (customName && customName !== defaultPlayer.name ? null : normalizeMaybeNumber(defaultPlayer.handicapIndex));
    return {
      name,
      rank,
      handicapIndex,
    };
  });
}

function remapRyderCupName(name = '', playersByRank = new Map()) {
  const rank = DEFAULT_RYDER_RANK_BY_NAME.get(cleanString(name));
  if (!Number.isInteger(rank)) return cleanString(name);
  const replacement = playersByRank.get(rank);
  return replacement && replacement.name ? replacement.name : cleanString(name);
}

function buildSeededTeeTimes(input = {}, playersByRank = new Map()) {
  const teeTimeCount = normalizeWholeNumber(input.teeTimeCount, RYDER_CUP_DEFAULT_TEE_TIME_COUNT);
  const teeIntervalMinutes = normalizeWholeNumber(input.teeIntervalMinutes, RYDER_CUP_DEFAULT_TEE_INTERVAL_MINUTES);
  const firstTeeTime = parseTimeString(input.firstTeeTime, RYDER_CUP_DEFAULT_FIRST_TEE_TIME);
  const firstMatch = /^(\d{2}):(\d{2})$/.exec(firstTeeTime);
  const firstMinutes = (Number(firstMatch[1]) * 60) + Number(firstMatch[2]);
  const seededGroups = buildMyrtleRyderCupTeeSheetGroups();
  return seededGroups.map((roundGroups = []) => Array.from({ length: teeTimeCount }, (_, slotIndex) => {
    const minutes = firstMinutes + (slotIndex * teeIntervalMinutes);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const seededPlayers = Array.isArray(roundGroups[slotIndex]) ? roundGroups[slotIndex] : [];
    return {
      label: `TT#${slotIndex + 1}`,
      time: `${hh}:${mm}`,
      players: seededPlayers.map((playerName) => remapRyderCupName(playerName, playersByRank)),
    };
  }));
}

function formatTemplateRoundLabel(index) {
  return `Round ${index + 1}`;
}

function buildTemplateRound(roundIndex, baseDate) {
  const firstTeeMinutes = 8 * 60;
  const teeInterval = 9;
  const teeTimes = Array.from({ length: 4 }, (_, slotIndex) => {
    const minutes = firstTeeMinutes + (slotIndex * teeInterval);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return {
      label: `TT#${slotIndex + 1}`,
      time: `${hh}:${mm}`,
      players: [],
    };
  });

  return {
    course: `${formatTemplateRoundLabel(roundIndex)} Course`,
    address: '',
    date: addDays(baseDate, roundIndex),
    time: teeTimes[0].time,
    confirmation: '',
    teeTimes,
    unassignedPlayers: [],
    scorecard: getDefaultScorecard(''),
    playerScores: [],
    teamMatches: [],
    ctpWinners: [],
    skinsResults: [],
  };
}

function buildDefaultTripTemplate(input = {}) {
  const requestedStartDate = toDateOnly(input.startDate);
  const roundStartDate = requestedStartDate || addDays(toDateOnly(), 60);
  const arrivalDate = addDays(roundStartDate, -1);
  const departureDate = addDays(roundStartDate, 4);
  const roundCount = Number.isInteger(input.roundCount) && input.roundCount > 0 ? input.roundCount : DEFAULT_TEMPLATE_ROUND_COUNT;

  return {
    name: String(input.name || DEFAULT_TEMPLATE_NAME),
    groupName: String(input.groupName || DEFAULT_TEMPLATE_GROUP),
    location: String(input.location || DEFAULT_TEMPLATE_LOCATION),
    arrivalDate,
    departureDate,
    packageType: String(input.packageType || DEFAULT_TEMPLATE_PACKAGE),
    reservationNumber: String(input.reservationNumber || 'TEMPLATE-RESERVATION'),
    preparedBy: String(input.preparedBy || 'Trip Coordinator'),
    contactPhone: String(input.contactPhone || '(000) 000-0000'),
    baseGroupSize: Number.isInteger(input.baseGroupSize) && input.baseGroupSize > 0 ? input.baseGroupSize : 16,
    extraNightPricePerCondo: Number.isFinite(Number(input.extraNightPricePerCondo))
      ? Number(input.extraNightPricePerCondo)
      : 130,
    competition: {
      scoringMode: 'best4',
      handicapBuckets: DEFAULT_TEMPLATE_BUCKET_LABELS.map((label) => ({ label, players: [] })),
    },
    tinCupLive: {
      version: 1,
      settings: {
        enableLiveFoursomeScoring: false,
        enableFoursomeCodes: true,
        enableLiveMarkers: true,
        enableLiveLeaderboard: false,
      },
      codes: {},
      scorecards: {},
      scrambleBonus: {},
    },
    rounds: Array.from({ length: roundCount }, (_, roundIndex) => buildTemplateRound(roundIndex, roundStartDate)),
    notes: String(input.notes || 'Reusable template trip. Duplicate and customize dates, courses, participants, settings, and add a dedicated live leaderboard page link from the main trip page.'),
  };
}

function buildRyderCupTripTemplate(input = {}) {
  const seededPlayers = normalizeSeededPlayers(input);
  const playersByRank = new Map(seededPlayers.map((player) => [player.rank, { ...player }]));
  const requestedStartDate = toDateOnly(input.startDate);
  const startDate = requestedStartDate || addDays(toDateOnly(), 60);
  const arrivalDate = toDateOnly(input.arrivalDate) || startDate;
  const departureDate = toDateOnly(input.departureDate) || addDays(startDate, 4);
  const courseNames = parseOptionalStringList(input.courseNames);
  const roundTeeTimes = buildSeededTeeTimes(input, playersByRank);
  const rounds = Array.from({ length: 5 }, (_, roundIndex) => {
    const teeTimes = roundTeeTimes[roundIndex] || [];
    return {
      course: courseNames[roundIndex] || `${formatTemplateRoundLabel(roundIndex)} Course`,
      address: '',
      date: addDays(startDate, roundIndex),
      time: teeTimes[0] && teeTimes[0].time ? teeTimes[0].time : parseTimeString(input.firstTeeTime, RYDER_CUP_DEFAULT_FIRST_TEE_TIME),
      confirmation: '',
      teeTimes,
      unassignedPlayers: [],
      scorecard: getDefaultScorecard(''),
      playerScores: [],
      teamMatches: [],
      ctpWinners: [],
      skinsResults: [],
    };
  });

  const competitionRyderCup = buildDefaultMyrtleRyderCup(rounds);
  competitionRyderCup.title = cleanString(input.competitionTitle) || 'Ryder Cup';
  competitionRyderCup.players = seededPlayers.map((player) => ({ ...player }));
  competitionRyderCup.teams = (competitionRyderCup.teams || []).map((team, teamIndex) => ({
    ...team,
    name: teamIndex === 0
      ? (cleanString(input.teamAName) || team.name || RYDER_CUP_DEFAULT_TEAM_A)
      : (cleanString(input.teamBName) || team.name || RYDER_CUP_DEFAULT_TEAM_B),
    players: Array.isArray(team.players)
      ? team.players.map((playerName) => remapRyderCupName(playerName, playersByRank))
      : [],
  }));
  competitionRyderCup.rounds = (competitionRyderCup.rounds || []).map((round) => ({
    ...round,
    matches: Array.isArray(round.matches)
      ? round.matches.map((match) => ({
        ...match,
        teamAPlayers: Array.isArray(match.teamAPlayers)
          ? match.teamAPlayers.map((playerName) => remapRyderCupName(playerName, playersByRank))
          : [],
        teamBPlayers: Array.isArray(match.teamBPlayers)
          ? match.teamBPlayers.map((playerName) => remapRyderCupName(playerName, playersByRank))
          : [],
      }))
      : [],
  }));
  if (competitionRyderCup.sideGames && competitionRyderCup.sideGames.birdiePool) {
    competitionRyderCup.sideGames.birdiePool.counts = seededPlayers.map((player) => ({
      playerName: player.name,
      count: 0,
    }));
  }

  const teamA = competitionRyderCup.teams[0] || { players: [], name: RYDER_CUP_DEFAULT_TEAM_A };
  const teamB = competitionRyderCup.teams[1] || { players: [], name: RYDER_CUP_DEFAULT_TEAM_B };
  const buildOverlayPlayers = (playerNames = []) => playerNames.map((name) => {
    const defaultRank = DEFAULT_RYDER_RANK_BY_NAME.get(cleanString(name));
    const seededPlayer = Number.isInteger(defaultRank) ? playersByRank.get(defaultRank) : seededPlayers.find((player) => player.name === name);
    return {
      name,
      seedRank: seededPlayer ? seededPlayer.rank : null,
      handicapIndex: seededPlayer ? seededPlayer.handicapIndex : null,
    };
  });

  return {
    trip: {
      name: cleanString(input.name) || RYDER_CUP_TEMPLATE_NAME,
      groupName: cleanString(input.groupName) || RYDER_CUP_TEMPLATE_GROUP,
      location: cleanString(input.location) || RYDER_CUP_TEMPLATE_LOCATION,
      arrivalDate,
      departureDate,
      packageType: cleanString(input.packageType) || RYDER_CUP_TEMPLATE_PACKAGE,
      reservationNumber: cleanString(input.reservationNumber) || '',
      preparedBy: cleanString(input.preparedBy) || 'Trip Coordinator',
      contactPhone: cleanString(input.contactPhone) || '',
      baseGroupSize: seededPlayers.length,
      extraNightPricePerCondo: 130,
      competition: {
        scoringMode: 'best4',
        handicapBuckets: DEFAULT_TEMPLATE_BUCKET_LABELS.map((label) => ({ label, players: [] })),
        ryderCup: competitionRyderCup,
      },
      tinCupLive: {
        version: 1,
        settings: {
          enableLiveFoursomeScoring: false,
          enableFoursomeCodes: true,
          enableLiveMarkers: true,
          enableLiveLeaderboard: false,
        },
        codes: {},
        scorecards: {},
        scrambleBonus: {},
      },
      rounds,
      notes: cleanString(input.notes) || 'Ryder Cup trip created from the Myrtle Ryder Cup template. Update courses, addresses, and participant details as needed.',
    },
    participants: seededPlayers.map((player) => ({
      name: player.name,
      status: 'in',
      handicapIndex: player.handicapIndex,
    })),
    ryderCup: {
      enabled: true,
      teamAName: teamA.name || RYDER_CUP_DEFAULT_TEAM_A,
      teamBName: teamB.name || RYDER_CUP_DEFAULT_TEAM_B,
      teamAPlayers: buildOverlayPlayers(teamA.players),
      teamBPlayers: buildOverlayPlayers(teamB.players),
      notes: '',
    },
  };
}

module.exports = {
  DEFAULT_TEMPLATE_NAME,
  RYDER_CUP_TEMPLATE_NAME,
  buildDefaultTripTemplate,
  buildRyderCupTripTemplate,
};
