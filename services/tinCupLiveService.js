const crypto = require('crypto');

const DAY_OPTIONS = ['Day 1', 'Day 2A', 'Day 2B', 'Day 2 Total', 'Day 3', 'Day 4'];
const MATCH_DAY_OPTIONS = ['Day 1', 'Day 2A', 'Day 2B', 'Day 3', 'Day 4', 'Practice'];
const TIN_CUP_RANK_POINTS = [12, 10, 8.5, 7, 5.75, 4.5, 3, 1.25, 0, 0, 0, 0, 0, 0, 0, 0];

const PLAYERS = [
  { name: 'Matt', handicap: 10.8 }, { name: 'Rick', handicap: 15.3 }, { name: 'OB', handicap: 11.2 }, { name: 'Kyle', handicap: 8.2 },
  { name: 'Manny', handicap: 22.0 }, { name: 'Steve', handicap: 13.1 }, { name: 'Tommy', handicap: 9.1 }, { name: 'Pat', handicap: 17.6 },
  { name: 'Mil', handicap: 12.9 }, { name: 'CSamm', handicap: 22.3 }, { name: 'Brian', handicap: 20.9 }, { name: 'Bob', handicap: 22.0 },
  { name: 'David', handicap: 12.9 }, { name: 'John', handicap: 11.2 }, { name: 'Tony', handicap: 12.8 }, { name: 'Spiro', handicap: 24.5 },
];
const PLAYER_KEYS = new Set(PLAYERS.map((player) => String(player.name || '').trim().replace(/\s+/g, ' ').toLowerCase()));

const FOURSOMES = [
  { playersByDay: { 'Day 1': [{ name: 'Matt', hcp: 6 }, { name: 'Rick', hcp: 8 }, { name: 'OB', hcp: 6 }, { name: 'Kyle', hcp: 4 }], 'Day 2A': [{ name: 'Bob', hcp: 13 }, { name: 'Kyle', hcp: 4 }, { name: 'Pat', hcp: 10 }, { name: 'Spiro', hcp: 14 }], 'Day 2B': [{ name: 'Kyle', hcp: 4 }, { name: 'Tommy', hcp: 5 }, { name: 'CSamm', hcp: 13 }, { name: 'David', hcp: 8 }], 'Day 3': [{ name: 'Kyle', hcp: 4 }, { name: 'Steve', hcp: 8 }, { name: 'Mil', hcp: 8 }, { name: 'Tony', hcp: 8 }], 'Day 4': [{ name: 'Matt', hcp: 6 }, { name: 'Rick', hcp: 8 }, { name: 'OB', hcp: 6 }, { name: 'Kyle', hcp: 4 }], Practice: [{ name: 'Matt', hcp: 6 }, { name: 'Rick', hcp: 8 }, { name: 'OB', hcp: 6 }, { name: 'Kyle', hcp: 4 }] } },
  { playersByDay: { 'Day 1': [{ name: 'Manny', hcp: 13 }, { name: 'Steve', hcp: 8 }, { name: 'Tommy', hcp: 5 }, { name: 'Pat', hcp: 10 }], 'Day 2A': [{ name: 'CSamm', hcp: 13 }, { name: 'Steve', hcp: 8 }, { name: 'Rick', hcp: 8 }, { name: 'John', hcp: 7 }], 'Day 2B': [{ name: 'Matt', hcp: 6 }, { name: 'Steve', hcp: 8 }, { name: 'Brian', hcp: 12 }, { name: 'Spiro', hcp: 14 }], 'Day 3': [{ name: 'Matt', hcp: 6 }, { name: 'Bob', hcp: 13 }, { name: 'Tommy', hcp: 5 }, { name: 'John', hcp: 7 }], 'Day 4': [{ name: 'Manny', hcp: 13 }, { name: 'Steve', hcp: 8 }, { name: 'Tommy', hcp: 5 }, { name: 'Pat', hcp: 10 }], Practice: [{ name: 'Manny', hcp: 13 }, { name: 'Steve', hcp: 8 }, { name: 'Tommy', hcp: 5 }, { name: 'Pat', hcp: 10 }] } },
  { playersByDay: { 'Day 1': [{ name: 'Mil', hcp: 8 }, { name: 'CSamm', hcp: 13 }, { name: 'Brian', hcp: 12 }, { name: 'Bob', hcp: 13 }], 'Day 2A': [{ name: 'OB', hcp: 6 }, { name: 'Brian', hcp: 12 }, { name: 'Tony', hcp: 8 }, { name: 'Tommy', hcp: 5 }], 'Day 2B': [{ name: 'OB', hcp: 6 }, { name: 'John', hcp: 7 }, { name: 'Mil', hcp: 8 }, { name: 'Pat', hcp: 10 }], 'Day 3': [{ name: 'Manny', hcp: 13 }, { name: 'CSamm', hcp: 13 }, { name: 'Spiro', hcp: 14 }, { name: 'OB', hcp: 6 }], 'Day 4': [{ name: 'Mil', hcp: 8 }, { name: 'CSamm', hcp: 13 }, { name: 'Brian', hcp: 12 }, { name: 'Bob', hcp: 13 }], Practice: [{ name: 'Mil', hcp: 8 }, { name: 'CSamm', hcp: 13 }, { name: 'Brian', hcp: 12 }, { name: 'Bob', hcp: 13 }] } },
  { playersByDay: { 'Day 1': [{ name: 'David', hcp: 8 }, { name: 'John', hcp: 7 }, { name: 'Tony', hcp: 8 }, { name: 'Spiro', hcp: 14 }], 'Day 2A': [{ name: 'Mil', hcp: 8 }, { name: 'David', hcp: 8 }, { name: 'Matt', hcp: 6 }, { name: 'Manny', hcp: 13 }], 'Day 2B': [{ name: 'Manny', hcp: 13 }, { name: 'Rick', hcp: 8 }, { name: 'Bob', hcp: 13 }, { name: 'Tony', hcp: 8 }], 'Day 3': [{ name: 'Pat', hcp: 10 }, { name: 'Brian', hcp: 12 }, { name: 'David', hcp: 8 }, { name: 'Rick', hcp: 8 }], 'Day 4': [{ name: 'David', hcp: 8 }, { name: 'John', hcp: 7 }, { name: 'Tony', hcp: 8 }, { name: 'Spiro', hcp: 14 }], Practice: [{ name: 'David', hcp: 8 }, { name: 'John', hcp: 7 }, { name: 'Tony', hcp: 8 }, { name: 'Spiro', hcp: 14 }] } },
];

