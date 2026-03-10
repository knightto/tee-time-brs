const express = require('express');
const { getSecondaryConn, initSecondaryConn } = require('../secondary-conn');
initSecondaryConn();
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const TripPrimary = require('../models/Trip');
const TripParticipantPrimary = require('../models/TripParticipant');
const TripAuditLogPrimary = require('../models/TripAuditLog');
const { buildDefaultTripTemplate, DEFAULT_TEMPLATE_NAME } = require('../services/tripTemplateService');
const {
  buildTripCompetitionView,
  setRoundMatchTeams,
  setRoundPlayerScores,
  setRoundSideGames,
  setTripHandicapBuckets,
  setTripScoringMode,
} = require('../services/tripCompetitionService');
const {
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
} = require('../services/tinCupLiveService');
const router = express.Router();

function getSecondaryModels() {
  const conn = getSecondaryConn();
  if (!conn) return {};
  return {
    TripSecondary: conn.model('Trip', require('../models/Trip').schema),
    TripParticipantSecondary: conn.model('TripParticipant', require('../models/TripParticipant').schema),
    TripAuditLogSecondary: conn.model('TripAuditLog', require('../models/TripAuditLog').schema),
  };
}

function isAdmin(req) {
  const code = req.headers['x-admin-code'] || req.query.code || (req.body && req.body.adminCode);
  return Boolean(ADMIN_DELETE_CODE && code && code === ADMIN_DELETE_CODE);
}

function getTripModelsForRequest(req) {
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripSecondary, TripParticipantSecondary, TripAuditLogSecondary } = getSecondaryModels();
    if (TripSecondary && TripParticipantSecondary && TripAuditLogSecondary) {
      return {
        TripModel: TripSecondary,
        TripParticipantModel: TripParticipantSecondary,
        TripAuditLogModel: TripAuditLogSecondary,
      };
    }
  }
  return {
    TripModel: TripPrimary,
    TripParticipantModel: TripParticipantPrimary,
    TripAuditLogModel: TripAuditLogPrimary,
  };
}

async function loadTripBundle(req) {
  const { TripModel, TripParticipantModel, TripAuditLogModel } = getTripModelsForRequest(req);
  const trip = await TripModel.findById(req.params.tripId);
  if (!trip) return { TripModel, TripParticipantModel, TripAuditLogModel, trip: null, participants: [] };
  const participants = await TripParticipantModel.find({ trip: trip._id });
  return { TripModel, TripParticipantModel, TripAuditLogModel, trip, participants };
}

function sendTripRouteError(res, error) {
  const message = error && error.message ? error.message : 'Request failed';
  if (/not found/i.test(message)) return res.status(404).json({ error: message });
  if (/required|select exactly|four-player/i.test(message)) return res.status(400).json({ error: message });
  return res.status(500).json({ error: message });
}

function isLiveScoringEnabled(state) {
  return Boolean(state && state.settings && state.settings.enableLiveFoursomeScoring);
}

function parseRoundStartDate(round) {
  if (!round || !round.date) return null;
  const day = new Date(round.date);
  if (Number.isNaN(day.getTime())) return null;
  const hhmm = String(round.time || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    day.setHours(0, 0, 0, 0);
    return day;
  }
  day.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return day;
}

function getTripStartDate(trip) {
  if (!trip) return null;
  let earliest = null;
  const rounds = Array.isArray(trip.rounds) ? trip.rounds : [];
  rounds.forEach((round) => {
    const dt = parseRoundStartDate(round);
    if (!dt) return;
    if (!earliest || dt.getTime() < earliest.getTime()) earliest = dt;
  });
  if (earliest) return earliest;
  if (trip.arrivalDate) {
    const arrival = new Date(trip.arrivalDate);
    if (!Number.isNaN(arrival.getTime())) {
      arrival.setHours(0, 0, 0, 0);
      return arrival;
    }
  }
  return null;
}

function hasTripStarted(trip) {
  const start = getTripStartDate(trip);
  if (!start) return false;
  return Date.now() >= start.getTime();
}

function truncateValue(value, maxLen = 240) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => truncateValue(item, maxLen));
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).slice(0, 40).forEach((key) => {
      out[key] = truncateValue(value[key], maxLen);
    });
    return out;
  }
  return String(value);
}

