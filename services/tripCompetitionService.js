const {
  MYRTLE_RYDER_CUP_HARD_CONSTRAINTS,
  MYRTLE_RYDER_CUP_PLAYERS,
  MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS,
  buildDefaultMyrtleRyderCup,
} = require('./myrtleRyderCupDefaults');

const SCORING_MODE_BEST4 = 'best4';
const SCORING_MODE_ALL5 = 'all5';
const SCORING_MODE_FIRST4 = 'first4of5';
const SCORING_MODE_LAST4 = 'last4of5';
const DEFAULT_SCORING_MODE = SCORING_MODE_BEST4;
const DEFAULT_HANDICAP_BUCKET_LABELS = ['Bucket A', 'Bucket B', 'Bucket C', 'Bucket D'];
const RYDER_CUP_TEAM_IDS = ['teamA', 'teamB'];
const MYRTLE_RYDER_CUP_PLAYER_NAMES = MYRTLE_RYDER_CUP_PLAYERS.map((player) => player.name);
const MYRTLE_RYDER_CUP_NAME_MAP = new Map(MYRTLE_RYDER_CUP_PLAYER_NAMES.map((name) => [normalizeNameKey(name), name]));
const MYRTLE_RYDER_CUP_RANK_MAP = new Map(MYRTLE_RYDER_CUP_PLAYERS.map((player) => [player.name, player.rank]));