const SEED_PLAYER_PENALTIES = {
  matt: { champion: 2, rookie: 0 },
  kyle: { champion: 1, rookie: 0 },
  tommy: { champion: 1, rookie: 0 },
  csamm: { champion: 3, rookie: 0 },
  spiro: { champion: 0, rookie: 1 },
  bob: { champion: 0, rookie: 1 },
};
const SEED_SCRAMBLE_BONUS = {
  matt: 1,
  tommy: 1,
  spiro: 0.5,
  brian: 0.5,
};
const SEED_MARKER_HOLES = {
  ctp: [3, 7, 12, 17],
  longDrive: [5, 14],
};

const clean = (v = '') => String(v || '').trim();
const normalize = (v = '') => clean(v).replace(/\s+/g, ' ').toLowerCase();
const toIntOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const out = Math.round(n);
  return out > 0 ? out : null;
};
const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const holeArray = () => Array.from({ length: 18 }, () => null);
const toPenalty = (v) => {
  const n = toNumOrNull(v);
  return n === null ? 0 : Number(n.toFixed(2));
};

function normalizePenalties(input = {}) {
  const src = (input && typeof input === 'object') ? input : {};
  const out = {};
  PLAYERS.forEach((player) => {
    const key = normalize(player.name);
    const raw = src[key] || src[player.name] || {};
    const champion = toPenalty(raw && raw.champion);
    const rookie = toPenalty(raw && raw.rookie);
    if (champion || rookie) {
      out[key] = { champion, rookie };
    }
  });
  return out;
}

function getPenaltyEntry(state, playerName = '') {
  const key = normalize(playerName);
  const penalties = (state && state.penalties && typeof state.penalties === 'object') ? state.penalties : {};
  const raw = penalties[key] || {};
  const champion = toPenalty(raw.champion);
  const rookie = toPenalty(raw.rookie);
  return { champion, rookie, total: Number((champion + rookie).toFixed(2)) };
}

function buildPenaltyTable(state) {
  return PLAYERS.reduce((acc, player) => {
    acc[normalize(player.name)] = getPenaltyEntry(state, player.name);
    return acc;
  }, {});
}

function defaultTinCupLiveState() {
  return {
    version: 1,
    settings: {
      enableLiveFoursomeScoring: true,
      enableFoursomeCodes: true,
      enableLiveMarkers: true,
      enableLiveLeaderboard: true,
    },
    codes: {},
    scorecards: {},
    scrambleBonus: {},
    penalties: {},
  };
}