async function writeTripAudit(req, trip, TripAuditLogModel, action, summary, details = {}) {
  if (!trip || !TripAuditLogModel) return;
  if (!hasTripStarted(trip)) return;
  try {
    await TripAuditLogModel.create({
      tripId: trip._id,
      action: String(action || '').trim() || 'trip_update',
      actor: isAdmin(req) ? 'admin' : 'public',
      method: String(req.method || ''),
      route: String(req.originalUrl || req.path || ''),
      summary: String(summary || '').trim(),
      details: truncateValue(details),
      timestamp: new Date(),
    });
  } catch (_error) {
    // Audit logging should never break trip updates.
  }
}


// List all trips
router.get('/', async (req, res) => {
  // If query param myrtleBeach2026=true, use secondary DB
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripSecondary } = getSecondaryModels();
    if (TripSecondary) {
      const trips = await TripSecondary.find();
      return res.json(trips);
    }
  }
  const trips = await TripPrimary.find();
  res.json(trips);
});

// Create a reusable default template trip
router.post('/templates/default', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { TripModel } = getTripModelsForRequest(req);
    const payload = buildDefaultTripTemplate(req.body || {});
    const trip = await TripModel.create(payload);
    return res.status(201).json({
      trip,
      templateName: DEFAULT_TEMPLATE_NAME,
      message: 'Default golf trip template created.',
    });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

// Get trip details + participants
router.get('/:tripId', async (req, res) => {
  // If query param myrtleBeach2026=true, use secondary DB
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripSecondary, TripParticipantSecondary } = getSecondaryModels();
    if (TripSecondary && TripParticipantSecondary) {
      const trip = await TripSecondary.findById(req.params.tripId);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });
      const participants = await TripParticipantSecondary.find({ trip: trip._id });
      return res.json({ trip, participants });
    }
  }
  const trip = await TripPrimary.findById(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const participants = await TripParticipantPrimary.find({ trip: trip._id });
  res.json({ trip, participants });
});

