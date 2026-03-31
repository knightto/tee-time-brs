const {
  MYRTLE_LEGACY_TEE_SHEET_GROUPS,
  MYRTLE_RYDER_CUP_PLAYERS,
  MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
  MYRTLE_RYDER_CUP_DESCRIPTION,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION,
  MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY,
  MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_FOUR_BALL_FORMAT,
  MYRTLE_RYDER_CUP_THREE_BALL_FORMAT,
  MYRTLE_RYDER_CUP_BEST_BALL_FORMAT,
  MYRTLE_RYDER_CUP_STABLEFORD_FORMAT,
  RYDER_CUP_MIN_PLAYER_COUNT,
  buildMyrtleRyderCupTeeSheetGroups,
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
const ALLOWED_RYDER_CUP_PLAN_STYLES = new Set([
  MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT,
  MYRTLE_RYDER_CUP_FOUR_BALL_FORMAT,
  MYRTLE_RYDER_CUP_THREE_BALL_FORMAT,
  MYRTLE_RYDER_CUP_BEST_BALL_FORMAT,
  MYRTLE_RYDER_CUP_STABLEFORD_FORMAT,
]);
const MYRTLE_CANONICAL_TEE_SHEET_GROUPS = buildMyrtleRyderCupTeeSheetGroups();

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

function buildRyderCupPlayerRows(players = []) {
  const source = Array.isArray(players) && players.length ? players : MYRTLE_RYDER_CUP_PLAYERS;
  const normalized = source.map((player, index) => ({
    name: normalizeRyderCupPlayerName(player && player.name),
    rank: asPositiveInteger(player && player.rank) || (index + 1),
    handicapIndex: asFiniteNumber(player && player.handicapIndex),
  }));
  if (normalized.length < RYDER_CUP_MIN_PLAYER_COUNT || normalized.length % 4 !== 0) {
    return MYRTLE_RYDER_CUP_PLAYERS.map((player) => ({ ...player }));
  }
  const nameKeys = new Set();
  const ranks = new Set();
  for (const player of normalized) {
    const nameKey = normalizeNameKey(player.name);
    if (!player.name || nameKeys.has(nameKey) || ranks.has(player.rank)) {
      return MYRTLE_RYDER_CUP_PLAYERS.map((defaultPlayer) => ({ ...defaultPlayer }));
    }
    nameKeys.add(nameKey);
    ranks.add(player.rank);
  }
  return normalized;
}

function buildRyderCupPlayerMaps(players = []) {
  const rows = buildRyderCupPlayerRows(players);
  const playerNames = rows.map((player) => player.name);
  const nameMap = new Map(playerNames.map((name) => [normalizeNameKey(name), name]));
  const rankMap = new Map(rows.map((player) => [player.name, player.rank]));
  const nameByRank = new Map(rows.map((player) => [player.rank, player.name]));
  const handicapMap = new Map(
    rows
      .filter((player) => asFiniteNumber(player && player.handicapIndex) !== null)
      .map((player) => [normalizeNameKey(player.name), asFiniteNumber(player.handicapIndex)])
  );
  return {
    rows,
    playerNames,
    nameMap,
    rankMap,
    nameByRank,
    handicapMap,
  };
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
  const rawState = trip && trip.competition && trip.competition.ryderCup && typeof trip.competition.ryderCup === 'object'
    ? trip.competition.ryderCup
    : {};
  const rawTeams = Array.isArray(rawState.teams) ? rawState.teams : [];
  return buildDefaultMyrtleRyderCup(Array.isArray(trip && trip.rounds) ? trip.rounds : [], {
    players: Array.isArray(rawState.players) && rawState.players.length ? rawState.players : MYRTLE_RYDER_CUP_PLAYERS,
    title: cleanString(rawState.title) || 'Myrtle Ryder Cup',
    teamAName: cleanString(rawTeams[0] && rawTeams[0].name) || 'Team A',
    teamBName: cleanString(rawTeams[1] && rawTeams[1].name) || 'Team B',
  });
}

function normalizeRyderCupWinnerList(values = []) {
  return uniqueNames(Array.isArray(values) ? values : [values]);
}

function normalizeRyderCupContributionState(value = '') {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === 'noshow' || normalized === 'no show' || normalized === 'no-show') return 'noShow';
  if (normalized === 'nocontribution' || normalized === 'no contribution' || normalized === 'no-contribution') return 'noShow';
  return '';
}

function splitRyderCupPlayerListText(value = '') {
  return uniqueNames(cleanString(value)
    .split(/[;,]/)
    .map((entry) => cleanString(entry))
    .filter(Boolean));
}

function parseRyderCupNoContributionPlayers(notes = '') {
  const text = cleanString(notes);
  if (!text) return [];
  const patterns = [
    /(?:^|\n)\s*(?:no\s*show|no-show|no\s*contribution|no-contribution|exclude(?:d)?\s+from\s+contribution)s?\s*[:\-]\s*([^\n]+)/ig,
  ];
  const players = [];
  patterns.forEach((pattern) => {
    let match = pattern.exec(text);
    while (match) {
      players.push(...splitRyderCupPlayerListText(match[1]));
      match = pattern.exec(text);
    }
  });
  return uniqueNames(players).map(normalizeRyderCupPlayerName).filter(Boolean);
}

function normalizeRyderCupTeamSplitWinners(entry = {}) {
  const teamAWinnerNames = normalizeRyderCupWinnerList(entry && (entry.teamAWinnerNames || entry.teamAWinnerName))
    .map(normalizeRyderCupPlayerName)
    .filter(Boolean);
  const teamBWinnerNames = normalizeRyderCupWinnerList(entry && (entry.teamBWinnerNames || entry.teamBWinnerName))
    .map(normalizeRyderCupPlayerName)
    .filter(Boolean);
  const winnerNames = normalizeRyderCupWinnerList([]
    .concat(teamAWinnerNames)
    .concat(teamBWinnerNames)
    .concat(entry && (entry.winnerNames || entry.winnerName || [])))
    .map(normalizeRyderCupPlayerName)
    .filter(Boolean);
  return {
    winnerNames,
    teamAWinnerNames,
    teamBWinnerNames,
  };
}

function normalizeCurrencyAmount(value) {
  const parsed = asFiniteNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeCurrencyAmountToIncrement(value, increment = 5) {
  const parsed = normalizeCurrencyAmount(value);
  const step = asFiniteNumber(increment);
  if (parsed === null) return null;
  if (step === null || step <= 0) return parsed;
  return normalizeCurrencyAmount(Math.round(parsed / step) * step);
}

function normalizeRyderCupPlayerName(value) {
  const key = normalizeNameKey(value);
  return MYRTLE_RYDER_CUP_NAME_MAP.get(key) || cleanString(value);
}

function buildPlayerHandicapLookup(players = []) {
  const lookup = new Map();
  (players || []).forEach((player) => {
    const name = normalizeRyderCupPlayerName(player && player.name);
    const handicapIndex = asFiniteNumber(player && player.handicapIndex);
    if (!name || handicapIndex === null) return;
    lookup.set(normalizeNameKey(name), handicapIndex);
  });
  return lookup;
}

function resolveOverlayPlayerName(player = {}, playerRows = []) {
  const rank = asPositiveInteger(player && player.seedRank);
  const { nameByRank } = buildRyderCupPlayerMaps(playerRows);
  if (rank && nameByRank.has(rank)) return nameByRank.get(rank);
  return normalizeRyderCupPlayerName(typeof player === 'string' ? player : (player && player.name));
}

function buildTripRyderCupHandicapLookup(trip = {}) {
  const overlay = trip && trip.ryderCup && typeof trip.ryderCup === 'object' ? trip.ryderCup : {};
  const rawCompetitionState = trip && trip.competition && trip.competition.ryderCup && typeof trip.competition.ryderCup === 'object'
    ? trip.competition.ryderCup
    : {};
  const playerRows = buildRyderCupPlayerRows(rawCompetitionState.players);
  const players = [].concat(overlay.teamAPlayers || [], overlay.teamBPlayers || []);
  return buildPlayerHandicapLookup(players.map((player) => ({
    name: resolveOverlayPlayerName(player, playerRows),
    handicapIndex: player && player.handicapIndex,
  })));
}

function getHandicapFromLookup(playerName = '', handicapLookup = null) {
  if (!(handicapLookup instanceof Map) || !handicapLookup.size) return null;
  const canonicalName = normalizeRyderCupPlayerName(playerName);
  const handicapIndex = handicapLookup.get(normalizeNameKey(canonicalName));
  return handicapIndex === undefined ? null : asFiniteNumber(handicapIndex);
}

function getMyrtleRyderCupHandicapIndex(playerName = '', playerRows = [], fallbackHandicap = null) {
  const normalizedFallback = asFiniteNumber(fallbackHandicap);
  const canonicalName = normalizeRyderCupPlayerName(playerName);
  const { handicapMap } = buildRyderCupPlayerMaps(playerRows);
  const mappedHandicap = handicapMap.get(normalizeNameKey(canonicalName));
  return mappedHandicap !== undefined ? mappedHandicap : normalizedFallback;
}

function resolveMyrtleRyderCupHandicapIndex(playerName = '', handicapLookup = null, playerRows = [], fallbackHandicap = null) {
  const overriddenHandicap = getHandicapFromLookup(playerName, handicapLookup);
  if (overriddenHandicap !== null) return overriddenHandicap;
  return getMyrtleRyderCupHandicapIndex(playerName, playerRows, fallbackHandicap);
}

function resolveMyrtleRyderCupMatchAllowance(playerName = '', handicapLookup = null, playerRows = [], fallbackHandicap = null) {
  const handicapIndex = resolveMyrtleRyderCupHandicapIndex(playerName, handicapLookup, playerRows, fallbackHandicap);
  if (!Number.isFinite(handicapIndex)) return 0;
  return Math.round(handicapIndex);
}

function normalizeMyrtleRyderCupTopLevelDescription(value = '') {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'team competition with every player playing their own ball in every round.') {
    return MYRTLE_RYDER_CUP_DESCRIPTION;
  }
  return cleanString(value);
}

function normalizeMyrtleRyderCupRoundDescription(value = '', roundFormat = '') {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'fixed ryder cup teams stay intact, every golfer posts one gross total for the day, and the lower combined gross side wins the point.') {
    return MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION;
  }
  if (normalized === 'singles are grouped to preserve the hard foursome rules, each golfer posts one gross total for the day, and the lower gross score wins the point.') {
    return MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION;
  }
  if (normalized.includes('75% handicap') || normalized.includes('75% handicaps')) {
    return isSinglesFormat(roundFormat)
      ? MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION
      : MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION;
  }
  if (isSinglesFormat(roundFormat) && normalized.includes('gross score wins the point')) {
    return MYRTLE_RYDER_CUP_SINGLES_MATCH_DESCRIPTION;
  }
  if (!isSinglesFormat(roundFormat) && normalized.includes('gross side wins the point')) {
    return MYRTLE_RYDER_CUP_TEAM_MATCH_DESCRIPTION;
  }
  return cleanString(value);
}

function normalizeMyrtleRyderCupEntrySummary(value = '', roundFormat = '') {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'enter one gross 18-hole total for every golfer. gross team totals and match winners are calculated automatically.') {
    return MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY;
  }
  if (normalized === 'enter one gross 18-hole total for each player. gross scores and winners are calculated automatically.') {
    return MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY;
  }
  if (normalized.includes('75% handicap allowance') || normalized.includes('75% handicap allowances')) {
    return isSinglesFormat(roundFormat)
      ? MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY
      : MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY;
  }
  if (isSinglesFormat(roundFormat) && normalized.includes('gross scores and winners are calculated automatically')) {
    return MYRTLE_RYDER_CUP_SINGLES_MATCH_ENTRY_SUMMARY;
  }
  if (!isSinglesFormat(roundFormat) && normalized.includes('gross team totals and match winners are calculated automatically')) {
    return MYRTLE_RYDER_CUP_TEAM_MATCH_ENTRY_SUMMARY;
  }
  return cleanString(value);
}

function normalizeMyrtleRyderCupAdminNote(value = '') {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'every ryder cup match now uses the same daily gross-total scoring model so the trip admin only enters one gross score per golfer each day.') {
    return 'Every Ryder Cup match now uses one gross score per golfer, then applies full handicap strokes automatically before awarding the point.';
  }
  if (normalized === 'with no handicap layer in the ryder cup, side games can stay gross all week as well.') {
    return 'The Ryder Cup now uses full handicaps, while the side games can still stay gross all week.';
  }
  if (normalized.includes('75% handicap allowance') || normalized.includes('75% handicap allowances')) {
    if (normalized.includes('side games')) return 'The Ryder Cup now uses full handicaps, while the side games can still stay gross all week.';
    return 'Every Ryder Cup match now uses one gross score per golfer, then applies full handicap strokes automatically before awarding the point.';
  }
  return cleanString(value);
}

function normalizeMyrtleRyderCupSideGameNote(value = '') {
  const note = cleanString(value);
  const normalized = note.toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('75% allowance') || normalized.includes('75% handicap')) {
    return 'Auto winner uses the best net round from the saved gross totals and full handicap strokes.';
  }
  return note;
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

function areValidRyderCupTeams(teams = [], players = []) {
  if (!Array.isArray(teams) || teams.length !== 2) return false;
  const playerRows = buildRyderCupPlayerRows(players);
  const allowedPlayers = playerRows.map((player) => player.name);
  const allPlayers = [];
  for (const team of teams) {
    if (!team || !Array.isArray(team.players) || team.players.length !== teams[0].players.length) return false;
    allPlayers.push(...team.players);
  }
  if (allPlayers.length < RYDER_CUP_MIN_PLAYER_COUNT || allPlayers.length % 4 !== 0 || allPlayers.length !== allowedPlayers.length) return false;
  if ((teams[0].players.length || 0) < (RYDER_CUP_MIN_PLAYER_COUNT / 2) || teams[0].players.length % 2 !== 0) return false;
  const uniqueTeamPlayers = uniqueNames(allPlayers);
  if (uniqueTeamPlayers.length !== allowedPlayers.length) return false;
  const allowedMap = new Map(allowedPlayers.map((name) => [normalizeNameKey(name), name]));
  return uniqueTeamPlayers.every((name) => allowedMap.has(normalizeNameKey(name)));
}

function normalizeRyderCupTeams(rawTeams = [], defaultState = {}) {
  const fallbackTeams = Array.isArray(defaultState.teams) ? clonePlain(defaultState.teams) : [];
  const playerRows = buildRyderCupPlayerRows(defaultState.players);
  const allowedPlayers = playerRows.map((player) => player.name);
  const expectedCount = allowedPlayers.length / 2;
  const sourceTeams = Array.isArray(rawTeams) && rawTeams.length ? rawTeams : fallbackTeams;
  const normalized = RYDER_CUP_TEAM_IDS.map((teamId, index) => {
    const fallback = fallbackTeams[index] || { id: teamId, name: `Team ${index === 0 ? 'A' : 'B'}`, players: [] };
    const source = sourceTeams.find((entry, entryIndex) => normalizeRyderCupTeamId(entry && entry.id, entryIndex) === teamId) || fallback;
    return {
      id: teamId,
      name: cleanString(source && source.name) || fallback.name,
      players: normalizeRyderCupTeamPlayers(source && source.players, allowedPlayers, expectedCount),
    };
  });
  return areValidRyderCupTeams(normalized, playerRows) ? normalized : fallbackTeams;
}

function normalizeRyderCupFormatLabel(value = '') {
  const label = cleanString(value);
  const normalized = label.toLowerCase();
  if (normalized === 'two-man gross total match' || normalized === 'two-man net total match' || normalized === 'two-man net total match (75%)' || normalized === MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT.toLowerCase()) return MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT;
  if (normalized === 'singles gross total match' || normalized === 'singles net total match' || normalized === 'singles net total match (75%)' || normalized === MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT.toLowerCase()) return MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT;
  return label;
}

function normalizeRyderCupFormatKey(value = '') {
  const key = cleanString(value);
  const normalized = key.toLowerCase();
  if (normalized === 'netteammatch') return 'grossTeamMatch';
  if (normalized === 'netsinglesmatch') return 'grossSinglesMatch';
  if (normalized === 'four-ball' || normalized === 'fourball' || normalized === 'four ball') return 'fourBallMatch';
  if (normalized === 'three-ball' || normalized === 'threeball' || normalized === 'three ball') return 'threeBallMatch';
  if (normalized === 'best-ball' || normalized === 'bestball' || normalized === 'best ball') return 'bestBallMatch';
  if (normalized === 'stableford') return 'stablefordMatch';
  return key;
}

function normalizeRyderCupPlanStyleLabel(value = '') {
  const label = cleanString(value);
  const normalized = label.toLowerCase();
  if (normalized === 'two-man gross total match' || normalized === 'two-man net total match' || normalized === 'two-man net total match (75%)' || normalized === MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT.toLowerCase()) return MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT;
  if (normalized === 'singles gross total match' || normalized === 'singles net total match' || normalized === 'singles net total match (75%)' || normalized === MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT.toLowerCase()) return MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT;
  return label;
}

function coerceRyderCupPlanStyle(value = '', roundFormat = '') {
  const normalized = normalizeRyderCupPlanStyleLabel(value);
  if (ALLOWED_RYDER_CUP_PLAN_STYLES.has(normalized)) return normalized;
  return getDefaultRyderCupPlanStyle(roundFormat);
}

function isGrossTotalFormatKey(formatKey = '') {
  const normalized = cleanString(formatKey).toLowerCase();
  return normalized === 'grossteammatch' || normalized === 'grosssinglesmatch'
    || normalized === 'fourballmatch' || normalized === 'threeballmatch'
    || normalized === 'bestballmatch';
}

function isSinglesFormat(format = '') {
  const normalized = cleanString(format).toLowerCase();
  return normalized === 'singles' || normalized === 'singles match play' || normalized.includes('singles');
}

function getDefaultRyderCupPlanStyle(format = '') {
  const normalized = cleanString(format).toLowerCase();
  if (normalized.includes('singles')) return MYRTLE_RYDER_CUP_SINGLES_MATCH_FORMAT;
  if (normalized.includes('four-ball') || normalized.includes('four ball')) return MYRTLE_RYDER_CUP_FOUR_BALL_FORMAT;
  if (normalized.includes('three-ball') || normalized.includes('three ball')) return MYRTLE_RYDER_CUP_THREE_BALL_FORMAT;
  if (normalized.includes('best-ball') || normalized.includes('best ball')) return MYRTLE_RYDER_CUP_BEST_BALL_FORMAT;
  if (normalized.includes('stableford')) return MYRTLE_RYDER_CUP_STABLEFORD_FORMAT;
  if (normalized.includes('gross total') || normalized.includes('net total')) return MYRTLE_RYDER_CUP_TEAM_MATCH_FORMAT;
  return 'Own Ball Pod';
}

