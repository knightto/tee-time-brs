const { getDefaultScorecard } = require('./tripCompetitionService');
const {
  MYRTLE_RYDER_CUP_PLAYERS,
  RYDER_CUP_MIN_PLAYER_COUNT,
  buildMyrtleRyderCupTeeSheetGroups,
  buildDefaultMyrtleRyderCup,
} = require('./myrtleRyderCupDefaults');

const DEFAULT_TEMPLATE_BUCKET_LABELS = ['Bucket A', 'Bucket B', 'Bucket C', 'Bucket D'];
const RYDER_CUP_TEMPLATE_NAME = 'Ryder Cup 5 round template';
const RYDER_CUP_TEMPLATE_GROUP = 'Ryder Cup Group';
const RYDER_CUP_TEMPLATE_LOCATION = 'Destination TBD';
const RYDER_CUP_TEMPLATE_PACKAGE = '5 Rounds Ryder Cup';
const RYDER_CUP_DEFAULT_TEAM_A = 'Team A';
const RYDER_CUP_DEFAULT_TEAM_B = 'Team B';
const RYDER_CUP_DEFAULT_FIRST_TEE_TIME = '08:00';
const RYDER_CUP_DEFAULT_TEE_INTERVAL_MINUTES = 9;

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
  const playerCount = requestedNames.length || MYRTLE_RYDER_CUP_PLAYERS.length;
  if (playerCount < RYDER_CUP_MIN_PLAYER_COUNT || playerCount % 4 !== 0) {
    throw new Error('Seeded roster must include at least 12 players in groups of 4.');
  }
  return Array.from({ length: playerCount }, (_, index) => {
    const defaultPlayer = MYRTLE_RYDER_CUP_PLAYERS[index] || {};
    const rank = index + 1;
    const customName = cleanString(requestedNames[index]);
    const name = customName || cleanString(defaultPlayer.name) || `Player ${rank}`;
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

function assertValidSeededPlayers(players = []) {
  const seenNames = new Set();
  for (const player of (players || [])) {
    const nameKey = cleanString(player && player.name).toLowerCase();
    if (!nameKey) throw new Error('Seeded roster contains an empty player name.');
    if (seenNames.has(nameKey)) throw new Error('Seeded roster must use unique player names.');
    seenNames.add(nameKey);
  }
}

function buildSeededTeeTimes(input = {}, roundSeeds = []) {
  const teeIntervalMinutes = normalizeWholeNumber(input.teeIntervalMinutes, RYDER_CUP_DEFAULT_TEE_INTERVAL_MINUTES);
  const firstTeeTime = parseTimeString(input.firstTeeTime, RYDER_CUP_DEFAULT_FIRST_TEE_TIME);
  const firstMatch = /^(\d{2}):(\d{2})$/.exec(firstTeeTime);
  const firstMinutes = (Number(firstMatch[1]) * 60) + Number(firstMatch[2]);
  const seededGroups = buildMyrtleRyderCupTeeSheetGroups(roundSeeds);
  return seededGroups.map((roundGroups = []) => Array.from({ length: roundGroups.length }, (_, slotIndex) => {
    const minutes = firstMinutes + (slotIndex * teeIntervalMinutes);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const seededPlayers = Array.isArray(roundGroups[slotIndex]) ? roundGroups[slotIndex] : [];
    return {
      label: `TT#${slotIndex + 1}`,
      time: `${hh}:${mm}`,
      players: seededPlayers.slice(),
    };
  }));
}

function formatTemplateRoundLabel(index) {
  return `Round ${index + 1}`;
}

function buildRyderCupTripTemplate(input = {}) {
  const seededPlayers = normalizeSeededPlayers(input);
  assertValidSeededPlayers(seededPlayers);
  const requestedStartDate = toDateOnly(input.startDate);
  const startDate = requestedStartDate || addDays(toDateOnly(), 60);
  const arrivalDate = toDateOnly(input.arrivalDate) || startDate;
  const departureDate = toDateOnly(input.departureDate) || addDays(startDate, 4);
  const courseNames = parseOptionalStringList(input.courseNames);
  const rounds = Array.from({ length: 5 }, (_, roundIndex) => ({
    course: courseNames[roundIndex] || `${formatTemplateRoundLabel(roundIndex)} Course`,
    address: '',
    date: addDays(startDate, roundIndex),
    time: parseTimeString(input.firstTeeTime, RYDER_CUP_DEFAULT_FIRST_TEE_TIME),
    confirmation: '',
    teeTimes: [],
    unassignedPlayers: [],
    scorecard: getDefaultScorecard(''),
    playerScores: [],
    teamMatches: [],
    ctpWinners: [],
    skinsResults: [],
  }));

  const competitionRyderCup = buildDefaultMyrtleRyderCup(rounds, {
    players: seededPlayers,
    title: cleanString(input.competitionTitle) || 'Ryder Cup',
    teamAName: cleanString(input.teamAName) || RYDER_CUP_DEFAULT_TEAM_A,
    teamBName: cleanString(input.teamBName) || RYDER_CUP_DEFAULT_TEAM_B,
  });
  const competitionPlayers = Array.isArray(competitionRyderCup && competitionRyderCup.players) ? competitionRyderCup.players : [];
  const seededNames = seededPlayers.map((player) => player.name);
  const competitionNames = competitionPlayers.map((player) => player && player.name);
  if (competitionPlayers.length !== seededPlayers.length || competitionNames.some((name, index) => name !== seededNames[index])) {
    throw new Error('Seeded roster must use unique valid player names.');
  }
  const roundTeeTimes = buildSeededTeeTimes(input, competitionRyderCup.rounds || []);
  rounds.forEach((round, roundIndex) => {
    const teeTimes = roundTeeTimes[roundIndex] || [];
    round.time = teeTimes[0] && teeTimes[0].time ? teeTimes[0].time : round.time;
    round.teeTimes = teeTimes;
  });

  const teamA = competitionRyderCup.teams[0] || { players: [], name: RYDER_CUP_DEFAULT_TEAM_A };
  const teamB = competitionRyderCup.teams[1] || { players: [], name: RYDER_CUP_DEFAULT_TEAM_B };
  const buildOverlayPlayers = (playerNames = []) => playerNames.map((name) => {
    const seededPlayer = seededPlayers.find((player) => player.name === name);
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
  RYDER_CUP_TEMPLATE_NAME,
  buildRyderCupTripTemplate,
};