// Update trip details
router.put('/:tripId', async (req, res) => {
  try {
    const { TripModel, TripAuditLogModel } = getTripModelsForRequest(req);
    const trip = await TripModel.findByIdAndUpdate(req.params.tripId, req.body, { new: true });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    await writeTripAudit(req, trip, TripAuditLogModel, 'update_trip', 'Trip details updated', {
      updates: req.body || {},
    });
    return res.json(trip);
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/competition', async (req, res) => {
  try {
    const { trip, participants } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    return res.json(buildTripCompetitionView(trip, participants));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/competition/settings', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { trip, participants, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setTripScoringMode(trip, req.body && req.body.scoringMode);
    await trip.save();
    await writeTripAudit(req, trip, TripAuditLogModel, 'competition_settings', 'Competition scoring mode changed', {
      scoringMode: req.body && req.body.scoringMode,
    });
    return res.json(buildTripCompetitionView(trip, participants));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/competition/buckets', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { trip, participants, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setTripHandicapBuckets(trip, participants, req.body && req.body.buckets);
    await trip.save();
    await writeTripAudit(req, trip, TripAuditLogModel, 'competition_buckets', 'Competition handicap buckets updated', {
      bucketCount: Array.isArray(req.body && req.body.buckets) ? req.body.buckets.length : 0,
    });
    return res.json(buildTripCompetitionView(trip, participants));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/competition/rounds/:roundIndex/scores', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { trip, participants, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setRoundPlayerScores(trip, req.params.roundIndex, req.body && req.body.playerName, req.body && req.body.holes);
    await trip.save();
    await writeTripAudit(req, trip, TripAuditLogModel, 'round_scores', 'Round player scores updated', {
      roundIndex: Number(req.params.roundIndex),
      playerName: req.body && req.body.playerName,
      holeCount: Array.isArray(req.body && req.body.holes) ? req.body.holes.length : 0,
    });
    return res.json(buildTripCompetitionView(trip, participants));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/competition/rounds/:roundIndex/matches/:slotIndex', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { trip, participants, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setRoundMatchTeams(trip, req.params.roundIndex, req.params.slotIndex, req.body && req.body.teamA, req.body && req.body.teamB);
    await trip.save();
    await writeTripAudit(req, trip, TripAuditLogModel, 'round_matches', 'Round match teams updated', {
      roundIndex: Number(req.params.roundIndex),
      slotIndex: Number(req.params.slotIndex),
      teamA: req.body && req.body.teamA,
      teamB: req.body && req.body.teamB,
    });
    return res.json(buildTripCompetitionView(trip, participants));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/competition/rounds/:roundIndex/side-games', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { trip, participants, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setRoundSideGames(trip, req.params.roundIndex, {
      ctpWinners: req.body && req.body.ctpWinners,
      skinsResults: req.body && req.body.skinsResults,
    });
    await trip.save();
    await writeTripAudit(req, trip, TripAuditLogModel, 'round_side_games', 'Round side games updated', {
      roundIndex: Number(req.params.roundIndex),
      ctpCount: Array.isArray(req.body && req.body.ctpWinners) ? req.body.ctpWinners.length : 0,
      skinsCount: Array.isArray(req.body && req.body.skinsResults) ? req.body.skinsResults.length : 0,
    });
    return res.json(buildTripCompetitionView(trip, participants));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/tin-cup/live/meta', async (req, res) => {
  try {
    const { trip } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    return res.json(getLiveMeta(state));
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/tin-cup/live/leaderboard', async (req, res) => {
  try {
    const { trip } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    const selectedDay = String(req.query.day || '').trim();
    const selectedMatchDay = String(req.query.matchDay || '').trim();
    const leaderboard = buildLeaderboard(state);
    const dayKey = leaderboard.dayOptions.includes(selectedDay) ? selectedDay : leaderboard.dayOptions[0];
    const matchKey = leaderboard.matchDayOptions.includes(selectedMatchDay) ? selectedMatchDay : leaderboard.matchDayOptions[0];
    return res.json({
      ...leaderboard,
      settings: state.settings,
      selectedDay: dayKey,
      selectedMatchDay: matchKey,
      dayRows: buildDayRows(leaderboard, dayKey),
      matchRows: leaderboard.matchBoards[matchKey] || [],
    });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/tin-cup/live/scorecard', async (req, res) => {
  try {
    const { trip, TripModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const dayKey = String(req.query.dayKey || '').trim();
    const slotIndex = Number(req.query.slotIndex);
    const code = String(req.query.code || '').trim();
    if (!dayKey) return res.status(400).json({ error: 'dayKey required' });
    if (!Number.isInteger(slotIndex) || slotIndex < 0) return res.status(400).json({ error: 'slotIndex required' });
    const state = ensureTinCupLiveState(trip);
    if (!isLiveScoringEnabled(state)) return res.status(403).json({ error: 'Live foursome scoring is disabled for this trip.' });
    if (state.settings.enableFoursomeCodes && !code) return res.status(403).json({ error: 'Foursome code required' });
    if (!verifySlotCode(state, dayKey, slotIndex, code)) return res.status(403).json({ error: 'Invalid foursome code' });
    const view = getScorecardView(state, dayKey, slotIndex);
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    return res.json(view);
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/tin-cup/live/scorecard/hole', async (req, res) => {
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const payload = req.body || {};
    const dayKey = String(payload.dayKey || '').trim();
    const slotIndex = Number(payload.slotIndex);
    const code = String(payload.code || '').trim();
    const state = ensureTinCupLiveState(trip);
    if (!isLiveScoringEnabled(state)) return res.status(403).json({ error: 'Live foursome scoring is disabled for this trip.' });
    if (state.settings.enableFoursomeCodes && !code) return res.status(403).json({ error: 'Foursome code required' });
    if (!verifySlotCode(state, dayKey, slotIndex, code)) return res.status(403).json({ error: 'Invalid foursome code' });
    const view = updateHoleScore(state, payload);
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_hole_score', 'Tin Cup live hole score updated', {
      dayKey,
      slotIndex,
      hole: payload.hole,
      playerName: payload.playerName,
      score: payload.score,
    });
    return res.json(view);
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/tin-cup/live/scorecard/marker', async (req, res) => {
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const payload = req.body || {};
    const dayKey = String(payload.dayKey || '').trim();
    const slotIndex = Number(payload.slotIndex);
    const code = String(payload.code || '').trim();
    const state = ensureTinCupLiveState(trip);
    if (!isLiveScoringEnabled(state)) return res.status(403).json({ error: 'Live foursome scoring is disabled for this trip.' });
    if (!state.settings.enableLiveMarkers) return res.status(403).json({ error: 'Live marker entry is disabled for this trip.' });
    if (state.settings.enableFoursomeCodes && !code) return res.status(403).json({ error: 'Foursome code required' });
    if (!verifySlotCode(state, dayKey, slotIndex, code)) return res.status(403).json({ error: 'Invalid foursome code' });
    const view = updateMarker(state, payload);
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_marker', 'Tin Cup live marker updated', {
      dayKey,
      slotIndex,
      markerType: payload.markerType,
      hole: payload.hole,
      playerName: payload.playerName,
    });
    return res.json(view);
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/tin-cup/live/admin/codes', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const { trip } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    const meta = getLiveMeta(state);
    return res.json({
      message: 'Existing code status by foursome.',
      daySlots: meta.daySlots,
    });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.post('/:tripId/tin-cup/live/admin/codes', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    if (!state.settings.enableFoursomeCodes) return res.status(400).json({ error: 'Foursome code feature is disabled for this trip.' });
    const body = req.body || {};
    const dayKey = String(body.dayKey || '').trim();
    const slotIndex = Number(body.slotIndex);
    const force = body.force === true;
    const generated = [];
    const daySlots = getLiveMeta(state).daySlots;
    const targets = [];
    daySlots.forEach((day) => {
      if (dayKey && day.dayKey !== dayKey) return;
      day.slots.forEach((slot) => {
        if (Number.isInteger(slotIndex) && slot.slotIndex !== slotIndex) return;
        targets.push({ dayKey: day.dayKey, slotIndex: slot.slotIndex });
      });
    });
    targets.forEach((target) => {
      const hasCode = Boolean(state.codes[`${target.dayKey}|${target.slotIndex}`]);
      if (hasCode && !force) return;
      const created = setSlotCode(state, target.dayKey, target.slotIndex, body.code || '');
      generated.push({
        dayKey: target.dayKey,
        slotIndex: target.slotIndex,
        label: created.slot.label,
        players: created.slot.players.map((player) => player.name),
        code: created.code,
      });
    });
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_codes', 'Tin Cup foursome codes generated', {
      generatedCount: generated.length,
      dayKey: dayKey || null,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      force,
    });
    return res.json({
      generatedCount: generated.length,
      generated,
      note: generated.length ? 'Store these codes securely. Codes are not returned again unless regenerated.' : 'No codes generated (already existed).',
    });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/tin-cup/live/admin/scramble-bonus', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const payload = req.body || {};
    const state = ensureTinCupLiveState(trip);
    setScrambleBonus(state, payload.playerName, payload.value);
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_scramble_bonus', 'Tin Cup scramble bonus updated', {
      playerName: payload.playerName,
      value: payload.value,
    });
    return res.json({ scrambleBonus: state.scrambleBonus });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/tin-cup/live/admin/penalty', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const payload = req.body || {};
    const state = ensureTinCupLiveState(trip);
    const penalties = setPlayerPenalty(state, payload.playerName, {
      champion: payload.champion,
      rookie: payload.rookie,
    });
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_penalty', 'Tin Cup player penalty updated', {
      playerName: payload.playerName,
      champion: payload.champion,
      rookie: payload.rookie,
    });
    return res.json({ penalties });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.post('/:tripId/tin-cup/live/admin/seed-scores', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    const reset = !(req.body && req.body.reset === false);
    const leaderboard = seedAllScores(state, { reset });
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_seed_scores', 'Tin Cup demo scores seeded for all rounds', {
      reset,
      scorecardCount: Object.keys(state.scorecards || {}).length,
    });
    const scorecardCount = Object.keys(state.scorecards || {}).length;
    const holeCount = Object.values(state.scorecards || {}).reduce((sum, card) => {
      const players = (card && card.players && typeof card.players === 'object') ? Object.values(card.players) : [];
      return sum + players.reduce((playerSum, player) => playerSum + (Array.isArray(player && player.holes) ? player.holes.filter((gross) => Number.isFinite(Number(gross))).length : 0), 0);
    }, 0);
    return res.json({
      message: 'Seeded Tin Cup scores for every round.',
      reset,
      scorecardCount,
      holeCount,
      topFive: (leaderboard.totals || []).slice(0, 5),
    });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/tin-cup/live/settings', async (req, res) => {
  try {
    const { trip } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    return res.json({ settings: state.settings });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.put('/:tripId/tin-cup/live/settings', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const { trip, TripModel, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const state = ensureTinCupLiveState(trip);
    const next = updateSettings(state, req.body && req.body.settings ? req.body.settings : {});
    trip.markModified('tinCupLive');
    await TripModel.updateOne({ _id: trip._id }, { tinCupLive: trip.tinCupLive });
    await writeTripAudit(req, trip, TripAuditLogModel, 'tin_cup_settings', 'Tin Cup live settings changed', {
      settings: req.body && req.body.settings ? req.body.settings : {},
    });
    return res.json({ settings: next });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

router.get('/:tripId/audit-log', async (req, res) => {
  try {
    const { trip, TripAuditLogModel } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 250;
    const rows = await TripAuditLogModel.find({ tripId: trip._id }).sort({ timestamp: -1 }).limit(limit).lean();
    return res.json({
      tripId: String(trip._id),
      startedAt: getTripStartDate(trip),
      count: rows.length,
      rows,
    });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

// List participants
router.get('/:tripId/participants', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripParticipantSecondary } = getSecondaryModels();
    if (TripParticipantSecondary) {
      const participants = await TripParticipantSecondary.find({ trip: req.params.tripId });
      return res.json(participants);
    }
  }
  const participants = await TripParticipantPrimary.find({ trip: req.params.tripId });
  res.json(participants);
});

// Add participant
router.post('/:tripId/participants', async (req, res) => {
  try {
    const { TripModel, TripParticipantModel, TripAuditLogModel } = getTripModelsForRequest(req);
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const participant = await TripParticipantModel.create({ ...req.body, trip: req.params.tripId });
    await writeTripAudit(req, trip, TripAuditLogModel, 'participant_add', 'Trip participant added', {
      participantId: participant._id,
      name: participant.name,
      status: participant.status,
    });
    return res.json(participant);
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

// Update participant
router.put('/:tripId/participants/:participantId', async (req, res) => {
  const needsAdmin = ['status', 'totalPaidAmount', 'depositPaid', 'fullAmountPaid', 'handicapIndex'].some((k) => k in req.body);
  if (needsAdmin && !isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { TripModel, TripParticipantModel, TripAuditLogModel } = getTripModelsForRequest(req);
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const participantBefore = await TripParticipantModel.findById(req.params.participantId);
    const participant = await TripParticipantModel.findByIdAndUpdate(req.params.participantId, req.body, { new: true });
    if (!participant) return res.status(404).json({ error: 'Participant not found' });
    await writeTripAudit(req, trip, TripAuditLogModel, 'participant_update', 'Trip participant updated', {
      participantId: participant._id,
      name: participant.name,
      fields: Object.keys(req.body || {}),
      before: participantBefore ? {
        name: participantBefore.name,
        status: participantBefore.status,
        handicapIndex: participantBefore.handicapIndex,
        roomAssignment: participantBefore.roomAssignment,
      } : null,
      after: {
        name: participant.name,
        status: participant.status,
        handicapIndex: participant.handicapIndex,
        roomAssignment: participant.roomAssignment,
      },
    });
    return res.json(participant);
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

// Delete participant
router.delete('/:tripId/participants/:participantId', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  try {
    const { TripModel, TripParticipantModel, TripAuditLogModel } = getTripModelsForRequest(req);
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const participant = await TripParticipantModel.findById(req.params.participantId);
    await TripParticipantModel.findByIdAndDelete(req.params.participantId);
    await writeTripAudit(req, trip, TripAuditLogModel, 'participant_delete', 'Trip participant removed', {
      participantId: req.params.participantId,
      name: participant && participant.name ? participant.name : '',
    });
    return res.json({ ok: true });
  } catch (error) {
    return sendTripRouteError(res, error);
  }
});

module.exports = router;

