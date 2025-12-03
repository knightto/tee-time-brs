const express = require('express');
const { secondaryConn } = require('../server');
const TripPrimary = require('../models/Trip');
const TripParticipantPrimary = require('../models/TripParticipant');
const TripSecondary = secondaryConn ? secondaryConn.model('Trip', require('../models/Trip').schema) : null;
const TripParticipantSecondary = secondaryConn ? secondaryConn.model('TripParticipant', require('../models/TripParticipant').schema) : null;
const router = express.Router();

// List all trips
router.get('/', async (req, res) => {
  // If query param myrtleBeach2026=true, use secondary DB
  if (req.query.myrtleBeach2026 === 'true' && TripSecondary) {
    const trips = await TripSecondary.find();
    return res.json(trips);
  }
  const trips = await TripPrimary.find();
  res.json(trips);
});

// Get trip details + participants
router.get('/:tripId', async (req, res) => {
  // If query param myrtleBeach2026=true, use secondary DB
  if (req.query.myrtleBeach2026 === 'true' && TripSecondary && TripParticipantSecondary) {
    const trip = await TripSecondary.findById(req.params.tripId);
    const participants = await TripParticipantSecondary.find({ trip: trip._id });
    return res.json({ trip, participants });
  }
  const trip = await TripPrimary.findById(req.params.tripId);
  const participants = await TripParticipantPrimary.find({ trip: trip._id });
  res.json({ trip, participants });
});

// Update trip details
router.put('/:tripId', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true' && TripSecondary) {
    const trip = await TripSecondary.findByIdAndUpdate(req.params.tripId, req.body, { new: true });
    return res.json(trip);
  }
  const trip = await TripPrimary.findByIdAndUpdate(req.params.tripId, req.body, { new: true });
  res.json(trip);
});

// List participants
router.get('/:tripId/participants', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true' && TripParticipantSecondary) {
    const participants = await TripParticipantSecondary.find({ trip: req.params.tripId });
    return res.json(participants);
  }
  const participants = await TripParticipantPrimary.find({ trip: req.params.tripId });
  res.json(participants);
});

// Add participant
router.post('/:tripId/participants', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true' && TripParticipantSecondary) {
    const participant = await TripParticipantSecondary.create({ ...req.body, trip: req.params.tripId });
    return res.json(participant);
  }
  const participant = await TripParticipantPrimary.create({ ...req.body, trip: req.params.tripId });
  res.json(participant);
});

// Update participant
router.put('/:tripId/participants/:participantId', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true' && TripParticipantSecondary) {
    const participant = await TripParticipantSecondary.findByIdAndUpdate(req.params.participantId, req.body, { new: true });
    return res.json(participant);
  }
  const participant = await TripParticipantPrimary.findByIdAndUpdate(req.params.participantId, req.body, { new: true });
  res.json(participant);
});

// Delete participant
router.delete('/:tripId/participants/:participantId', async (req, res) => {
  if (req.query.myrtleBeach2026 === 'true' && TripParticipantSecondary) {
    await TripParticipantSecondary.findByIdAndDelete(req.params.participantId);
    return res.json({ ok: true });
  }
  await TripParticipantPrimary.findByIdAndDelete(req.params.participantId);
  res.json({ ok: true });
});

module.exports = router;