// Myrtle course scorecards captured from public scorecard pages on 2026-03-09.
const MYRTLE_SCORECARDS = [
  {
    courseKey: 'world tour',
    holes: [
      { hole: 1, par: 4, handicap: 15 },
      { hole: 2, par: 5, handicap: 3 },
      { hole: 3, par: 3, handicap: 7 },
      { hole: 4, par: 4, handicap: 5 },
      { hole: 5, par: 5, handicap: 1 },
      { hole: 6, par: 4, handicap: 11 },
      { hole: 7, par: 3, handicap: 9 },
      { hole: 8, par: 4, handicap: 13 },
      { hole: 9, par: 4, handicap: 17 },
      { hole: 10, par: 4, handicap: 12 },
      { hole: 11, par: 5, handicap: 10 },
      { hole: 12, par: 3, handicap: 18 },
      { hole: 13, par: 4, handicap: 2 },
      { hole: 14, par: 3, handicap: 14 },
      { hole: 15, par: 5, handicap: 8 },
      { hole: 16, par: 4, handicap: 6 },
      { hole: 17, par: 4, handicap: 16 },
      { hole: 18, par: 4, handicap: 4 },
    ],
  },
  {
    courseKey: 'wild wing avocet',
    holes: [
      { hole: 1, par: 4, handicap: 9 },
      { hole: 2, par: 4, handicap: 17 },
      { hole: 3, par: 4, handicap: 3 },
      { hole: 4, par: 5, handicap: 5 },
      { hole: 5, par: 3, handicap: 11 },
      { hole: 6, par: 4, handicap: 1 },
      { hole: 7, par: 5, handicap: 7 },
      { hole: 8, par: 3, handicap: 15 },
      { hole: 9, par: 4, handicap: 13 },
      { hole: 10, par: 4, handicap: 12 },
      { hole: 11, par: 5, handicap: 6 },
      { hole: 12, par: 3, handicap: 8 },
      { hole: 13, par: 4, handicap: 16 },
      { hole: 14, par: 4, handicap: 18 },
      { hole: 15, par: 5, handicap: 10 },
      { hole: 16, par: 4, handicap: 2 },
      { hole: 17, par: 3, handicap: 14 },
      { hole: 18, par: 4, handicap: 4 },
    ],
  },
  {
    courseKey: 'kings north',
    holes: [
      { hole: 1, par: 5, handicap: 10 },
      { hole: 2, par: 4, handicap: 8 },
      { hole: 3, par: 4, handicap: 12 },
      { hole: 4, par: 3, handicap: 16 },
      { hole: 5, par: 4, handicap: 14 },
      { hole: 6, par: 5, handicap: 2 },
      { hole: 7, par: 4, handicap: 6 },
      { hole: 8, par: 3, handicap: 18 },
      { hole: 9, par: 4, handicap: 4 },
      { hole: 10, par: 5, handicap: 13 },
      { hole: 11, par: 4, handicap: 11 },
      { hole: 12, par: 3, handicap: 17 },
      { hole: 13, par: 4, handicap: 3 },
      { hole: 14, par: 4, handicap: 9 },
      { hole: 15, par: 5, handicap: 1 },
      { hole: 16, par: 4, handicap: 7 },
      { hole: 17, par: 3, handicap: 15 },
      { hole: 18, par: 4, handicap: 5 },
    ],
  },
  {
    courseKey: 'river hills',
    holes: [
      { hole: 1, par: 4, handicap: 14 },
      { hole: 2, par: 5, handicap: 4 },
      { hole: 3, par: 3, handicap: 18 },
      { hole: 4, par: 4, handicap: 8 },
      { hole: 5, par: 4, handicap: 6 },
      { hole: 6, par: 3, handicap: 16 },
      { hole: 7, par: 5, handicap: 2 },
      { hole: 8, par: 4, handicap: 12 },
      { hole: 9, par: 4, handicap: 10 },
      { hole: 10, par: 4, handicap: 11 },
      { hole: 11, par: 5, handicap: 3 },
      { hole: 12, par: 3, handicap: 15 },
      { hole: 13, par: 4, handicap: 9 },
      { hole: 14, par: 4, handicap: 5 },
      { hole: 15, par: 3, handicap: 17 },
      { hole: 16, par: 4, handicap: 13 },
      { hole: 17, par: 5, handicap: 1 },
      { hole: 18, par: 4, handicap: 7 },
    ],
  },
  {
    courseKey: 'long bay',
    holes: [
      { hole: 1, par: 4, handicap: 11 },
      { hole: 2, par: 5, handicap: 3 },
      { hole: 3, par: 4, handicap: 5 },
      { hole: 4, par: 4, handicap: 1 },
      { hole: 5, par: 3, handicap: 13 },
      { hole: 6, par: 4, handicap: 17 },
      { hole: 7, par: 5, handicap: 7 },
      { hole: 8, par: 3, handicap: 15 },
      { hole: 9, par: 4, handicap: 9 },
      { hole: 10, par: 4, handicap: 16 },
      { hole: 11, par: 5, handicap: 10 },
      { hole: 12, par: 4, handicap: 6 },
      { hole: 13, par: 3, handicap: 18 },
      { hole: 14, par: 4, handicap: 8 },
      { hole: 15, par: 5, handicap: 14 },
      { hole: 16, par: 4, handicap: 4 },
      { hole: 17, par: 3, handicap: 12 },
      { hole: 18, par: 4, handicap: 2 },
    ],
  },
];

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeNameKey(value) {
  return cleanString(value).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCourseKey(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueNames(values = []) {
  const seen = new Set();
  const output = [];
  for (const raw of values) {
    const name = cleanString(raw);
    const key = normalizeNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
}

function asFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asPositiveInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : null;
}

function toIsoDateOnly(value) {
  if (!value) return '';
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function isMyrtleRyderCupTrip(trip = {}) {
  const raw = trip && trip.competition && trip.competition.ryderCup;
  if (raw && typeof raw === 'object' && Object.keys(raw).length) return true;
  const searchable = `${cleanString(trip && trip.name)} ${cleanString(trip && trip.location)}`.toLowerCase();
  const arrivalIso = toIsoDateOnly(trip && trip.arrivalDate);
  const roundIso = Array.isArray(trip && trip.rounds) && trip.rounds[0] ? toIsoDateOnly(trip.rounds[0].date) : '';
  return searchable.includes('myrtle') && (arrivalIso === '2026-03-18' || roundIso === '2026-03-18');
}

function normalizeRyderCupTeamId(value, fallbackIndex = 0) {
  const key = cleanString(value).toLowerCase();
  if (key === 'teama' || key === 'team a' || key === 'a') return 'teamA';
  if (key === 'teamb' || key === 'team b' || key === 'b') return 'teamB';
  return RYDER_CUP_TEAM_IDS[fallbackIndex] || 'teamA';
}

function normalizeRyderCupResult(value) {
  const key = cleanString(value).toLowerCase();
  if (key === 'a' || key === 'teama' || key === 'team a' || key === 'winnera' || key === 'winner-a') return 'teamA';
  if (key === 'b' || key === 'teamb' || key === 'team b' || key === 'winnerb' || key === 'winner-b') return 'teamB';
  if (key === 'h' || key === 'half' || key === 'halved' || key === 'tie') return 'halved';
  return '';
}

function getRyderCupDefaultState(trip = {}) {
  return buildDefaultMyrtleRyderCup(Array.isArray(trip && trip.rounds) ? trip.rounds : []);
}

function buildRyderCupPlayerRows() {
  return MYRTLE_RYDER_CUP_PLAYERS.map((player) => ({ ...player }));
}

function normalizeRyderCupWinnerList(values = []) {
  return uniqueNames(Array.isArray(values) ? values : [values]);
}

function normalizeCurrencyAmount(value) {
  const parsed = asFiniteNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeRyderCupPlayerName(value) {
  const key = normalizeNameKey(value);
  return MYRTLE_RYDER_CUP_NAME_MAP.get(key) || cleanString(value);
}

function normalizeRyderCupTeamPlayers(players = [], allowedPlayers = [], expectedCount = 0) {
  const allowed = new Map(allowedPlayers.map((name) => [normalizeNameKey(name), name]));
  const output = [];
  const seen = new Set();
  for (const rawName of Array.isArray(players) ? players : []) {
    const normalized = normalizeRyderCupPlayerName(rawName);
    const key = normalizeNameKey(normalized);
    if (!key || seen.has(key) || !allowed.has(key)) continue;
    seen.add(key);
    output.push(allowed.get(key));
  }
  if (expectedCount > 0) return output.slice(0, expectedCount);
  return output;
}

function areValidRyderCupTeams(teams = []) {
  if (!Array.isArray(teams) || teams.length !== 2) return false;
  const allPlayers = [];
  for (const team of teams) {
    if (!team || !Array.isArray(team.players) || team.players.length !== 10) return false;
    allPlayers.push(...team.players);
  }
  const uniqueTeamPlayers = uniqueNames(allPlayers);
  if (uniqueTeamPlayers.length !== MYRTLE_RYDER_CUP_PLAYER_NAMES.length) return false;
  return uniqueTeamPlayers.every((name) => MYRTLE_RYDER_CUP_NAME_MAP.has(normalizeNameKey(name)));
}

function normalizeRyderCupTeams(rawTeams = [], defaultState = {}) {
  const fallbackTeams = Array.isArray(defaultState.teams) ? clonePlain(defaultState.teams) : [];
  const sourceTeams = Array.isArray(rawTeams) && rawTeams.length ? rawTeams : fallbackTeams;
  const normalized = RYDER_CUP_TEAM_IDS.map((teamId, index) => {
    const fallback = fallbackTeams[index] || { id: teamId, name: `Team ${index === 0 ? 'A' : 'B'}`, players: [] };
    const source = sourceTeams.find((entry, entryIndex) => normalizeRyderCupTeamId(entry && entry.id, entryIndex) === teamId) || fallback;
    return {
      id: teamId,
      name: cleanString(source && source.name) || fallback.name,
      players: normalizeRyderCupTeamPlayers(source && source.players, MYRTLE_RYDER_CUP_PLAYER_NAMES, 10),
    };
  });
  return areValidRyderCupTeams(normalized) ? normalized : fallbackTeams;
}

function isSinglesFormat(format = '') {
  return cleanString(format).toLowerCase() === 'singles';
}

function buildRyderCupTeamLookup(teams = []) {
  const byPlayer = new Map();
  teams.forEach((team) => {
    (team.players || []).forEach((name) => {
      byPlayer.set(normalizeNameKey(name), {
        teamId: team.id,
        teamName: team.name,
      });
    });
  });
  return byPlayer;
}

function normalizeRyderCupRound(rawRound = {}, defaultRound = {}, teams = []) {
  const expectedCount = isSinglesFormat(defaultRound.format) ? 1 : 2;
  const teamA = teams[0] || { players: [] };
  const teamB = teams[1] || { players: [] };
  const rawMatches = Array.isArray(rawRound && rawRound.matches) ? rawRound.matches : [];
  const rawDate = toIsoDateOnly(rawRound && rawRound.date);
  const matches = (defaultRound.matches || []).map((defaultMatch, matchIndex) => {
    const rawMatch = rawMatches[matchIndex] || defaultMatch || {};
    let teamAPlayers = normalizeRyderCupTeamPlayers(rawMatch.teamAPlayers, teamA.players, expectedCount);
    let teamBPlayers = normalizeRyderCupTeamPlayers(rawMatch.teamBPlayers, teamB.players, expectedCount);
    if (teamAPlayers.length !== expectedCount || teamBPlayers.length !== expectedCount) {
      teamAPlayers = (defaultMatch.teamAPlayers || []).slice();
      teamBPlayers = (defaultMatch.teamBPlayers || []).slice();
    }
    return {
      matchNumber: asPositiveInteger(rawMatch.matchNumber) || defaultMatch.matchNumber || (matchIndex + 1),
      label: cleanString(rawMatch.label) || defaultMatch.label || (isSinglesFormat(defaultRound.format) ? `Singles ${matchIndex + 1}` : `Match ${matchIndex + 1}`),
      groupNumber: asPositiveInteger(rawMatch.groupNumber) || defaultMatch.groupNumber || (matchIndex + 1),
      teamAPlayers,
      teamBPlayers,
      result: normalizeRyderCupResult(rawMatch.result),
      notes: cleanString(rawMatch.notes !== undefined ? rawMatch.notes : defaultMatch.notes),
    };
  });
  return {
    roundNumber: asPositiveInteger(rawRound.roundNumber) || defaultRound.roundNumber,
    title: cleanString(rawRound.title) || defaultRound.title || `Round ${defaultRound.roundNumber || 1}`,
    format: cleanString(rawRound.format) || defaultRound.format || 'Four-Ball',
    pointValue: asFiniteNumber(rawRound.pointValue) || asFiniteNumber(defaultRound.pointValue) || 1,
    course: cleanString(rawRound.course) || defaultRound.course || '',
    date: rawDate ? new Date(rawRound.date).toISOString() : defaultRound.date || null,
    label: cleanString(rawRound.label) || defaultRound.label || '',
    matches,
  };
}

function remapRyderCupRoundForTeams(round = {}, teams = []) {
  const teamASet = new Set(((teams[0] && teams[0].players) || []).map((name) => normalizeNameKey(name)));
  const teamBSet = new Set(((teams[1] && teams[1].players) || []).map((name) => normalizeNameKey(name)));
  const matches = (round.matches || []).map((match) => {
    const players = uniqueNames([].concat(match.teamAPlayers || [], match.teamBPlayers || []));
    return {
      ...match,
      teamAPlayers: players.filter((name) => teamASet.has(normalizeNameKey(name))),
      teamBPlayers: players.filter((name) => teamBSet.has(normalizeNameKey(name))),
      result: '',
    };
  });
  return {
    ...round,
    matches,
  };
}

function normalizeRyderCupSideGames(rawSideGames = {}, defaultState = {}) {
  const defaultSideGames = clonePlain(defaultState.sideGames || {});
  const rawDailyLowGross = Array.isArray(rawSideGames && rawSideGames.dailyLowGross) ? rawSideGames.dailyLowGross : [];
  const dailyLowGross = (defaultSideGames.dailyLowGross || []).map((entry, index) => {
    const rawEntry = rawDailyLowGross[index] || {};
    return {
      roundNumber: entry.roundNumber,
      label: entry.label,
      winnerName: normalizeRyderCupPlayerName(rawEntry.winnerName || entry.winnerName),
      amount: normalizeCurrencyAmount(rawEntry.amount),
      notes: cleanString(rawEntry.notes),
    };
  });
  const weeklySource = rawSideGames && rawSideGames.weeklyLowGross ? rawSideGames.weeklyLowGross : {};
  const closestSource = rawSideGames && rawSideGames.closestToPin ? rawSideGames.closestToPin : {};
  const birdieSource = rawSideGames && rawSideGames.birdiePool ? rawSideGames.birdiePool : {};
  const mvpSource = rawSideGames && rawSideGames.mvp ? rawSideGames.mvp : {};
  const rawClosestEntries = Array.isArray(closestSource.entries) ? closestSource.entries : [];
  const closestEntries = rawClosestEntries
    .map((entry) => ({
      roundNumber: asPositiveInteger(entry && entry.roundNumber),
      course: cleanString(entry && entry.course),
      hole: asPositiveInteger(entry && entry.hole),
      playerName: normalizeRyderCupPlayerName(entry && entry.playerName),
      distance: cleanString(entry && entry.distance),
      amount: normalizeCurrencyAmount(entry && entry.amount),
      notes: cleanString(entry && entry.notes),
    }))
    .filter((entry) => entry.roundNumber && entry.hole && entry.playerName);
  const birdieCounts = buildRyderCupPlayerRows().map((player) => {
    const saved = Array.isArray(birdieSource.counts)
      ? birdieSource.counts.find((entry) => normalizeNameKey(entry && entry.playerName) === normalizeNameKey(player.name))
      : null;
    return {
      playerName: player.name,
      count: Math.max(0, Math.round(asFiniteNumber(saved && saved.count) || 0)),
    };
  });
  const birdieWinners = normalizeRyderCupWinnerList(birdieSource.winners).map(normalizeRyderCupPlayerName).filter(Boolean);
  const mvpWinners = normalizeRyderCupWinnerList(mvpSource.overrideWinners || mvpSource.winnerName).map(normalizeRyderCupPlayerName).filter(Boolean);
  return {
    dailyLowGross,
    weeklyLowGross: {
      winnerName: normalizeRyderCupPlayerName(weeklySource.winnerName),
      amount: normalizeCurrencyAmount(weeklySource.amount),
      notes: cleanString(weeklySource.notes),
    },
    closestToPin: {
      entries: closestEntries,
    },
    birdiePool: {
      counts: birdieCounts,
      winners: birdieWinners,
      amount: normalizeCurrencyAmount(birdieSource.amount),
      notes: cleanString(birdieSource.notes),
    },
    mvp: {
      overrideWinners: mvpWinners,
      amount: normalizeCurrencyAmount(mvpSource.amount),
      notes: cleanString(mvpSource.notes),
    },
  };
}

function normalizeRyderCupPayout(rawPayout = {}, defaultState = {}) {
  const fallback = clonePlain(defaultState.payout || {});
  const rawAllocation = rawPayout && rawPayout.allocationPercentages ? rawPayout.allocationPercentages : {};
  return {
    totalPot: normalizeCurrencyAmount(rawPayout && rawPayout.totalPot) !== null
      ? normalizeCurrencyAmount(rawPayout && rawPayout.totalPot)
      : normalizeCurrencyAmount(fallback.totalPot) || 0,
    allocationPercentages: {
      winningTeam: asFiniteNumber(rawAllocation.winningTeam) || asFiniteNumber(fallback.allocationPercentages && fallback.allocationPercentages.winningTeam) || 50,
      weeklyLowGross: asFiniteNumber(rawAllocation.weeklyLowGross) || asFiniteNumber(fallback.allocationPercentages && fallback.allocationPercentages.weeklyLowGross) || 20,
      birdiePool: asFiniteNumber(rawAllocation.birdiePool) || asFiniteNumber(fallback.allocationPercentages && fallback.allocationPercentages.birdiePool) || 10,
      closestToPin: asFiniteNumber(rawAllocation.closestToPin) || asFiniteNumber(fallback.allocationPercentages && fallback.allocationPercentages.closestToPin) || 10,
      mvp: asFiniteNumber(rawAllocation.mvp) || asFiniteNumber(fallback.allocationPercentages && fallback.allocationPercentages.mvp) || 10,
    },
  };
}

function normalizeRyderCupState(rawState = {}, trip = {}) {
  const defaultState = getRyderCupDefaultState(trip);
  const state = clonePlain(rawState || {});
  const teams = normalizeRyderCupTeams(state.teams, defaultState);
  const rounds = (defaultState.rounds || []).map((defaultRound, index) => normalizeRyderCupRound(
    Array.isArray(state.rounds) ? state.rounds[index] || {} : {},
    defaultRound,
    teams,
  ));
  return {
    title: cleanString(state.title) || defaultState.title,
    players: buildRyderCupPlayerRows(),
    teams,
    rounds,
    sideGames: normalizeRyderCupSideGames(state.sideGames, defaultState),
    payout: normalizeRyderCupPayout(state.payout, defaultState),
    adminNotes: {
      hardConstraints: MYRTLE_RYDER_CUP_HARD_CONSTRAINTS.map((entry) => ({ ...entry })),
      requestedGroupings: MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS.map((entry) => ({ ...entry })),
      notes: Array.isArray(state && state.adminNotes && state.adminNotes.notes)
        ? state.adminNotes.notes.map((note) => cleanString(note)).filter(Boolean)
        : clonePlain(defaultState.adminNotes && defaultState.adminNotes.notes),
    },
  };
}

function cloneScorecardHoles(holes = []) {
  return holes.map((hole) => ({
    hole: Number(hole.hole),
    par: Number(hole.par),
    handicap: Number(hole.handicap),
  }));
}

function getDefaultScorecard(courseName = '') {
  const normalizedCourse = normalizeCourseKey(courseName);
  const found = MYRTLE_SCORECARDS.find((entry) => normalizedCourse === normalizeCourseKey(entry.courseKey))
    || MYRTLE_SCORECARDS.find((entry) => normalizedCourse.includes(normalizeCourseKey(entry.courseKey)) || normalizeCourseKey(entry.courseKey).includes(normalizedCourse));
  if (found) return cloneScorecardHoles(found.holes);
  return Array.from({ length: 18 }, (_, index) => ({
    hole: index + 1,
    par: 4,
    handicap: index + 1,
  }));
}

function normalizeScorecard(scorecard = [], courseName = '') {
  const fallback = getDefaultScorecard(courseName);
  const explicit = Array.isArray(scorecard) ? scorecard : [];
  const byHole = new Map();
  explicit.forEach((hole, index) => {
    const holeNumber = asPositiveInteger(hole && (hole.hole || hole.number)) || (index + 1);
    if (holeNumber < 1 || holeNumber > 18) return;
    const par = asPositiveInteger(hole && hole.par);
    const handicap = asPositiveInteger(hole && (hole.handicap || hole.strokeIndex || hole.hcp));
    byHole.set(holeNumber, {
      hole: holeNumber,
      par: par || fallback[holeNumber - 1].par,
      handicap: handicap || fallback[holeNumber - 1].handicap,
    });
  });
  return fallback.map((hole) => byHole.get(hole.hole) || hole);
}

function normalizeHoleScores(holes = []) {
  const output = Array.from({ length: 18 }, () => null);
  if (!Array.isArray(holes)) return output;
  holes.slice(0, 18).forEach((value, index) => {
    const gross = asPositiveInteger(value);
    output[index] = gross || null;
  });
  return output;
}

function compactHoleScores(holes = []) {
  return normalizeHoleScores(holes);
}

function normalizeScoringMode(value) {
  if (value === SCORING_MODE_ALL5) return SCORING_MODE_ALL5;
  if (value === SCORING_MODE_FIRST4) return SCORING_MODE_FIRST4;
  if (value === SCORING_MODE_LAST4) return SCORING_MODE_LAST4;
  return SCORING_MODE_BEST4;
}

function getScoringModeLabel(scoringMode) {
  const mode = normalizeScoringMode(scoringMode);
  if (mode === SCORING_MODE_ALL5) return 'All 5 rounds count';
  if (mode === SCORING_MODE_FIRST4) return 'First 4 of 5 rounds';
  if (mode === SCORING_MODE_LAST4) return 'Last 4 of 5 rounds';
  return 'Best 4 of 5 rounds';
}

function getPlayingHandicap(handicapIndex) {
  const numeric = asFiniteNumber(handicapIndex);
  return numeric === null ? 0 : Math.round(numeric);
}

function getHoleStrokeAdjustment(playingHandicap, strokeIndex) {
  const parsedHandicap = Math.round(asFiniteNumber(playingHandicap) || 0);
  const parsedStrokeIndex = asPositiveInteger(strokeIndex);
  if (!parsedHandicap || !parsedStrokeIndex) return 0;

  const absHandicap = Math.abs(parsedHandicap);
  const base = Math.floor(absHandicap / 18);
  const extra = absHandicap % 18;

  if (parsedHandicap > 0) {
    return base + (parsedStrokeIndex <= extra ? 1 : 0);
  }

  const reverseRank = 19 - parsedStrokeIndex;
  return -(base + (reverseRank <= extra ? 1 : 0));
}

function stablefordPointsForNetDiff(netDiff) {
  if (!Number.isFinite(netDiff)) return null;
  if (netDiff >= 2) return 0;
  if (netDiff === 1) return 1;
  if (netDiff === 0) return 2;
  if (netDiff === -1) return 3;
  return 4;
}

function calculateHoleResult(grossScore, hole, handicapIndex) {
  const gross = asPositiveInteger(grossScore);
  if (!gross || !hole) {
    return {
      gross: null,
      net: null,
      points: null,
      strokeAdjustment: 0,
    };
  }
  const playingHandicap = getPlayingHandicap(handicapIndex);
  const strokeAdjustment = getHoleStrokeAdjustment(playingHandicap, hole.handicap);
  const net = gross - strokeAdjustment;
  const points = stablefordPointsForNetDiff(net - hole.par);
  return {
    gross,
    net,
    points,
    strokeAdjustment,
  };
}

function findPlayerScoreEntry(round = {}, playerName = '') {
  const targetKey = normalizeNameKey(playerName);
  const entries = Array.isArray(round.playerScores) ? round.playerScores : [];
  return entries.find((entry) => normalizeNameKey(entry && entry.playerName) === targetKey) || null;
}

function getRoundPlayerNames(round = {}) {
  const names = [];
  for (const slot of round.teeTimes || []) {
    for (const player of slot && slot.players ? slot.players : []) {
      names.push(player);
    }
  }
  for (const name of round.unassignedPlayers || []) {
    names.push(name);
  }
  for (const entry of round.playerScores || []) {
    if (entry && entry.playerName) names.push(entry.playerName);
  }
  return uniqueNames(names);
}

function getCompetitionPlayerPool(trip = {}, participants = []) {
  const roundNames = [];
  for (const round of trip.rounds || []) {
    roundNames.push(...getRoundPlayerNames(round));
  }
  const roundNameSet = new Set(roundNames.map(normalizeNameKey));
  const participantDocs = Array.isArray(participants) ? participants : [];
  const confirmed = participantDocs.filter((participant) => cleanString(participant && participant.status) === 'in');
  const baseParticipants = confirmed.length ? confirmed : participantDocs;
  const output = [];
  const seen = new Set();

  for (const participant of baseParticipants) {
    const name = cleanString(participant && participant.name);
    const key = normalizeNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push({
      participantId: participant && participant._id ? String(participant._id) : null,
      name,
      handicapIndex: asFiniteNumber(participant && participant.handicapIndex),
      status: cleanString(participant && participant.status) || 'in',
    });
  }

  for (const name of roundNames) {
    const key = normalizeNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push({
      participantId: null,
      name,
      handicapIndex: null,
      status: roundNameSet.has(key) ? 'in' : '',
    });
  }

  if (!output.length) {
    for (const participant of participantDocs) {
      const name = cleanString(participant && participant.name);
      const key = normalizeNameKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      output.push({
        participantId: participant && participant._id ? String(participant._id) : null,
        name,
        handicapIndex: asFiniteNumber(participant && participant.handicapIndex),
        status: cleanString(participant && participant.status) || 'in',
      });
    }
  }

  return output;
}

function buildHandicapBuckets(players = [], storedBuckets = []) {
  const sorted = players
    .slice()
    .sort((left, right) => {
      const leftHcp = asFiniteNumber(left && left.handicapIndex);
      const rightHcp = asFiniteNumber(right && right.handicapIndex);
      if (leftHcp !== null && rightHcp !== null && leftHcp !== rightHcp) return leftHcp - rightHcp;
      if (leftHcp !== null && rightHcp === null) return -1;
      if (leftHcp === null && rightHcp !== null) return 1;
      return cleanString(left && left.name).localeCompare(cleanString(right && right.name));
    });
  const toViewPlayer = (player) => ({
    name: player.name,
    handicapIndex: asFiniteNumber(player.handicapIndex),
  });
  if (!Array.isArray(storedBuckets) || !storedBuckets.length) {
    const bucketSize = Math.max(1, Math.ceil(sorted.length / DEFAULT_HANDICAP_BUCKET_LABELS.length));
    return DEFAULT_HANDICAP_BUCKET_LABELS.map((label, index) => ({
      label,
      players: sorted.slice(index * bucketSize, (index + 1) * bucketSize).map(toViewPlayer),
    }));
  }

  const labels = DEFAULT_HANDICAP_BUCKET_LABELS.map((fallbackLabel, index) => {
    const raw = storedBuckets[index];
    const parsed = cleanString(raw && raw.label);
    return parsed || fallbackLabel;
  });
  const buckets = labels.map((label) => ({ label, players: [] }));
  const byName = new Map(sorted.map((player) => [normalizeNameKey(player.name), player]));
  const assigned = new Set();

  storedBuckets.slice(0, buckets.length).forEach((bucket, bucketIndex) => {
    const names = Array.isArray(bucket && bucket.players) ? bucket.players : [];
    uniqueNames(names).forEach((rawName) => {
      const key = normalizeNameKey(rawName);
      if (!key || assigned.has(key) || !byName.has(key)) return;
      assigned.add(key);
      buckets[bucketIndex].players.push(toViewPlayer(byName.get(key)));
    });
  });

  sorted.forEach((player) => {
    const key = normalizeNameKey(player.name);
    if (assigned.has(key)) return;
    assigned.add(key);
    let targetBucket = buckets[0];
    for (const bucket of buckets) {
      if (bucket.players.length < targetBucket.players.length) targetBucket = bucket;
    }
    targetBucket.players.push(toViewPlayer(player));
  });

  return buckets;
}

function calculatePlayerRound(round = {}, playerName = '', handicapIndex = null) {
  const scorecard = normalizeScorecard(round.scorecard, round.course);
  const entry = findPlayerScoreEntry(round, playerName);
  const holes = normalizeHoleScores(entry && entry.holes);
  const holeResults = scorecard.map((hole, index) => calculateHoleResult(holes[index], hole, handicapIndex));
  const playingHandicap = getPlayingHandicap(handicapIndex);
  const completedHoles = holeResults.filter((result) => result.gross !== null).length;
  const stablefordTotal = completedHoles
    ? holeResults.reduce((sum, result) => sum + (result.points || 0), 0)
    : null;
  const grossTotal = completedHoles
    ? holeResults.reduce((sum, result) => sum + (result.gross || 0), 0)
    : null;
  const netTotal = completedHoles
    ? holeResults.reduce((sum, result) => sum + (result.net || 0), 0)
    : null;
  return {
    playerName,
    holes,
    holeResults,
    playingHandicap,
    stablefordTotal,
    grossTotal,
    netTotal,
    completedHoles,
    isComplete: completedHoles === 18,
  };
}

function computeCountedRounds(roundResults = [], scoringMode = DEFAULT_SCORING_MODE) {
  const counted = Array.from({ length: roundResults.length }, () => false);
  const mode = normalizeScoringMode(scoringMode);
  const completeRounds = roundResults
    .map((round, index) => ({ ...round, index }))
    .filter((round) => round && round.isComplete && Number.isFinite(round.stablefordTotal));

  if (!completeRounds.length) {
    return { countedFlags: counted, countedTotal: null };
  }

  if (mode === SCORING_MODE_ALL5) {
    let total = 0;
    completeRounds.forEach((round) => {
      counted[round.index] = true;
      total += round.stablefordTotal;
    });
    return { countedFlags: counted, countedTotal: total };
  }

  let chosen = [];
  if (mode === SCORING_MODE_FIRST4) {
    chosen = completeRounds.slice(0, Math.min(4, completeRounds.length));
  } else if (mode === SCORING_MODE_LAST4) {
    chosen = completeRounds.slice(Math.max(0, completeRounds.length - 4));
  } else {
    chosen = completeRounds
      .slice()
      .sort((left, right) => {
        if (right.stablefordTotal !== left.stablefordTotal) return right.stablefordTotal - left.stablefordTotal;
        return left.index - right.index;
      })
      .slice(0, Math.min(4, completeRounds.length));
  }

  const total = chosen.reduce((sum, round) => {
    counted[round.index] = true;
    return sum + round.stablefordTotal;
  }, 0);
  return { countedFlags: counted, countedTotal: total };
}

function normalizeTeamSelection(players = [], allowedPlayers = []) {
  const allowed = new Map(allowedPlayers.map((name) => [normalizeNameKey(name), cleanString(name)]));
  const output = [];
  const seen = new Set();
  for (const raw of players || []) {
    const key = normalizeNameKey(raw);
    if (!key || !allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    output.push(allowed.get(key));
  }
  return output;
}

function getSuggestedTeams(players = []) {
  const roster = uniqueNames(players);
  if (roster.length < 2) return { teamA: [], teamB: [] };
  const midpoint = Math.ceil(roster.length / 2);
  return {
    teamA: roster.slice(0, Math.min(2, midpoint)),
    teamB: roster.slice(Math.min(2, midpoint), Math.min(4, roster.length)),
  };
}

function findTeamMatch(round = {}, slotIndex) {
  const target = Number(slotIndex);
  const matches = Array.isArray(round.teamMatches) ? round.teamMatches : [];
  return matches.find((entry) => Number(entry && entry.slotIndex) === target) || null;
}

function calculateTeamBestNet(round = {}, playerName = '', holeIndex = 0, handicapIndex = null) {
  const playerRound = calculatePlayerRound(round, playerName, handicapIndex);
  const holeResult = playerRound.holeResults[holeIndex];
  return holeResult && holeResult.net !== null ? holeResult.net : null;
}

function calculateRoundMatch(round = {}, slot = {}, slotIndex = 0, playerPool = []) {
  const slotPlayers = uniqueNames(slot && slot.players ? slot.players : []);
  const savedMatch = findTeamMatch(round, slotIndex);
  const savedTeamA = normalizeTeamSelection(savedMatch && savedMatch.teamA, slotPlayers);
  const savedTeamB = normalizeTeamSelection(savedMatch && savedMatch.teamB, slotPlayers);
  const hasSavedTeams = savedTeamA.length === 2 && savedTeamB.length === 2
    && uniqueNames(savedTeamA.concat(savedTeamB)).length === 4;
  const suggestedTeams = getSuggestedTeams(slotPlayers);
  const teamA = hasSavedTeams ? savedTeamA : [];
  const teamB = hasSavedTeams ? savedTeamB : [];
  const handicapByName = new Map(playerPool.map((player) => [normalizeNameKey(player.name), asFiniteNumber(player.handicapIndex)]));

  if (!hasSavedTeams) {
    return {
      slotIndex,
      label: cleanString(slot && slot.label) || `TT#${slotIndex + 1}`,
      time: cleanString(slot && slot.time),
      players: slotPlayers,
      teamA,
      teamB,
      suggestedTeamA: suggestedTeams.teamA,
      suggestedTeamB: suggestedTeams.teamB,
      result: {
        status: slotPlayers.length === 4 ? 'unassigned' : 'unavailable',
        summary: slotPlayers.length === 4
          ? 'Assign two players to Team A and two to Team B.'
          : 'Need a four-player tee time for a 2-man match.',
        pointsA: null,
        pointsB: null,
        completedHoles: 0,
        teamAHolesWon: 0,
        teamBHolesWon: 0,
        halvedHoles: 0,
      },
    };
  }

  let completedHoles = 0;
  let teamAHolesWon = 0;
  let teamBHolesWon = 0;
  let halvedHoles = 0;

  for (let holeIndex = 0; holeIndex < 18; holeIndex += 1) {
    const teamANets = teamA
      .map((name) => calculateTeamBestNet(round, name, holeIndex, handicapByName.get(normalizeNameKey(name))))
      .filter((value) => Number.isFinite(value));
    const teamBNets = teamB
      .map((name) => calculateTeamBestNet(round, name, holeIndex, handicapByName.get(normalizeNameKey(name))))
      .filter((value) => Number.isFinite(value));
    if (!teamANets.length || !teamBNets.length) continue;
    completedHoles += 1;
    const teamABest = Math.min(...teamANets);
    const teamBBest = Math.min(...teamBNets);
    if (teamABest < teamBBest) teamAHolesWon += 1;
    else if (teamBBest < teamABest) teamBHolesWon += 1;
    else halvedHoles += 1;
  }

  const result = {
    status: completedHoles === 18 ? 'complete' : 'pending',
    summary: '',
    pointsA: null,
    pointsB: null,
    completedHoles,
    teamAHolesWon,
    teamBHolesWon,
    halvedHoles,
  };

  if (completedHoles !== 18) {
    result.summary = completedHoles
      ? `Scores entered through ${completedHoles} of 18 holes.`
      : 'No score data entered yet.';
  } else if (teamAHolesWon > teamBHolesWon) {
    result.summary = `Team A won ${teamAHolesWon}-${teamBHolesWon}-${halvedHoles}.`;
    result.pointsA = 1;
    result.pointsB = 0;
  } else if (teamBHolesWon > teamAHolesWon) {
    result.summary = `Team B won ${teamBHolesWon}-${teamAHolesWon}-${halvedHoles}.`;
    result.pointsA = 0;
    result.pointsB = 1;
  } else {
    result.summary = `Match tied ${teamAHolesWon}-${teamBHolesWon}-${halvedHoles}.`;
    result.pointsA = 0.5;
    result.pointsB = 0.5;
  }

  return {
    slotIndex,
    label: cleanString(slot && slot.label) || `TT#${slotIndex + 1}`,
    time: cleanString(slot && slot.time),
    players: slotPlayers,
    teamA,
    teamB,
    suggestedTeamA: suggestedTeams.teamA,
    suggestedTeamB: suggestedTeams.teamB,
    result,
  };
}

function normalizeCtpWinners(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      hole: asPositiveInteger(entry && entry.hole),
      winners: uniqueNames(Array.isArray(entry && entry.winners) ? entry.winners : [entry && entry.playerName]),
      note: cleanString(entry && entry.note),
    }))
    .filter((entry) => entry.hole && entry.winners.length);
}

function normalizeSkinsResults(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      playerName: cleanString(entry && entry.playerName),
      holes: uniqueNames((Array.isArray(entry && entry.holes) ? entry.holes : [])
        .map((hole) => String(asPositiveInteger(hole) || '').trim()))
        .map((hole) => Number(hole))
        .filter((hole) => Number.isFinite(hole)),
      amount: asFiniteNumber(entry && entry.amount),
      note: cleanString(entry && entry.note),
    }))
    .filter((entry) => entry.playerName);
}

