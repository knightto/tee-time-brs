const TEAM_A_DEFAULTS = [
  { name: 'Joe Gillette', seedRank: 1 },
  { name: 'Josh Browne', seedRank: 3 },
  { name: 'Tommy Knight (Jr)', seedRank: 4 },
  { name: 'Lance Darr', seedRank: 9 },
  { name: 'Chris Neff', seedRank: 11 },
  { name: 'Dennis Freeman', seedRank: 13 },
  { name: 'Chad Jones', seedRank: 14 },
  { name: 'Jeremy Bridges', seedRank: 15 },
  { name: 'Matt Shannon', seedRank: 16 },
  { name: 'Tommy Knight Sr', seedRank: 19 },
];

const TEAM_B_DEFAULTS = [
  { name: 'John Quimby', seedRank: 2 },
  { name: 'Reny Butler', seedRank: 5 },
  { name: 'Thomas Lasik', seedRank: 6 },
  { name: 'John Hyers', seedRank: 7 },
  { name: 'Chris Manuel', seedRank: 8 },
  { name: 'Caleb Hart', seedRank: 10 },
  { name: 'Marcus Ordonez', seedRank: 12 },
  { name: 'Delmar Christian', seedRank: 17 },
  { name: 'Manuel Ordonez', seedRank: 18 },
  { name: 'Duane Harris', seedRank: 20 },
];

const NAME_ALIASES = {
  jayquimby: ['johnquimby'],
  johnquimby: ['jayquimby'],
  mannyordonez: ['manuelordonez'],
  manuelordonez: ['mannyordonez'],
  tomlasik: ['thomaslasik'],
  thomaslasik: ['tomlasik'],
  lancedar: ['lancedarr'],
  lancedarr: ['lancedar'],
  tommyknight: ['tommyknightjr'],
  tommyknightjr: ['tommyknight'],
};

const DEFAULT_TEAM_A_NAME = 'Team A';
const DEFAULT_TEAM_B_NAME = 'Team B';
const DEFAULT_PLAYERS = TEAM_A_DEFAULTS.concat(TEAM_B_DEFAULTS);
const DEFAULT_PLAYER_BY_KEY = buildDefaultPlayerKeyLookup();