function getRyderCupRoundGroupNumbers(matches = []) {
  return Array.from(new Set((matches || []).map((match, matchIndex) => asPositiveInteger(match && match.groupNumber) || (matchIndex + 1))))
    .sort((left, right) => left - right);
}

function normalizeRyderCupScore(value) {
  const parsed = asPositiveInteger(value);
  return parsed || null;
}

function normalizeRyderCupScoreList(values = [], expectedCount = 0) {
  const source = Array.isArray(values) ? values : [];
  const normalized = source.slice(0, expectedCount > 0 ? expectedCount : source.length).map((value) => normalizeRyderCupScore(value));
  if (expectedCount > 0) {
    while (normalized.length < expectedCount) normalized.push(null);
  }
  return normalized;
}

function inferRyderCupWinningResult(teamAScore, teamBScore) {
  if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore)) return '';
  if (teamAScore === teamBScore) return 'halved';
  return teamAScore < teamBScore ? 'teamA' : 'teamB';
}

function inferRyderCupNoShowForfeitResult(round = {}, scoreState = {}) {
  const formatKey = cleanString(round && round.formatKey).toLowerCase();
  const supportsForfeitOnNoShow = isGrossTotalFormatKey(formatKey)
    || formatKey === 'combinedscore'
    || isSinglesFormat(round && round.format);
  if (!supportsForfeitOnNoShow) return '';
  const teamANoShow = Array.isArray(scoreState && scoreState.teamANoContributionPlayers)
    && scoreState.teamANoContributionPlayers.length > 0;
  const teamBNoShow = Array.isArray(scoreState && scoreState.teamBNoContributionPlayers)
    && scoreState.teamBNoContributionPlayers.length > 0;
  if (!teamANoShow && !teamBNoShow) return '';
  if (teamANoShow && teamBNoShow) return 'halved';
  return teamANoShow ? 'teamB' : 'teamA';
}

function isRyderCupTeamRound(round = {}) {
  return cleanString(round && round.resultMode).toLowerCase() === 'teamround'
    || cleanString(round && round.resultMode).toLowerCase() === 'team_round'
    || cleanString(round && round.formatKey).toLowerCase() === 'onetwothree';
}

function buildRyderCupRoundPlanTemplate(round = {}) {
  const playStyle = getDefaultRyderCupPlanStyle(round.format);
  return getRyderCupRoundGroupNumbers(round.matches || []).map((groupNumber) => ({
    groupNumber,
    playStyle,
    notes: '',
  }));
}

function normalizeRyderCupRoundPlan(rawPlan = {}, defaultRound = {}, matches = []) {
  const templateGroups = buildRyderCupRoundPlanTemplate({
    format: cleanString(defaultRound && defaultRound.format),
    matches: matches.length ? matches : (defaultRound && defaultRound.matches) || [],
  });
  const savedGroups = Array.isArray(rawPlan && rawPlan.groups) ? rawPlan.groups : [];
  const defaultGroups = Array.isArray(defaultRound && defaultRound.plan && defaultRound.plan.groups)
    ? defaultRound.plan.groups
    : [];
  const savedByGroup = new Map(savedGroups.map((entry) => [asPositiveInteger(entry && entry.groupNumber), entry]));
  const defaultByGroup = new Map(defaultGroups.map((entry) => [asPositiveInteger(entry && entry.groupNumber), entry]));
  return {
    dayNote: cleanString(rawPlan && rawPlan.dayNote) || cleanString(defaultRound && defaultRound.plan && defaultRound.plan.dayNote),
    groups: templateGroups.map((template) => {
      const saved = savedByGroup.get(template.groupNumber) || {};
      const fallback = defaultByGroup.get(template.groupNumber) || template;
      return {
        groupNumber: template.groupNumber,
        playStyle: coerceRyderCupPlanStyle(
          cleanString(saved && saved.playStyle) || cleanString(fallback && fallback.playStyle),
          defaultRound && defaultRound.format,
        ) || template.playStyle,
        notes: cleanString(saved && saved.notes) || cleanString(fallback && fallback.notes),
      };
    }),
  };
}