function normalizeSettings(input = {}, fallback = {}) {
  return {
    enableLiveFoursomeScoring: input.enableLiveFoursomeScoring === undefined
      ? Boolean(fallback.enableLiveFoursomeScoring)
      : input.enableLiveFoursomeScoring === true,
    enableFoursomeCodes: input.enableFoursomeCodes === undefined
      ? Boolean(fallback.enableFoursomeCodes)
      : input.enableFoursomeCodes === true,
    enableLiveMarkers: input.enableLiveMarkers === undefined
      ? Boolean(fallback.enableLiveMarkers)
      : input.enableLiveMarkers === true,
    enableLiveLeaderboard: input.enableLiveLeaderboard === undefined
      ? Boolean(fallback.enableLiveLeaderboard)
      : input.enableLiveLeaderboard === true,
  };
}

function ensureTinCupLiveState(trip = {}) {
  const defaults = defaultTinCupLiveState();
  const src = (trip && trip.tinCupLive) || {};
  const out = {
    version: 1,
    settings: normalizeSettings(
      (src && typeof src.settings === 'object' && src.settings) ? src.settings : {},
      defaults.settings
    ),
    codes: (src && typeof src.codes === 'object' && src.codes) ? src.codes : {},
    scorecards: (src && typeof src.scorecards === 'object' && src.scorecards) ? src.scorecards : {},
    scrambleBonus: (src && typeof src.scrambleBonus === 'object' && src.scrambleBonus) ? src.scrambleBonus : {},
    penalties: normalizePenalties((src && typeof src.penalties === 'object' && src.penalties) ? src.penalties : {}),
  };
  trip.tinCupLive = out;
  return out;
}

function updateSettings(state, nextSettings = {}) {
  state.settings = normalizeSettings(nextSettings, state.settings || defaultTinCupLiveState().settings);
  return state.settings;
}

function getDaySlots(dayKey = '') {
  return FOURSOMES.map((group, index) => {
    const dayPlayers = (group.playersByDay && group.playersByDay[dayKey]) || [];
    return {
      slotIndex: index,
      label: `Group ${index + 1}`,
      players: dayPlayers.map((p) => ({ name: p.name, hcp: Number(p.hcp) || 0 })),
    };
  }).filter((slot) => slot.players.length === 4);
}

function keyFor(dayKey, slotIndex) {
  return `${clean(dayKey)}|${Number(slotIndex)}`;
}

function makeSalt() {
  return crypto.randomBytes(8).toString('hex');
}