function buildDefaultPlayerKeyLookup() {
  const map = new Map();
  DEFAULT_PLAYERS.forEach((player) => {
    getAliasKeys(normalizeNameKey(player.name)).forEach((key) => {
      if (!map.has(key)) map.set(key, player);
    });
  });
  return map;
}

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeNameKey(value = '') {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getAliasKeys(key = '') {
  const normalized = normalizeNameKey(key);
  if (!normalized) return [];
  const seen = new Set([normalized]);
  const aliases = NAME_ALIASES[normalized] || [];
  aliases.forEach((alias) => {
    const aliasKey = normalizeNameKey(alias);
    if (aliasKey) seen.add(aliasKey);
  });
  return Array.from(seen);
}

function normalizeSeedRank(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : null;
}

function clonePlayer(player = {}) {
  return {
    playerId: player.playerId ? String(player.playerId) : null,
    name: cleanString(player.name),
    seedRank: normalizeSeedRank(player.seedRank),
  };
}

function sortPlayers(players = []) {
  return players.slice().sort((left, right) => {
    const leftSeed = normalizeSeedRank(left && left.seedRank);
    const rightSeed = normalizeSeedRank(right && right.seedRank);
    if (leftSeed !== null && rightSeed !== null && leftSeed !== rightSeed) return leftSeed - rightSeed;
    if (leftSeed !== null && rightSeed === null) return -1;
    if (leftSeed === null && rightSeed !== null) return 1;
    return cleanString(left && left.name).localeCompare(cleanString(right && right.name));
  });
}

function getDefaultPlayerForName(name = '') {
  const keys = getAliasKeys(normalizeNameKey(name));
  for (let index = 0; index < keys.length; index += 1) {
    const match = DEFAULT_PLAYER_BY_KEY.get(keys[index]);
    if (match) return match;
  }
  return null;
}

function resolveParticipantId(name = '', participants = []) {
  const keys = getAliasKeys(normalizeNameKey(name));
  if (!keys.length) return null;
  for (let index = 0; index < participants.length; index += 1) {
    const participant = participants[index] || {};
    const participantKeys = getAliasKeys(normalizeNameKey(participant.name));
    const matches = participantKeys.some((key) => keys.includes(key));
    if (matches && participant._id) return String(participant._id);
  }
  return null;
}

function normalizePlayer(rawPlayer = {}, participants = []) {
  const fallback = getDefaultPlayerForName(rawPlayer && rawPlayer.name);
  const name = cleanString(rawPlayer && rawPlayer.name) || cleanString(fallback && fallback.name);
  const seedRank = normalizeSeedRank(rawPlayer && rawPlayer.seedRank) || normalizeSeedRank(fallback && fallback.seedRank);
  const playerId = cleanString(rawPlayer && rawPlayer.playerId) || resolveParticipantId(name, participants) || null;
  return {
    playerId,
    name,
    seedRank,
  };
}

function normalizePlayers(rawPlayers, participants = [], fallbackPlayers = []) {
  if (!Array.isArray(rawPlayers) || !rawPlayers.length) {
    return sortPlayers((fallbackPlayers || []).map((player) => normalizePlayer(player, participants)));
  }
  const seenNames = new Set();
  const seenSeeds = new Set();
  const players = [];
  rawPlayers.forEach((player) => {
    const normalized = normalizePlayer(player, participants);
    if (!normalized.name || normalized.seedRank === null) return;
    const nameKey = normalizeNameKey(normalized.name);
    if (seenNames.has(nameKey) || seenSeeds.has(normalized.seedRank)) return;
    seenNames.add(nameKey);
    seenSeeds.add(normalized.seedRank);
    players.push(normalized);
  });
  return sortPlayers(players);
}

function getDefaultTripRyderCupState(participants = []) {
  return {
    enabled: true,
    teamAName: DEFAULT_TEAM_A_NAME,
    teamBName: DEFAULT_TEAM_B_NAME,
    teamAPlayers: sortPlayers(TEAM_A_DEFAULTS.map((player) => normalizePlayer(player, participants))),
    teamBPlayers: sortPlayers(TEAM_B_DEFAULTS.map((player) => normalizePlayer(player, participants))),
    notes: '',
  };
}

function buildCandidateTripRyderCupState(rawState = {}, participants = [], defaults = getDefaultTripRyderCupState(participants)) {
  return {
    enabled: typeof rawState.enabled === 'boolean' ? rawState.enabled : defaults.enabled,
    teamAName: cleanString(rawState.teamAName) || defaults.teamAName,
    teamBName: cleanString(rawState.teamBName) || defaults.teamBName,
    teamAPlayers: normalizePlayers(rawState.teamAPlayers, participants, defaults.teamAPlayers),
    teamBPlayers: normalizePlayers(rawState.teamBPlayers, participants, defaults.teamBPlayers),
    notes: cleanString(rawState.notes),
  };
}

function validateTripRyderCupState(state = {}) {
  const teamAPlayers = Array.isArray(state.teamAPlayers) ? state.teamAPlayers : [];
  const teamBPlayers = Array.isArray(state.teamBPlayers) ? state.teamBPlayers : [];
  if (teamAPlayers.length !== 10 || teamBPlayers.length !== 10) {
    throw new Error('Ryder Cup teams must have exactly 10 players on each side.');
  }
  const allPlayers = teamAPlayers.concat(teamBPlayers);
  const nameKeys = new Set();
  const seedRanks = new Set();
  allPlayers.forEach((player) => {
    const name = cleanString(player && player.name);
    const seedRank = normalizeSeedRank(player && player.seedRank);
    if (!name || seedRank === null) {
      throw new Error('Each Ryder Cup player must include a name and seed rank.');
    }
    const nameKey = normalizeNameKey(name);
    if (nameKeys.has(nameKey)) {
      throw new Error('Ryder Cup rosters must contain 20 unique players.');
    }
    if (seedRanks.has(seedRank)) {
      throw new Error('Ryder Cup rosters must contain unique seed ranks.');
    }
    nameKeys.add(nameKey);
    seedRanks.add(seedRank);
  });
}

function normalizeTripRyderCupState(rawState = {}, participants = []) {
  const defaults = getDefaultTripRyderCupState(participants);
  const nextState = buildCandidateTripRyderCupState(rawState, participants, defaults);
  try {
    validateTripRyderCupState(nextState);
    return nextState;
  } catch (_error) {
    return {
      ...defaults,
      enabled: nextState.enabled,
      teamAName: nextState.teamAName,
      teamBName: nextState.teamBName,
      notes: nextState.notes,
    };
  }
}

function buildTripRyderCupBalance(state = {}) {
  const sumSeeds = (players = []) => players.reduce((total, player) => total + (normalizeSeedRank(player && player.seedRank) || 0), 0);
  const teamASum = sumSeeds(state.teamAPlayers || []);
  const teamBSum = sumSeeds(state.teamBPlayers || []);
  return {
    teamASum,
    teamBSum,
    difference: Math.abs(teamASum - teamBSum),
  };
}

function buildTripRyderCupView(rawState = {}, participants = []) {
  const state = normalizeTripRyderCupState(rawState, participants);
  const balance = buildTripRyderCupBalance(state);
  return {
    enabled: state.enabled,
    teamAName: state.teamAName,
    teamBName: state.teamBName,
    teamAPlayers: sortPlayers((state.teamAPlayers || []).map(clonePlayer)),
    teamBPlayers: sortPlayers((state.teamBPlayers || []).map(clonePlayer)),
    notes: state.notes,
    balance,
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function ensureTripRyderCupState(trip = {}, participants = []) {
  const current = clonePlain(trip && trip.ryderCup);
  const normalized = normalizeTripRyderCupState(current, participants);
  const changed = JSON.stringify(current || {}) !== JSON.stringify(normalized);
  if (trip) trip.ryderCup = normalized;
  return {
    state: buildTripRyderCupView(normalized, participants),
    changed,
  };
}

function setTripRyderCupState(trip = {}, participants = [], payload = {}) {
  const defaults = getDefaultTripRyderCupState(participants);
  const nextState = buildCandidateTripRyderCupState(payload, participants, defaults);
  validateTripRyderCupState(nextState);
  if (trip) trip.ryderCup = nextState;
  return buildTripRyderCupView(nextState, participants);
}

module.exports = {
  buildTripRyderCupBalance,
  buildTripRyderCupView,
  ensureTripRyderCupState,
  getDefaultTripRyderCupState,
  setTripRyderCupState,
  validateTripRyderCupState,
};