function buildDailyPointsLeaderboard(roundViews = [], playerPool = []) {
  const pointsByName = new Map(playerPool.map((player) => [normalizeNameKey(player.name), {
    name: player.name,
    handicapIndex: asFiniteNumber(player.handicapIndex),
    points: 0,
  }]));

  for (const round of roundViews) {
    for (const match of round.matches || []) {
      if (!match || !match.result || match.result.status !== 'complete') continue;
      for (const name of match.teamA || []) {
        const key = normalizeNameKey(name);
        if (!pointsByName.has(key)) {
          pointsByName.set(key, { name, handicapIndex: null, points: 0 });
        }
        pointsByName.get(key).points += match.result.pointsA || 0;
      }
      for (const name of match.teamB || []) {
        const key = normalizeNameKey(name);
        if (!pointsByName.has(key)) {
          pointsByName.set(key, { name, handicapIndex: null, points: 0 });
        }
        pointsByName.get(key).points += match.result.pointsB || 0;
      }
    }
  }

  const sorted = Array.from(pointsByName.values()).sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    return left.name.localeCompare(right.name);
  });

  let previousPoints = null;
  let previousPosition = 0;
  return sorted.map((entry, index) => {
    const position = previousPoints !== null && previousPoints === entry.points ? previousPosition : index + 1;
    previousPoints = entry.points;
    previousPosition = position;
    return {
      position,
      name: entry.name,
      handicapIndex: entry.handicapIndex,
      points: entry.points,
    };
  });
}

