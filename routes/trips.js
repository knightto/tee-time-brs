const express = require('express');
const { getSecondaryConn, initSecondaryConn } = require('../secondary-conn');
initSecondaryConn();
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';
const TripPrimary = require('../models/Trip');
const TripParticipantPrimary = require('../models/TripParticipant');
const { buildDefaultTripTemplate, DEFAULT_TEMPLATE_NAME } = require('../services/tripTemplateService');
const {
  buildTripCompetitionView,
  setRoundMatchTeams,
  setRoundPlayerScores,
  setRoundSideGames,
  setTripHandicapBuckets,
  setTripScoringMode,
} = require('../services/tripCompetitionService');
const router = express.Router();

function getSecondaryModels() {
  const conn = getSecondaryConn();
  if (!conn) return {};
  return {
    TripSecondary: conn.model('Trip', require('../models/Trip').schema),
    TripParticipantSecondary: conn.model('TripParticipant', require('../models/TripParticipant').schema),
  };
}

function isAdmin(req) {
  const code = req.headers['x-admin-code'] || req.query.code || (req.body && req.body.adminCode);
  return Boolean(ADMIN_DELETE_CODE && code && code === ADMIN_DELETE_CODE);
}

function getTripModelsForRequest(req) {
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripSecondary, TripParticipantSecondary } = getSecondaryModels();
    if (TripSecondary && TripParticipantSecondary) {
      return { TripModel: TripSecondary, TripParticipantModel: TripParticipantSecondary };
    }
  }
  return { TripModel: TripPrimary, TripParticipantModel: TripParticipantPrimary };
}

async function loadTripBundle(req) {
  const { TripModel, TripParticipantModel } = getTripModelsForRequest(req);
  const trip = await TripModel.findById(req.params.tripId);
  if (!trip) return { TripModel, TripParticipantModel, trip: null, participants: [] };
  const participants = await TripParticipantModel.find({ trip: trip._id });
  return { TripModel, TripParticipantModel, trip, participants };
}

function sendTripRouteError(res, error) {
  const message = error && error.message ? error.message : 'Request failed';
  if (/not found/i.test(message)) return res.status(404).json({ error: message });
  if (/required|select exactly|four-player/i.test(message)) return res.status(400).json({ error: message });
  return res.status(500).json({ error: message });
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
      const participants = await TripParticipantSecondary.find({ trip: trip._id });
      return res.json({ trip, participants });
    }
  }
  const trip = await TripPrimary.findById(req.params.tripId);
  const participants = await TripParticipantPrimary.find({ trip: trip._id });
  res.json({ trip, participants });
});

// Update trip details
router.put('/:tripId', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripSecondary } = getSecondaryModels();
    if (TripSecondary) {
      const trip = await TripSecondary.findByIdAndUpdate(req.params.tripId, req.body, { new: true });
      return res.json(trip);
    }
  }
  const trip = await TripPrimary.findByIdAndUpdate(req.params.tripId, req.body, { new: true });
  res.json(trip);
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
    const { trip, participants } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setTripScoringMode(trip, req.body && req.body.scoringMode);
    await trip.save();
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
    const { trip, participants } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setTripHandicapBuckets(trip, participants, req.body && req.body.buckets);
    await trip.save();
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
    const { trip, participants } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setRoundPlayerScores(trip, req.params.roundIndex, req.body && req.body.playerName, req.body && req.body.holes);
    await trip.save();
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
    const { trip, participants } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setRoundMatchTeams(trip, req.params.roundIndex, req.params.slotIndex, req.body && req.body.teamA, req.body && req.body.teamB);
    await trip.save();
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
    const { trip, participants } = await loadTripBundle(req);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    setRoundSideGames(trip, req.params.roundIndex, {
      ctpWinners: req.body && req.body.ctpWinners,
      skinsResults: req.body && req.body.skinsResults,
    });
    await trip.save();
    return res.json(buildTripCompetitionView(trip, participants));
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
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripParticipantSecondary } = getSecondaryModels();
    if (TripParticipantSecondary) {
      const participant = await TripParticipantSecondary.create({ ...req.body, trip: req.params.tripId });
      return res.json(participant);
    }
  }
  const participant = await TripParticipantPrimary.create({ ...req.body, trip: req.params.tripId });
  res.json(participant);
});

// Update participant
router.put('/:tripId/participants/:participantId', async (req, res) => {
  const needsAdmin = ['status', 'totalPaidAmount', 'depositPaid', 'fullAmountPaid', 'handicapIndex'].some((k) => k in req.body);
  if (needsAdmin && !isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripParticipantSecondary } = getSecondaryModels();
    if (TripParticipantSecondary) {
      const participant = await TripParticipantSecondary.findByIdAndUpdate(req.params.participantId, req.body, { new: true });
      return res.json(participant);
    }
  }
  const participant = await TripParticipantPrimary.findByIdAndUpdate(req.params.participantId, req.body, { new: true });
  res.json(participant);
});

// Delete participant
router.delete('/:tripId/participants/:participantId', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin code required' });
  }
  if (req.query.myrtleBeach2026 === 'true') {
    const { TripParticipantSecondary } = getSecondaryModels();
    if (TripParticipantSecondary) {
      await TripParticipantSecondary.findByIdAndDelete(req.params.participantId);
      return res.json({ ok: true });
    }
  }
  await TripParticipantPrimary.findByIdAndDelete(req.params.participantId);
  res.json({ ok: true });
});

module.exports = router;
