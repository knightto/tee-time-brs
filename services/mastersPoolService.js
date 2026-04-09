const { buildDefaultTiers, buildOfficial2026Field } = require('./masters2026Field');

const DEFAULT_SCORING_RULES = Object.freeze({
  round1: { first: 8, secondThird: 6, fourthToEighth: 4, ninthToSixteenth: 2, other: 0 },
  round2: { madeCut: 10, missedCut: 0, top10Bonus: 3, leaderBonus: 5 },
  round3: { first: 12, secondThird: 9, fourthToEighth: 6, ninthToSixteenth: 3, madeCutOther: 1 },
  round4: { first: 20, second: 15, third: 12, fourthFifth: 9, sixthToTenth: 6, eleventhToSixteenth: 3, other: 1 },
});

const DEFAULT_TIER_RULES = Object.freeze({ tierCount: 6, picksPerTier: 1 });
const DEFAULT_LINEUP_RULES = Object.freeze({ countMode: 'all', bestX: null });
const DEFAULT_LOCK_OFFSET_MINUTES = 120;
const ROUND_LABELS = Object.freeze({ 1: 'Round 1', 2: 'Round 2', 3: 'Round 3', 4: 'Round 4' });

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'masters-pool';
}

function buildDefaultMastersRound1Start(season) {
  const year = Number(season) || new Date().getFullYear();
  const aprilFirstUtc = new Date(Date.UTC(year, 3, 1, 13, 0, 0));
  const firstThursdayOffset = (4 - aprilFirstUtc.getUTCDay() + 7) % 7;
  const firstThursday = new Date(aprilFirstUtc.getTime() + firstThursdayOffset * 24 * 60 * 60 * 1000);
  return new Date(firstThursday.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveRound1Start(payload = {}) {
  const explicit = normalizeDate(payload.round1StartsAt);
  if (explicit) return explicit;
  const tournamentName = String(payload.tournamentName || 'Masters Tournament').toLowerCase();
  if (tournamentName.includes('masters')) return buildDefaultMastersRound1Start(payload.season);
  return null;
}

function getPoolLockState(pool, nowInput = new Date()) {
  const normalized = pool && pool.poolFormat ? pool : buildDefaultPoolPayload(pool || {});
  const now = normalizeDate(nowInput) || new Date();
  const round1StartsAt = normalizeDate(normalized.round1StartsAt);
  const lockOffsetMinutes = Math.max(0, Number(normalized.lockOffsetMinutes) || DEFAULT_LOCK_OFFSET_MINUTES);
  const autoLockAt = round1StartsAt ? new Date(round1StartsAt.getTime() + lockOffsetMinutes * 60 * 1000) : null;
  const manualLocked = normalized.isLocked === true;
  const autoLocked = Boolean(autoLockAt && now.getTime() >= autoLockAt.getTime());
  return {
    manualLocked,
    autoLocked,
    isLocked: manualLocked || autoLocked,
    round1StartsAt,
    autoLockAt,
    lockOffsetMinutes,
    reason: manualLocked
      ? String(normalized.lockReason || 'Locked by admin').trim()
      : autoLocked
        ? `Pool locked automatically ${lockOffsetMinutes} minutes after Round 1 started.`
        : '',
  };
}

function normalizePayouts(rows = []) {
  const source = Array.isArray(rows) && rows.length ? rows : [
    { position: 1, label: '1st Place', mode: 'percentage', value: 60 },
    { position: 2, label: '2nd Place', mode: 'percentage', value: 30 },
    { position: 3, label: '3rd Place', mode: 'percentage', value: 10 },
  ];
  return source
    .map((row, index) => ({
      position: Number(row && row.position) || index + 1,
      label: String((row && row.label) || `${index + 1} Place`).trim(),
      mode: String((row && row.mode) || 'percentage').trim().toLowerCase() === 'amount' ? 'amount' : 'percentage',
      value: Math.max(0, Number(row && row.value) || 0),
    }))
    .filter((row) => row.position >= 1 && row.position <= 3)
    .sort((a, b) => a.position - b.position);
}

function mergeScoringRules(input = {}) {
  return {
    round1: { ...DEFAULT_SCORING_RULES.round1, ...(input.round1 || {}) },
    round2: { ...DEFAULT_SCORING_RULES.round2, ...(input.round2 || {}) },
    round3: { ...DEFAULT_SCORING_RULES.round3, ...(input.round3 || {}) },
    round4: { ...DEFAULT_SCORING_RULES.round4, ...(input.round4 || {}) },
  };
}

function normalizeTiers(tiers = [], golfers = []) {
  const source = Array.isArray(tiers) && tiers.length ? tiers : buildDefaultTiers();
  const normalized = source
    .map((tier, index) => ({
      key: String((tier && tier.key) || String.fromCharCode(65 + index)).trim().toUpperCase(),
      label: String((tier && tier.label) || `Tier ${String.fromCharCode(65 + index)}`).trim(),
      order: Number(tier && tier.order) || (index + 1),
    }))
    .filter((tier) => tier.key)
    .sort((a, b) => a.order - b.order);
  const existingKeys = new Set(normalized.map((tier) => tier.key));
  (Array.isArray(golfers) ? golfers : []).forEach((golfer) => {
    const key = String((golfer && golfer.tierKey) || '').trim().toUpperCase();
    if (!key || existingKeys.has(key)) return;
    normalized.push({ key, label: `Tier ${key}`, order: normalized.length + 1 });
    existingKeys.add(key);
  });
  normalized.sort((a, b) => a.order - b.order);
  return normalized;
}

function normalizeGolfers(golfers = [], tiers = buildDefaultTiers()) {
  const tierKeys = new Set(normalizeTiers(tiers).map((tier) => tier.key));
  return (Array.isArray(golfers) ? golfers : [])
    .map((golfer, index) => ({
      golferId: String((golfer && golfer.golferId) || slugify((golfer && golfer.name) || `player-${index + 1}`)).trim(),
      name: String((golfer && golfer.name) || '').trim(),
      shortName: String((golfer && golfer.shortName) || '').trim(),
      seed: Math.max(1, Number(golfer && golfer.seed) || (index + 1)),
      tierKey: tierKeys.has(String((golfer && golfer.tierKey) || '').trim().toUpperCase())
        ? String(golfer.tierKey).trim().toUpperCase()
        : normalizeTiers(tiers)[0].key,
      worldRanking: golfer && golfer.worldRanking !== undefined && golfer.worldRanking !== null ? Number(golfer.worldRanking) : null,
      bettingOdds: String((golfer && golfer.bettingOdds) || '').trim(),
      status: ['active', 'withdrew', 'missed_cut', 'finished'].includes(String(golfer && golfer.status || '').trim())
        ? String(golfer.status).trim()
        : 'active',
      metadata: golfer && golfer.metadata && typeof golfer.metadata === 'object' ? golfer.metadata : {},
    }))
    .filter((golfer) => golfer.name)
    .sort((a, b) => a.seed - b.seed);
}

function buildDefaultRoundResults() {
  return [1, 2, 3, 4].map((round) => ({
    round,
    label: ROUND_LABELS[round],
    status: 'pending',
    actualWinningScoreToPar: null,
    golfers: [],
    updatedAt: new Date(),
  }));
}

function normalizeRoundResultGolfers(golfers = []) {
  return (Array.isArray(golfers) ? golfers : [])
    .map((golfer) => ({
      golferId: String((golfer && golfer.golferId) || '').trim(),
      name: String((golfer && golfer.name) || '').trim(),
      position: golfer && golfer.position !== undefined && golfer.position !== null ? Number(golfer.position) : null,
      madeCut: golfer && golfer.madeCut !== undefined && golfer.madeCut !== null ? Boolean(golfer.madeCut) : null,
      scoreToPar: golfer && golfer.scoreToPar !== undefined && golfer.scoreToPar !== null ? Number(golfer.scoreToPar) : null,
      strokes: golfer && golfer.strokes !== undefined && golfer.strokes !== null ? Number(golfer.strokes) : null,
      status: ['active', 'withdrew', 'missed_cut', 'finished'].includes(String(golfer && golfer.status || '').trim())
        ? String(golfer.status).trim()
        : 'active',
      note: String((golfer && golfer.note) || '').trim(),
    }))
    .filter((golfer) => golfer.golferId);
}

function normalizeRoundResults(roundResults = []) {
  const fallback = buildDefaultRoundResults();
  const byRound = new Map();
  (Array.isArray(roundResults) ? roundResults : []).forEach((round) => {
    const roundNumber = Number(round && round.round);
    if (!Number.isFinite(roundNumber) || roundNumber < 1 || roundNumber > 4) return;
    byRound.set(roundNumber, {
      round: roundNumber,
      label: String((round && round.label) || ROUND_LABELS[roundNumber]).trim(),
      status: ['pending', 'in_progress', 'complete'].includes(String(round && round.status || '').trim()) ? String(round.status).trim() : 'pending',
      actualWinningScoreToPar: round && round.actualWinningScoreToPar !== undefined && round.actualWinningScoreToPar !== null ? Number(round.actualWinningScoreToPar) : null,
      updatedAt: round && round.updatedAt ? new Date(round.updatedAt) : new Date(),
      golfers: normalizeRoundResultGolfers(round && round.golfers),
    });
  });
  return fallback.map((row) => byRound.get(row.round) || row);
}

function buildDefaultPoolPayload(payload = {}) {
  const seedGolfers = Array.isArray(payload.golfers) && payload.golfers.length ? payload.golfers : buildOfficial2026Field();
  const tiers = normalizeTiers(payload.tiers, seedGolfers);
  const normalized = {
    name: String(payload.name || 'Masters Tier Pool').trim(),
    slug: slugify(payload.slug || payload.name || 'masters-tier-pool'),
    season: Number(payload.season) || new Date().getFullYear(),
    tournamentName: String(payload.tournamentName || 'Masters Tournament').trim(),
    poolFormat: 'tiered_picks',
    selectionMode: 'tiers',
    accessCode: String(payload.accessCode || '').trim(),
    tiers,
    tierRules: { ...DEFAULT_TIER_RULES, ...(payload.tierRules || {}), tierCount: tiers.length },
    lineupRules: { ...DEFAULT_LINEUP_RULES, ...(payload.lineupRules || {}) },
    status: String(payload.status || 'draft').trim().toLowerCase(),
    entryFee: Number.isFinite(Number(payload.entryFee)) ? Number(payload.entryFee) : 10,
    expectedEntrants: Number.isFinite(Number(payload.expectedEntrants)) ? Math.max(0, Number(payload.expectedEntrants)) : 0,
    round1StartsAt: resolveRound1Start(payload),
    lockOffsetMinutes: Math.max(0, Number(payload.lockOffsetMinutes) || DEFAULT_LOCK_OFFSET_MINUTES),
    isLocked: payload.isLocked === true,
    lockedAt: payload.lockedAt || null,
    lockReason: String(payload.lockReason || '').trim(),
    payouts: normalizePayouts(payload.payouts),
    scoringRules: mergeScoringRules(payload.scoringRules),
    dataSource: payload.dataSource && typeof payload.dataSource === 'object'
      ? { mode: String(payload.dataSource.mode || 'manual'), provider: String(payload.dataSource.provider || 'manual'), metadata: payload.dataSource.metadata || {} }
      : { mode: 'manual', provider: 'manual', metadata: {} },
    golfers: normalizeGolfers(seedGolfers, tiers),
    roundResults: normalizeRoundResults(payload.roundResults),
    computed: payload.computed && typeof payload.computed === 'object' ? payload.computed : {},
  };
  if (payload._id !== undefined && payload._id !== null) normalized._id = payload._id;
  if (payload.createdAt !== undefined && payload.createdAt !== null) normalized.createdAt = payload.createdAt;
  if (payload.updatedAt !== undefined && payload.updatedAt !== null) normalized.updatedAt = payload.updatedAt;
  return normalized;
}

function getLatestCompletedRound(roundResults = []) {
  const complete = normalizeRoundResults(roundResults)
    .filter((round) => round.status === 'complete' || round.status === 'in_progress')
    .map((round) => round.round);
  return complete.length ? Math.max(...complete) : 0;
}

function scoreRound1(position, rules) {
  if (position === 1) return rules.first;
  if (position >= 2 && position <= 3) return rules.secondThird;
  if (position >= 4 && position <= 8) return rules.fourthToEighth;
  if (position >= 9 && position <= 16) return rules.ninthToSixteenth;
  return rules.other;
}

function scoreRound2(result, rules) {
  if (result.madeCut !== true) return rules.missedCut;
  let points = rules.madeCut;
  if (Number.isFinite(result.position) && result.position <= 10) points += rules.top10Bonus;
  if (result.position === 1) points += rules.leaderBonus;
  return points;
}

function scoreRound3(result, rules) {
  if (result.position === 1) return rules.first;
  if (result.position >= 2 && result.position <= 3) return rules.secondThird;
  if (result.position >= 4 && result.position <= 8) return rules.fourthToEighth;
  if (result.position >= 9 && result.position <= 16) return rules.ninthToSixteenth;
  return result.madeCut === true ? rules.madeCutOther : 0;
}

function scoreRound4(result, rules) {
  if (result.position === 1) return rules.first;
  if (result.position === 2) return rules.second;
  if (result.position === 3) return rules.third;
  if (result.position >= 4 && result.position <= 5) return rules.fourthFifth;
  if (result.position >= 6 && result.position <= 10) return rules.sixthToTenth;
  if (result.position >= 11 && result.position <= 16) return rules.eleventhToSixteenth;
  return Number.isFinite(result.position) ? rules.other : 0;
}

function deriveGolferStatus(baseStatus, result, latestRound) {
  if (String(result.status || '') === 'withdrew') return 'withdrew';
  if (latestRound >= 2 && result.madeCut === false) return 'missed_cut';
  if (latestRound === 4 && Number.isFinite(result.position)) return 'finished';
  return baseStatus || 'active';
}

function computeGolferScores(pool) {
  const normalized = buildDefaultPoolPayload(pool || {});
  const rules = mergeScoringRules(normalized.scoringRules);
  const state = new Map();
  const latestRound = getLatestCompletedRound(normalized.roundResults);

  normalized.golfers.forEach((golfer) => {
    state.set(golfer.golferId, {
      golferId: golfer.golferId,
      name: golfer.name,
      shortName: golfer.shortName || golfer.name,
      seed: golfer.seed,
      tierKey: golfer.tierKey,
      worldRanking: golfer.worldRanking,
      bettingOdds: golfer.bettingOdds,
      status: golfer.status,
      perRound: { 1: 0, 2: 0, 3: 0, 4: 0 },
      cumulative: { 1: 0, 2: 0, 3: 0, 4: 0 },
      placements: { 1: null, 2: null, 3: null, 4: null },
      madeCut: false,
    });
  });

  normalized.roundResults.forEach((round) => {
    const resultMap = new Map((round.golfers || []).map((golfer) => [golfer.golferId, golfer]));
    normalized.golfers.forEach((golfer) => {
      const current = state.get(golfer.golferId);
      const result = resultMap.get(golfer.golferId) || { position: null, madeCut: null, status: golfer.status };
      current.placements[round.round] = result.position;
      if (round.round === 2 && result.madeCut === true) current.madeCut = true;
      let points = 0;
      if (round.round === 1) points = scoreRound1(result.position, rules.round1);
      if (round.round === 2) points = scoreRound2(result, rules.round2);
      if (round.round === 3) points = scoreRound3(result, rules.round3);
      if (round.round === 4) points = scoreRound4(result, rules.round4);
      current.perRound[round.round] = points;
      current.cumulative[round.round] = points + (round.round > 1 ? current.cumulative[round.round - 1] : 0);
      current.status = deriveGolferStatus(current.status, result, latestRound);
    });
  });

  return {
    golfers: Array.from(state.values()).sort((a, b) => a.seed - b.seed),
    scoreById: state,
    latestCompletedRound: latestRound,
  };
}

function buildTiers(pool) {
  const normalized = buildDefaultPoolPayload(pool || {});
  const scores = computeGolferScores(normalized);
  const scoreById = scores.scoreById;
  return normalized.tiers.map((tier) => ({
    key: tier.key,
    label: tier.label,
    order: tier.order,
    golfers: normalized.golfers
      .filter((golfer) => golfer.tierKey === tier.key)
      .sort((a, b) => a.seed - b.seed)
      .map((golfer) => scoreById.get(golfer.golferId) || golfer),
  }));
}

function normalizeEntryPicks(picks = []) {
  return (Array.isArray(picks) ? picks : [])
    .map((pick) => ({
      tierKey: String((pick && pick.tierKey) || '').trim().toUpperCase(),
      golferId: String((pick && pick.golferId) || '').trim(),
    }))
    .filter((pick) => pick.tierKey && pick.golferId);
}

function validateEntrySubmission(pool, entryPayload = {}) {
  const normalized = buildDefaultPoolPayload(pool || {});
  const errors = [];
  const lockState = getPoolLockState(normalized);
  if (!String(entryPayload.entrantName || '').trim()) errors.push('Entrant name is required.');
  if (lockState.isLocked) errors.push(lockState.reason || 'Pool is locked.');
  if (normalized.accessCode && String(entryPayload.accessCode || '').trim() !== normalized.accessCode) errors.push('Pool access code is invalid.');

  const picks = normalizeEntryPicks(entryPayload.picks);
  const golferById = new Map(normalized.golfers.map((golfer) => [golfer.golferId, golfer]));
  const tierKeys = normalized.tiers.map((tier) => tier.key);
  const seenGolfers = new Set();
  const picksByTier = new Map();

  picks.forEach((pick) => {
    const golfer = golferById.get(pick.golferId);
    if (!golfer) errors.push(`Unknown golfer selected: ${pick.golferId}`);
    if (seenGolfers.has(pick.golferId)) errors.push(`Duplicate golfer selected: ${pick.golferId}`);
    seenGolfers.add(pick.golferId);
    if (!picksByTier.has(pick.tierKey)) picksByTier.set(pick.tierKey, []);
    picksByTier.get(pick.tierKey).push(pick);
    if (golfer && golfer.tierKey !== pick.tierKey) errors.push(`${golfer.name} does not belong to Tier ${pick.tierKey}.`);
  });

  tierKeys.forEach((tierKey) => {
    const count = (picksByTier.get(tierKey) || []).length;
    if (count !== normalized.tierRules.picksPerTier) errors.push(`Tier ${tierKey} requires exactly ${normalized.tierRules.picksPerTier} golfers.`);
  });

  return { ok: errors.length === 0, errors, picks };
}

function computeLineupTotals(selectedGolfers, latestRound, lineupRules) {
  const roundTotals = { 1: 0, 2: 0, 3: 0, 4: 0 };
  [1, 2, 3, 4].forEach((round) => {
    const list = selectedGolfers.map((golfer) => ({
      golferId: golfer.golferId,
      points: Number(golfer.perRound[round] || 0),
    }));
    const used = lineupRules.countMode === 'best_x' && Number.isFinite(Number(lineupRules.bestX))
      ? list.sort((a, b) => b.points - a.points).slice(0, Math.max(1, Number(lineupRules.bestX)))
      : list;
    roundTotals[round] = used.reduce((sum, item) => sum + item.points, 0);
  });
  const totalPoints = [1, 2, 3, 4].filter((round) => round <= latestRound || latestRound === 0).reduce((sum, round) => sum + roundTotals[round], 0);
  return { roundTotals, totalPoints };
}

function scoreEntry(pool, entry) {
  const normalized = buildDefaultPoolPayload(pool || {});
  const scores = computeGolferScores(normalized);
  const latestRound = scores.latestCompletedRound || 0;
  const selectedGolfers = normalizeEntryPicks(entry && entry.picks)
    .map((pick) => scores.scoreById.get(pick.golferId))
    .filter(Boolean)
    .sort((a, b) => a.seed - b.seed);
  const lineup = computeLineupTotals(selectedGolfers, latestRound, normalized.lineupRules || DEFAULT_LINEUP_RULES);
  const sundayPoints = latestRound >= 4 ? selectedGolfers.reduce((sum, golfer) => sum + Number(golfer.perRound[4] || 0), 0) : 0;
  const madeCutCount = selectedGolfers.filter((golfer) => golfer.madeCut === true).length;
  const bestSingleGolferFinish = selectedGolfers.reduce((best, golfer) => {
    const finish = Number(golfer.placements[4] || golfer.placements[3] || golfer.placements[2] || golfer.placements[1] || Number.POSITIVE_INFINITY);
    return finish < best ? finish : best;
  }, Number.POSITIVE_INFINITY);
  const finalRound = normalized.roundResults.find((round) => round.round === 4) || {};
  const actualWinningScore = finalRound.actualWinningScoreToPar !== undefined && finalRound.actualWinningScoreToPar !== null ? Number(finalRound.actualWinningScoreToPar) : null;
  const predictedScore = entry && entry.predictedWinningScoreToPar !== undefined && entry.predictedWinningScoreToPar !== null ? Number(entry.predictedWinningScoreToPar) : null;
  return {
    totalPoints: lineup.totalPoints,
    sundayPoints,
    madeCutCount,
    bestSingleGolferFinish,
    winningScoreDelta: Number.isFinite(actualWinningScore) && Number.isFinite(predictedScore) ? Math.abs(predictedScore - actualWinningScore) : Number.POSITIVE_INFINITY,
    roundTotals: lineup.roundTotals,
    golferBreakdown: selectedGolfers,
    submissionTimestamp: entry && entry.submittedAt ? new Date(entry.submittedAt).getTime() : Number.MAX_SAFE_INTEGER,
  };
}

function rankEntries(pool, entries = []) {
  const ranked = (Array.isArray(entries) ? entries : []).map((entry) => ({ entry, computed: scoreEntry(pool, entry) }));
  ranked.sort((left, right) => {
    if (right.computed.totalPoints !== left.computed.totalPoints) return right.computed.totalPoints - left.computed.totalPoints;
    if (right.computed.sundayPoints !== left.computed.sundayPoints) return right.computed.sundayPoints - left.computed.sundayPoints;
    if (right.computed.madeCutCount !== left.computed.madeCutCount) return right.computed.madeCutCount - left.computed.madeCutCount;
    if (left.computed.bestSingleGolferFinish !== right.computed.bestSingleGolferFinish) return left.computed.bestSingleGolferFinish - right.computed.bestSingleGolferFinish;
    return left.computed.submissionTimestamp - right.computed.submissionTimestamp;
  });
  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}

function computePayouts(pool, rankedRows = []) {
  const totalEntries = rankedRows.length;
  const totalPot = roundMoney((Number(pool && pool.entryFee) || 0) * totalEntries);
  const rows = normalizePayouts(pool && pool.payouts).map((row) => {
    const winner = rankedRows.find((entry) => entry.rank === row.position) || null;
    return {
      position: row.position,
      label: row.label,
      mode: row.mode,
      value: row.value,
      amount: row.mode === 'amount' ? roundMoney(row.value) : roundMoney(totalPot * (row.value / 100)),
      entryId: winner ? String(winner.entry._id || '') : '',
      entrantName: winner ? winner.entry.entrantName : '',
    };
  });
  return { totalEntries, totalPot, rows };
}

function buildPoolSummary(pool, entries = []) {
  const normalized = buildDefaultPoolPayload(pool || {});
  const lockState = getPoolLockState(normalized);
  const rankedEntries = rankEntries(normalized, entries);
  const payouts = computePayouts(normalized, rankedEntries);
  return {
    pool: {
      ...normalized,
      manualIsLocked: normalized.isLocked === true,
      isLocked: lockState.isLocked,
      lockState: {
        ...lockState,
        round1StartsAt: lockState.round1StartsAt ? lockState.round1StartsAt.toISOString() : null,
        autoLockAt: lockState.autoLockAt ? lockState.autoLockAt.toISOString() : null,
      },
    },
    bracket: {
      latestCompletedRound: getLatestCompletedRound(normalized.roundResults),
      matches: [],
      stages: {},
    },
    tiers: buildTiers(normalized),
    leaderboard: rankedEntries.map((row) => ({
      id: String(row.entry._id || ''),
      rank: row.rank,
      entrantName: row.entry.entrantName,
      email: row.entry.email || '',
      submittedAt: row.entry.submittedAt,
      totalPoints: row.computed.totalPoints,
      sundayPoints: row.computed.sundayPoints,
      madeCutCount: row.computed.madeCutCount,
      bestSingleGolferFinish: row.computed.bestSingleGolferFinish,
      predictedWinningScoreToPar: row.entry.predictedWinningScoreToPar,
      winningScoreDelta: row.computed.winningScoreDelta,
      golferBreakdown: row.computed.golferBreakdown,
      roundTotals: row.computed.roundTotals,
      payout: payouts.rows.find((payout) => payout.entryId && payout.entryId === String(row.entry._id || '')) || null,
    })),
    payouts,
  };
}

function buildPoolComputedState(pool, entries = []) {
  const summary = buildPoolSummary(pool, entries);
  return {
    updatedAt: new Date(),
    latestCompletedRound: summary.bracket.latestCompletedRound,
    leaderboard: summary.leaderboard.slice(0, 50).map((entry) => ({
      id: entry.id,
      rank: entry.rank,
      entrantName: entry.entrantName,
      totalPoints: entry.totalPoints,
      sundayPoints: entry.sundayPoints,
      madeCutCount: entry.madeCutCount,
      bestSingleGolferFinish: entry.bestSingleGolferFinish,
    })),
    payouts: summary.payouts,
  };
}

function upsertRoundResult(pool, roundNumber, golfers, extra = {}) {
  const round = Math.max(1, Math.min(4, Number(roundNumber) || 1));
  return normalizeRoundResults(pool.roundResults).map((row) => (row.round === round
    ? {
        ...row,
        golfers: normalizeRoundResultGolfers(golfers),
        status: extra.status || 'complete',
        actualWinningScoreToPar: extra.actualWinningScoreToPar !== undefined && extra.actualWinningScoreToPar !== null ? Number(extra.actualWinningScoreToPar) : row.actualWinningScoreToPar,
        updatedAt: new Date(),
      }
    : row));
}

function buildSampleField() {
  return buildOfficial2026Field();
}

function buildMockRoundResults(golfers = buildSampleField()) {
  const ordered = normalizeGolfers(golfers, buildDefaultTiers());
  const winnerId = ordered.find((golfer) => golfer.name === 'Scottie Scheffler')?.golferId || ordered[0].golferId;
  return [1, 2, 3, 4].map((round) => ({
    round,
    label: ROUND_LABELS[round],
    status: 'complete',
    actualWinningScoreToPar: round === 4 ? -11 : null,
    golfers: ordered.map((golfer, index) => ({
      golferId: golfer.golferId,
      name: golfer.name,
      position: golfer.golferId === winnerId ? 1 : (golfer.golferId === ordered[0].golferId && winnerId !== ordered[0].golferId ? 2 : index + 1),
      madeCut: index < 50,
      scoreToPar: round === 4 && golfer.golferId === winnerId ? -11 : -(12 - (index % 10)),
      status: round >= 4 && index < 50 ? 'finished' : index >= 50 && round >= 2 ? 'missed_cut' : 'active',
      note: '',
    })),
    updatedAt: new Date(),
  }));
}

module.exports = {
  DEFAULT_LINEUP_RULES,
  DEFAULT_SCORING_RULES,
  DEFAULT_TIER_RULES,
  buildDefaultPoolPayload,
  buildMockRoundResults,
  buildPoolComputedState,
  buildPoolSummary,
  buildSampleField,
  buildTiers,
  computeGolferScores,
  computePayouts,
  mergeScoringRules,
  getPoolLockState,
  normalizeEntryPicks,
  normalizeGolfers,
  normalizePayouts,
  normalizeRoundResults,
  normalizeTiers,
  rankEntries,
  scoreEntry,
  slugify,
  upsertRoundResult,
  validateEntrySubmission,
};