function getTripRyderCupState(trip = {}, options = {}) {
  if (!options.force && !isMyrtleRyderCupTrip(trip)) return null;
  const rawState = trip && trip.competition && trip.competition.ryderCup;
  return normalizeRyderCupState(rawState, trip);
}

function setTripRyderCupState(trip = {}, nextState = {}) {
  if (!trip.competition) trip.competition = {};
  trip.competition.ryderCup = clonePlain(nextState);
  return trip.competition.ryderCup;
}

function assertValidRyderCupTeams(teams = []) {
  if (!areValidRyderCupTeams(teams)) {
    throw new Error('Ryder Cup teams must have 10 unique ranked players on each side.');
  }
}

function assertValidRyderCupRound(round = {}, teams = []) {
  const teamA = teams[0] || { players: [] };
  const teamB = teams[1] || { players: [] };
  const matches = Array.isArray(round.matches) ? round.matches : [];
  const expectedCount = isSinglesFormat(round.format) ? 1 : 2;
  const expectedMatchCount = teamA.players.length / expectedCount;
  if (matches.length !== expectedMatchCount) {
    throw new Error(`Ryder Cup ${round.title || 'round'} must include ${expectedMatchCount} matches.`);
  }
  const usedTeamA = [];
  const usedTeamB = [];
  const groupCounts = new Map();
  matches.forEach((match, index) => {
    if (!match || !Array.isArray(match.teamAPlayers) || !Array.isArray(match.teamBPlayers)) {
      throw new Error(`Ryder Cup ${round.title || 'round'} match ${index + 1} is incomplete.`);
    }
    if (match.teamAPlayers.length !== expectedCount || match.teamBPlayers.length !== expectedCount) {
      throw new Error(`Ryder Cup ${round.title || 'round'} match ${index + 1} must use ${expectedCount} player${expectedCount === 1 ? '' : 's'} per side.`);
    }
    usedTeamA.push(...match.teamAPlayers);
    usedTeamB.push(...match.teamBPlayers);
    const groupNumber = asPositiveInteger(match.groupNumber) || (index + 1);
    groupCounts.set(groupNumber, (groupCounts.get(groupNumber) || 0) + 1);
  });
  if (uniqueNames(usedTeamA).length !== teamA.players.length || uniqueNames(usedTeamB).length !== teamB.players.length) {
    throw new Error(`Ryder Cup ${round.title || 'round'} must use every player exactly once per team.`);
  }
  if (isSinglesFormat(round.format)) {
    const invalidGroup = Array.from(groupCounts.values()).find((count) => count !== 2);
    if (invalidGroup) {
      throw new Error('Singles groups must contain exactly two matches per foursome.');
    }
  }
}