function hashCode(salt, code) {
  const payload = `${salt}|${clean(code).toUpperCase()}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function ensureSlotScorecard(state, dayKey, slotIndex) {
  const slot = getDaySlots(dayKey).find((item) => item.slotIndex === Number(slotIndex));
  if (!slot) throw new Error('Tee time slot not found for this day.');
  const k = keyFor(dayKey, slotIndex);
  if (!state.scorecards[k]) {
    state.scorecards[k] = {
      dayKey,
      slotIndex: Number(slotIndex),
      players: {},
      markers: { ctp: {}, longDrive: {} },
      updatedAt: new Date().toISOString(),
    };
  }
  const sc = state.scorecards[k];
  if (!sc.players || typeof sc.players !== 'object') sc.players = {};
  if (!sc.markers || typeof sc.markers !== 'object') sc.markers = { ctp: {}, longDrive: {} };
  if (!sc.markers.ctp || typeof sc.markers.ctp !== 'object') sc.markers.ctp = {};
  if (!sc.markers.longDrive || typeof sc.markers.longDrive !== 'object') sc.markers.longDrive = {};
  slot.players.forEach((player) => {
    const playerKey = normalize(player.name);
    if (!sc.players[playerKey]) {
      sc.players[playerKey] = { name: player.name, holes: holeArray() };
    }
    const holes = Array.isArray(sc.players[playerKey].holes) ? sc.players[playerKey].holes.slice(0, 18) : [];
    while (holes.length < 18) holes.push(null);
    sc.players[playerKey].holes = holes.map((value) => toIntOrNull(value));
    sc.players[playerKey].name = player.name;
  });
  sc.updatedAt = new Date().toISOString();
  return { slot, scorecard: sc };
}

function setSlotCode(state, dayKey, slotIndex, code) {
  const slot = getDaySlots(dayKey).find((item) => item.slotIndex === Number(slotIndex));
  if (!slot) throw new Error('Tee time slot not found for this day.');
  const rawCode = clean(code).toUpperCase() || generateCode();
  const salt = makeSalt();
  state.codes[keyFor(dayKey, slotIndex)] = {
    salt,
    hash: hashCode(salt, rawCode),
    updatedAt: new Date().toISOString(),
  };
  ensureSlotScorecard(state, dayKey, slotIndex);
  return { code: rawCode, slot };
}

function verifySlotCode(state, dayKey, slotIndex, code) {
  if (!(state.settings && state.settings.enableFoursomeCodes)) return true;
  const rec = state.codes[keyFor(dayKey, slotIndex)];
  if (!rec || !rec.salt || !rec.hash) return false;
  const probe = hashCode(rec.salt, code);
  return crypto.timingSafeEqual(Buffer.from(rec.hash, 'hex'), Buffer.from(probe, 'hex'));
}

function getDayHandicapMap(dayKey) {
  const map = new Map();
  for (const group of FOURSOMES) {
    const dayPlayers = (group.playersByDay && group.playersByDay[dayKey]) || [];
    dayPlayers.forEach((player) => {
      const key = normalize(player.name);
      if (!map.has(key)) map.set(key, Number(player.hcp) || 0);
    });
  }
  return map;
}

function getHoleStrokeAllowance(hcp, holeNumber) {
  const playing = Math.max(0, Math.round(Number(hcp) || 0));
  if (!playing) return 0;
  const base = Math.floor(playing / 18);
  const extra = playing % 18;
  return base + (holeNumber <= extra ? 1 : 0);
}

function summarizePlayerCard(playerCard, hcp) {
  const holes = Array.isArray(playerCard && playerCard.holes) ? playerCard.holes.slice(0, 18) : holeArray();
  while (holes.length < 18) holes.push(null);
  let grossTotal = 0;
  let netTotal = 0;
  let frontGross = 0;
  let backGross = 0;
  let frontNet = 0;
  let backNet = 0;
  let frontPlayed = 0;
  let backPlayed = 0;
  let complete18 = true;
  let completeFront = true;
  let completeBack = true;
  for (let i = 0; i < 18; i += 1) {
    const gross = toIntOrNull(holes[i]);
    const holeNo = i + 1;
    if (gross === null) {
      complete18 = false;
      if (holeNo <= 9) completeFront = false;
      else completeBack = false;
      continue;
    }
    const strokes = getHoleStrokeAllowance(hcp, holeNo);
    const net = gross - strokes;
    grossTotal += gross;
    netTotal += net;
    if (holeNo <= 9) {
      frontGross += gross;
      frontNet += net;
      frontPlayed += 1;
    } else {
      backGross += gross;
      backNet += net;
      backPlayed += 1;
    }
  }
  return {
    holes,
    grossTotal: complete18 ? grossTotal : null,
    netTotal: complete18 ? netTotal : null,
    frontNet: completeFront ? frontNet : null,
    backNet: completeBack ? backNet : null,
    frontPlayed,
    backPlayed,
    completeFront,
    completeBack,
    complete18,
  };
}

function getDayPlayerSummaries(state, dayKey) {
  const handicapMap = getDayHandicapMap(dayKey);
  const out = new Map();
  getDaySlots(dayKey).forEach((slot) => {
    const k = keyFor(dayKey, slot.slotIndex);
    const card = state.scorecards[k] || {};
    const cardPlayers = (card && card.players) || {};
    slot.players.forEach((player) => {
      const nameKey = normalize(player.name);
      const src = cardPlayers[nameKey] || { name: player.name, holes: holeArray() };
      const penalties = getPenaltyEntry(state, player.name);
      const summary = summarizePlayerCard(src, handicapMap.get(nameKey) || 0);
      out.set(nameKey, {
        name: player.name,
        hcp: handicapMap.get(nameKey) || 0,
        ...summary,
        penaltyChampion: penalties.champion,
        penaltyRookie: penalties.rookie,
        penaltyTotal: penalties.total,
        adjustedNetTotal: summary.netTotal === null ? null : Number((summary.netTotal + penalties.total).toFixed(2)),
      });
    });
  });
  return out;
}

function getDayMatrixByPlayer(dayKey) {
  const rules = [{ pairs: [[0, 1], [2, 3]] }, { pairs: [[0, 2], [1, 3]] }, { pairs: [[0, 3], [1, 2]] }];
  const rows = [];
  FOURSOMES.forEach((group) => {
    const players = (group.playersByDay && group.playersByDay[dayKey]) || [];
    if (players.length < 4) return;
    const byPlayer = new Map(players.map((p) => [normalize(p.name), { player: p.name, segments: [] }]));
    rules.forEach((rule, segmentIndex) => {
      rule.pairs.forEach(([a, b]) => {
        const pa = players[a];
        const pb = players[b];
        byPlayer.get(normalize(pa.name)).segments.push({ opponent: pb.name, segmentIndex });
        byPlayer.get(normalize(pb.name)).segments.push({ opponent: pa.name, segmentIndex });
      });
    });
    players.forEach((p) => rows.push(byPlayer.get(normalize(p.name))));
  });
  return new Map(rows.map((row) => [normalize(row.player), row]));
}

function compareSegment(daySummaries, playerName, opponentName, segmentIndex) {
  const me = daySummaries.get(normalize(playerName));
  const opp = daySummaries.get(normalize(opponentName));
  if (!me || !opp) return '';
  const start = segmentIndex === 0 ? 0 : 9;
  const end = segmentIndex === 0 ? 8 : 17;
  let mineShared = 0;
  let theirsShared = 0;
  let sharedHoles = 0;
  for (let idx = start; idx <= end; idx += 1) {
    const holeNo = idx + 1;
    const mineGross = toIntOrNull(me.holes[idx]);
    const theirsGross = toIntOrNull(opp.holes[idx]);
    if (mineGross === null || theirsGross === null) continue;
    mineShared += mineGross - getHoleStrokeAllowance(me.hcp, holeNo);
    theirsShared += theirsGross - getHoleStrokeAllowance(opp.hcp, holeNo);
    sharedHoles += 1;
  }
  if (!sharedHoles) return '';
  if (sharedHoles >= 9) {
    if (mineShared < theirsShared) return 'W';
    if (mineShared > theirsShared) return 'L';
    return 'T';
  }
  if (mineShared < theirsShared) return 'W*';
  if (mineShared > theirsShared) return 'L*';
  return 'T*';
}

function getMatchPointsFromLive(state, dayKey) {
  const matrix = getDayMatrixByPlayer(dayKey);
  const daySummaries = getDayPlayerSummaries(state, dayKey);
  const out = new Map(PLAYERS.map((p) => [normalize(p.name), 0]));
  const matchRows = [];
  matrix.forEach((row, key) => {
    let points = 0;
    const segments = (row.segments || []).map((segment) => {
      const result = compareSegment(daySummaries, row.player, segment.opponent, segment.segmentIndex);
      if (result === 'W') points += 2;
      if (result === 'T') points += 1;
      return { opponent: segment.opponent, result, segmentIndex: segment.segmentIndex };
    });
    out.set(key, points);
    matchRows.push({ player: row.player, points, segments });
  });
  return { points: out, rows: matchRows };
}

function getStrokeBonusFromLive(state, dayKey) {
  const daySummaries = getDayPlayerSummaries(state, dayKey);
  const values = PLAYERS.map((p) => ({ key: normalize(p.name), value: toNumOrNull(daySummaries.get(normalize(p.name)) && daySummaries.get(normalize(p.name)).adjustedNetTotal) }));
  const valid = values.filter((value) => value.value !== null);
  const out = new Map(values.map((value) => [value.key, 0]));
  valid.forEach((entry) => {
    const rank = 1 + valid.filter((value) => value.value < entry.value).length;
    if (rank < 9) out.set(entry.key, 2);
  });
  return out;
}

function getDay4RankPointsFromLive(state) {
  const daySummaries = getDayPlayerSummaries(state, 'Day 4');
  const entries = PLAYERS
    .map((p) => ({ key: normalize(p.name), net: toNumOrNull(daySummaries.get(normalize(p.name)) && daySummaries.get(normalize(p.name)).adjustedNetTotal) }))
    .filter((entry) => entry.net !== null)
    .sort((a, b) => a.net - b.net);
  const pts = new Map(PLAYERS.map((p) => [normalize(p.name), 0]));
  const ranks = new Map(PLAYERS.map((p) => [normalize(p.name), null]));
  let i = 0;
  while (i < entries.length) {
    const start = i;
    const score = entries[i].net;
    while (i < entries.length && entries[i].net === score) i += 1;
    const tie = entries.slice(start, i);
    const firstRank = start + 1;
    let total = 0;
    for (let pos = firstRank; pos <= i; pos += 1) total += (TIN_CUP_RANK_POINTS[pos - 1] || 0);
    const avg = tie.length ? Number((total / tie.length).toFixed(2)) : 0;
    tie.forEach((entry) => {
      pts.set(entry.key, avg);
      ranks.set(entry.key, firstRank);
    });
  }
  return { pts, ranks };
}

function buildLeaderboard(state) {
  const day1Summaries = getDayPlayerSummaries(state, 'Day 1');
  const day3Summaries = getDayPlayerSummaries(state, 'Day 3');
  const day4Summaries = getDayPlayerSummaries(state, 'Day 4');
  const day1 = getMatchPointsFromLive(state, 'Day 1');
  const day2A = getMatchPointsFromLive(state, 'Day 2A');
  const day2B = getMatchPointsFromLive(state, 'Day 2B');
  const day3 = getMatchPointsFromLive(state, 'Day 3');
  const day4 = getMatchPointsFromLive(state, 'Day 4');
  const practice = getMatchPointsFromLive(state, 'Practice');
  const s1 = getStrokeBonusFromLive(state, 'Day 1');
  const s3 = getStrokeBonusFromLive(state, 'Day 3');
  const d4 = getDay4RankPointsFromLive(state);

  const totals = PLAYERS.map((player) => {
    const key = normalize(player.name);
    const penalty = getPenaltyEntry(state, player.name);
    const match1 = day1.points.get(key) || 0;
    const match2A = day2A.points.get(key) || 0;
    const match2B = day2B.points.get(key) || 0;
    const match2 = match2A + match2B;
    const match3 = day3.points.get(key) || 0;
    const stroke1 = s1.get(key) || 0;
    const stroke3 = s3.get(key) || 0;
    const day1Net = toNumOrNull(day1Summaries.get(key) && day1Summaries.get(key).adjustedNetTotal);
    const day3Net = toNumOrNull(day3Summaries.get(key) && day3Summaries.get(key).adjustedNetTotal);
    const day4Net = toNumOrNull(day4Summaries.get(key) && day4Summaries.get(key).adjustedNetTotal);
    const scramble = toNumOrNull((state.scrambleBonus || {})[key]) || 0;
    const day4Points = d4.pts.get(key) || 0;
    const day1Total = match1 + stroke1;
    const day2Total = match2;
    const day3Total = match3 + stroke3 + scramble;
    const total = Number((day1Total + day2Total + day3Total + day4Points).toFixed(2));
    return {
      name: player.name,
      match1,
      match2A,
      match2B,
      match2,
      match3,
      day1Net,
      day3Net,
      day4Net,
      stroke1,
      stroke3,
      scramble,
      penaltyChampion: penalty.champion,
      penaltyRookie: penalty.rookie,
      penaltyTotal: penalty.total,
      day4Points,
      day4Rank: d4.ranks.get(key),
      day1Total,
      day2Total,
      day3Total,
      total,
    };
  }).sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));

  let pos = 0;
  let last = null;
  totals.forEach((row, idx) => {
    if (last === null || row.total !== last) pos = idx + 1;
    row.position = pos;
    last = row.total;
  });

  return {
    generatedAt: new Date().toISOString(),
    dayOptions: DAY_OPTIONS.slice(),
    matchDayOptions: MATCH_DAY_OPTIONS.slice(),
    matchBoards: {
      'Day 1': day1.rows,
      'Day 2A': day2A.rows,
      'Day 2B': day2B.rows,
      'Day 3': day3.rows,
      'Day 4': day4.rows,
      Practice: practice.rows,
    },
    totals,
  };
}

function buildDayRows(leaderboard, selectedDay) {
  const source = Array.isArray(leaderboard && leaderboard.totals) ? leaderboard.totals : [];
  const rows = source.map((row) => {
    let points = 0;
    let detail = '';
    if (selectedDay === 'Day 1') {
      points = row.day1Total;
      detail = `${row.match1} match + ${row.stroke1} stroke`;
    } else if (selectedDay === 'Day 2A') {
      points = row.match2A;
      detail = `${row.match2A} match`;
    } else if (selectedDay === 'Day 2B') {
      points = row.match2B;
      detail = `${row.match2B} match`;
    } else if (selectedDay === 'Day 2 Total') {
      points = row.day2Total;
      detail = `${row.day2Total} match`;
    } else if (selectedDay === 'Day 3') {
      points = row.day3Total;
      detail = `${row.match3} match + ${row.stroke3} stroke + ${row.scramble} scramble`;
    } else {
      points = row.day4Points || 0;
      detail = `${row.day4Points} rank pts`;
    }
    if (Number(row.penaltyTotal) !== 0) {
      detail = `${detail} + pen ${row.penaltyTotal > 0 ? '+' : ''}${row.penaltyTotal}`;
    }
    return { name: row.name, points, detail, total: row.total };
  }).sort((a, b) => (b.points - a.points) || (b.total - a.total) || a.name.localeCompare(b.name));

  let pos = 0;
  let last = null;
  rows.forEach((row, idx) => {
    if (last === null || row.points !== last) pos = idx + 1;
    row.position = pos;
    last = row.points;
  });
  return rows;
}

function getLiveMeta(state) {
  const daySlots = MATCH_DAY_OPTIONS.map((dayKey) => ({
    dayKey,
    slots: getDaySlots(dayKey).map((slot) => ({
      slotIndex: slot.slotIndex,
      label: slot.label,
      players: slot.players.map((player) => player.name),
      hasCode: Boolean(state.codes[keyFor(dayKey, slot.slotIndex)]),
    })),
  }));
  return {
    dayOptions: DAY_OPTIONS.slice(),
    matchDayOptions: MATCH_DAY_OPTIONS.slice(),
    settings: state.settings || defaultTinCupLiveState().settings,
    penalties: buildPenaltyTable(state),
    playerHandicaps: PLAYERS.map((player) => ({ name: player.name, handicap: player.handicap })),
    daySlots,
  };
}

function getScorecardView(state, dayKey, slotIndex) {
  const { slot, scorecard } = ensureSlotScorecard(state, dayKey, slotIndex);
  return {
    dayKey,
    slotIndex: Number(slotIndex),
    label: slot.label,
    players: slot.players.map((player) => {
      const entry = scorecard.players[normalize(player.name)] || { name: player.name, holes: holeArray() };
      const summary = summarizePlayerCard(entry, player.hcp);
      const penalty = getPenaltyEntry(state, player.name);
      return {
        name: player.name,
        handicap: player.hcp,
        holes: summary.holes,
        grossTotal: summary.grossTotal,
        netTotal: summary.netTotal,
        penaltyChampion: penalty.champion,
        penaltyRookie: penalty.rookie,
        penaltyTotal: penalty.total,
        adjustedNetTotal: summary.netTotal === null ? null : Number((summary.netTotal + penalty.total).toFixed(2)),
        complete18: summary.complete18,
      };
    }),
    markers: scorecard.markers || { ctp: {}, longDrive: {} },
    updatedAt: scorecard.updatedAt || null,
  };
}

function updateHoleScore(state, payload = {}) {
  const dayKey = clean(payload.dayKey);
  const slotIndex = Number(payload.slotIndex);
  const playerName = clean(payload.playerName);
  const hole = Number(payload.hole);
  const gross = toIntOrNull(payload.gross);
  if (!dayKey) throw new Error('dayKey required');
  if (!Number.isInteger(slotIndex) || slotIndex < 0) throw new Error('slotIndex required');
  if (!playerName) throw new Error('playerName required');
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error('hole must be 1-18');

  const { slot, scorecard } = ensureSlotScorecard(state, dayKey, slotIndex);
  const player = slot.players.find((entry) => normalize(entry.name) === normalize(playerName));
  if (!player) throw new Error('Player not in this foursome');

  const key = normalize(player.name);
  const entry = scorecard.players[key] || { name: player.name, holes: holeArray() };
  while (entry.holes.length < 18) entry.holes.push(null);
  entry.holes[hole - 1] = gross;
  scorecard.players[key] = entry;
  scorecard.updatedAt = new Date().toISOString();
  return getScorecardView(state, dayKey, slotIndex);
}

function updateMarker(state, payload = {}) {
  const dayKey = clean(payload.dayKey);
  const slotIndex = Number(payload.slotIndex);
  const type = clean(payload.type);
  const hole = Number(payload.hole);
  const winner = clean(payload.winner);
  if (!dayKey) throw new Error('dayKey required');
  if (!Number.isInteger(slotIndex) || slotIndex < 0) throw new Error('slotIndex required');
  if (!['ctp', 'longDrive'].includes(type)) throw new Error('Marker type must be ctp or longDrive');
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error('hole must be 1-18');

  const { slot, scorecard } = ensureSlotScorecard(state, dayKey, slotIndex);
  const allowed = new Map(slot.players.map((player) => [normalize(player.name), player.name]));
  if (winner) {
    const winnerKey = normalize(winner);
    if (!allowed.has(winnerKey)) throw new Error('Winner must be in this foursome');
    scorecard.markers[type][String(hole)] = allowed.get(winnerKey);
  } else {
    delete scorecard.markers[type][String(hole)];
  }
  scorecard.updatedAt = new Date().toISOString();
  return getScorecardView(state, dayKey, slotIndex);
}

function setScrambleBonus(state, playerName, value) {
  const key = normalize(playerName);
  if (!key) throw new Error('playerName required');
  const parsed = toNumOrNull(value);
  if (parsed === null) delete state.scrambleBonus[key];
  else state.scrambleBonus[key] = parsed;
  return state.scrambleBonus;
}

function setPlayerPenalty(state, playerName, payload = {}) {
  const key = normalize(playerName);
  if (!key) throw new Error('playerName required');
  if (!PLAYER_KEYS.has(key)) throw new Error('Unknown Tin Cup player');
  if (!state.penalties || typeof state.penalties !== 'object') state.penalties = {};
  const current = getPenaltyEntry(state, playerName);
  const champion = Object.prototype.hasOwnProperty.call(payload, 'champion')
    ? toPenalty(payload.champion)
    : current.champion;
  const rookie = Object.prototype.hasOwnProperty.call(payload, 'rookie')
    ? toPenalty(payload.rookie)
    : current.rookie;
  if (!champion && !rookie) {
    delete state.penalties[key];
  } else {
    state.penalties[key] = { champion, rookie };
  }
  return buildPenaltyTable(state);
}

function getSeedGrossScore(dayKey, slotIndex, player, holeNumber) {
  const playerKey = normalize(player && player.name);
  const playerIndex = Math.max(0, PLAYERS.findIndex((entry) => normalize(entry.name) === playerKey));
  const dayIndex = Math.max(0, MATCH_DAY_OPTIONS.indexOf(dayKey));
  const skillOffset = Math.max(0, Math.min(3, Math.round((Number(player && player.hcp) - 4) / 4)));
  let gross = 4 + skillOffset;
  if (((holeNumber + playerIndex + dayIndex + Number(slotIndex)) % 6) === 0) gross -= 1;
  if (((holeNumber * (Number(slotIndex) + 2) + playerIndex + dayIndex) % 9) === 0) gross += 1;
  if (((holeNumber + dayIndex + playerIndex) % 13) === 0) gross += 1;
  if (((holeNumber + Number(slotIndex) + playerIndex) % 11) === 0) gross -= 1;
  return Math.max(3, Math.min(8, gross));
}

function getSeedMarkerWinner(players = [], dayKey, slotIndex, holeNumber, offset = 0) {
  const dayIndex = Math.max(0, MATCH_DAY_OPTIONS.indexOf(dayKey));
  let best = null;
  players.forEach((player, playerIndex) => {
    const gross = getSeedGrossScore(dayKey, slotIndex, player, holeNumber);
    const tieBreaker = ((playerIndex + 1) * (holeNumber + dayIndex + offset + Number(slotIndex) + 1)) % 17;
    if (!best || gross < best.gross || (gross === best.gross && tieBreaker < best.tieBreaker)) {
      best = { name: player.name, gross, tieBreaker };
    }
  });
  return best ? best.name : '';
}

function seedAllScores(state, options = {}) {
  const reset = options.reset !== false;
  if (!state.scorecards || typeof state.scorecards !== 'object' || reset) state.scorecards = {};
  if (!state.scrambleBonus || typeof state.scrambleBonus !== 'object' || reset) state.scrambleBonus = {};
  if (!state.penalties || typeof state.penalties !== 'object' || reset) state.penalties = {};

  state.penalties = {
    ...(reset ? {} : state.penalties),
    ...normalizePenalties(SEED_PLAYER_PENALTIES),
  };
  state.scrambleBonus = {
    ...(reset ? {} : state.scrambleBonus),
    ...SEED_SCRAMBLE_BONUS,
  };

  MATCH_DAY_OPTIONS.forEach((dayKey) => {
    getDaySlots(dayKey).forEach((slot) => {
      const { scorecard } = ensureSlotScorecard(state, dayKey, slot.slotIndex);
      scorecard.players = {};
      slot.players.forEach((player) => {
        scorecard.players[normalize(player.name)] = {
          name: player.name,
          holes: Array.from({ length: 18 }, (_, index) => getSeedGrossScore(dayKey, slot.slotIndex, player, index + 1)),
        };
      });
      scorecard.markers = { ctp: {}, longDrive: {} };
      SEED_MARKER_HOLES.ctp.forEach((holeNumber) => {
        scorecard.markers.ctp[String(holeNumber)] = getSeedMarkerWinner(slot.players, dayKey, slot.slotIndex, holeNumber, 1);
      });
      SEED_MARKER_HOLES.longDrive.forEach((holeNumber) => {
        scorecard.markers.longDrive[String(holeNumber)] = getSeedMarkerWinner(slot.players, dayKey, slot.slotIndex, holeNumber, 7);
      });
      scorecard.updatedAt = new Date().toISOString();
      state.scorecards[keyFor(dayKey, slot.slotIndex)] = scorecard;
    });
  });

  return buildLeaderboard(state);
}

module.exports = {
  DAY_OPTIONS,
  MATCH_DAY_OPTIONS,
  PLAYERS,
  defaultTinCupLiveState,
  ensureTinCupLiveState,
  getLiveMeta,
  updateSettings,
  setSlotCode,
  verifySlotCode,
  getScorecardView,
  updateHoleScore,
  updateMarker,
  buildLeaderboard,
  buildDayRows,
  setScrambleBonus,
  setPlayerPenalty,
  seedAllScores,
};