function normalizeRyderCupRoundScore(rawRoundScore = {}, defaultRound = {}) {
  const fallback = defaultRound && defaultRound.roundScore ? defaultRound.roundScore : {};
  return {
    teamAScore: normalizeRyderCupScore(rawRoundScore && rawRoundScore.teamAScore),
    teamBScore: normalizeRyderCupScore(rawRoundScore && rawRoundScore.teamBScore),
    result: normalizeRyderCupResult(rawRoundScore && rawRoundScore.result),
    notes: cleanString(rawRoundScore && rawRoundScore.notes) || cleanString(fallback && fallback.notes),
  };
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

function groupRyderCupMatchesByGroup(matches = []) {
  const byGroup = new Map();
  (matches || []).forEach((match, index) => {
    const groupNumber = asPositiveInteger(match && match.groupNumber) || (index + 1);
    const existing = byGroup.get(groupNumber) || [];
    existing.push(match || {});
    byGroup.set(groupNumber, existing);
  });
  return byGroup;
}

function getRyderCupMatchPlayerKey(match = {}) {
  return uniqueNames([].concat(match.teamAPlayers || [], match.teamBPlayers || []))
    .map((name) => normalizeNameKey(name))
    .filter(Boolean)
    .sort()
    .join('::');
}

function buildRyderCupPlayerScoreLookup(matches = []) {
  const byPlayer = new Map();
  (matches || []).forEach((match) => {
    [
      ['teamAPlayers', 'teamAPlayerScores'],
      ['teamBPlayers', 'teamBPlayerScores'],
    ].forEach(([playersKey, scoresKey]) => {
      const players = Array.isArray(match && match[playersKey]) ? match[playersKey] : [];
      const scores = Array.isArray(match && match[scoresKey]) ? match[scoresKey] : [];
      players.forEach((playerName, index) => {
        const playerKey = normalizeNameKey(playerName);
        if (!playerKey) return;
        byPlayer.set(playerKey, normalizeRyderCupScore(scores[index]));
      });
    });
  });
  return byPlayer;
}

function buildRyderCupMatchContributionLookup(match = {}) {
  const byPlayer = new Map();
  [
    ['teamAPlayers', 'teamAPlayerContributionStates'],
    ['teamBPlayers', 'teamBPlayerContributionStates'],
  ].forEach(([playersKey, statesKey]) => {
    const players = Array.isArray(match && match[playersKey]) ? match[playersKey] : [];
    const states = Array.isArray(match && match[statesKey]) ? match[statesKey] : [];
    players.forEach((playerName, index) => {
      const playerKey = normalizeNameKey(playerName);
      const contributionState = normalizeRyderCupContributionState(states[index]);
      if (!playerKey || contributionState !== 'noShow') return;
      byPlayer.set(playerKey, contributionState);
    });
  });
  parseRyderCupNoContributionPlayers(match && match.notes).forEach((playerName) => {
    const playerKey = normalizeNameKey(playerName);
    if (!playerKey) return;
    byPlayer.set(playerKey, 'noShow');
  });
  return byPlayer;
}

function getRyderCupPlayerScores(scoreLookup = new Map(), players = []) {
  return (players || []).map((playerName) => {
    const playerKey = normalizeNameKey(playerName);
    return playerKey && scoreLookup.has(playerKey) ? scoreLookup.get(playerKey) : null;
  });
}

function buildRyderCupMatchSideScoreState(players = [], scores = [], handicapLookup = null, contributionLookup = new Map()) {
  const rows = (players || []).map((playerName, index) => {
    const cleanName = normalizeRyderCupPlayerName(playerName);
    const playerKey = normalizeNameKey(cleanName);
    const contributionState = playerKey && contributionLookup.get(playerKey) === 'noShow' ? 'noShow' : 'active';
    const grossScore = normalizeRyderCupScore(scores[index]);
    const matchAllowance = contributionState === 'noShow'
      ? 0
      : resolveMyrtleRyderCupMatchAllowance(cleanName, handicapLookup);
    return {
      playerName: cleanName,
      grossScore,
      matchAllowance,
      contributionState,
      isComplete: Boolean(cleanName) && (contributionState === 'noShow' || Number.isFinite(grossScore)),
    };
  });
  return {
    rows,
    complete: rows.length > 0 && rows.every((row) => row.isComplete),
    grossTotal: rows.length > 0 && rows.every((row) => row.isComplete)
      ? rows.reduce((sum, row) => sum + (row.contributionState === 'noShow' ? 0 : row.grossScore), 0)
      : null,
    allowanceTotal: rows.reduce((sum, row) => sum + row.matchAllowance, 0),
    activePlayers: rows.filter((row) => row.contributionState !== 'noShow').map((row) => row.playerName),
    noContributionPlayers: rows.filter((row) => row.contributionState === 'noShow').map((row) => row.playerName),
    contributionStates: rows.map((row) => row.contributionState),
  };
}

function getRyderCupSlotPlayersForTeam(slot = {}, teamLookup = new Map(), teamId = '') {
  return uniqueNames((slot && slot.players) || []).filter((playerName) => {
    const lookup = teamLookup.get(normalizeNameKey(playerName));
    return lookup && lookup.teamId === teamId;
  });
}

function buildMyrtleRyderCupScheduleSync(defaultRound = {}, tripRound = {}, teams = []) {
  const templateMatches = Array.isArray(defaultRound && defaultRound.matches) ? defaultRound.matches : [];
  if (!templateMatches.length) {
    return {
      source: 'teeTimes',
      status: 'synced',
      issues: [],
    };
  }

  const teeTimes = Array.isArray(tripRound && tripRound.teeTimes) ? tripRound.teeTimes : [];
  const templateByGroup = groupRyderCupMatchesByGroup(templateMatches);
  const teamLookup = buildRyderCupTeamLookup(teams);
  const issues = [];
  const sortedGroups = Array.from(templateByGroup.keys()).sort((left, right) => left - right);

  if (!teeTimes.length) {
    issues.push('No tee times are saved for this round yet.');
  }
  if (teeTimes.length !== sortedGroups.length) {
    issues.push(`Expected ${sortedGroups.length} Ryder Cup foursomes but found ${teeTimes.length}.`);
  }

  sortedGroups.forEach((groupNumber) => {
    const templates = templateByGroup.get(groupNumber) || [];
    const slot = teeTimes[groupNumber - 1] || {};
    const slotPlayers = uniqueNames((slot && slot.players) || []);
    const expectedTeamACount = templates.reduce((sum, match) => sum + ((match && match.teamAPlayers && match.teamAPlayers.length) || 0), 0);
    const expectedTeamBCount = templates.reduce((sum, match) => sum + ((match && match.teamBPlayers && match.teamBPlayers.length) || 0), 0);
    const expectedPlayerCount = expectedTeamACount + expectedTeamBCount;
    const teamAPlayers = getRyderCupSlotPlayersForTeam(slot, teamLookup, 'teamA');
    const teamBPlayers = getRyderCupSlotPlayersForTeam(slot, teamLookup, 'teamB');
    const assignedKeys = new Set(teamAPlayers.concat(teamBPlayers).map((name) => normalizeNameKey(name)));
    const unmappedPlayers = slotPlayers.filter((playerName) => !assignedKeys.has(normalizeNameKey(playerName)));

    if (!slotPlayers.length) {
      issues.push(`Foursome ${groupNumber} is empty on the schedule.`);
      return;
    }
    if (slotPlayers.length !== expectedPlayerCount) {
      issues.push(`Foursome ${groupNumber} should have ${expectedPlayerCount} golfers but has ${slotPlayers.length}.`);
    }
    if (unmappedPlayers.length) {
      issues.push(`Foursome ${groupNumber} has golfers who are not mapped to a Ryder Cup team: ${unmappedPlayers.join(', ')}.`);
    }
    if (teamAPlayers.length !== expectedTeamACount || teamBPlayers.length !== expectedTeamBCount) {
      issues.push(`Foursome ${groupNumber} should have ${expectedTeamACount} ${teams[0] && teams[0].name ? teams[0].name : 'Team A'} golfer${expectedTeamACount === 1 ? '' : 's'} and ${expectedTeamBCount} ${teams[1] && teams[1].name ? teams[1].name : 'Team B'} golfer${expectedTeamBCount === 1 ? '' : 's'}.`);
    }
  });

  return {
    source: 'teeTimes',
    status: issues.length ? 'invalid' : 'synced',
    issues,
  };
}

function deriveMyrtleRyderCupRoundMatches(rawRound = {}, defaultRound = {}, tripRound = {}, teams = []) {
  const templateMatches = Array.isArray(defaultRound && defaultRound.matches) ? defaultRound.matches : [];
  const rawMatches = Array.isArray(rawRound && rawRound.matches) ? rawRound.matches : [];
  const scheduleSync = buildMyrtleRyderCupScheduleSync(defaultRound, tripRound, teams);
  const teeTimes = Array.isArray(tripRound && tripRound.teeTimes) ? tripRound.teeTimes : [];
  if (!templateMatches.length) {
    return {
      matches: rawMatches,
      scheduleSync,
    };
  }
  if (!teeTimes.length || scheduleSync.status !== 'synced') {
    return {
      matches: rawMatches.length ? rawMatches : templateMatches.map((match) => clonePlain(match || {})),
      scheduleSync,
    };
  }

  const templateByGroup = groupRyderCupMatchesByGroup(templateMatches);
  const rawByGroup = groupRyderCupMatchesByGroup(rawMatches);
  const teamLookup = buildRyderCupTeamLookup(teams);
  const scoreLookup = buildRyderCupPlayerScoreLookup(rawMatches);
  const derivedMatches = [];
  const sortedGroups = Array.from(templateByGroup.keys()).sort((left, right) => left - right);

  sortedGroups.forEach((groupNumber) => {
    const templates = templateByGroup.get(groupNumber) || [];
    const rawGroupMatches = rawByGroup.get(groupNumber) || [];
    const slot = teeTimes[groupNumber - 1] || {};
    const teamAPlayers = getRyderCupSlotPlayersForTeam(slot, teamLookup, 'teamA');
    const teamBPlayers = getRyderCupSlotPlayersForTeam(slot, teamLookup, 'teamB');
    let teamAOffset = 0;
    let teamBOffset = 0;
    templates.forEach((template, matchIndex) => {
      const sourceMatch = rawGroupMatches[matchIndex] || {};
      const teamACount = (template && template.teamAPlayers && template.teamAPlayers.length) || 0;
      const teamBCount = (template && template.teamBPlayers && template.teamBPlayers.length) || 0;
      const nextTeamAPlayers = teamAPlayers.slice(teamAOffset, teamAOffset + teamACount);
      const nextTeamBPlayers = teamBPlayers.slice(teamBOffset, teamBOffset + teamBCount);
      teamAOffset += teamACount;
      teamBOffset += teamBCount;

      const derivedPlayerKey = getRyderCupMatchPlayerKey({
        teamAPlayers: nextTeamAPlayers,
        teamBPlayers: nextTeamBPlayers,
      });
      const sourcePlayerKey = getRyderCupMatchPlayerKey(sourceMatch);
      const preserveManualMatchState = Boolean(derivedPlayerKey) && derivedPlayerKey === sourcePlayerKey;
      const rawTeamAGrossScore = normalizeRyderCupScore(sourceMatch && sourceMatch.teamAGrossScore);
      const rawTeamBGrossScore = normalizeRyderCupScore(sourceMatch && sourceMatch.teamBGrossScore);

      derivedMatches.push({
        matchNumber: asPositiveInteger(sourceMatch && sourceMatch.matchNumber) || asPositiveInteger(template && template.matchNumber) || (derivedMatches.length + 1),
        label: cleanString(template && template.label)
          || cleanString(sourceMatch && sourceMatch.label)
          || (isSinglesFormat(defaultRound && defaultRound.format) ? `Singles ${derivedMatches.length + 1}` : `Match ${derivedMatches.length + 1}`),
        groupNumber,
        teamAPlayers: nextTeamAPlayers,
        teamBPlayers: nextTeamBPlayers,
        teamAPlayerScores: getRyderCupPlayerScores(scoreLookup, nextTeamAPlayers),
        teamBPlayerScores: getRyderCupPlayerScores(scoreLookup, nextTeamBPlayers),
        teamAScore: preserveManualMatchState ? (rawTeamAGrossScore ?? normalizeRyderCupScore(sourceMatch && sourceMatch.teamAScore)) : null,
        teamBScore: preserveManualMatchState ? (rawTeamBGrossScore ?? normalizeRyderCupScore(sourceMatch && sourceMatch.teamBScore)) : null,
        result: preserveManualMatchState ? normalizeRyderCupResult(sourceMatch && sourceMatch.result) : '',
        notes: preserveManualMatchState
          ? cleanString(sourceMatch && sourceMatch.notes !== undefined ? sourceMatch.notes : template && template.notes)
          : cleanString(template && template.notes),
      });
    });
  });

  return {
    matches: derivedMatches,
    scheduleSync,
  };
}

function syncMyrtleRyderCupRoundToTripTeeSheet(rawRound = {}, defaultRound = {}, tripRound = {}, teams = []) {
  if (!Array.isArray(defaultRound && defaultRound.matches) || !defaultRound.matches.length) return rawRound;
  const { matches, scheduleSync } = deriveMyrtleRyderCupRoundMatches(rawRound, defaultRound, tripRound, teams);
  return {
    ...clonePlain(rawRound || {}),
    matches,
    scheduleSync,
  };
}

function normalizeRyderCupRound(rawRound = {}, defaultRound = {}, teams = []) {
  const roundFormat = normalizeRyderCupFormatLabel(cleanString(rawRound.format))
    || normalizeRyderCupFormatLabel(cleanString(defaultRound.format))
    || 'Four-Ball';
  const formatKey = normalizeRyderCupFormatKey(cleanString(rawRound.formatKey))
    || normalizeRyderCupFormatKey(cleanString(defaultRound.formatKey));
  const resultMode = cleanString(rawRound.resultMode) || cleanString(defaultRound.resultMode) || 'match';
  const expectedCount = isSinglesFormat(roundFormat) ? 1 : 2;
  const storesGrossTeamTotals = isGrossTotalFormatKey(formatKey) || formatKey === 'combinedscore';
  const teamA = teams[0] || { players: [] };
  const teamB = teams[1] || { players: [] };
  const rawMatches = Array.isArray(rawRound && rawRound.matches) ? rawRound.matches : [];
  const rawDate = toIsoDateOnly(rawRound && rawRound.date);
  const rawScheduleSync = rawRound && rawRound.scheduleSync && typeof rawRound.scheduleSync === 'object'
    ? rawRound.scheduleSync
    : (defaultRound && defaultRound.scheduleSync && typeof defaultRound.scheduleSync === 'object' ? defaultRound.scheduleSync : null);
  const matches = (defaultRound.matches || []).map((defaultMatch, matchIndex) => {
    const rawMatch = rawMatches[matchIndex] || defaultMatch || {};
    let teamAPlayers = normalizeRyderCupTeamPlayers(rawMatch.teamAPlayers, teamA.players, expectedCount);
    let teamBPlayers = normalizeRyderCupTeamPlayers(rawMatch.teamBPlayers, teamB.players, expectedCount);
    if (teamAPlayers.length !== expectedCount || teamBPlayers.length !== expectedCount) {
      teamAPlayers = (defaultMatch.teamAPlayers || []).slice();
      teamBPlayers = (defaultMatch.teamBPlayers || []).slice();
    }
    const rawTeamAScore = normalizeRyderCupScore(rawMatch.teamAScore);
    const rawTeamBScore = normalizeRyderCupScore(rawMatch.teamBScore);
    const rawTeamAGrossScore = normalizeRyderCupScore(rawMatch.teamAGrossScore);
    const rawTeamBGrossScore = normalizeRyderCupScore(rawMatch.teamBGrossScore);
    return {
      matchNumber: asPositiveInteger(rawMatch.matchNumber) || defaultMatch.matchNumber || (matchIndex + 1),
      label: cleanString(rawMatch.label) || defaultMatch.label || (isSinglesFormat(roundFormat) ? `Singles ${matchIndex + 1}` : `Match ${matchIndex + 1}`),
      groupNumber: asPositiveInteger(rawMatch.groupNumber) || defaultMatch.groupNumber || (matchIndex + 1),
      teamAPlayers,
      teamBPlayers,
      teamAPlayerScores: normalizeRyderCupScoreList(rawMatch.teamAPlayerScores, teamAPlayers.length || expectedCount),
      teamBPlayerScores: normalizeRyderCupScoreList(rawMatch.teamBPlayerScores, teamBPlayers.length || expectedCount),
      teamAScore: storesGrossTeamTotals ? (rawTeamAGrossScore ?? rawTeamAScore) : rawTeamAScore,
      teamBScore: storesGrossTeamTotals ? (rawTeamBGrossScore ?? rawTeamBScore) : rawTeamBScore,
      result: normalizeRyderCupResult(rawMatch.result),
      notes: cleanString(rawMatch.notes !== undefined ? rawMatch.notes : defaultMatch.notes),
    };
  });
  const plan = normalizeRyderCupRoundPlan(rawRound && rawRound.plan, {
    ...defaultRound,
    format: roundFormat,
  }, matches);
  return {
    roundNumber: asPositiveInteger(rawRound.roundNumber) || defaultRound.roundNumber,
    title: cleanString(rawRound.title) || defaultRound.title || `Round ${defaultRound.roundNumber || 1}`,
    format: roundFormat,
    formatKey,
    resultMode,
    description: normalizeMyrtleRyderCupRoundDescription(
      cleanString(rawRound.description) || cleanString(defaultRound.description),
      roundFormat,
    ),
    entrySummary: normalizeMyrtleRyderCupEntrySummary(
      cleanString(rawRound.entrySummary) || cleanString(defaultRound.entrySummary),
      roundFormat,
    ),
    pointValue: asFiniteNumber(rawRound.pointValue) || asFiniteNumber(defaultRound.pointValue) || 1,
    course: cleanString(rawRound.course) || defaultRound.course || '',
    date: rawDate ? new Date(rawRound.date).toISOString() : defaultRound.date || null,
    label: cleanString(rawRound.label) || defaultRound.label || '',
    plan,
    roundScore: normalizeRyderCupRoundScore(rawRound && rawRound.roundScore, defaultRound),
    scheduleSync: rawScheduleSync ? {
      source: cleanString(rawScheduleSync.source) || 'teeTimes',
      status: cleanString(rawScheduleSync.status) || 'synced',
      issues: Array.isArray(rawScheduleSync.issues) ? rawScheduleSync.issues.map((issue) => cleanString(issue)).filter(Boolean) : [],
    } : null,
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

function normalizeRyderCupSideGames(rawSideGames = {}, defaultState = {}, trip = {}) {
  const defaultSideGames = clonePlain(defaultState.sideGames || {});
  const playerRows = buildRyderCupPlayerRows(defaultState.players);
  const normalizePrizeAmount = isMyrtleRyderCupTrip(trip)
    ? (value) => normalizeCurrencyAmountToIncrement(value, 5)
    : normalizeCurrencyAmount;
  const normalizeBirdieCountEntries = (entries = []) => (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      playerName: normalizeRyderCupPlayerName(entry && entry.playerName),
      count: Math.max(0, Math.round(asFiniteNumber(entry && entry.count) || 0)),
    }))
    .filter((entry) => entry.playerName && entry.count > 0);
  const rawDailyNet = Array.isArray(rawSideGames && rawSideGames.dailyNet)
    ? rawSideGames.dailyNet
    : [];
  const dailyNet = (defaultSideGames.dailyNet || []).map((entry, index) => {
    const rawEntry = rawDailyNet[index] || {};
    return {
      roundNumber: entry.roundNumber,
      label: entry.label,
      winnerNames: normalizeRyderCupWinnerList(rawEntry.winnerNames || rawEntry.winnerName || entry.winnerNames)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      amount: normalizePrizeAmount(rawEntry.amount) !== null
        ? normalizePrizeAmount(rawEntry.amount)
        : normalizePrizeAmount(entry.amount),
      notes: normalizeMyrtleRyderCupSideGameNote(rawEntry.notes),
    };
  });
  const rawDailyGross = Array.isArray(rawSideGames && rawSideGames.dailyGross)
    ? rawSideGames.dailyGross
    : (Array.isArray(rawSideGames && rawSideGames.dailyLowGross) ? rawSideGames.dailyLowGross : []);
  const dailyGross = (defaultSideGames.dailyGross || []).map((entry, index) => {
    const rawEntry = rawDailyGross[index] || {};
    return {
      roundNumber: entry.roundNumber,
      label: entry.label,
      winnerNames: normalizeRyderCupWinnerList(rawEntry.winnerNames || rawEntry.winnerName || entry.winnerNames)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      amount: normalizePrizeAmount(rawEntry.amount) !== null
        ? normalizePrizeAmount(rawEntry.amount)
        : normalizePrizeAmount(entry.amount),
      notes: cleanString(rawEntry.notes),
    };
  });
  const rawDailyOver100Draw = Array.isArray(rawSideGames && rawSideGames.dailyOver100Draw)
    ? rawSideGames.dailyOver100Draw
    : [];
  const dailyOver100Draw = (defaultSideGames.dailyOver100Draw || []).map((entry, index) => {
    const rawEntry = rawDailyOver100Draw[index] || {};
    const winners = normalizeRyderCupTeamSplitWinners(rawEntry);
    return {
      roundNumber: entry.roundNumber,
      label: entry.label,
      winnerNames: winners.winnerNames,
      teamAWinnerNames: winners.teamAWinnerNames,
      teamBWinnerNames: winners.teamBWinnerNames,
      amount: normalizePrizeAmount(rawEntry.amount) !== null
        ? normalizePrizeAmount(rawEntry.amount)
        : normalizePrizeAmount(entry.amount),
      notes: cleanString(rawEntry.notes),
    };
  });
  const rawDailyLongestPuttLastHole = Array.isArray(rawSideGames && rawSideGames.dailyLongestPuttLastHole)
    ? rawSideGames.dailyLongestPuttLastHole
    : [];
  const dailyLongestPuttLastHole = (defaultSideGames.dailyLongestPuttLastHole || []).map((entry, index) => {
    const rawEntry = rawDailyLongestPuttLastHole[index] || {};
    return {
      roundNumber: entry.roundNumber,
      label: entry.label,
      winnerNames: normalizeRyderCupWinnerList(rawEntry.winnerNames || rawEntry.winnerName || entry.winnerNames)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      distance: cleanString(rawEntry.distance),
      amount: normalizePrizeAmount(rawEntry.amount) !== null
        ? normalizePrizeAmount(rawEntry.amount)
        : normalizePrizeAmount(entry.amount),
      notes: cleanString(rawEntry.notes),
    };
  });
  const rawDailyBirdiePot = Array.isArray(rawSideGames && rawSideGames.dailyBirdiePot)
    ? rawSideGames.dailyBirdiePot
    : [];
  const dailyBirdiePot = (defaultSideGames.dailyBirdiePot || []).map((entry, index) => {
    const rawEntry = rawDailyBirdiePot[index] || {};
    return {
      roundNumber: entry.roundNumber,
      label: entry.label,
      counts: normalizeBirdieCountEntries(rawEntry.counts),
      winnerNames: normalizeRyderCupWinnerList(rawEntry.winnerNames || rawEntry.winnerName || entry.winnerNames)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      amount: normalizePrizeAmount(rawEntry.amount) !== null
        ? normalizePrizeAmount(rawEntry.amount)
        : normalizePrizeAmount(entry.amount),
      notes: cleanString(rawEntry.notes),
    };
  });
  const lastChanceRedemptionSource = rawSideGames && rawSideGames.lastChanceRedemptionPot
    ? rawSideGames.lastChanceRedemptionPot
    : {};
  const redemptionBirdieSource = rawSideGames && rawSideGames.redemptionBirdiePot
    ? rawSideGames.redemptionBirdiePot
    : {};
  const finalDayHighHoleSource = rawSideGames && rawSideGames.finalDayHighHole
    ? rawSideGames.finalDayHighHole
    : {};
  const weeklySource = rawSideGames && (rawSideGames.weeklyNet || rawSideGames.weeklyLowGross)
    ? (rawSideGames.weeklyNet || rawSideGames.weeklyLowGross)
    : {};
  const weeklyOver100Source = rawSideGames && rawSideGames.weeklyOver100Draw ? rawSideGames.weeklyOver100Draw : {};
  const closestSource = rawSideGames && rawSideGames.closestToPin ? rawSideGames.closestToPin : {};
  const birdieSource = rawSideGames && rawSideGames.birdiePool ? rawSideGames.birdiePool : {};
  const leftoverSource = rawSideGames && rawSideGames.leftoverPot ? rawSideGames.leftoverPot : {};
  const mvpSource = rawSideGames && rawSideGames.mvp ? rawSideGames.mvp : {};
  const rawClosestEntries = Array.isArray(closestSource.entries) ? closestSource.entries : [];
  const closestEntries = rawClosestEntries
    .map((entry) => ({
      roundNumber: asPositiveInteger(entry && entry.roundNumber),
      course: cleanString(entry && entry.course),
      hole: asPositiveInteger(entry && entry.hole),
      playerName: normalizeRyderCupPlayerName(entry && entry.playerName),
      distance: cleanString(entry && entry.distance),
      amount: normalizePrizeAmount(entry && entry.amount),
      notes: cleanString(entry && entry.notes),
    }))
    .filter((entry) => entry.roundNumber && entry.hole && entry.playerName);
  const birdieCounts = playerRows.map((player) => {
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
  const weeklyOver100Winners = normalizeRyderCupTeamSplitWinners(weeklyOver100Source);
  return {
    dailyNet,
    dailyGross,
    dailyOver100Draw,
    dailyLongestPuttLastHole,
    dailyBirdiePot,
    lastChanceRedemptionPot: {
      roundNumber: asPositiveInteger(lastChanceRedemptionSource.roundNumber)
        || asPositiveInteger(defaultSideGames.lastChanceRedemptionPot && defaultSideGames.lastChanceRedemptionPot.roundNumber),
      label: cleanString(lastChanceRedemptionSource.label)
        || cleanString(defaultSideGames.lastChanceRedemptionPot && defaultSideGames.lastChanceRedemptionPot.label),
      winnerNames: normalizeRyderCupWinnerList(lastChanceRedemptionSource.winnerNames || lastChanceRedemptionSource.winnerName)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      amount: normalizePrizeAmount(lastChanceRedemptionSource.amount) !== null
        ? normalizePrizeAmount(lastChanceRedemptionSource.amount)
        : normalizePrizeAmount(defaultSideGames.lastChanceRedemptionPot && defaultSideGames.lastChanceRedemptionPot.amount),
      notes: cleanString(lastChanceRedemptionSource.notes)
        || cleanString(defaultSideGames.lastChanceRedemptionPot && defaultSideGames.lastChanceRedemptionPot.notes),
    },
    redemptionBirdiePot: {
      roundNumber: asPositiveInteger(redemptionBirdieSource.roundNumber)
        || asPositiveInteger(defaultSideGames.redemptionBirdiePot && defaultSideGames.redemptionBirdiePot.roundNumber),
      label: cleanString(redemptionBirdieSource.label)
        || cleanString(defaultSideGames.redemptionBirdiePot && defaultSideGames.redemptionBirdiePot.label),
      winnerNames: normalizeRyderCupWinnerList(redemptionBirdieSource.winnerNames || redemptionBirdieSource.winnerName)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      amount: normalizePrizeAmount(redemptionBirdieSource.amount) !== null
        ? normalizePrizeAmount(redemptionBirdieSource.amount)
        : normalizePrizeAmount(defaultSideGames.redemptionBirdiePot && defaultSideGames.redemptionBirdiePot.amount),
      notes: cleanString(redemptionBirdieSource.notes)
        || cleanString(defaultSideGames.redemptionBirdiePot && defaultSideGames.redemptionBirdiePot.notes),
    },
    finalDayHighHole: {
      roundNumber: asPositiveInteger(finalDayHighHoleSource.roundNumber)
        || asPositiveInteger(defaultSideGames.finalDayHighHole && defaultSideGames.finalDayHighHole.roundNumber),
      label: cleanString(finalDayHighHoleSource.label)
        || cleanString(defaultSideGames.finalDayHighHole && defaultSideGames.finalDayHighHole.label),
      winnerNames: normalizeRyderCupWinnerList(finalDayHighHoleSource.winnerNames || finalDayHighHoleSource.winnerName)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      hole: asPositiveInteger(finalDayHighHoleSource.hole),
      score: asPositiveInteger(finalDayHighHoleSource.score),
      amount: normalizePrizeAmount(finalDayHighHoleSource.amount) !== null
        ? normalizePrizeAmount(finalDayHighHoleSource.amount)
        : normalizePrizeAmount(defaultSideGames.finalDayHighHole && defaultSideGames.finalDayHighHole.amount),
      notes: cleanString(finalDayHighHoleSource.notes)
        || cleanString(defaultSideGames.finalDayHighHole && defaultSideGames.finalDayHighHole.notes),
    },
    weeklyNet: {
      winnerNames: normalizeRyderCupWinnerList(weeklySource.winnerNames || weeklySource.winnerName)
        .map(normalizeRyderCupPlayerName)
        .filter(Boolean),
      amount: normalizePrizeAmount(weeklySource.amount) !== null
        ? normalizePrizeAmount(weeklySource.amount)
        : normalizePrizeAmount(defaultSideGames.weeklyNet && defaultSideGames.weeklyNet.amount),
      notes: cleanString(weeklySource.notes),
    },
    weeklyOver100Draw: {
      winnerNames: weeklyOver100Winners.winnerNames,
      teamAWinnerNames: weeklyOver100Winners.teamAWinnerNames,
      teamBWinnerNames: weeklyOver100Winners.teamBWinnerNames,
      amount: normalizePrizeAmount(weeklyOver100Source.amount) !== null
        ? normalizePrizeAmount(weeklyOver100Source.amount)
        : normalizePrizeAmount(defaultSideGames.weeklyOver100Draw && defaultSideGames.weeklyOver100Draw.amount),
      notes: cleanString(weeklyOver100Source.notes),
    },
    closestToPin: {
      entries: closestEntries,
    },
    birdiePool: {
      counts: birdieCounts,
      winners: birdieWinners,
      amount: normalizePrizeAmount(birdieSource.amount) !== null
        ? normalizePrizeAmount(birdieSource.amount)
        : normalizePrizeAmount(defaultSideGames.birdiePool && defaultSideGames.birdiePool.amount),
      notes: cleanString(birdieSource.notes),
    },
    leftoverPot: {
      amount: normalizePrizeAmount(leftoverSource.amount) !== null
        ? normalizePrizeAmount(leftoverSource.amount)
        : normalizePrizeAmount(defaultSideGames.leftoverPot && defaultSideGames.leftoverPot.amount),
      notes: cleanString(leftoverSource.notes),
    },
    mvp: {
      overrideWinners: mvpWinners,
      amount: normalizePrizeAmount(mvpSource.amount) !== null
        ? normalizePrizeAmount(mvpSource.amount)
        : normalizePrizeAmount(defaultSideGames.mvp && defaultSideGames.mvp.amount),
      notes: cleanString(mvpSource.notes),
    },
  };
}

function isLegacyMyrtleRyderCupPayout(rawPayout = {}, fallback = {}) {
  const rawTotalPot = normalizeCurrencyAmount(rawPayout && rawPayout.totalPot);
  const fallbackTotalPot = normalizeCurrencyAmount(fallback && fallback.totalPot);
  if (rawTotalPot !== 1000 || fallbackTotalPot !== 2000) return false;
  const rawAllocation = rawPayout && rawPayout.allocationPercentages ? rawPayout.allocationPercentages : {};
  const winningTeam = asFiniteNumber(rawAllocation.winningTeam);
  const weeklyNet = asFiniteNumber(rawAllocation.weeklyNet) || asFiniteNumber(rawAllocation.weeklyLowGross);
  const birdiePool = asFiniteNumber(rawAllocation.birdiePool);
  const closestToPin = asFiniteNumber(rawAllocation.closestToPin);
  const mvp = asFiniteNumber(rawAllocation.mvp);
  const hasNoExplicitAllocation = winningTeam === null
    && weeklyNet === null
    && birdiePool === null
    && closestToPin === null
    && mvp === null;
  const hasLegacyAllocation = winningTeam === 50
    && weeklyNet === 20
    && birdiePool === 10
    && closestToPin === 10
    && mvp === 10;
  return hasNoExplicitAllocation || hasLegacyAllocation;
}

function normalizeRyderCupPayout(rawPayout = {}, defaultState = {}, trip = {}) {
  const fallback = clonePlain(defaultState.payout || {});
  const useFairMyrtleFallback = isLegacyMyrtleRyderCupPayout(rawPayout, fallback);
  const normalizePayoutAmount = isMyrtleRyderCupTrip(trip)
    ? (value) => normalizeCurrencyAmountToIncrement(value, 5)
    : normalizeCurrencyAmount;
  const rawAllocation = rawPayout && rawPayout.allocationPercentages ? rawPayout.allocationPercentages : {};
  const fallbackAllocation = fallback.allocationPercentages || {};
  const payoutSource = useFairMyrtleFallback ? fallback : rawPayout;
  const allocationSource = useFairMyrtleFallback ? fallbackAllocation : rawAllocation;
  const resolveAllocationPercent = (...values) => {
    for (let index = 0; index < values.length; index += 1) {
      const parsed = asFiniteNumber(values[index]);
      if (parsed !== null) return parsed;
    }
    return null;
  };
  return {
    totalPot: normalizePayoutAmount(payoutSource && payoutSource.totalPot) !== null
      ? normalizePayoutAmount(payoutSource && payoutSource.totalPot)
      : normalizePayoutAmount(fallback.totalPot) || 0,
    allocationPercentages: {
      winningTeam: resolveAllocationPercent(allocationSource.winningTeam, fallbackAllocation.winningTeam) ?? 25,
      weeklyNet: resolveAllocationPercent(
        allocationSource.weeklyNet,
        allocationSource.weeklyLowGross,
        fallbackAllocation.weeklyNet,
        fallbackAllocation.weeklyLowGross
      ) ?? 12.5,
      birdiePool: resolveAllocationPercent(allocationSource.birdiePool, fallbackAllocation.birdiePool) ?? 6.25,
      closestToPin: resolveAllocationPercent(allocationSource.closestToPin, fallbackAllocation.closestToPin) ?? 4,
      mvp: resolveAllocationPercent(allocationSource.mvp, fallbackAllocation.mvp) ?? 6.25,
    },
  };
}

function normalizeRyderCupState(rawState = {}, trip = {}) {
  const defaultState = getRyderCupDefaultState(trip);
  const playerRows = buildRyderCupPlayerRows(defaultState.players);
  const state = clonePlain(rawState || {});
  const rawScheduleVersion = cleanString(state.scheduleVersion);
  const teams = normalizeRyderCupTeams(state.teams, defaultState);
  const rawRounds = Array.isArray(state.rounds) ? state.rounds : [];
  const tripRounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  const getRoundSeed = (roundPayload = {}, defaultRound = {}, index = 0) => (
    isMyrtleRyderCupTrip(trip)
      ? syncMyrtleRyderCupRoundToTripTeeSheet(roundPayload, defaultRound, tripRounds[index] || {}, teams)
      : roundPayload
  );
  const normalizedExistingRounds = (defaultState.rounds || []).map((defaultRound, index) => normalizeRyderCupRound(
    getRoundSeed(rawRounds[index] || {}, defaultRound, index),
    defaultRound,
    teams,
  ));
  const shouldReseedRounds = rawScheduleVersion
    && rawScheduleVersion === MYRTLE_RYDER_CUP_SCHEDULE_VERSION
      ? false
      : !hasStartedRyderCup(normalizedExistingRounds);
  const rounds = (defaultState.rounds || []).map((defaultRound, index) => normalizeRyderCupRound(
    getRoundSeed(!shouldReseedRounds ? rawRounds[index] || {} : {}, defaultRound, index),
    defaultRound,
    teams,
  ));
  return {
    title: cleanString(state.title) || defaultState.title,
    description: normalizeMyrtleRyderCupTopLevelDescription(cleanString(state.description) || cleanString(defaultState.description)),
    scheduleVersion: MYRTLE_RYDER_CUP_SCHEDULE_VERSION,
    players: playerRows.map((player) => ({ ...player })),
    teams,
    rounds,
    sideGames: normalizeRyderCupSideGames(state.sideGames, defaultState, trip),
    payout: normalizeRyderCupPayout(state.payout, defaultState, trip),
    adminNotes: {
      hardConstraints: [],
      requestedGroupings: [],
      notes: Array.isArray(state && state.adminNotes && state.adminNotes.notes)
        ? state.adminNotes.notes.map((note) => normalizeMyrtleRyderCupAdminNote(cleanString(note))).filter(Boolean)
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
  const tripRyderCupHandicapLookup = buildTripRyderCupHandicapLookup(trip);
  const defaultState = getRyderCupDefaultState(trip);
  const playerRows = buildRyderCupPlayerRows(defaultState.players);
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
    const handicapIndex = resolveMyrtleRyderCupHandicapIndex(name, tripRyderCupHandicapLookup, playerRows, participant && participant.handicapIndex);
    output.push({
      participantId: participant && participant._id ? String(participant._id) : null,
      name,
      handicapIndex,
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
      handicapIndex: resolveMyrtleRyderCupHandicapIndex(name, tripRyderCupHandicapLookup, playerRows, null),
      status: roundNameSet.has(key) ? 'in' : '',
    });
  }

  if (!output.length) {
    for (const participant of participantDocs) {
      const name = cleanString(participant && participant.name);
      const key = normalizeNameKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const handicapIndex = resolveMyrtleRyderCupHandicapIndex(name, tripRyderCupHandicapLookup, playerRows, participant && participant.handicapIndex);
      output.push({
        participantId: participant && participant._id ? String(participant._id) : null,
        name,
        handicapIndex,
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

function assertValidRyderCupTeams(teams = [], players = []) {
  if (!areValidRyderCupTeams(teams, players)) {
    throw new Error('Ryder Cup teams must keep evenly sized, ranked rosters in groups of 4.');
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
  const planGroups = Array.isArray(round && round.plan && round.plan.groups) ? round.plan.groups : [];
  const expectedGroups = getRyderCupRoundGroupNumbers(matches);
  const actualGroups = getRyderCupRoundGroupNumbers(planGroups);
  if (actualGroups.length !== expectedGroups.length || expectedGroups.some((groupNumber, index) => actualGroups[index] !== groupNumber)) {
    throw new Error(`Ryder Cup ${round.title || 'round'} must include a daily plan entry for every foursome.`);
  }
}

function setTripRyderCupTeams(trip = {}, payload = {}) {
  const current = getTripRyderCupState(trip, { force: true });
  const hasStarted = hasStartedRyderCup(current.rounds);
  if (hasStarted) {
    throw new Error('Ryder Cup teams are locked after results are entered.');
  }
  const nextTeams = normalizeRyderCupTeams(payload && payload.teams, current);
  const nextState = {
    ...current,
    teams: nextTeams,
    rounds: current.rounds.map((round) => remapRyderCupRoundForTeams(round, nextTeams)),
  };
  assertValidRyderCupTeams(nextState.teams, nextState.players);
  try {
    nextState.rounds.forEach((round) => assertValidRyderCupRound(round, nextState.teams));
  } catch (_error) {
    throw new Error('Team changes require updated round matchups. Save the teams in a split that still gives each match the correct 2-vs-2 or singles setup.');
  }
  return setTripRyderCupState(trip, nextState);
}

function haveSameRyderCupPlayerSet(leftPlayers = [], rightPlayers = []) {
  const left = uniqueNames(leftPlayers).map((name) => normalizeNameKey(name)).filter(Boolean).sort();
  const right = uniqueNames(rightPlayers).map((name) => normalizeNameKey(name)).filter(Boolean).sort();
  if (left.length !== right.length) return false;
  return left.every((key, index) => key === right[index]);
}

function buildRyderCupTeamsFromOverlayState(overlayState = {}, currentState = {}) {
  const currentTeams = Array.isArray(currentState.teams) ? currentState.teams : [];
  const playerRows = buildRyderCupPlayerRows(currentState.players);
  const allowedPlayers = playerRows.map((player) => player.name);
  const expectedCount = allowedPlayers.length / 2;
  const currentTeamA = currentTeams.find((team, index) => normalizeRyderCupTeamId(team && team.id, index) === 'teamA') || currentTeams[0] || { name: 'Team A' };
  const currentTeamB = currentTeams.find((team, index) => normalizeRyderCupTeamId(team && team.id, index) === 'teamB') || currentTeams[1] || { name: 'Team B' };
  const teamAPlayers = normalizeRyderCupTeamPlayers(
    Array.isArray(overlayState && overlayState.teamAPlayers)
      ? overlayState.teamAPlayers.map((player) => resolveOverlayPlayerName(player, playerRows))
      : [],
    allowedPlayers,
    expectedCount
  );
  const teamBPlayers = normalizeRyderCupTeamPlayers(
    Array.isArray(overlayState && overlayState.teamBPlayers)
      ? overlayState.teamBPlayers.map((player) => resolveOverlayPlayerName(player, playerRows))
      : [],
    allowedPlayers,
    expectedCount
  );
  return [
    {
      id: 'teamA',
      name: cleanString(overlayState && overlayState.teamAName) || cleanString(currentTeamA.name) || 'Team A',
      players: teamAPlayers,
    },
    {
      id: 'teamB',
      name: cleanString(overlayState && overlayState.teamBName) || cleanString(currentTeamB.name) || 'Team B',
      players: teamBPlayers,
    },
  ];
}

function deriveRyderCupOverlaySwapPairs(currentTeams = [], nextTeams = []) {
  const currentTeamA = currentTeams.find((team, index) => normalizeRyderCupTeamId(team && team.id, index) === 'teamA') || currentTeams[0] || { players: [] };
  const nextTeamA = nextTeams.find((team, index) => normalizeRyderCupTeamId(team && team.id, index) === 'teamA') || nextTeams[0] || { players: [] };
  const currentASet = new Set((currentTeamA.players || []).map((name) => normalizeNameKey(name)).filter(Boolean));
  const nextASet = new Set((nextTeamA.players || []).map((name) => normalizeNameKey(name)).filter(Boolean));
  const outgoingA = (currentTeamA.players || []).filter((name) => !nextASet.has(normalizeNameKey(name)));
  const incomingA = (nextTeamA.players || []).filter((name) => !currentASet.has(normalizeNameKey(name)));
  if (outgoingA.length !== incomingA.length) {
    throw new Error('Ryder Cup roster changes must swap the same number of players between teams.');
  }
  return outgoingA.map((playerName, index) => ({
    playerName,
    targetPlayerName: incomingA[index],
  }));
}

function applyRyderCupTeamSwapToState(state = {}, playerName = '', targetPlayerName = '') {
  const leftName = normalizeRyderCupPlayerName(playerName);
  const rightName = normalizeRyderCupPlayerName(targetPlayerName);
  if (!leftName || !rightName || leftName === rightName) return state;
  return {
    ...state,
    teams: (state.teams || []).map((team) => ({
      ...team,
      players: swapPlayerName(team.players, leftName, rightName),
    })),
    rounds: (state.rounds || []).map((round) => ({
      ...round,
      matches: (round.matches || []).map((match) => ({
        ...match,
        teamAPlayers: swapPlayerName(match.teamAPlayers, leftName, rightName),
        teamBPlayers: swapPlayerName(match.teamBPlayers, leftName, rightName),
      })),
    })),
  };
}

function syncTripRyderCupOverlayToCompetition(trip = {}, overlayState = {}) {
  if (!isMyrtleRyderCupTrip(trip)) return null;
  const current = getTripRyderCupState(trip, { force: true });
  if (!current || !Array.isArray(current.teams) || current.teams.length !== 2) return null;
  const nextTeams = buildRyderCupTeamsFromOverlayState(overlayState, current);
  assertValidRyderCupTeams(nextTeams, current.players);

  const currentTeamA = current.teams.find((team, index) => normalizeRyderCupTeamId(team && team.id, index) === 'teamA') || current.teams[0] || { players: [] };
  const currentTeamB = current.teams.find((team, index) => normalizeRyderCupTeamId(team && team.id, index) === 'teamB') || current.teams[1] || { players: [] };
  const nextTeamA = nextTeams[0];
  const nextTeamB = nextTeams[1];
  const rosterChanged = !haveSameRyderCupPlayerSet(currentTeamA.players, nextTeamA.players)
    || !haveSameRyderCupPlayerSet(currentTeamB.players, nextTeamB.players);

  if (rosterChanged && hasStartedRyderCup(current.rounds)) {
    throw new Error('Ryder Cup teams are locked after results are entered.');
  }

  let nextState = clonePlain(current);
  if (rosterChanged) {
    const swaps = deriveRyderCupOverlaySwapPairs(current.teams, nextTeams);
    swaps.forEach((swap) => {
      nextState = applyRyderCupTeamSwapToState(nextState, swap.playerName, swap.targetPlayerName);
    });
  }

  nextState.teams = nextTeams.map((team) => ({
    ...team,
    players: (team.players || []).slice(),
  }));
  assertValidRyderCupTeams(nextState.teams, nextState.players);
  nextState.rounds.forEach((round) => assertValidRyderCupRound(round, nextState.teams));
  return setTripRyderCupState(trip, nextState);
}

function setTripRyderCupRound(trip = {}, roundIndex, payload = {}) {
  const current = getTripRyderCupState(trip, { force: true });
  const index = Number(roundIndex);
  if (!Number.isInteger(index) || index < 0 || index >= current.rounds.length) {
    throw new Error('Ryder Cup round not found.');
  }
  const tripRounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  const nextState = clonePlain(current);
  const roundPayload = isMyrtleRyderCupTrip(trip)
    ? syncMyrtleRyderCupRoundToTripTeeSheet(payload, current.rounds[index], tripRounds[index] || {}, nextState.teams)
    : payload;
  nextState.rounds[index] = normalizeRyderCupRound(roundPayload, current.rounds[index], nextState.teams);
  const scheduleSync = nextState.rounds[index] && nextState.rounds[index].scheduleSync;
  if (scheduleSync && scheduleSync.status === 'invalid') {
    const firstIssue = Array.isArray(scheduleSync.issues) && scheduleSync.issues.length ? scheduleSync.issues[0] : 'The current tee sheet does not match the Ryder Cup format.';
    throw new Error(`Fix the scheduled foursomes before saving Ryder Cup scores. ${firstIssue}`);
  }
  assertValidRyderCupRound(nextState.rounds[index], nextState.teams);
  return setTripRyderCupState(trip, nextState);
}

function setTripRyderCupSettings(trip = {}, payload = {}) {
  const current = getTripRyderCupState(trip, { force: true });
  const nextState = {
    ...current,
    sideGames: Object.prototype.hasOwnProperty.call(payload || {}, 'sideGames')
      ? normalizeRyderCupSideGames(payload.sideGames, current, trip)
      : current.sideGames,
    payout: Object.prototype.hasOwnProperty.call(payload || {}, 'payout')
      ? normalizeRyderCupPayout(payload.payout, current, trip)
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
  const hasStarted = hasStartedRyderCup(current.rounds);
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

  assertValidRyderCupTeams(nextState.teams, nextState.players);
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

function resolveRyderCupMatchTotals(round = {}, match = {}, handicapLookup = null) {
  const expectedCount = isSinglesFormat(round.format) ? 1 : 2;
  const formatKey = cleanString(round && round.formatKey).toLowerCase();
  const teamAPlayerScores = normalizeRyderCupScoreList(match.teamAPlayerScores, expectedCount);
  const teamBPlayerScores = normalizeRyderCupScoreList(match.teamBPlayerScores, expectedCount);
  const contributionLookup = buildRyderCupMatchContributionLookup(match);
  const teamASideState = buildRyderCupMatchSideScoreState(match.teamAPlayers || [], teamAPlayerScores, handicapLookup, contributionLookup);
  const teamBSideState = buildRyderCupMatchSideScoreState(match.teamBPlayers || [], teamBPlayerScores, handicapLookup, contributionLookup);
  const teamAHandicapAllowance = teamASideState.allowanceTotal;
  const teamBHandicapAllowance = teamBSideState.allowanceTotal;
  let teamAScore = normalizeRyderCupScore(match.teamAScore);
  let teamBScore = normalizeRyderCupScore(match.teamBScore);
  let teamAGrossScore = teamAScore;
  let teamBGrossScore = teamBScore;
  let scoreSource = '';
  if (isGrossTotalFormatKey(formatKey) || formatKey === 'combinedscore') {
    if (Number.isFinite(teamASideState.grossTotal) && Number.isFinite(teamBSideState.grossTotal)) {
      teamAGrossScore = teamASideState.grossTotal;
      teamBGrossScore = teamBSideState.grossTotal;
      teamAScore = teamASideState.grossTotal - teamAHandicapAllowance;
      teamBScore = teamBSideState.grossTotal - teamBHandicapAllowance;
      scoreSource = 'playerScores';
    } else if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
      teamAGrossScore = teamAScore;
      teamBGrossScore = teamBScore;
      teamAScore -= teamAHandicapAllowance;
      teamBScore -= teamBHandicapAllowance;
      scoreSource = 'teamTotals';
    }
  } else if (formatKey === 'bestballstroke') {
    if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
      teamAGrossScore = teamAScore;
      teamBGrossScore = teamBScore;
      scoreSource = 'teamTotals';
    }
  } else if (formatKey === 'fourBallMatch') {
    // Four-ball: Compare net scores hole-by-hole, best net per hole wins the hole
    if (Number.isFinite(teamASideState.grossTotal) && Number.isFinite(teamBSideState.grossTotal)) {
      teamAGrossScore = teamASideState.grossTotal;
      teamBGrossScore = teamBSideState.grossTotal;
      teamAScore = teamASideState.grossTotal - teamAHandicapAllowance;
      teamBScore = teamBSideState.grossTotal - teamBHandicapAllowance;
      scoreSource = 'playerScores';
    } else if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
      teamAGrossScore = teamAScore;
      teamBGrossScore = teamBScore;
      teamAScore -= teamAHandicapAllowance;
      teamBScore -= teamBHandicapAllowance;
      scoreSource = 'teamTotals';
    }
  } else if (formatKey === 'threeBallMatch') {
    // Three-ball: Individual competition, lowest net score wins
    if (Number.isFinite(teamASideState.grossTotal) && Number.isFinite(teamBSideState.grossTotal)) {
      teamAGrossScore = teamASideState.grossTotal;
      teamBGrossScore = teamBSideState.grossTotal;
      teamAScore = teamASideState.grossTotal - teamAHandicapAllowance;
      teamBScore = teamBSideState.grossTotal - teamBHandicapAllowance;
      scoreSource = 'playerScores';
    } else if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
      teamAGrossScore = teamAScore;
      teamBGrossScore = teamBScore;
      teamAScore -= teamAHandicapAllowance;
      teamBScore -= teamBHandicapAllowance;
      scoreSource = 'teamTotals';
    }
  } else if (formatKey === 'bestBallMatch') {
    // Best-ball: Sum the best net score from each pair per hole
    if (Number.isFinite(teamASideState.grossTotal) && Number.isFinite(teamBSideState.grossTotal)) {
      teamAGrossScore = teamASideState.grossTotal;
      teamBGrossScore = teamBSideState.grossTotal;
      teamAScore = teamASideState.grossTotal - teamAHandicapAllowance;
      teamBScore = teamBSideState.grossTotal - teamBHandicapAllowance;
      scoreSource = 'playerScores';
    } else if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
      teamAGrossScore = teamAScore;
      teamBGrossScore = teamBScore;
      teamAScore -= teamAHandicapAllowance;
      teamBScore -= teamBHandicapAllowance;
      scoreSource = 'teamTotals';
    }
  } else if (formatKey === 'stablefordMatch') {
    // Stableford: Points-based scoring (Birdie=3, Par=2, Bogey=1, Double+=0)
    // For team competition, we need to sum individual Stableford points
    if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
      teamAGrossScore = teamAScore;
      teamBGrossScore = teamBScore;
      scoreSource = 'teamTotals';
    }
  } else if (Number.isFinite(teamAScore) && Number.isFinite(teamBScore)) {
    teamAGrossScore = teamAScore;
    teamBGrossScore = teamBScore;
    scoreSource = 'teamTotals';
  }
  return {
    teamAPlayerScores,
    teamBPlayerScores,
    teamAPlayerContributionStates: teamASideState.contributionStates,
    teamBPlayerContributionStates: teamBSideState.contributionStates,
    teamAScore,
    teamBScore,
    teamAGrossScore,
    teamBGrossScore,
    teamAHandicapAllowance,
    teamBHandicapAllowance,
    teamAActivePlayers: teamASideState.activePlayers,
    teamBActivePlayers: teamBSideState.activePlayers,
    teamANoContributionPlayers: teamASideState.noContributionPlayers,
    teamBNoContributionPlayers: teamBSideState.noContributionPlayers,
    scoreSource,
  };
}

function resolveRyderCupMatchOutcome(round = {}, match = {}, handicapLookup = null) {
  const scoreState = resolveRyderCupMatchTotals(round, match, handicapLookup);
  const manualResult = normalizeRyderCupResult(match && match.result);
  const noShowForfeitResult = inferRyderCupNoShowForfeitResult(round, scoreState);
  const inferredResult = inferRyderCupWinningResult(scoreState.teamAScore, scoreState.teamBScore);
  return {
    ...scoreState,
    resultKey: manualResult || noShowForfeitResult || inferredResult,
    resultSource: manualResult
      ? 'manual'
      : (noShowForfeitResult ? 'noShowForfeit' : (inferredResult ? 'scores' : '')),
  };
}

function resolveRyderCupRoundScore(round = {}) {
  const score = round && round.roundScore ? round.roundScore : {};
  const teamAScore = normalizeRyderCupScore(score.teamAScore);
  const teamBScore = normalizeRyderCupScore(score.teamBScore);
  const manualResult = normalizeRyderCupResult(score.result);
  const inferredResult = inferRyderCupWinningResult(teamAScore, teamBScore);
  return {
    teamAScore,
    teamBScore,
    notes: cleanString(score.notes),
    resultKey: manualResult || inferredResult,
    resultSource: manualResult ? 'manual' : (inferredResult ? 'scores' : ''),
  };
}

function hasStartedRyderCup(rounds = []) {
  return (rounds || []).some((round) => {
    if (isRyderCupTeamRound(round)) {
      return Boolean(resolveRyderCupRoundScore(round).resultKey);
    }
    return (round.matches || []).some((match) => Boolean(resolveRyderCupMatchOutcome(round, match).resultKey));
  });
}

function buildRyderCupRoundPlanView(round = {}) {
  const savedGroups = Array.isArray(round && round.plan && round.plan.groups) ? round.plan.groups : [];
  const savedByGroup = new Map(savedGroups.map((entry) => [asPositiveInteger(entry && entry.groupNumber), entry]));
  const groups = getRyderCupRoundGroupNumbers(round.matches || []).map((groupNumber) => {
    const groupMatches = (round.matches || []).filter((match, matchIndex) => (asPositiveInteger(match && match.groupNumber) || (matchIndex + 1)) === groupNumber);
    const teamAPlayers = uniqueNames(groupMatches.flatMap((match) => match.teamAPlayers || []));
    const teamBPlayers = uniqueNames(groupMatches.flatMap((match) => match.teamBPlayers || []));
    const saved = savedByGroup.get(groupNumber) || {};
    return {
      groupNumber,
      label: `Foursome ${groupNumber}`,
      players: uniqueNames(teamAPlayers.concat(teamBPlayers)),
      teamAPlayers,
      teamBPlayers,
      playStyle: coerceRyderCupPlanStyle(cleanString(saved.playStyle), round.format),
      notes: cleanString(saved.notes),
      pairings: groupMatches.map((match, matchIndex) => ({
        matchNumber: match.matchNumber || (matchIndex + 1),
        label: cleanString(match.label) || (isSinglesFormat(round.format) ? `Singles ${matchIndex + 1}` : `Match ${matchIndex + 1}`),
        teamAPlayers: (match.teamAPlayers || []).slice(),
        teamBPlayers: (match.teamBPlayers || []).slice(),
      })),
    };
  });
  return {
    dayNote: cleanString(round && round.plan && round.plan.dayNote),
    groups,
  };
}

function buildRyderCupFairness(teams = [], players = []) {
  const { rankMap, rows } = buildRyderCupPlayerMaps(players);
  const tierSize = Math.max(1, Math.floor(rows.length / 4));
  const bottomTierStart = Math.max(1, rows.length - tierSize + 1);
  const summary = teams.map((team) => {
    const ranks = (team.players || []).map((name) => rankMap.get(name)).filter((value) => Number.isFinite(value));
    const rankSum = ranks.reduce((sum, value) => sum + value, 0);
    const averageRank = ranks.length ? rankSum / ranks.length : null;
    const topFiveCount = ranks.filter((rank) => rank <= tierSize).length;
    const bottomFiveCount = ranks.filter((rank) => rank >= bottomTierStart).length;
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
  const roundRules = (rounds || []).map((round) => ({
    roundNumber: round.roundNumber,
    title: round.title,
    format: round.format,
    description: cleanString(round.description),
  }));
  return {
    hardConstraints: [],
    requestedGroupings: [],
    roundRules,
  };
}

function buildRyderCupRoundAndStandingsView(rounds = [], teams = [], handicapLookup = null) {
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
      const resolved = resolveRyderCupMatchOutcome(round, match, handicapLookup);
      const points = getRyderCupMatchPoints(resolved.resultKey, roundPointValue);
      if (!isRyderCupTeamRound(round)) {
        totalPointsAvailable += roundPointValue;
        if (points.complete) {
          roundPointsA += points.pointsA;
          roundPointsB += points.pointsB;
          completedMatches += 1;
        } else {
          remainingPoints += roundPointValue;
        }
      }
      return {
        ...match,
        teamAPlayerScores: resolved.teamAPlayerScores,
        teamBPlayerScores: resolved.teamBPlayerScores,
        teamAPlayerContributionStates: resolved.teamAPlayerContributionStates,
        teamBPlayerContributionStates: resolved.teamBPlayerContributionStates,
        teamAScore: resolved.teamAScore,
        teamBScore: resolved.teamBScore,
        teamAGrossScore: resolved.teamAGrossScore,
        teamBGrossScore: resolved.teamBGrossScore,
        teamAHandicapAllowance: resolved.teamAHandicapAllowance,
        teamBHandicapAllowance: resolved.teamBHandicapAllowance,
        teamAActivePlayers: resolved.teamAActivePlayers,
        teamBActivePlayers: resolved.teamBActivePlayers,
        teamANoContributionPlayers: resolved.teamANoContributionPlayers,
        teamBNoContributionPlayers: resolved.teamBNoContributionPlayers,
        scoreSource: resolved.scoreSource,
        enteredResult: normalizeRyderCupResult(match.result),
        result: points.resultKey,
        resultSource: resolved.resultSource,
        pointsA: points.pointsA,
        pointsB: points.pointsB,
        isComplete: points.complete,
      };
    });
    let roundScore = {
      teamAScore: null,
      teamBScore: null,
      notes: cleanString(round && round.roundScore && round.roundScore.notes),
      result: '',
      resultSource: '',
      pointsA: 0,
      pointsB: 0,
      isComplete: false,
    };
    if (isRyderCupTeamRound(round)) {
      const resolvedRoundScore = resolveRyderCupRoundScore(round);
      const roundPoints = getRyderCupMatchPoints(resolvedRoundScore.resultKey, roundPointValue);
      totalPointsAvailable += roundPointValue;
      if (roundPoints.complete) {
        roundPointsA += roundPoints.pointsA;
        roundPointsB += roundPoints.pointsB;
        completedMatches = 1;
      } else {
        remainingPoints += roundPointValue;
      }
      roundScore = {
        teamAScore: resolvedRoundScore.teamAScore,
        teamBScore: resolvedRoundScore.teamBScore,
        notes: resolvedRoundScore.notes,
        enteredResult: normalizeRyderCupResult(round && round.roundScore && round.roundScore.result),
        result: roundPoints.resultKey,
        resultSource: resolvedRoundScore.resultSource,
        pointsA: roundPoints.pointsA,
        pointsB: roundPoints.pointsB,
        isComplete: roundPoints.complete,
      };
    }
    teamAPoints += roundPointsA;
    teamBPoints += roundPointsB;
    return {
      ...round,
      plan: buildRyderCupRoundPlanView({
        ...round,
        matches,
      }),
      matches,
      roundScore,
      pointsAvailable: isRyderCupTeamRound(round)
        ? roundPointValue
        : (round.matches || []).length * roundPointValue,
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

function buildRyderCupIndividualLeaderboard(rounds = [], teams = [], handicapLookup = null, players = []) {
  const teamLookup = buildRyderCupTeamLookup(teams);
  const teamAPlayers = ((teams[0] && teams[0].players) || []).slice();
  const teamBPlayers = ((teams[1] && teams[1].players) || []).slice();
  const rowsByName = new Map(buildRyderCupPlayerRows(players).map((player) => [normalizeNameKey(player.name), {
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
  const applyIndividualMatchResult = (playerNames = [], teamId = '', resultKey = '', pointsWon = 0, options = {}) => {
    const awardPoints = options.awardPoints !== false;
    (playerNames || []).forEach((name) => {
      const entry = rowsByName.get(normalizeNameKey(name));
      if (!entry) return;
      entry.matchesPlayed += 1;
      if (awardPoints) entry.pointsWon += pointsWon;
      if (resultKey === 'halved') entry.halves += 1;
      else if (resultKey === teamId) entry.wins += 1;
      else if (resultKey) entry.losses += 1;
    });
  };
  rounds.forEach((round) => {
    const pointValue = asFiniteNumber(round.pointValue) || 1;
    if (isRyderCupTeamRound(round)) {
      const resolved = resolveRyderCupRoundScore(round);
      const points = getRyderCupMatchPoints(resolved.resultKey, pointValue);
      if (!points.complete) return;
      const participationShareA = teamAPlayers.length ? points.pointsA / teamAPlayers.length : 0;
      const participationShareB = teamBPlayers.length ? points.pointsB / teamBPlayers.length : 0;
      applyIndividualMatchResult(teamAPlayers, 'teamA', points.resultKey, participationShareA);
      applyIndividualMatchResult(teamBPlayers, 'teamB', points.resultKey, participationShareB);
      return;
    }
    (round.matches || []).forEach((match) => {
      const resolved = resolveRyderCupMatchOutcome(round, match, handicapLookup);
      const points = getRyderCupMatchPoints(resolved.resultKey, pointValue);
      if (!points.complete) return;
      const teamAPlayers = Array.isArray(resolved.teamAActivePlayers) && resolved.teamAActivePlayers.length
        ? resolved.teamAActivePlayers
        : [];
      const teamBPlayers = Array.isArray(resolved.teamBActivePlayers) && resolved.teamBActivePlayers.length
        ? resolved.teamBActivePlayers
        : [];
      applyIndividualMatchResult(teamAPlayers, 'teamA', points.resultKey, points.pointsA);
      applyIndividualMatchResult(teamBPlayers, 'teamB', points.resultKey, points.pointsB);
      // No-show golfers do not get match credit for rounds they missed.
      // applyIndividualMatchResult(resolved.teamANoContributionPlayers || [], 'teamA', points.resultKey, 0, { awardPoints: false });
      // applyIndividualMatchResult(resolved.teamBNoContributionPlayers || [], 'teamB', points.resultKey, 0, { awardPoints: false });
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

function buildRyderCupNetScoreSummary(rounds = [], handicapLookup = null, players = []) {
  const playerRows = buildRyderCupPlayerRows(players);
  const totalsByName = new Map(playerRows.map((player) => [normalizeNameKey(player.name), {
    name: player.name,
    grossTotal: 0,
    netTotal: 0,
    roundsScored: 0,
  }]));
  const roundSummaries = (rounds || []).map((round, roundIndex) => {
    const roundNumber = asPositiveInteger(round && round.roundNumber) || (roundIndex + 1);
    const title = cleanString(round && round.title) || `Round ${roundNumber}`;
    const eligible = !isRyderCupTeamRound(round);
    const rowsByName = new Map();
    const pushScore = (playerName = '', grossScore = null) => {
      const normalizedGross = normalizeRyderCupScore(grossScore);
      if (!Number.isFinite(normalizedGross)) return;
      const cleanName = normalizeRyderCupPlayerName(playerName);
      const playerKey = normalizeNameKey(cleanName);
      if (!cleanName || !playerKey || rowsByName.has(playerKey)) return;
      const matchHandicap = resolveMyrtleRyderCupMatchAllowance(cleanName, handicapLookup, playerRows, null);
      rowsByName.set(playerKey, {
        playerName: cleanName,
        grossTotal: normalizedGross,
        netTotal: normalizedGross - matchHandicap,
        matchHandicap,
      });
    };
    if (eligible) {
      let expectedCount = 0;
      (round.matches || []).forEach((match) => {
        const resolved = resolveRyderCupMatchOutcome(round, match, handicapLookup);
        expectedCount += (resolved.teamAActivePlayers || []).length + (resolved.teamBActivePlayers || []).length;
        (match.teamAPlayers || []).forEach((playerName, playerIndex) => pushScore(playerName, resolved.teamAPlayerScores[playerIndex]));
        (match.teamBPlayers || []).forEach((playerName, playerIndex) => pushScore(playerName, resolved.teamBPlayerScores[playerIndex]));
      });
      const rows = Array.from(rowsByName.values()).sort((left, right) => {
        if (left.netTotal !== right.netTotal) return left.netTotal - right.netTotal;
        if (left.grossTotal !== right.grossTotal) return left.grossTotal - right.grossTotal;
        return left.playerName.localeCompare(right.playerName);
      });
      const enteredCount = rows.length;
      const hasScores = enteredCount > 0;
      const complete = eligible && expectedCount > 0 && enteredCount === expectedCount;
      if (complete) {
        rows.forEach((row) => {
          const total = totalsByName.get(normalizeNameKey(row.playerName));
          if (!total) return;
          total.grossTotal += row.grossTotal;
          total.netTotal += row.netTotal;
          total.roundsScored += 1;
        });
      }
      const eligibleRows = rows.filter((row) => row.netTotal > 72 - row.matchHandicap - 8);
      const lowestNet = complete && eligibleRows.length ? eligibleRows[0].netTotal : null;
      return {
        roundNumber,
        title,
        eligible,
        hasScores,
        complete,
        enteredCount,
        expectedCount,
        pendingCount: Math.max(expectedCount - enteredCount, 0),
        rows,
        lowestNet,
        winners: Number.isFinite(lowestNet)
          ? eligibleRows.filter((row) => row.netTotal === lowestNet).map((row) => row.playerName)
          : [],
      };
    }
    const rows = Array.from(rowsByName.values()).sort((left, right) => {
      if (left.netTotal !== right.netTotal) return left.netTotal - right.netTotal;
      if (left.grossTotal !== right.grossTotal) return left.grossTotal - right.grossTotal;
      return left.playerName.localeCompare(right.playerName);
    });
    const expectedCount = eligible ? players.length : 0;
    const enteredCount = rows.length;
    const hasScores = enteredCount > 0;
    const complete = eligible && expectedCount > 0 && enteredCount === expectedCount;
    if (complete) {
      rows.forEach((row) => {
        const total = totalsByName.get(normalizeNameKey(row.playerName));
        if (!total) return;
        total.grossTotal += row.grossTotal;
        total.netTotal += row.netTotal;
        total.roundsScored += 1;
      });
    }
    const eligibleRows = rows.filter((row) => row.netTotal > 72 - row.matchHandicap - 8);
    const lowestNet = complete && eligibleRows.length ? eligibleRows[0].netTotal : null;
    return {
      roundNumber,
      title,
      eligible,
      hasScores,
      enteredCount,
      expectedCount,
      pendingCount: Math.max(0, expectedCount - enteredCount),
      complete,
      lowestNet,
      winners: Number.isFinite(lowestNet) ? eligibleRows.filter((row) => row.netTotal === lowestNet).map((row) => row.playerName) : [],
      rows,
    };
  });
  const eligibleRounds = roundSummaries.filter((round) => round.eligible);
  const completedRoundsCount = eligibleRounds.filter((round) => round.complete).length;
  const totals = Array.from(totalsByName.values())
    .filter((row) => row.roundsScored > 0 && (completedRoundsCount === 0 || row.roundsScored === completedRoundsCount))
    .sort((left, right) => {
      if (left.netTotal !== right.netTotal) return left.netTotal - right.netTotal;
      if (left.grossTotal !== right.grossTotal) return left.grossTotal - right.grossTotal;
      return left.name.localeCompare(right.name);
    });
  const complete = eligibleRounds.length > 0
    && eligibleRounds.every((round) => round.complete)
    && totals.length > 0;
  const lowestNet = complete && totals.length ? totals[0].netTotal : null;
  return {
    rounds: roundSummaries,
    totals,
    complete,
    completedRoundsCount: eligibleRounds.filter((round) => round.complete).length,
    eligibleRoundsCount: eligibleRounds.length,
    lowestNet,
    winners: Number.isFinite(lowestNet) ? totals.filter((row) => row.netTotal === lowestNet).map((row) => row.name) : [],
  };
}

function buildRyderCupSideGameTeamLookup(teams = []) {
  const lookup = new Map();
  (teams[0] && Array.isArray(teams[0].players) ? teams[0].players : []).forEach((name) => {
    lookup.set(normalizeNameKey(name), 'teamA');
  });
  (teams[1] && Array.isArray(teams[1].players) ? teams[1].players : []).forEach((name) => {
    lookup.set(normalizeNameKey(name), 'teamB');
  });
  return lookup;
}

function hashDeterministicSeed(value = '') {
  const input = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickDeterministicWinner(values = [], seed = '') {
  const pool = uniqueNames(values).sort((left, right) => left.localeCompare(right));
  if (!pool.length) return [];
  const winnerIndex = hashDeterministicSeed(`${seed}|${pool.join('|')}`) % pool.length;
  return [pool[winnerIndex]];
}

function buildAutomaticRyderCupOver100Draw(eligible = {}, seed = '', excludedNames = []) {
  const excludedKeys = new Set((Array.isArray(excludedNames) ? excludedNames : [excludedNames])
    .map((name) => normalizeNameKey(name))
    .filter(Boolean));
  const teamAEligible = uniqueNames(eligible && eligible.teamAEligible)
    .filter((name) => !excludedKeys.has(normalizeNameKey(name)))
    .sort((left, right) => left.localeCompare(right));
  const teamBEligible = uniqueNames(eligible && eligible.teamBEligible)
    .filter((name) => !excludedKeys.has(normalizeNameKey(name)))
    .sort((left, right) => left.localeCompare(right));
  const teamAWinnerNames = pickDeterministicWinner(teamAEligible, `${seed}|teamA`);
  const teamBWinnerNames = pickDeterministicWinner(teamBEligible, `${seed}|teamB`);
  return {
    winnerNames: uniqueNames([].concat(teamAWinnerNames, teamBWinnerNames)),
    teamAWinnerNames,
    teamBWinnerNames,
  };
}

function buildRyderCupOver100EligibleTeams(rows = [], teamLookup = new Map()) {
  const teamAEligible = [];
  const teamBEligible = [];
  (rows || []).forEach((row) => {
    if ((asFiniteNumber(row && row.grossTotal) || 0) <= 100) return;
    const playerName = normalizeRyderCupPlayerName(row && row.playerName);
    const teamKey = teamLookup.get(normalizeNameKey(playerName));
    if (teamKey === 'teamA') teamAEligible.push(playerName);
    else if (teamKey === 'teamB') teamBEligible.push(playerName);
  });
  return {
    teamAEligible: uniqueNames(teamAEligible).sort((left, right) => left.localeCompare(right)),
    teamBEligible: uniqueNames(teamBEligible).sort((left, right) => left.localeCompare(right)),
  };
}

function parseRyderCupOver100DrawExclusions(notes = '') {
  const text = cleanString(notes);
  if (!text) return [];
  const matches = [];
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*exclude(?:\s+winners?)?\s*:\s*(.+)\s*$/i);
    if (match && match[1]) matches.push(match[1]);
  });
  if (!matches.length) {
    Array.from(text.matchAll(/exclude(?:\s+winners?)?\s*:\s*([^.\n]+)/gi)).forEach((match) => {
      if (match && match[1]) matches.push(match[1]);
    });
  }
  return uniqueNames(matches
    .flatMap((segment) => String(segment || '').split(/[|,;]+/))
    .map((name) => normalizeRyderCupPlayerName(name))
    .filter(Boolean));
}

function normalizeRyderCupBirdieCounts(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      playerName: normalizeRyderCupPlayerName(entry && entry.playerName),
      count: Math.max(0, Math.round(asFiniteNumber(entry && entry.count) || 0)),
    }))
    .filter((entry) => entry.playerName && entry.count > 0)
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.playerName.localeCompare(right.playerName);
    });
}

function buildRyderCupBirdiePoolShares(entries = [], amount = 0) {
  const counts = normalizeRyderCupBirdieCounts(entries);
  const totalBirdies = counts.reduce((sum, entry) => sum + entry.count, 0);
  const totalCents = Math.max(0, Math.round((asFiniteNumber(amount) || 0) * 100));
  if (!counts.length || !totalBirdies) {
    return {
      counts,
      totalBirdies: 0,
      paidPlayers: [],
      perBirdieAmount: null,
      awardedAmount: 0,
      leftoverAmount: roundCurrency(totalCents / 100),
      shareRows: [],
    };
  }

  const provisionalShares = counts.map((entry) => {
    const exactCents = (totalCents * entry.count) / totalBirdies;
    return {
      name: entry.playerName,
      birdies: entry.count,
      cents: Math.floor(exactCents / 100) * 100,
    };
  });
  const awardedCents = provisionalShares.reduce((sum, entry) => sum + entry.cents, 0);
  const leftoverCents = Math.max(0, totalCents - awardedCents);

  return {
    counts,
    totalBirdies,
    paidPlayers: counts.map((entry) => entry.playerName),
    perBirdieAmount: roundCurrency(totalCents / 100 / totalBirdies),
    awardedAmount: roundCurrency(awardedCents / 100),
    leftoverAmount: roundCurrency(leftoverCents / 100),
    shareRows: provisionalShares
      .map((entry) => ({
        name: entry.name,
        birdies: entry.birdies,
        amount: roundCurrency(entry.cents / 100),
      }))
      .sort((left, right) => {
        if (right.birdies !== left.birdies) return right.birdies - left.birdies;
        return left.name.localeCompare(right.name);
      }),
  };
}

function buildRyderCupAwardedPrizeWinnersBeforeRound(targetRoundNumber = 0, sources = {}) {
  const target = asPositiveInteger(targetRoundNumber);
  if (!target) return [];
  const winners = [];
  const pushWinners = (values = []) => {
    winners.push(...normalizeRyderCupWinnerList(values)
      .map(normalizeRyderCupPlayerName)
      .filter(Boolean));
  };
  [
    sources.dailyNet,
    sources.dailyGross,
    sources.dailyOver100Draw,
    sources.dailyLongestPuttLastHole,
  ].forEach((entries) => {
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      if ((asPositiveInteger(entry && entry.roundNumber) || 0) >= target) return;
      if ((asFiniteNumber(entry && entry.amount) || 0) <= 0) return;
      pushWinners(entry && entry.winnerNames);
    });
  });
  (Array.isArray(sources && sources.dailyBirdiePot) ? sources.dailyBirdiePot : []).forEach((entry) => {
    if ((asPositiveInteger(entry && entry.roundNumber) || 0) >= target) return;
    if ((asFiniteNumber(entry && entry.amount) || 0) <= 0) return;
    if (Array.isArray(entry && entry.shareRows) && entry.shareRows.length) {
      pushWinners(entry.shareRows.map((share) => share && share.name));
      return;
    }
    pushWinners(entry && entry.winnerNames);
  });
  (Array.isArray(sources && sources.closestEntries) ? sources.closestEntries : []).forEach((entry) => {
    if ((asPositiveInteger(entry && entry.roundNumber) || 0) >= target) return;
    if ((asFiniteNumber(entry && entry.amount) || 0) <= 0) return;
    pushWinners(entry && entry.playerName ? [entry.playerName] : []);
  });
  return uniqueNames(winners).sort((left, right) => left.localeCompare(right));
}

function buildRyderCupRedemptionEligiblePlayers(teams = [], excludedPlayers = []) {
  const excludedKeys = new Set((Array.isArray(excludedPlayers) ? excludedPlayers : [excludedPlayers])
    .map((name) => normalizeNameKey(name))
    .filter(Boolean));
  return uniqueNames((teams || []).flatMap((team) => Array.isArray(team && team.players) ? team.players : []))
    .filter((name) => !excludedKeys.has(normalizeNameKey(name)))
    .sort((left, right) => left.localeCompare(right));
}

function buildRyderCupSideGamesView(sideGames = {}, individualLeaderboard = [], rounds = [], handicapLookup = null, teams = [], players = []) {
  const netSummary = buildRyderCupNetScoreSummary(rounds, handicapLookup, players);
  const teamLookup = buildRyderCupSideGameTeamLookup(teams);
  const buildDailyBirdiePotView = (savedEntries = [], labelSuffix = 'Birdie Pot') => (
    netSummary.rounds
      .filter((round) => round.eligible)
      .map((roundSummary, index) => {
        const saved = savedEntries.find((entry) => Number(entry && entry.roundNumber) === Number(roundSummary.roundNumber))
          || savedEntries[index]
          || {};
        const amount = normalizeCurrencyAmount(saved.amount);
        const birdiePool = buildRyderCupBirdiePoolShares(saved.counts, amount);
        const counts = birdiePool.counts;
        const highestCount = counts.length ? counts[0].count : 0;
        return {
          roundNumber: roundSummary.roundNumber,
          label: cleanString(saved.label) || `${roundSummary.title} ${labelSuffix}`,
          counts,
          winnerNames: birdiePool.paidPlayers,
          automaticWinners: birdiePool.paidPlayers,
          amount,
          notes: cleanString(saved.notes),
          manualOverride: false,
          highestCount: highestCount || null,
          totalBirdies: birdiePool.totalBirdies,
          perBirdieAmount: birdiePool.perBirdieAmount,
          awardedAmount: birdiePool.awardedAmount,
          leftoverAmount: birdiePool.leftoverAmount,
          shareRows: birdiePool.shareRows,
          hasScores: roundSummary.hasScores,
          enteredCount: roundSummary.enteredCount,
          expectedCount: roundSummary.expectedCount,
          pendingCount: roundSummary.pendingCount,
          isComplete: roundSummary.complete,
        };
      })
  );
  const closestEntries = sideGames && sideGames.closestToPin && Array.isArray(sideGames.closestToPin.entries)
    ? sideGames.closestToPin.entries
    : [];
  const closestToPinWinners = uniqueNames(closestEntries.map((entry) => entry.playerName).filter(Boolean));
  const tripBirdiePool = buildRyderCupBirdiePoolShares(
    sideGames && sideGames.birdiePool && Array.isArray(sideGames.birdiePool.counts)
      ? sideGames.birdiePool.counts
      : [],
    sideGames && sideGames.birdiePool ? sideGames.birdiePool.amount : null
  );
  const birdieLeaderboard = tripBirdiePool.counts;
  const overrideMvpWinners = normalizeRyderCupWinnerList(sideGames && sideGames.mvp && sideGames.mvp.overrideWinners);
  const highestPoints = individualLeaderboard.length ? individualLeaderboard[0].pointsWon : 0;
  const automaticMvpWinners = highestPoints > 0
    ? individualLeaderboard.filter((entry) => entry.pointsWon === highestPoints).map((entry) => entry.name)
    : [];
  const savedDailyNet = Array.isArray(sideGames && sideGames.dailyNet) ? sideGames.dailyNet : [];
  const savedDailyGross = Array.isArray(sideGames && sideGames.dailyGross) ? sideGames.dailyGross : [];
  const savedDailyOver100Draw = Array.isArray(sideGames && sideGames.dailyOver100Draw)
    ? sideGames.dailyOver100Draw
    : [];
  const dailyOver100Draw = netSummary.rounds
    .filter((round) => round.eligible)
    .map((roundSummary, index) => {
      const saved = savedDailyOver100Draw.find((entry) => Number(entry && entry.roundNumber) === Number(roundSummary.roundNumber))
        || savedDailyOver100Draw[index]
        || {};
      const eligible = buildRyderCupOver100EligibleTeams(roundSummary.rows, teamLookup);
      const excludedNames = parseRyderCupOver100DrawExclusions(saved.notes);
      const winners = roundSummary.complete
        ? buildAutomaticRyderCupOver100Draw(eligible, `${roundSummary.roundNumber}|${roundSummary.title}`, excludedNames)
        : { winnerNames: [], teamAWinnerNames: [], teamBWinnerNames: [] };
      return {
        roundNumber: roundSummary.roundNumber,
        label: cleanString(saved.label) || `${roundSummary.title} Over-100 Team Draw`,
        winnerNames: winners.winnerNames,
        teamAWinnerNames: winners.teamAWinnerNames,
        teamBWinnerNames: winners.teamBWinnerNames,
        teamAEligible: eligible.teamAEligible,
        teamBEligible: eligible.teamBEligible,
        amount: normalizeCurrencyAmount(saved.amount),
        notes: cleanString(saved.notes),
        automaticWinners: winners.winnerNames,
        manualOverride: false,
        excludedNames,
        hasScores: roundSummary.hasScores,
        enteredCount: roundSummary.enteredCount,
        expectedCount: roundSummary.expectedCount,
        pendingCount: roundSummary.pendingCount,
        isComplete: roundSummary.complete,
      };
    });
  const dailyNet = netSummary.rounds
    .filter((round) => round.eligible)
    .map((roundSummary, index) => {
      const saved = savedDailyNet.find((entry) => Number(entry && entry.roundNumber) === Number(roundSummary.roundNumber))
        || savedDailyNet[index]
        || {};
      const manualWinners = normalizeRyderCupWinnerList(saved.winnerNames || saved.winnerName);
      return {
        roundNumber: roundSummary.roundNumber,
        label: cleanString(saved.label) || `${roundSummary.title} Net`,
        winnerNames: manualWinners.length ? manualWinners : roundSummary.winners,
        automaticWinners: roundSummary.winners,
        amount: normalizeCurrencyAmount(saved.amount),
        notes: normalizeMyrtleRyderCupSideGameNote(saved.notes),
        manualOverride: manualWinners.length > 0,
        lowestNet: roundSummary.lowestNet,
        hasScores: roundSummary.hasScores,
        enteredCount: roundSummary.enteredCount,
        expectedCount: roundSummary.expectedCount,
        pendingCount: roundSummary.pendingCount,
        isComplete: roundSummary.complete,
      };
    });
  const dailyGross = netSummary.rounds
    .filter((round) => round.eligible)
    .map((roundSummary, index) => {
      const saved = savedDailyGross.find((entry) => Number(entry && entry.roundNumber) === Number(roundSummary.roundNumber))
        || savedDailyGross[index]
        || {};
      const manualWinners = normalizeRyderCupWinnerList(saved.winnerNames || saved.winnerName);
      const grossRows = (Array.isArray(roundSummary.rows) ? roundSummary.rows.slice() : []).sort((left, right) => {
        if (left.grossTotal !== right.grossTotal) return left.grossTotal - right.grossTotal;
        if (left.netTotal !== right.netTotal) return left.netTotal - right.netTotal;
        return left.playerName.localeCompare(right.playerName);
      });
      const lowestGross = roundSummary.complete && grossRows.length ? grossRows[0].grossTotal : null;
      const automaticWinners = Number.isFinite(lowestGross)
        ? grossRows.filter((row) => row.grossTotal === lowestGross).map((row) => row.playerName)
        : [];
      return {
        roundNumber: roundSummary.roundNumber,
        label: cleanString(saved.label) || `${roundSummary.title} Gross`,
        winnerNames: manualWinners.length ? manualWinners : automaticWinners,
        automaticWinners,
        amount: normalizeCurrencyAmount(saved.amount),
        notes: cleanString(saved.notes),
        manualOverride: manualWinners.length > 0,
        lowestGross,
        hasScores: roundSummary.hasScores,
        enteredCount: roundSummary.enteredCount,
        expectedCount: roundSummary.expectedCount,
        pendingCount: roundSummary.pendingCount,
        isComplete: roundSummary.complete,
      };
    });
  const savedDailyLongestPuttLastHole = Array.isArray(sideGames && sideGames.dailyLongestPuttLastHole)
    ? sideGames.dailyLongestPuttLastHole
    : [];
  const dailyLongestPuttLastHole = netSummary.rounds
    .filter((round) => round.eligible)
    .map((roundSummary, index) => {
      const saved = savedDailyLongestPuttLastHole.find((entry) => Number(entry && entry.roundNumber) === Number(roundSummary.roundNumber))
        || savedDailyLongestPuttLastHole[index]
        || {};
      return {
        roundNumber: roundSummary.roundNumber,
        label: cleanString(saved.label) || `${roundSummary.title} Longest Made Putt on Last Hole`,
        winnerNames: normalizeRyderCupWinnerList(saved.winnerNames || saved.winnerName),
        distance: cleanString(saved.distance),
        amount: normalizeCurrencyAmount(saved.amount),
        notes: cleanString(saved.notes),
        hasScores: roundSummary.hasScores,
        enteredCount: roundSummary.enteredCount,
        expectedCount: roundSummary.expectedCount,
        pendingCount: roundSummary.pendingCount,
        isComplete: roundSummary.complete,
      };
    });
  const savedDailyBirdiePot = Array.isArray(sideGames && sideGames.dailyBirdiePot)
    ? sideGames.dailyBirdiePot
    : [];
  const weeklySource = sideGames && sideGames.weeklyNet ? sideGames.weeklyNet : {};
  const weeklyOver100Source = sideGames && sideGames.weeklyOver100Draw ? sideGames.weeklyOver100Draw : {};
  const weeklyManualWinners = normalizeRyderCupWinnerList(weeklySource.winnerNames || weeklySource.winnerName);
  const weeklyOver100Eligible = netSummary.rounds
    .filter((round) => round.eligible)
    .reduce((accumulator, roundSummary) => {
      const eligible = buildRyderCupOver100EligibleTeams(roundSummary.rows, teamLookup);
      accumulator.teamAEligible.push(...eligible.teamAEligible);
      accumulator.teamBEligible.push(...eligible.teamBEligible);
      return accumulator;
    }, { teamAEligible: [], teamBEligible: [] });
  const finalEligibleRound = netSummary.rounds.filter((round) => round.eligible).slice(-1)[0] || null;
  const finalRoundNumber = asPositiveInteger(finalEligibleRound && finalEligibleRound.roundNumber);
  const priorWinnerNames = buildRyderCupAwardedPrizeWinnersBeforeRound(finalRoundNumber, {
    dailyNet,
    dailyGross,
    dailyOver100Draw,
    dailyLongestPuttLastHole,
    dailyBirdiePot: buildDailyBirdiePotView(savedDailyBirdiePot, 'Birdie Pot'),
    closestEntries,
  });
  const redemptionEligiblePlayers = buildRyderCupRedemptionEligiblePlayers(teams, priorWinnerNames);
  const redemptionEligibleKeys = new Set(redemptionEligiblePlayers.map((name) => normalizeNameKey(name)).filter(Boolean));
  const finalRoundRows = Array.isArray(finalEligibleRound && finalEligibleRound.rows) ? finalEligibleRound.rows : [];
  const redemptionRows = finalRoundRows.filter((row) => redemptionEligibleKeys.has(normalizeNameKey(row && row.playerName)));
  const redemptionLowestNet = finalEligibleRound && finalEligibleRound.complete && redemptionRows.length
    ? redemptionRows[0].netTotal
    : null;
  const lastChanceSource = sideGames && sideGames.lastChanceRedemptionPot ? sideGames.lastChanceRedemptionPot : {};
  const lastChanceManualWinners = normalizeRyderCupWinnerList(lastChanceSource.winnerNames || lastChanceSource.winnerName);
  const automaticLastChanceWinners = Number.isFinite(redemptionLowestNet)
    ? redemptionRows.filter((row) => row.netTotal === redemptionLowestNet).map((row) => row.playerName)
    : [];
  const dailyBirdiePot = buildDailyBirdiePotView(savedDailyBirdiePot, 'Birdie Pot');
  const finalDayBirdieEntry = dailyBirdiePot.find((entry) => Number(entry && entry.roundNumber) === Number(finalRoundNumber)) || null;
  const redemptionBirdieSource = sideGames && sideGames.redemptionBirdiePot ? sideGames.redemptionBirdiePot : {};
  const redemptionBirdieManualWinners = normalizeRyderCupWinnerList(redemptionBirdieSource.winnerNames || redemptionBirdieSource.winnerName);
  const redemptionBirdieManualOverride = redemptionBirdieManualWinners.length > 0;
  const redemptionBirdieCounts = (finalDayBirdieEntry && Array.isArray(finalDayBirdieEntry.counts) ? finalDayBirdieEntry.counts : [])
    .filter((entry) => redemptionEligibleKeys.has(normalizeNameKey(entry && entry.playerName)));
  const redemptionBirdiePool = buildRyderCupBirdiePoolShares(redemptionBirdieCounts, redemptionBirdieSource.amount);
  const finalDayHighHoleSource = sideGames && sideGames.finalDayHighHole ? sideGames.finalDayHighHole : {};
  return {
    dailyNet,
    dailyGross,
    dailyOver100Draw,
    dailyLongestPuttLastHole,
    dailyBirdiePot,
    lastChanceRedemptionPot: {
      roundNumber: finalRoundNumber || asPositiveInteger(lastChanceSource.roundNumber),
      label: cleanString(lastChanceSource.label) || `${finalEligibleRound ? finalEligibleRound.title : 'Final Round'} Last-Chance Redemption Pot`,
      winnerNames: lastChanceManualWinners.length ? lastChanceManualWinners : automaticLastChanceWinners,
      automaticWinners: automaticLastChanceWinners,
      amount: normalizeCurrencyAmount(lastChanceSource.amount),
      notes: cleanString(lastChanceSource.notes),
      manualOverride: lastChanceManualWinners.length > 0,
      lowestNet: redemptionLowestNet,
      eligiblePlayers: redemptionEligiblePlayers,
      priorWinnerNames,
      hasScores: Boolean(finalEligibleRound && finalEligibleRound.hasScores),
      enteredCount: redemptionRows.length,
      expectedCount: finalEligibleRound && finalEligibleRound.complete ? redemptionRows.length : redemptionEligiblePlayers.length,
      pendingCount: Math.max((finalEligibleRound && finalEligibleRound.complete ? redemptionRows.length : redemptionEligiblePlayers.length) - redemptionRows.length, 0),
      isComplete: Boolean(finalEligibleRound && finalEligibleRound.complete && redemptionRows.length),
    },
    redemptionBirdiePot: {
      roundNumber: finalRoundNumber || asPositiveInteger(redemptionBirdieSource.roundNumber),
      label: cleanString(redemptionBirdieSource.label) || `${finalEligibleRound ? finalEligibleRound.title : 'Final Round'} Redemption Birdie Pot`,
      winnerNames: redemptionBirdieManualOverride ? redemptionBirdieManualWinners : redemptionBirdiePool.paidPlayers,
      automaticWinners: redemptionBirdiePool.paidPlayers,
      amount: normalizeCurrencyAmount(redemptionBirdieSource.amount),
      notes: cleanString(redemptionBirdieSource.notes),
      manualOverride: redemptionBirdieManualOverride,
      eligiblePlayers: redemptionEligiblePlayers,
      priorWinnerNames,
      counts: redemptionBirdiePool.counts,
      highestCount: redemptionBirdieManualOverride ? null : (redemptionBirdiePool.counts.length ? redemptionBirdiePool.counts[0].count : null),
      totalBirdies: redemptionBirdieManualOverride ? 0 : redemptionBirdiePool.totalBirdies,
      perBirdieAmount: redemptionBirdieManualOverride ? null : redemptionBirdiePool.perBirdieAmount,
      awardedAmount: redemptionBirdieManualOverride
        ? (normalizeCurrencyAmount(redemptionBirdieSource.amount) || 0)
        : redemptionBirdiePool.awardedAmount,
      leftoverAmount: redemptionBirdieManualOverride ? 0 : redemptionBirdiePool.leftoverAmount,
      shareRows: redemptionBirdieManualOverride ? [] : redemptionBirdiePool.shareRows,
      hasScores: Boolean(finalEligibleRound && finalEligibleRound.hasScores),
      enteredCount: redemptionBirdieManualOverride ? redemptionBirdieManualWinners.length : redemptionBirdiePool.counts.length,
      expectedCount: redemptionBirdieManualOverride
        ? redemptionBirdieManualWinners.length
        : (finalEligibleRound && finalEligibleRound.complete ? redemptionBirdiePool.counts.length : redemptionEligiblePlayers.length),
      pendingCount: redemptionBirdieManualOverride
        ? 0
        : Math.max((finalEligibleRound && finalEligibleRound.complete ? redemptionBirdiePool.counts.length : redemptionEligiblePlayers.length) - redemptionBirdiePool.counts.length, 0),
      isComplete: redemptionBirdieManualOverride || Boolean(finalEligibleRound && finalEligibleRound.complete),
    },
    finalDayHighHole: {
      roundNumber: finalRoundNumber || asPositiveInteger(finalDayHighHoleSource.roundNumber),
      label: cleanString(finalDayHighHoleSource.label) || `${finalEligibleRound ? finalEligibleRound.title : 'Final Round'} Single-Hole High Score`,
      winnerNames: normalizeRyderCupWinnerList(finalDayHighHoleSource.winnerNames || finalDayHighHoleSource.winnerName),
      hole: asPositiveInteger(finalDayHighHoleSource.hole),
      score: asPositiveInteger(finalDayHighHoleSource.score),
      amount: normalizeCurrencyAmount(finalDayHighHoleSource.amount),
      notes: cleanString(finalDayHighHoleSource.notes),
      manualOverride: normalizeRyderCupWinnerList(finalDayHighHoleSource.winnerNames || finalDayHighHoleSource.winnerName).length > 0,
      hasScores: Boolean(finalEligibleRound && finalEligibleRound.hasScores),
      enteredCount: normalizeRyderCupWinnerList(finalDayHighHoleSource.winnerNames || finalDayHighHoleSource.winnerName).length,
      expectedCount: 1,
      pendingCount: normalizeRyderCupWinnerList(finalDayHighHoleSource.winnerNames || finalDayHighHoleSource.winnerName).length ? 0 : 1,
      isComplete: normalizeRyderCupWinnerList(finalDayHighHoleSource.winnerNames || finalDayHighHoleSource.winnerName).length > 0,
    },
    weeklyNet: {
      winnerNames: weeklyManualWinners.length ? weeklyManualWinners : (netSummary.complete ? netSummary.winners : []),
      automaticWinners: netSummary.complete ? netSummary.winners : [],
      amount: normalizeCurrencyAmount(weeklySource.amount),
      notes: cleanString(weeklySource.notes),
      manualOverride: weeklyManualWinners.length > 0,
      lowestNet: netSummary.lowestNet,
      completedRoundsCount: netSummary.completedRoundsCount,
      eligibleRoundsCount: netSummary.eligibleRoundsCount,
      isComplete: netSummary.complete,
    },
    weeklyOver100Draw: {
      ...(netSummary.complete
        ? buildAutomaticRyderCupOver100Draw(
          weeklyOver100Eligible,
          `weekly|${(teams[0] && teams[0].name) || 'teamA'}|${(teams[1] && teams[1].name) || 'teamB'}`,
          parseRyderCupOver100DrawExclusions(weeklyOver100Source.notes)
        )
        : { winnerNames: [], teamAWinnerNames: [], teamBWinnerNames: [] }),
      teamAEligible: uniqueNames(weeklyOver100Eligible.teamAEligible).sort((left, right) => left.localeCompare(right)),
      teamBEligible: uniqueNames(weeklyOver100Eligible.teamBEligible).sort((left, right) => left.localeCompare(right)),
      amount: normalizeCurrencyAmount(weeklyOver100Source.amount),
      notes: cleanString(weeklyOver100Source.notes),
      manualOverride: false,
      completedRoundsCount: netSummary.completedRoundsCount,
      eligibleRoundsCount: netSummary.eligibleRoundsCount,
      isComplete: netSummary.complete,
    },
    closestToPin: {
      entries: closestEntries,
      winners: closestToPinWinners,
    },
    birdiePool: {
      counts: birdieLeaderboard,
      winners: tripBirdiePool.paidPlayers,
      amount: sideGames && sideGames.birdiePool ? sideGames.birdiePool.amount : null,
      notes: sideGames && sideGames.birdiePool ? sideGames.birdiePool.notes : '',
      totalBirdies: tripBirdiePool.totalBirdies,
      perBirdieAmount: tripBirdiePool.perBirdieAmount,
      awardedAmount: tripBirdiePool.awardedAmount,
      leftoverAmount: tripBirdiePool.leftoverAmount,
      shareRows: tripBirdiePool.shareRows,
    },
    leftoverPot: {
      amount: sideGames && sideGames.leftoverPot ? sideGames.leftoverPot.amount : null,
      notes: sideGames && sideGames.leftoverPot ? sideGames.leftoverPot.notes : '',
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
  const sumEntryAmounts = (entries = []) => roundCurrency((Array.isArray(entries) ? entries : []).reduce((sum, entry) => (
    sum + (asFiniteNumber(entry && entry.amount) || 0)
  ), 0));
  const resolveConfiguredAmount = (explicitAmount, fallbackPercent = 0) => {
    const explicit = asFiniteNumber(explicitAmount);
    if (explicit !== null) return roundCurrency(explicit);
    return roundCurrency(totalPot * ((asFiniteNumber(fallbackPercent) || 0) / 100));
  };
  const buildWinnerLabel = (winners = [], pendingLabel = 'Pending') => {
    const list = uniqueNames(Array.isArray(winners) ? winners : [winners]);
    return list.length ? list.join(', ') : pendingLabel;
  };
  const formatCurrencyLabel = (value) => `$${roundCurrency(value).toFixed(2)}`;
  const buildRoundScorePendingLabel = (
    entry = {},
    {
      emptyLabel = 'Round not played yet',
      partialLabel = 'Scores still missing',
      completeLabel = 'Pending',
    } = {}
  ) => {
    if (entry && entry.isComplete) return completeLabel;
    const enteredCount = Math.max(0, Math.round(asFiniteNumber(entry && entry.enteredCount) || 0));
    const expectedCount = Math.max(0, Math.round(asFiniteNumber(entry && entry.expectedCount) || 0));
    if (!enteredCount) return emptyLabel;
    if (expectedCount > enteredCount) return `${enteredCount}/${expectedCount} scores entered`;
    return partialLabel;
  };
  const buildTripScorePendingLabel = (
    entry = {},
    {
      emptyLabel = 'No scoring rounds complete yet',
      progressLabel = 'Pending remaining rounds',
      completeLabel = 'Pending',
    } = {}
  ) => {
    if (entry && entry.isComplete) return completeLabel;
    const completedRoundsCount = Math.max(0, Math.round(asFiniteNumber(entry && entry.completedRoundsCount) || 0));
    const eligibleRoundsCount = Math.max(0, Math.round(asFiniteNumber(entry && entry.eligibleRoundsCount) || 0));
    if (!completedRoundsCount) return emptyLabel;
    if (eligibleRoundsCount > completedRoundsCount) return `${completedRoundsCount} of ${eligibleRoundsCount} scoring rounds complete`;
    return progressLabel;
  };
  const buildBirdiePoolLabel = (entry = {}, pendingLabel = 'Pending') => {
    const manualWinners = uniqueNames(Array.isArray(entry && entry.winnerNames) ? entry.winnerNames : [entry && entry.winnerName]);
    if (entry && entry.manualOverride && manualWinners.length) return manualWinners.join(', ');
    const totalBirdies = Math.max(0, Math.round(asFiniteNumber(entry && entry.totalBirdies) || 0));
    if (!totalBirdies) return pendingLabel;
    const perBirdieAmount = asFiniteNumber(entry && entry.perBirdieAmount);
    const leftoverAmount = Math.max(0, asFiniteNumber(entry && entry.leftoverAmount) || 0);
    const baseLabel = perBirdieAmount === null
      ? `${totalBirdies} ${totalBirdies === 1 ? 'birdie' : 'birdies'} recorded`
      : `${totalBirdies} ${totalBirdies === 1 ? 'birdie' : 'birdies'} @ ${formatCurrencyLabel(perBirdieAmount)} per birdie`;
    return leftoverAmount > 0
      ? `${baseLabel} · ${formatCurrencyLabel(leftoverAmount)} to leftover pot`
      : baseLabel;
  };
  const buildPrizeRow = ({
    key = '',
    label = '',
    amount = 0,
    winners = [],
    winnerLabel = 'Pending',
    perPerson = null,
    group = 'trip',
    leftoverAmount = 0,
    shareRows = [],
  }) => ({
    key,
    label,
    amount: roundCurrency(amount),
    winners: uniqueNames(Array.isArray(winners) ? winners : [winners]),
    winnerLabel,
    perPerson: perPerson === null || perPerson === undefined ? null : roundCurrency(perPerson),
    group,
    leftoverAmount: roundCurrency(leftoverAmount),
    shareRows: (Array.isArray(shareRows) ? shareRows : [])
      .map((entry) => ({
        name: String(entry && entry.name || '').trim(),
        birdies: Math.max(0, Math.round(asFiniteNumber(entry && entry.birdies) || 0)),
        amount: roundCurrency(entry && entry.amount),
      }))
      .filter((entry) => entry.name && entry.amount > 0),
  });

  const dailyNetEntries = Array.isArray(sideGames && sideGames.dailyNet) ? sideGames.dailyNet : [];
  const dailyGrossEntries = Array.isArray(sideGames && sideGames.dailyGross) ? sideGames.dailyGross : [];
  const dailyOver100Entries = Array.isArray(sideGames && sideGames.dailyOver100Draw) ? sideGames.dailyOver100Draw : [];
  const dailyBirdieEntries = Array.isArray(sideGames && sideGames.dailyBirdiePot) ? sideGames.dailyBirdiePot : [];
  const dailyLongestPuttEntries = Array.isArray(sideGames && sideGames.dailyLongestPuttLastHole) ? sideGames.dailyLongestPuttLastHole : [];
  const closestEntries = sideGames && sideGames.closestToPin && Array.isArray(sideGames.closestToPin.entries)
    ? sideGames.closestToPin.entries
    : [];

  const dailyNetAmount = sumEntryAmounts(dailyNetEntries);
  const dailyGrossAmount = sumEntryAmounts(dailyGrossEntries);
  const dailyOver100Amount = sumEntryAmounts(dailyOver100Entries);
  const dailyBirdieAmount = sumEntryAmounts(dailyBirdieEntries);
  const dailyLongestPuttAmount = sumEntryAmounts(dailyLongestPuttEntries);
  // Last-chance redemption was merged into the redemption birdie pot.
  // Keep the legacy side-game state for reference/admin editing, but do not fund a separate payout row.
  const lastChanceRedemptionAmount = 0;
  const redemptionBirdieAmount = resolveConfiguredAmount(sideGames && sideGames.redemptionBirdiePot ? sideGames.redemptionBirdiePot.amount : null, 0);
  // Final-day single-hole high score is no longer part of the payout structure.
  const finalDayHighHoleAmount = 0;
  const weeklyAmount = resolveConfiguredAmount(sideGames && sideGames.weeklyNet ? sideGames.weeklyNet.amount : null, allocation.weeklyNet);
  const weeklyOver100Amount = resolveConfiguredAmount(sideGames && sideGames.weeklyOver100Draw ? sideGames.weeklyOver100Draw.amount : null, 0);
  const birdieAmount = resolveConfiguredAmount(sideGames && sideGames.birdiePool ? sideGames.birdiePool.amount : null, allocation.birdiePool);
  const closestAmount = closestEntries.some((entry) => asFiniteNumber(entry && entry.amount) !== null)
    ? sumEntryAmounts(closestEntries)
    : resolveConfiguredAmount(null, allocation.closestToPin);
  const mvpAmount = resolveConfiguredAmount(sideGames && sideGames.mvp ? sideGames.mvp.amount : null, allocation.mvp);

  const nonTeamAmount = roundCurrency(
    dailyNetAmount
    + dailyGrossAmount
    + dailyOver100Amount
    + dailyBirdieAmount
    + dailyLongestPuttAmount
    + lastChanceRedemptionAmount
    + redemptionBirdieAmount
    + finalDayHighHoleAmount
    + weeklyAmount
    + weeklyOver100Amount
    + birdieAmount
    + closestAmount
    + mvpAmount
  );
  const defaultTeamCount = Math.max(
    Array.isArray(teams[0] && teams[0].players) ? teams[0].players.length : 0,
    Array.isArray(teams[1] && teams[1].players) ? teams[1].players.length : 0,
    10
  );
  const teamAmount = roundCurrency(defaultTeamCount * 50);
  const overAllocatedAmount = (nonTeamAmount + teamAmount) > totalPot
    ? roundCurrency((nonTeamAmount + teamAmount) - totalPot)
    : 0;

  const teamRows = [];
  if (standings.remainingPoints > 0) {
    teamRows.push(buildPrizeRow({
      key: 'winningTeam',
      label: 'Winning Team',
      amount: teamAmount,
      winners: [],
      winnerLabel: 'Pending Ryder Cup finish',
      perPerson: null,
      group: 'trip',
    }));
  } else if (standings.teamAPoints === standings.teamBPoints) {
    const allWinners = uniqueNames([].concat(teams[0] && teams[0].players ? teams[0].players : [], teams[1] && teams[1].players ? teams[1].players : []));
    teamRows.push(buildPrizeRow({
      key: 'winningTeam',
      label: 'Winning Team',
      amount: teamAmount,
      winners: allWinners,
      winnerLabel: `${teams[0] ? teams[0].name : 'Team A'} and ${teams[1] ? teams[1].name : 'Team B'} split the tie`,
      perPerson: allWinners.length ? teamAmount / allWinners.length : null,
      group: 'trip',
    }));
  } else {
    const winningTeam = standings.teamAPoints > standings.teamBPoints ? teams[0] : teams[1];
    const winners = winningTeam && Array.isArray(winningTeam.players) ? winningTeam.players.slice() : [];
    teamRows.push(buildPrizeRow({
      key: 'winningTeam',
      label: 'Winning Team',
      amount: teamAmount,
      winners,
      winnerLabel: winningTeam ? winningTeam.name : 'Winning Team',
      perPerson: winners.length ? teamAmount / winners.length : null,
      group: 'trip',
    }));
  }

  const categoryRows = teamRows.concat([
    buildPrizeRow({
      key: 'dailyNet',
      label: 'Daily Net',
      amount: dailyNetAmount,
      winners: uniqueNames(dailyNetEntries.flatMap((entry) => entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [])),
      winnerLabel: dailyNetEntries.length ? `${dailyNetEntries.length} daily payouts` : 'Pending',
      group: 'daily',
    }),
    buildPrizeRow({
      key: 'dailyGross',
      label: 'Daily Gross',
      amount: dailyGrossAmount,
      winners: uniqueNames(dailyGrossEntries.flatMap((entry) => entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [])),
      winnerLabel: dailyGrossEntries.length ? `${dailyGrossEntries.length} daily payouts` : 'Pending',
      group: 'daily',
    }),
    buildPrizeRow({
      key: 'dailyOver100Draw',
      label: 'Daily Over-100 Team Draw',
      amount: dailyOver100Amount,
      winners: uniqueNames(dailyOver100Entries.flatMap((entry) => entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [])),
      winnerLabel: dailyOver100Entries.length ? `${dailyOver100Entries.length} daily draws` : 'Pending',
      group: 'daily',
    }),
    buildPrizeRow({
      key: 'dailyBirdiePot',
      label: 'Daily Birdie Pot',
      amount: dailyBirdieAmount,
      winners: uniqueNames(dailyBirdieEntries.flatMap((entry) => entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [])),
      winnerLabel: dailyBirdieEntries.length ? `${dailyBirdieEntries.length} daily pools paid by birdie count` : 'Pending',
      group: 'daily',
    }),
    buildPrizeRow({
      key: 'dailyLongestPuttLastHole',
      label: 'Longest Made Putt On Last Hole',
      amount: dailyLongestPuttAmount,
      winners: uniqueNames(dailyLongestPuttEntries.flatMap((entry) => entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [])),
      winnerLabel: dailyLongestPuttEntries.length ? `${dailyLongestPuttEntries.length} daily payouts` : 'Pending',
      group: 'daily',
    }),
    buildPrizeRow({
      key: 'redemptionBirdiePot',
      label: 'Redemption Birdie Pot',
      amount: redemptionBirdieAmount,
      winners: sideGames.redemptionBirdiePot && Array.isArray(sideGames.redemptionBirdiePot.winnerNames) ? sideGames.redemptionBirdiePot.winnerNames : [],
      winnerLabel: buildBirdiePoolLabel(sideGames && sideGames.redemptionBirdiePot, 'Pending'),
      group: 'daily',
      leftoverAmount: asFiniteNumber(sideGames && sideGames.redemptionBirdiePot && sideGames.redemptionBirdiePot.leftoverAmount) || 0,
      shareRows: sideGames && sideGames.redemptionBirdiePot && Array.isArray(sideGames.redemptionBirdiePot.shareRows)
        ? sideGames.redemptionBirdiePot.shareRows
        : [],
    }),
    buildPrizeRow({
      key: 'weeklyNet',
      label: 'Weekly Net Champion',
      amount: weeklyAmount,
      winners: sideGames.weeklyNet && Array.isArray(sideGames.weeklyNet.winnerNames) ? sideGames.weeklyNet.winnerNames : [],
      winnerLabel: buildWinnerLabel(sideGames.weeklyNet && sideGames.weeklyNet.winnerNames, 'Pending'),
      perPerson: sideGames.weeklyNet && sideGames.weeklyNet.winnerNames && sideGames.weeklyNet.winnerNames.length
        ? weeklyAmount / sideGames.weeklyNet.winnerNames.length
        : null,
      group: 'trip',
    }),
    buildPrizeRow({
      key: 'weeklyOver100Draw',
      label: 'Weekly Over-100 Team Draw',
      amount: weeklyOver100Amount,
      winners: sideGames.weeklyOver100Draw && Array.isArray(sideGames.weeklyOver100Draw.winnerNames) ? sideGames.weeklyOver100Draw.winnerNames : [],
      winnerLabel: buildWinnerLabel(sideGames.weeklyOver100Draw && sideGames.weeklyOver100Draw.winnerNames, 'Pending'),
      perPerson: sideGames.weeklyOver100Draw && sideGames.weeklyOver100Draw.winnerNames && sideGames.weeklyOver100Draw.winnerNames.length
        ? weeklyOver100Amount / sideGames.weeklyOver100Draw.winnerNames.length
        : null,
      group: 'trip',
    }),
    buildPrizeRow({
      key: 'closestToPin',
      label: 'Closest to Pin',
      amount: closestAmount,
      winners: sideGames.closestToPin && Array.isArray(sideGames.closestToPin.winners) ? sideGames.closestToPin.winners : [],
      winnerLabel: buildWinnerLabel(sideGames.closestToPin && sideGames.closestToPin.winners, 'Pending'),
      perPerson: sideGames.closestToPin && sideGames.closestToPin.winners && sideGames.closestToPin.winners.length
        ? closestAmount / sideGames.closestToPin.winners.length
        : null,
      group: 'trip',
    }),
    buildPrizeRow({
      key: 'birdiePool',
      label: 'Trip Birdie Pool',
      amount: birdieAmount,
      winners: sideGames.birdiePool && Array.isArray(sideGames.birdiePool.winners) ? sideGames.birdiePool.winners : [],
      winnerLabel: buildBirdiePoolLabel(sideGames && sideGames.birdiePool, 'Pending'),
      group: 'trip',
      leftoverAmount: asFiniteNumber(sideGames && sideGames.birdiePool && sideGames.birdiePool.leftoverAmount) || 0,
    }),
    buildPrizeRow({
      key: 'mvp',
      label: 'Ryder Cup MVP',
      amount: mvpAmount,
      winners: sideGames.mvp && Array.isArray(sideGames.mvp.winners) ? sideGames.mvp.winners : [],
      winnerLabel: buildWinnerLabel(sideGames.mvp && sideGames.mvp.winners, 'Pending'),
      perPerson: sideGames.mvp && sideGames.mvp.winners && sideGames.mvp.winners.length
        ? mvpAmount / sideGames.mvp.winners.length
        : null,
      group: 'trip',
    }),
  ]);

  const winnerRows = teamRows.concat(
    dailyNetEntries.map((entry, index) => buildPrizeRow({
      key: `dailyNet-${index + 1}`,
      label: cleanString(entry && entry.label) || `Round ${index + 1} Net`,
      amount: asFiniteNumber(entry && entry.amount) || 0,
      winners: entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [],
      winnerLabel: buildWinnerLabel(entry && entry.winnerNames, buildRoundScorePendingLabel(entry)),
      perPerson: entry && Array.isArray(entry.winnerNames) && entry.winnerNames.length ? (asFiniteNumber(entry.amount) || 0) / entry.winnerNames.length : null,
      group: 'daily',
    })),
    dailyGrossEntries.map((entry, index) => buildPrizeRow({
      key: `dailyGross-${index + 1}`,
      label: cleanString(entry && entry.label) || `Round ${index + 1} Gross`,
      amount: asFiniteNumber(entry && entry.amount) || 0,
      winners: entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [],
      winnerLabel: buildWinnerLabel(entry && entry.winnerNames, buildRoundScorePendingLabel(entry)),
      perPerson: entry && Array.isArray(entry.winnerNames) && entry.winnerNames.length ? (asFiniteNumber(entry.amount) || 0) / entry.winnerNames.length : null,
      group: 'daily',
    })),
    dailyOver100Entries.map((entry, index) => buildPrizeRow({
      key: `dailyOver100Draw-${index + 1}`,
      label: cleanString(entry && entry.label) || `Round ${index + 1} Over-100 Team Draw`,
      amount: asFiniteNumber(entry && entry.amount) || 0,
      winners: entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [],
      winnerLabel: buildWinnerLabel(entry && entry.winnerNames, buildRoundScorePendingLabel(entry, { completeLabel: 'No eligible golfer' })),
      perPerson: entry && Array.isArray(entry.winnerNames) && entry.winnerNames.length ? (asFiniteNumber(entry.amount) || 0) / entry.winnerNames.length : null,
      group: 'daily',
    })),
    dailyBirdieEntries.map((entry, index) => buildPrizeRow({
      key: `dailyBirdiePot-${index + 1}`,
      label: cleanString(entry && entry.label) || `Round ${index + 1} Birdie Pot`,
      amount: asFiniteNumber(entry && entry.amount) || 0,
      winners: entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [],
      winnerLabel: buildBirdiePoolLabel(entry, buildRoundScorePendingLabel(entry, { completeLabel: 'No birdies tracked yet' })),
      group: 'daily',
      leftoverAmount: asFiniteNumber(entry && entry.leftoverAmount) || 0,
      shareRows: entry && Array.isArray(entry.shareRows) ? entry.shareRows : [],
    })),
    dailyLongestPuttEntries.map((entry, index) => buildPrizeRow({
      key: `dailyLongestPuttLastHole-${index + 1}`,
      label: cleanString(entry && entry.label) || `Round ${index + 1} Longest Made Putt on Last Hole`,
      amount: asFiniteNumber(entry && entry.amount) || 0,
      winners: entry && Array.isArray(entry.winnerNames) ? entry.winnerNames : [],
      winnerLabel: buildWinnerLabel(entry && entry.winnerNames, buildRoundScorePendingLabel(entry, { completeLabel: 'Not tracked' })),
      perPerson: entry && Array.isArray(entry.winnerNames) && entry.winnerNames.length ? (asFiniteNumber(entry.amount) || 0) / entry.winnerNames.length : null,
      group: 'daily',
    })),
    [
      buildPrizeRow({
        key: 'redemptionBirdiePot-winner',
        label: cleanString(sideGames && sideGames.redemptionBirdiePot && sideGames.redemptionBirdiePot.label) || 'Redemption Birdie Pot',
        amount: redemptionBirdieAmount,
        winners: sideGames.redemptionBirdiePot && Array.isArray(sideGames.redemptionBirdiePot.winnerNames) ? sideGames.redemptionBirdiePot.winnerNames : [],
        winnerLabel: buildBirdiePoolLabel(sideGames && sideGames.redemptionBirdiePot, buildRoundScorePendingLabel(sideGames.redemptionBirdiePot, { completeLabel: 'No birdies tracked yet' })),
        group: 'daily',
        leftoverAmount: asFiniteNumber(sideGames && sideGames.redemptionBirdiePot && sideGames.redemptionBirdiePot.leftoverAmount) || 0,
        shareRows: sideGames && sideGames.redemptionBirdiePot && Array.isArray(sideGames.redemptionBirdiePot.shareRows)
          ? sideGames.redemptionBirdiePot.shareRows
          : [],
      }),
    ],
    [
      buildPrizeRow({
        key: 'weeklyNet-winner',
        label: 'Weekly Net Champion',
        amount: weeklyAmount,
        winners: sideGames.weeklyNet && Array.isArray(sideGames.weeklyNet.winnerNames) ? sideGames.weeklyNet.winnerNames : [],
        winnerLabel: buildWinnerLabel(sideGames.weeklyNet && sideGames.weeklyNet.winnerNames, buildTripScorePendingLabel(sideGames.weeklyNet)),
        perPerson: sideGames.weeklyNet && sideGames.weeklyNet.winnerNames && sideGames.weeklyNet.winnerNames.length
          ? weeklyAmount / sideGames.weeklyNet.winnerNames.length
          : null,
        group: 'trip',
      }),
      buildPrizeRow({
        key: 'weeklyOver100Draw-winner',
        label: 'Weekly Over-100 Team Draw',
        amount: weeklyOver100Amount,
        winners: sideGames.weeklyOver100Draw && Array.isArray(sideGames.weeklyOver100Draw.winnerNames) ? sideGames.weeklyOver100Draw.winnerNames : [],
        winnerLabel: buildWinnerLabel(sideGames.weeklyOver100Draw && sideGames.weeklyOver100Draw.winnerNames, buildTripScorePendingLabel(sideGames.weeklyOver100Draw)),
        perPerson: sideGames.weeklyOver100Draw && sideGames.weeklyOver100Draw.winnerNames && sideGames.weeklyOver100Draw.winnerNames.length
          ? weeklyOver100Amount / sideGames.weeklyOver100Draw.winnerNames.length
          : null,
        group: 'trip',
      }),
    ],
    closestEntries.length
      ? closestEntries.map((entry, index) => buildPrizeRow({
        key: `closestToPin-${index + 1}`,
        label: `Round ${entry.roundNumber} Hole ${entry.hole} Closest to Pin`,
        amount: asFiniteNumber(entry && entry.amount) || 0,
        winners: entry && entry.playerName ? [entry.playerName] : [],
        winnerLabel: buildWinnerLabel(entry && entry.playerName ? [entry.playerName] : [], 'Pending'),
        perPerson: asFiniteNumber(entry && entry.amount),
        group: 'trip',
      }))
      : [
        buildPrizeRow({
          key: 'closestToPin-winner',
          label: 'Closest to Pin',
          amount: closestAmount,
          winners: sideGames.closestToPin && Array.isArray(sideGames.closestToPin.winners) ? sideGames.closestToPin.winners : [],
          winnerLabel: buildWinnerLabel(sideGames.closestToPin && sideGames.closestToPin.winners, 'Pending'),
          perPerson: sideGames.closestToPin && sideGames.closestToPin.winners && sideGames.closestToPin.winners.length
            ? closestAmount / sideGames.closestToPin.winners.length
            : null,
          group: 'trip',
        }),
      ],
    [
      buildPrizeRow({
        key: 'birdiePool-winner',
        label: 'Trip Birdie Pool',
        amount: birdieAmount,
        winners: sideGames.birdiePool && Array.isArray(sideGames.birdiePool.winners) ? sideGames.birdiePool.winners : [],
        winnerLabel: buildBirdiePoolLabel(sideGames && sideGames.birdiePool, 'Pending'),
        group: 'trip',
        leftoverAmount: asFiniteNumber(sideGames && sideGames.birdiePool && sideGames.birdiePool.leftoverAmount) || 0,
        shareRows: sideGames && sideGames.birdiePool && Array.isArray(sideGames.birdiePool.shareRows)
          ? sideGames.birdiePool.shareRows
          : [],
      }),
      buildPrizeRow({
        key: 'mvp-winner',
        label: 'Ryder Cup MVP',
        amount: mvpAmount,
        winners: sideGames.mvp && Array.isArray(sideGames.mvp.winners) ? sideGames.mvp.winners : [],
        winnerLabel: buildWinnerLabel(sideGames.mvp && sideGames.mvp.winners, 'Pending'),
        perPerson: sideGames.mvp && sideGames.mvp.winners && sideGames.mvp.winners.length
          ? mvpAmount / sideGames.mvp.winners.length
          : null,
        group: 'trip',
      }),
    ],
  );

  return {
    totalPot,
    allocationPercentages: allocation,
    rows: categoryRows,
    winnerRows,
    nonTeamAmount,
    teamAmount,
    overAllocatedAmount,
  };
}

function buildRyderCupView(state = null, playerPool = []) {
  if (!state) return null;
  const playerRows = buildRyderCupPlayerRows(state.players);
  const { rankMap } = buildRyderCupPlayerMaps(playerRows);
  const playerHandicapLookup = buildPlayerHandicapLookup(playerPool);
  const fairness = buildRyderCupFairness(state.teams || [], playerRows);
  const roundBundle = buildRyderCupRoundAndStandingsView(state.rounds || [], state.teams || [], playerHandicapLookup);
  const individualLeaderboard = buildRyderCupIndividualLeaderboard(state.rounds || [], state.teams || [], playerHandicapLookup, playerRows);
  const sideGames = buildRyderCupSideGamesView(state.sideGames || {}, individualLeaderboard, state.rounds || [], playerHandicapLookup, state.teams || [], playerRows);
  const payout = buildRyderCupPayoutView(state.payout || {}, roundBundle.standings || {}, sideGames, state.teams || []);
  const hasStarted = hasStartedRyderCup(state.rounds || []);
  const fairnessByTeam = new Map((fairness.teams || []).map((team) => [team.teamId, team]));
  const teams = (state.teams || []).map((team) => {
    const summary = fairnessByTeam.get(team.id) || {};
    return {
      id: team.id,
      name: team.name,
      players: (team.players || [])
        .map((name) => ({
          name,
          rank: rankMap.get(name) || null,
          handicapIndex: resolveMyrtleRyderCupHandicapIndex(name, playerHandicapLookup, playerRows, null),
          matchHandicap: resolveMyrtleRyderCupMatchAllowance(name, playerHandicapLookup, playerRows, null),
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
    description: cleanString(state.description),
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
      roundRules: Array.isArray(admin.roundRules) ? admin.roundRules : [],
      notes: Array.isArray(state.adminNotes && state.adminNotes.notes) ? state.adminNotes.notes : [],
    },
  };
}

function buildTeeSheetGroupKeys(groups = []) {
  return (groups || []).map((players = []) => uniqueNames(players)
    .map((name) => normalizeNameKey(name))
    .filter(Boolean)
    .sort()
    .join('::'));
}

function roundMatchesTeeSheetGroups(round = {}, expectedGroups = []) {
  const teeTimes = Array.isArray(round && round.teeTimes) ? round.teeTimes : [];
  const actualKeys = teeTimes.map((slot = {}) => uniqueNames(slot.players || [])
    .map((name) => normalizeNameKey(name))
    .filter(Boolean)
    .sort()
    .join('::'));
  const expectedKeys = buildTeeSheetGroupKeys(expectedGroups);
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((groupKey, index) => actualKeys[index] === groupKey);
}

function buildCanonicalMyrtleTripRound(round = {}, expectedGroups = []) {
  const teeTimes = (expectedGroups || []).map((players = [], slotIndex) => {
    const existing = Array.isArray(round.teeTimes) ? round.teeTimes[slotIndex] || {} : {};
    return {
      ...clonePlain(existing),
      label: cleanString(existing.label) || `TT#${slotIndex + 1}`,
      time: cleanString(existing.time),
      players: uniqueNames(players),
    };
  });
  return {
    ...clonePlain(round),
    teeTimes,
  };
}

function normalizeLegacyMyrtleTripTeeSheet(trip = {}) {
  if (!isMyrtleRyderCupTrip(trip)) return trip;
  const rounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  if (rounds.length !== MYRTLE_LEGACY_TEE_SHEET_GROUPS.length) return trip;
  const ryderCupState = getTripRyderCupState(trip, { force: true });
  if (ryderCupState && hasStartedRyderCup(ryderCupState.rounds || [])) return trip;
  const matchesLegacySchedule = MYRTLE_LEGACY_TEE_SHEET_GROUPS.every((expectedGroups, roundIndex) =>
    roundMatchesTeeSheetGroups(rounds[roundIndex] || {}, expectedGroups)
  );
  if (!matchesLegacySchedule) return trip;
  const nextTrip = clonePlain(trip);
  nextTrip.rounds = rounds.map((round, roundIndex) => {
    const expectedGroups = MYRTLE_CANONICAL_TEE_SHEET_GROUPS[roundIndex] || [];
    return buildCanonicalMyrtleTripRound(round, expectedGroups);
  });
  return nextTrip;
}

function buildTripCompetitionView(trip = {}, participants = []) {
  trip = normalizeLegacyMyrtleTripTeeSheet(trip);
  const playerPool = getCompetitionPlayerPool(trip, participants);
  const scoringMode = normalizeScoringMode(trip && trip.competition && trip.competition.scoringMode);
  const rounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  const ryderCupState = getTripRyderCupState(trip);
  const isMyrtleOwnBallTrip = isMyrtleRyderCupTrip(trip);

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

  const ryderCup = buildRyderCupView(ryderCupState, playerPool);

  return {
    overview: {
      scoringMode,
      scoringModeLabel: getScoringModeLabel(scoringMode),
      playerCount: playerPool.length,
      roundCount: roundViews.length,
      formatSummary: isMyrtleOwnBallTrip
        ? 'Daily Myrtle Ryder Cup matches use one gross total per golfer, then apply full handicap strokes and award each match to the lower net side.'
        : 'Individual net Stableford across the trip, with daily 2-man net best ball matches inside each foursome.',
      sideGamesSummary: isMyrtleOwnBallTrip
        ? 'Ryder Cup matches use full handicaps, while daily net, daily gross, over-100 team draws, daily birdie pot, longest made putt on the last hole, weekly net, weekly over-100 draw, closest to pin, birdie pool, MVP, and payouts stay aligned to the Myrtle trip setup.'
        : 'Optional Closest to Pin and skins results are tracked separately from the main competition.',
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
  normalizeLegacyMyrtleTripTeeSheet,
  normalizeScoringMode,
  setRoundMatchTeams,
  setRoundPlayerScores,
  setRoundSideGames,
  setTripRyderCupRound,
  setTripRyderCupSettings,
  setTripRyderCupTeams,
  syncTripRyderCupOverlayToCompetition,
  swapTripRyderCupTeamPlayers,
  setTripHandicapBuckets,
  setTripScoringMode,
  stablefordPointsForNetDiff,
};