function setTripRyderCupTeams(trip = {}, payload = {}) {
  const current = getTripRyderCupState(trip, { force: true });
  const hasStarted = current.rounds.some((round) => (round.matches || []).some((match) => Boolean(normalizeRyderCupResult(match && match.result))));
  if (hasStarted) {
    throw new Error('Ryder Cup teams are locked after results are entered.');
  }
  const nextTeams = normalizeRyderCupTeams(payload && payload.teams, current);
  const nextState = {
    ...current,
    teams: nextTeams,
    rounds: current.rounds.map((round) => remapRyderCupRoundForTeams(round, nextTeams)),
  };
  assertValidRyderCupTeams(nextState.teams);
  try {
    nextState.rounds.forEach((round) => assertValidRyderCupRound(round, nextState.teams));
  } catch (_error) {
    throw new Error('Team changes require updated round matchups. Save the teams in a split that still gives each match the correct 2-vs-2 or singles setup.');
  }
  return setTripRyderCupState(trip, nextState);
}

function setTripRyderCupRound(trip = {}, roundIndex, payload = {}) {
  const current = getTripRyderCupState(trip, { force: true });
  const index = Number(roundIndex);
  if (!Number.isInteger(index) || index < 0 || index >= current.rounds.length) {
    throw new Error('Ryder Cup round not found.');
  }
  const nextState = clonePlain(current);
  nextState.rounds[index] = normalizeRyderCupRound(payload, current.rounds[index], nextState.teams);
  assertValidRyderCupRound(nextState.rounds[index], nextState.teams);
  return setTripRyderCupState(trip, nextState);
}

function setTripRyderCupSettings(trip = {}, payload = {}) {
  const current = getTripRyderCupState(trip, { force: true });
  const nextState = {
    ...current,
    sideGames: Object.prototype.hasOwnProperty.call(payload || {}, 'sideGames')
      ? normalizeRyderCupSideGames(payload.sideGames, current)
      : current.sideGames,
    payout: Object.prototype.hasOwnProperty.call(payload || {}, 'payout')
      ? normalizeRyderCupPayout(payload.payout, current)
      : current.payout,
  };
  return setTripRyderCupState(trip, nextState);
}

function swapPlayerName(values = [], leftName = '', rightName = '') {
  const leftKey = normalizeNameKey(leftName);
  const rightKey = normalizeNameKey(rightName);
  return (values || []).map((value) => {
    const key = normalizeNameKey(value);
    if (key === leftKey) return rightName;
    if (key === rightKey) return leftName;
    return value;
  });
}

function swapTripRyderCupTeamPlayers(trip = {}, playerName = '', targetPlayerName = '') {
  const current = getTripRyderCupState(trip, { force: true });
  const leftName = normalizeRyderCupPlayerName(playerName);
  const rightName = normalizeRyderCupPlayerName(targetPlayerName);
  if (!leftName || !rightName || leftName === rightName) {
    throw new Error('Choose one player from each team to swap.');
  }
  const hasStarted = current.rounds.some((round) => (round.matches || []).some((match) => Boolean(normalizeRyderCupResult(match && match.result))));
  if (hasStarted) {
    throw new Error('Ryder Cup teams are locked after results are entered.');
  }
  const sourceTeam = current.teams.find((team) => (team.players || []).some((name) => normalizeNameKey(name) === normalizeNameKey(leftName)));
  const targetTeam = current.teams.find((team) => (team.players || []).some((name) => normalizeNameKey(name) === normalizeNameKey(rightName)));
  if (!sourceTeam || !targetTeam || sourceTeam.id === targetTeam.id) {
    throw new Error('Drag a player onto someone on the opposite team to swap them.');
  }

  const nextState = clonePlain(current);
  nextState.teams = nextState.teams.map((team) => {
    if (team.id === sourceTeam.id) {
      return {
        ...team,
        players: swapPlayerName(team.players, leftName, rightName),
      };
    }
    if (team.id === targetTeam.id) {
      return {
        ...team,
        players: swapPlayerName(team.players, leftName, rightName),
      };
    }
    return team;
  });
  nextState.rounds = nextState.rounds.map((round) => ({
    ...round,
    matches: (round.matches || []).map((match) => ({
      ...match,
      teamAPlayers: swapPlayerName(match.teamAPlayers, leftName, rightName),
      teamBPlayers: swapPlayerName(match.teamBPlayers, leftName, rightName),
    })),
  }));

  assertValidRyderCupTeams(nextState.teams);
  nextState.rounds.forEach((round) => assertValidRyderCupRound(round, nextState.teams));
  return setTripRyderCupState(trip, nextState);
}

function getRyderCupMatchPoints(result, pointValue = 1) {
  const normalized = normalizeRyderCupResult(result);
  const parsedPointValue = asFiniteNumber(pointValue) || 1;
  if (normalized === 'teamA') {
    return { complete: true, pointsA: parsedPointValue, pointsB: 0, resultKey: normalized };
  }
  if (normalized === 'teamB') {
    return { complete: true, pointsA: 0, pointsB: parsedPointValue, resultKey: normalized };
  }
  if (normalized === 'halved') {
    return { complete: true, pointsA: parsedPointValue / 2, pointsB: parsedPointValue / 2, resultKey: normalized };
  }
  return { complete: false, pointsA: 0, pointsB: 0, resultKey: '' };
}

function buildRyderCupFoursomes(rounds = []) {
  const groups = [];
  rounds.forEach((round) => {
    if (isSinglesFormat(round.format)) {
      const byGroup = new Map();
      (round.matches || []).forEach((match) => {
        const groupNumber = asPositiveInteger(match.groupNumber) || 1;
        const existing = byGroup.get(groupNumber) || {
          roundNumber: round.roundNumber,
          roundTitle: round.title,
          roundLabel: round.label,
          format: round.format,
          groupNumber,
          label: `${round.title} - Foursome ${groupNumber}`,
          players: [],
        };
        existing.players = uniqueNames(existing.players.concat(match.teamAPlayers || [], match.teamBPlayers || []));
        byGroup.set(groupNumber, existing);
      });
      groups.push(...Array.from(byGroup.values()));
      return;
    }
    (round.matches || []).forEach((match) => {
      const groupNumber = asPositiveInteger(match.groupNumber) || match.matchNumber || 1;
      groups.push({
        roundNumber: round.roundNumber,
        roundTitle: round.title,
        roundLabel: round.label,
        format: round.format,
        groupNumber,
        label: `${round.title} - Match ${match.matchNumber || groupNumber}`,
        players: uniqueNames([].concat(match.teamAPlayers || [], match.teamBPlayers || [])),
      });
    });
  });
  return groups;
}

function findRyderCupGroupingCoverage(groups = [], players = [], roundNumber = null) {
  const targetKeys = players.map((name) => normalizeNameKey(name)).filter(Boolean);
  return groups.filter((group) => {
    if (roundNumber !== null && Number(group.roundNumber) !== Number(roundNumber)) return false;
    const playerKeys = new Set((group.players || []).map((name) => normalizeNameKey(name)));
    return targetKeys.every((key) => playerKeys.has(key));
  });
}

function buildRyderCupFairness(teams = []) {
  const summary = teams.map((team) => {
    const ranks = (team.players || []).map((name) => MYRTLE_RYDER_CUP_RANK_MAP.get(name)).filter((value) => Number.isFinite(value));
    const rankSum = ranks.reduce((sum, value) => sum + value, 0);
    const averageRank = ranks.length ? rankSum / ranks.length : null;
    const topFiveCount = ranks.filter((rank) => rank <= 5).length;
    const bottomFiveCount = ranks.filter((rank) => rank >= 16).length;
    return {
      teamId: team.id,
      teamName: team.name,
      rankSum,
      averageRank,
      topFiveCount,
      bottomFiveCount,
    };
  });
  const difference = Math.abs((summary[0] && summary[0].rankSum) - (summary[1] && summary[1].rankSum));
  let status = 'Very balanced';
  if (difference > 2) {
    const leadingTeam = summary[0].rankSum < summary[1].rankSum ? summary[0].teamName : summary[1].teamName;
    status = `Slight edge ${leadingTeam}`;
  }
  return {
    teams: summary,
    rankDifference: difference,
    status,
  };
}

function buildRyderCupAdminView(rounds = []) {
  const foursomes = buildRyderCupFoursomes(rounds);
  const finalRoundNumber = rounds.length;
  const hardConstraints = MYRTLE_RYDER_CUP_HARD_CONSTRAINTS.map((constraint) => {
    if (constraint.id === 'final-round-knights') {
      const coverage = findRyderCupGroupingCoverage(foursomes, ['Tommy Knight', 'Tommy Knight Sr'], finalRoundNumber);
      return {
        ...constraint,
        status: coverage.length ? 'met' : 'missing',
        locations: coverage.map((group) => group.label),
      };
    }
    if (constraint.id === 'marcus-not-caleb') {
      const conflicts = findRyderCupGroupingCoverage(foursomes, ['Marcus Ordonez', 'Caleb Hart']);
      return {
        ...constraint,
        status: conflicts.length ? 'violation' : 'clear',
        locations: conflicts.map((group) => group.label),
      };
    }
    if (constraint.id === 'duane-foursome-limits') {
      const restricted = ['Tommy Knight', 'Tommy Knight Sr', 'Reny Butler', 'Matt Shannon'];
      const conflicts = foursomes.filter((group) => {
        const keys = new Set((group.players || []).map((name) => normalizeNameKey(name)));
        return keys.has(normalizeNameKey('Duane Harris'))
          && restricted.some((name) => keys.has(normalizeNameKey(name)));
      });
      return {
        ...constraint,
        status: conflicts.length ? 'violation' : 'clear',
        locations: conflicts.map((group) => group.label),
      };
    }
    if (constraint.id === 'neff-with-jeremy-once') {
      const coverage = findRyderCupGroupingCoverage(foursomes, ['Chris Neff', 'Jeremy Bridges']);
      return {
        ...constraint,
        status: coverage.length ? 'met' : 'missing',
        locations: coverage.map((group) => group.label),
      };
    }
    if (constraint.id === 'neff-not-manuel') {
      const conflicts = findRyderCupGroupingCoverage(foursomes, ['Chris Neff', 'Manuel Ordonez']);
      return {
        ...constraint,
        status: conflicts.length ? 'violation' : 'clear',
        locations: conflicts.map((group) => group.label),
      };
    }
    return {
      ...constraint,
      status: 'clear',
      locations: [],
    };
  });
  const requestedGroupings = MYRTLE_RYDER_CUP_REQUESTED_GROUPINGS.map((grouping) => {
    const coverage = findRyderCupGroupingCoverage(foursomes, grouping.players);
    return {
      ...grouping,
      status: coverage.length ? 'scheduled' : 'not_scheduled',
      locations: coverage.map((group) => group.label),
    };
  });
  return {
    hardConstraints,
    requestedGroupings,
  };
}

function buildRyderCupRoundAndStandingsView(rounds = [], teams = []) {
  let teamAPoints = 0;
  let teamBPoints = 0;
  let remainingPoints = 0;
  let totalPointsAvailable = 0;
  const roundViews = rounds.map((round) => {
    const roundPointValue = asFiniteNumber(round.pointValue) || 1;
    let roundPointsA = 0;
    let roundPointsB = 0;
    let completedMatches = 0;
    const matches = (round.matches || []).map((match) => {
      const points = getRyderCupMatchPoints(match.result, roundPointValue);
      totalPointsAvailable += roundPointValue;
      if (points.complete) {
        roundPointsA += points.pointsA;
        roundPointsB += points.pointsB;
        completedMatches += 1;
      } else {
        remainingPoints += roundPointValue;
      }
      return {
        ...match,
        result: points.resultKey,
        pointsA: points.pointsA,
        pointsB: points.pointsB,
        isComplete: points.complete,
      };
    });
    teamAPoints += roundPointsA;
    teamBPoints += roundPointsB;
    return {
      ...round,
      matches,
      pointsAvailable: (round.matches || []).length * roundPointValue,
      roundPointsA,
      roundPointsB,
      completedMatches,
      runningPointsA: teamAPoints,
      runningPointsB: teamBPoints,
    };
  });
  const leaderTeamId = teamAPoints === teamBPoints ? '' : (teamAPoints > teamBPoints ? 'teamA' : 'teamB');
  const leaderTeam = teams.find((team) => team.id === leaderTeamId) || null;
  const lead = Math.abs(teamAPoints - teamBPoints);
  return {
    rounds: roundViews,
    standings: {
      teamAPoints,
      teamBPoints,
      remainingPoints,
      totalPointsAvailable,
      leaderTeamId,
      leaderTeamName: leaderTeam ? leaderTeam.name : 'Tied',
      clinched: Boolean(leaderTeamId) && lead > remainingPoints,
      status: leaderTeamId
        ? `${leaderTeam.name} leads by ${lead} point${lead === 1 ? '' : 's'}`
        : 'Match is tied',
    },
  };
}

function buildRyderCupIndividualLeaderboard(rounds = [], teams = []) {
  const teamLookup = buildRyderCupTeamLookup(teams);
  const rowsByName = new Map(buildRyderCupPlayerRows().map((player) => [normalizeNameKey(player.name), {
    name: player.name,
    rank: player.rank,
    teamId: teamLookup.get(normalizeNameKey(player.name)) ? teamLookup.get(normalizeNameKey(player.name)).teamId : '',
    teamName: teamLookup.get(normalizeNameKey(player.name)) ? teamLookup.get(normalizeNameKey(player.name)).teamName : '',
    matchesPlayed: 0,
    pointsWon: 0,
    wins: 0,
    losses: 0,
    halves: 0,
  }]));
  rounds.forEach((round) => {
    const pointValue = asFiniteNumber(round.pointValue) || 1;
    (round.matches || []).forEach((match) => {
      const points = getRyderCupMatchPoints(match.result, pointValue);
      if (!points.complete) return;
      const teamAPlayers = match.teamAPlayers || [];
      const teamBPlayers = match.teamBPlayers || [];
      teamAPlayers.forEach((name) => {
        const entry = rowsByName.get(normalizeNameKey(name));
        if (!entry) return;
        entry.matchesPlayed += 1;
        entry.pointsWon += points.pointsA;
        if (points.resultKey === 'teamA') entry.wins += 1;
        else if (points.resultKey === 'teamB') entry.losses += 1;
        else entry.halves += 1;
      });
      teamBPlayers.forEach((name) => {
        const entry = rowsByName.get(normalizeNameKey(name));
        if (!entry) return;
        entry.matchesPlayed += 1;
        entry.pointsWon += points.pointsB;
        if (points.resultKey === 'teamB') entry.wins += 1;
        else if (points.resultKey === 'teamA') entry.losses += 1;
        else entry.halves += 1;
      });
    });
  });
  const sorted = Array.from(rowsByName.values()).sort((left, right) => {
    if (right.pointsWon !== left.pointsWon) return right.pointsWon - left.pointsWon;
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.name.localeCompare(right.name);
  });
  return sorted.map((entry, index, list) => {
    const previous = list[index - 1];
    const sameAsPrevious = previous
      && previous.pointsWon === entry.pointsWon
      && previous.wins === entry.wins
      && previous.rank === entry.rank;
    return {
      ...entry,
      position: sameAsPrevious ? previous.position : index + 1,
      record: `${entry.wins}-${entry.losses}-${entry.halves}`,
    };
  });
}

function buildRyderCupSideGamesView(sideGames = {}, individualLeaderboard = []) {
  const closestEntries = sideGames && sideGames.closestToPin && Array.isArray(sideGames.closestToPin.entries)
    ? sideGames.closestToPin.entries
    : [];
  const closestToPinWinners = uniqueNames(closestEntries.map((entry) => entry.playerName).filter(Boolean));
  const birdieCounts = sideGames && sideGames.birdiePool && Array.isArray(sideGames.birdiePool.counts)
    ? sideGames.birdiePool.counts
    : [];
  const birdieLeaderboard = birdieCounts
    .map((entry) => ({
      playerName: normalizeRyderCupPlayerName(entry && entry.playerName),
      count: Math.max(0, Math.round(asFiniteNumber(entry && entry.count) || 0)),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.playerName.localeCompare(right.playerName);
    });
  const highestBirdieCount = birdieLeaderboard.length ? birdieLeaderboard[0].count : 0;
  const birdieWinners = normalizeRyderCupWinnerList(sideGames && sideGames.birdiePool && sideGames.birdiePool.winners).length
    ? normalizeRyderCupWinnerList(sideGames && sideGames.birdiePool && sideGames.birdiePool.winners)
    : (highestBirdieCount > 0
      ? birdieLeaderboard.filter((entry) => entry.count === highestBirdieCount).map((entry) => entry.playerName)
      : []);
  const overrideMvpWinners = normalizeRyderCupWinnerList(sideGames && sideGames.mvp && sideGames.mvp.overrideWinners);
  const highestPoints = individualLeaderboard.length ? individualLeaderboard[0].pointsWon : 0;
  const automaticMvpWinners = highestPoints > 0
    ? individualLeaderboard.filter((entry) => entry.pointsWon === highestPoints).map((entry) => entry.name)
    : [];
  return {
    dailyLowGross: Array.isArray(sideGames && sideGames.dailyLowGross) ? sideGames.dailyLowGross : [],
    weeklyLowGross: sideGames && sideGames.weeklyLowGross ? sideGames.weeklyLowGross : { winnerName: '', amount: null, notes: '' },
    closestToPin: {
      entries: closestEntries,
      winners: closestToPinWinners,
    },
    birdiePool: {
      counts: birdieLeaderboard,
      winners: birdieWinners,
      amount: sideGames && sideGames.birdiePool ? sideGames.birdiePool.amount : null,
      notes: sideGames && sideGames.birdiePool ? sideGames.birdiePool.notes : '',
    },
    mvp: {
      winners: overrideMvpWinners.length ? overrideMvpWinners : automaticMvpWinners,
      amount: sideGames && sideGames.mvp ? sideGames.mvp.amount : null,
      notes: sideGames && sideGames.mvp ? sideGames.mvp.notes : '',
      manualOverride: overrideMvpWinners.length > 0,
    },
  };
}

function roundCurrency(value) {
  const parsed = asFiniteNumber(value);
  if (parsed === null) return 0;
  return Math.round(parsed * 100) / 100;
}

function buildRyderCupPayoutView(payout = {}, standings = {}, sideGames = {}, teams = []) {
  const totalPot = roundCurrency(payout.totalPot);
  const allocation = payout.allocationPercentages || {};
  const teamAmount = roundCurrency(totalPot * ((asFiniteNumber(allocation.winningTeam) || 0) / 100));
  const weeklyAmount = roundCurrency(totalPot * ((asFiniteNumber(allocation.weeklyLowGross) || 0) / 100));
  const birdieAmount = roundCurrency(totalPot * ((asFiniteNumber(allocation.birdiePool) || 0) / 100));
  const closestAmount = roundCurrency(totalPot * ((asFiniteNumber(allocation.closestToPin) || 0) / 100));
  const mvpAmount = roundCurrency(totalPot * ((asFiniteNumber(allocation.mvp) || 0) / 100));

  const teamRows = [];
  if (standings.remainingPoints > 0 && standings.teamAPoints === standings.teamBPoints) {
    teamRows.push({
      key: 'winningTeam',
      label: 'Winning Team',
      amount: teamAmount,
      winners: [],
      winnerLabel: 'Pending Ryder Cup result',
      perPerson: null,
    });
  } else if (standings.teamAPoints === standings.teamBPoints) {
    const allWinners = uniqueNames([].concat(teams[0] && teams[0].players ? teams[0].players : [], teams[1] && teams[1].players ? teams[1].players : []));
    teamRows.push({
      key: 'winningTeam',
      label: 'Winning Team',
      amount: teamAmount,
      winners: allWinners,
      winnerLabel: `${teams[0] ? teams[0].name : 'Team A'} and ${teams[1] ? teams[1].name : 'Team B'} split the tie`,
      perPerson: allWinners.length ? roundCurrency(teamAmount / allWinners.length) : null,
    });
  } else {
    const winningTeam = standings.teamAPoints > standings.teamBPoints ? teams[0] : teams[1];
    const winners = winningTeam && Array.isArray(winningTeam.players) ? winningTeam.players.slice() : [];
    teamRows.push({
      key: 'winningTeam',
      label: 'Winning Team',
      amount: teamAmount,
      winners,
      winnerLabel: winningTeam ? winningTeam.name : 'Winning Team',
      perPerson: winners.length ? roundCurrency(teamAmount / winners.length) : null,
    });
  }

  const categoryRows = teamRows.concat([
    {
      key: 'weeklyLowGross',
      label: 'Weekly Low Gross',
      amount: weeklyAmount,
      winners: sideGames.weeklyLowGross && sideGames.weeklyLowGross.winnerName ? [sideGames.weeklyLowGross.winnerName] : [],
      winnerLabel: sideGames.weeklyLowGross && sideGames.weeklyLowGross.winnerName ? sideGames.weeklyLowGross.winnerName : 'Pending',
      perPerson: sideGames.weeklyLowGross && sideGames.weeklyLowGross.winnerName ? weeklyAmount : null,
    },
    {
      key: 'birdiePool',
      label: 'Birdie Pool',
      amount: birdieAmount,
      winners: sideGames.birdiePool && Array.isArray(sideGames.birdiePool.winners) ? sideGames.birdiePool.winners : [],
      winnerLabel: sideGames.birdiePool && sideGames.birdiePool.winners && sideGames.birdiePool.winners.length ? sideGames.birdiePool.winners.join(', ') : 'Pending',
      perPerson: sideGames.birdiePool && sideGames.birdiePool.winners && sideGames.birdiePool.winners.length
        ? roundCurrency(birdieAmount / sideGames.birdiePool.winners.length)
        : null,
    },
    {
      key: 'closestToPin',
      label: 'Closest to Pin',
      amount: closestAmount,
      winners: sideGames.closestToPin && Array.isArray(sideGames.closestToPin.winners) ? sideGames.closestToPin.winners : [],
      winnerLabel: sideGames.closestToPin && sideGames.closestToPin.winners && sideGames.closestToPin.winners.length ? sideGames.closestToPin.winners.join(', ') : 'Pending',
      perPerson: sideGames.closestToPin && sideGames.closestToPin.winners && sideGames.closestToPin.winners.length
        ? roundCurrency(closestAmount / sideGames.closestToPin.winners.length)
        : null,
    },
    {
      key: 'mvp',
      label: 'Ryder Cup MVP',
      amount: mvpAmount,
      winners: sideGames.mvp && Array.isArray(sideGames.mvp.winners) ? sideGames.mvp.winners : [],
      winnerLabel: sideGames.mvp && sideGames.mvp.winners && sideGames.mvp.winners.length ? sideGames.mvp.winners.join(', ') : 'Pending',
      perPerson: sideGames.mvp && sideGames.mvp.winners && sideGames.mvp.winners.length
        ? roundCurrency(mvpAmount / sideGames.mvp.winners.length)
        : null,
    },
  ]);

  return {
    totalPot,
    allocationPercentages: allocation,
    rows: categoryRows,
  };
}

function buildRyderCupView(state = null) {
  if (!state) return null;
  const fairness = buildRyderCupFairness(state.teams || []);
  const roundBundle = buildRyderCupRoundAndStandingsView(state.rounds || [], state.teams || []);
  const individualLeaderboard = buildRyderCupIndividualLeaderboard(state.rounds || [], state.teams || []);
  const sideGames = buildRyderCupSideGamesView(state.sideGames || {}, individualLeaderboard);
  const payout = buildRyderCupPayoutView(state.payout || {}, roundBundle.standings || {}, sideGames, state.teams || []);
  const hasStarted = (state.rounds || []).some((round) => (round.matches || []).some((match) => Boolean(normalizeRyderCupResult(match && match.result))));
  const fairnessByTeam = new Map((fairness.teams || []).map((team) => [team.teamId, team]));
  const teams = (state.teams || []).map((team) => {
    const summary = fairnessByTeam.get(team.id) || {};
    return {
      id: team.id,
      name: team.name,
      players: (team.players || [])
        .map((name) => ({
          name,
          rank: MYRTLE_RYDER_CUP_RANK_MAP.get(name) || null,
        }))
        .sort((left, right) => {
          if (left.rank !== right.rank) return left.rank - right.rank;
          return left.name.localeCompare(right.name);
        }),
      rankSum: summary.rankSum || 0,
      averageRank: summary.averageRank || null,
      topFiveCount: summary.topFiveCount || 0,
      bottomFiveCount: summary.bottomFiveCount || 0,
      currentPoints: team.id === 'teamA' ? roundBundle.standings.teamAPoints : roundBundle.standings.teamBPoints,
      balanceNote: fairness.status,
    };
  });
  const admin = buildRyderCupAdminView(roundBundle.rounds || []);
  return {
    title: state.title,
    totalPointsAvailable: roundBundle.standings.totalPointsAvailable,
    hasStarted,
    canEditTeams: !hasStarted,
    teams,
    fairness: {
      ...fairness,
      teamA: fairnessByTeam.get('teamA') || null,
      teamB: fairnessByTeam.get('teamB') || null,
    },
    rounds: roundBundle.rounds,
    standings: roundBundle.standings,
    individualLeaderboard,
    sideGames,
    payout,
    admin: {
      ...admin,
      notes: Array.isArray(state.adminNotes && state.adminNotes.notes) ? state.adminNotes.notes : [],
    },
  };
}

function buildTripCompetitionView(trip = {}, participants = []) {
  const playerPool = getCompetitionPlayerPool(trip, participants);
  const scoringMode = normalizeScoringMode(trip && trip.competition && trip.competition.scoringMode);
  const rounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  const ryderCupState = getTripRyderCupState(trip);

  const roundViews = rounds.map((round, roundIndex) => {
    const roundPlayers = uniqueNames(getRoundPlayerNames(round));
    const playerScores = roundPlayers.map((name) => {
      const player = playerPool.find((entry) => normalizeNameKey(entry.name) === normalizeNameKey(name));
      const roundScore = calculatePlayerRound(round, name, player && player.handicapIndex);
      return {
        playerName: name,
        handicapIndex: player ? asFiniteNumber(player.handicapIndex) : null,
        holes: roundScore.holes,
        strokeAdjustments: roundScore.holeResults.map((result) => result.strokeAdjustment),
        netHoles: roundScore.holeResults.map((result) => result.net),
        stablefordPointsByHole: roundScore.holeResults.map((result) => result.points),
        playingHandicap: roundScore.playingHandicap,
        stablefordTotal: roundScore.stablefordTotal,
        grossTotal: roundScore.grossTotal,
        netTotal: roundScore.netTotal,
        completedHoles: roundScore.completedHoles,
        isComplete: roundScore.isComplete,
      };
    });

    const scoreLookup = new Map(playerScores.map((entry) => [normalizeNameKey(entry.playerName), entry]));
    const matches = (round.teeTimes || []).map((slot, slotIndex) => calculateRoundMatch(round, slot, slotIndex, playerPool));

    return {
      roundIndex,
      course: cleanString(round && round.course) || `Round ${roundIndex + 1}`,
      date: round && round.date ? new Date(round.date).toISOString() : null,
      time: cleanString(round && round.time),
      scorecard: normalizeScorecard(round && round.scorecard, round && round.course),
      teeTimes: Array.isArray(round && round.teeTimes) ? round.teeTimes.map((slot, slotIndex) => ({
        slotIndex,
        label: cleanString(slot && slot.label) || `TT#${slotIndex + 1}`,
        time: cleanString(slot && slot.time),
        players: uniqueNames(slot && slot.players ? slot.players : []),
      })) : [],
      playerScores,
      playerScoreLookup: scoreLookup,
      matches,
      ctpWinners: normalizeCtpWinners(round && round.ctpWinners),
      skinsResults: normalizeSkinsResults(round && round.skinsResults),
      unassignedPlayers: uniqueNames(round && round.unassignedPlayers),
    };
  });

  const leaderboard = playerPool
    .map((player) => {
      const roundResults = roundViews.map((round) => {
        const score = round.playerScoreLookup.get(normalizeNameKey(player.name));
        return {
          stablefordTotal: score ? score.stablefordTotal : null,
          completedHoles: score ? score.completedHoles : 0,
          isComplete: score ? score.isComplete : false,
        };
      });
      const counted = computeCountedRounds(roundResults, scoringMode);
      return {
        participantId: player.participantId,
        name: player.name,
        handicapIndex: asFiniteNumber(player.handicapIndex),
        roundStablefordTotals: roundResults.map((round) => round.stablefordTotal),
        roundIsComplete: roundResults.map((round) => round.isComplete),
        roundCompletedHoles: roundResults.map((round) => round.completedHoles),
        countedFlags: counted.countedFlags,
        countedTotal: counted.countedTotal,
      };
    })
    .sort((left, right) => {
      const leftTotal = Number.isFinite(left.countedTotal) ? left.countedTotal : -Infinity;
      const rightTotal = Number.isFinite(right.countedTotal) ? right.countedTotal : -Infinity;
      if (rightTotal !== leftTotal) return rightTotal - leftTotal;
      const leftBest = Math.max(...left.roundStablefordTotals.map((value) => (Number.isFinite(value) ? value : -Infinity)));
      const rightBest = Math.max(...right.roundStablefordTotals.map((value) => (Number.isFinite(value) ? value : -Infinity)));
      if (rightBest !== leftBest) return rightBest - leftBest;
      return left.name.localeCompare(right.name);
    })
    .map((entry, index, list) => {
      const previous = list[index - 1];
      const sameAsPrevious = previous
        && previous.countedTotal === entry.countedTotal
        && previous.name !== entry.name;
      return {
        ...entry,
        position: sameAsPrevious ? previous.position : index + 1,
      };
    });

  const ryderCup = buildRyderCupView(ryderCupState);

  return {
    overview: {
      scoringMode,
      scoringModeLabel: getScoringModeLabel(scoringMode),
      playerCount: playerPool.length,
      roundCount: roundViews.length,
      formatSummary: 'Individual net Stableford across the trip, with daily 2-man net best ball matches inside each foursome.',
      sideGamesSummary: 'Optional Closest to Pin and skins results are tracked separately from the main competition.',
    },
    buckets: buildHandicapBuckets(playerPool, trip && trip.competition && trip.competition.handicapBuckets),
    leaderboard,
    dailyMatches: roundViews.map((round) => ({
      roundIndex: round.roundIndex,
      course: round.course,
      date: round.date,
      time: round.time,
      matches: round.matches,
    })),
    dailyPointsLeaderboard: buildDailyPointsLeaderboard(roundViews, playerPool),
    sideGames: roundViews.map((round) => ({
      roundIndex: round.roundIndex,
      course: round.course,
      date: round.date,
      ctpWinners: round.ctpWinners,
      skinsResults: round.skinsResults,
    })),
    rounds: roundViews.map((round) => ({
      roundIndex: round.roundIndex,
      course: round.course,
      date: round.date,
      time: round.time,
      scorecard: round.scorecard,
      teeTimes: round.teeTimes,
      playerScores: round.playerScores,
      matches: round.matches,
      ctpWinners: round.ctpWinners,
      skinsResults: round.skinsResults,
      unassignedPlayers: round.unassignedPlayers,
    })),
    admin: {
      handicapPlayers: playerPool
        .filter((player) => player.participantId)
        .map((player) => ({
          participantId: player.participantId,
          name: player.name,
          handicapIndex: asFiniteNumber(player.handicapIndex),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    },
    ryderCup,
  };
}

function getRoundAtIndex(trip = {}, roundIndex) {
  const index = Number(roundIndex);
  const rounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  if (!Number.isInteger(index) || index < 0 || index >= rounds.length) {
    throw new Error('Round not found.');
  }
  return rounds[index];
}

function setTripScoringMode(trip = {}, scoringMode) {
  const nextMode = normalizeScoringMode(scoringMode);
  if (!trip.competition) trip.competition = {};
  trip.competition.scoringMode = nextMode;
  return nextMode;
}

function setTripHandicapBuckets(trip = {}, participants = [], buckets = []) {
  const playerPool = getCompetitionPlayerPool(trip, participants);
  const allowedByName = new Map(playerPool.map((player) => [normalizeNameKey(player.name), player.name]));
  const sourceBuckets = Array.isArray(buckets) ? buckets : [];
  const normalizedBuckets = DEFAULT_HANDICAP_BUCKET_LABELS.map((fallbackLabel, index) => {
    const rawBucket = sourceBuckets[index];
    const label = cleanString(rawBucket && rawBucket.label) || fallbackLabel;
    const rawPlayers = Array.isArray(rawBucket && rawBucket.players) ? rawBucket.players : [];
    return { label, players: uniqueNames(rawPlayers) };
  });

  const assigned = new Set();
  normalizedBuckets.forEach((bucket) => {
    bucket.players = bucket.players.reduce((list, rawName) => {
      const key = normalizeNameKey(rawName);
      if (!key || assigned.has(key) || !allowedByName.has(key)) return list;
      assigned.add(key);
      list.push(allowedByName.get(key));
      return list;
    }, []);
  });

  for (const player of playerPool) {
    const key = normalizeNameKey(player.name);
    if (assigned.has(key)) continue;
    assigned.add(key);
    let targetBucket = normalizedBuckets[0];
    for (const bucket of normalizedBuckets) {
      if (bucket.players.length < targetBucket.players.length) targetBucket = bucket;
    }
    targetBucket.players.push(player.name);
  }

  if (!trip.competition) trip.competition = {};
  trip.competition.handicapBuckets = normalizedBuckets;
  return normalizedBuckets;
}

function setRoundPlayerScores(trip = {}, roundIndex, playerName = '', holes = []) {
  const round = getRoundAtIndex(trip, roundIndex);
  const cleanName = cleanString(playerName);
  if (!cleanName) throw new Error('playerName required');
  const normalizedHoles = compactHoleScores(holes);
  if (!Array.isArray(round.playerScores)) round.playerScores = [];
  const targetKey = normalizeNameKey(cleanName);
  const existingIndex = round.playerScores.findIndex((entry) => normalizeNameKey(entry && entry.playerName) === targetKey);
  const hasAnyScores = normalizedHoles.some((value) => value !== null);

  if (!hasAnyScores) {
    if (existingIndex >= 0) round.playerScores.splice(existingIndex, 1);
    return null;
  }

  const payload = { playerName: cleanName, holes: normalizedHoles };
  if (existingIndex >= 0) round.playerScores[existingIndex] = payload;
  else round.playerScores.push(payload);
  return payload;
}

function setRoundMatchTeams(trip = {}, roundIndex, slotIndex, teamA = [], teamB = []) {
  const round = getRoundAtIndex(trip, roundIndex);
  const slots = Array.isArray(round.teeTimes) ? round.teeTimes : [];
  const index = Number(slotIndex);
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    throw new Error('Tee time not found.');
  }
  const slotPlayers = uniqueNames(slots[index] && slots[index].players ? slots[index].players : []);
  if (slotPlayers.length !== 4) {
    throw new Error('Team matches require a four-player tee time.');
  }
  const normalizedTeamA = normalizeTeamSelection(teamA, slotPlayers);
  const normalizedTeamB = normalizeTeamSelection(teamB, slotPlayers);
  const combined = uniqueNames(normalizedTeamA.concat(normalizedTeamB));
  if (normalizedTeamA.length !== 2 || normalizedTeamB.length !== 2 || combined.length !== 4) {
    throw new Error('Select exactly two players for Team A and two players for Team B.');
  }
  if (!Array.isArray(round.teamMatches)) round.teamMatches = [];
  const existingIndex = round.teamMatches.findIndex((entry) => Number(entry && entry.slotIndex) === index);
  const payload = { slotIndex: index, teamA: normalizedTeamA, teamB: normalizedTeamB };
  if (existingIndex >= 0) round.teamMatches[existingIndex] = payload;
  else round.teamMatches.push(payload);
  return payload;
}

function setRoundSideGames(trip = {}, roundIndex, payload = {}) {
  const round = getRoundAtIndex(trip, roundIndex);
  if (Object.prototype.hasOwnProperty.call(payload, 'ctpWinners')) {
    round.ctpWinners = normalizeCtpWinners(payload.ctpWinners);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'skinsResults')) {
    round.skinsResults = normalizeSkinsResults(payload.skinsResults);
  }
  return round;
}

module.exports = {
  SCORING_MODE_BEST4,
  SCORING_MODE_ALL5,
  SCORING_MODE_FIRST4,
  SCORING_MODE_LAST4,
  DEFAULT_SCORING_MODE,
  buildTripCompetitionView,
  calculatePlayerRound,
  computeCountedRounds,
  getDefaultScorecard,
  getHoleStrokeAdjustment,
  normalizeScoringMode,
  setRoundMatchTeams,
  setRoundPlayerScores,
  setRoundSideGames,
  setTripRyderCupRound,
  setTripRyderCupSettings,
  setTripRyderCupTeams,
  swapTripRyderCupTeamPlayers,
  setTripHandicapBuckets,
  setTripScoringMode,
  stablefordPointsForNetDiff,
};
