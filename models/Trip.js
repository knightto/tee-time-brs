const mongoose = require('mongoose');

const TripRoundSlotSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  time: { type: String, default: '' }, // HH:MM
  players: { type: [String], default: [] }
}, { _id: false });

const TripRoundScorecardHoleSchema = new mongoose.Schema({
  hole: { type: Number, default: 0 },
  par: { type: Number, default: 4 },
  handicap: { type: Number, default: 0 }
}, { _id: false });

const TripRoundPlayerScoreSchema = new mongoose.Schema({
  playerName: { type: String, default: '' },
  holes: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { _id: false });

const TripRoundTeamMatchSchema = new mongoose.Schema({
  slotIndex: { type: Number, default: 0 },
  teamA: { type: [String], default: [] },
  teamB: { type: [String], default: [] }
}, { _id: false });

const TripRoundCtpSchema = new mongoose.Schema({
  hole: { type: Number, default: 0 },
  winners: { type: [String], default: [] },
  note: { type: String, default: '' }
}, { _id: false });

const TripRoundSkinSchema = new mongoose.Schema({
  playerName: { type: String, default: '' },
  holes: { type: [Number], default: [] },
  amount: { type: Number, default: null },
  note: { type: String, default: '' }
}, { _id: false });

const TripRoundSchema = new mongoose.Schema({
  course: { type: String, default: '' },
  address: { type: String, default: '' },
  date: { type: Date, default: null },
  time: { type: String, default: '' }, // HH:MM
  confirmation: { type: String, default: '' },
  teeTimes: { type: [TripRoundSlotSchema], default: [] },
  unassignedPlayers: { type: [String], default: [] },
  scorecard: { type: [TripRoundScorecardHoleSchema], default: [] },
  playerScores: { type: [TripRoundPlayerScoreSchema], default: [] },
  teamMatches: { type: [TripRoundTeamMatchSchema], default: [] },
  ctpWinners: { type: [TripRoundCtpSchema], default: [] },
  skinsResults: { type: [TripRoundSkinSchema], default: [] }
}, { _id: false });

const TripCompetitionSchema = new mongoose.Schema({
  scoringMode: { type: String, enum: ['best4', 'all5'], default: 'best4' }
}, { _id: false });

const TripSchema = new mongoose.Schema({
  name: { type: String, required: true },
  groupName: { type: String, required: true },
  location: { type: String, required: true },
  arrivalDate: { type: Date, required: true },
  departureDate: { type: Date, required: true },
  packageType: { type: String },
  reservationNumber: { type: String },
  preparedBy: { type: String },
  contactPhone: { type: String },
  baseGroupSize: { type: Number, default: 16 },
  extraNightPricePerCondo: { type: Number, default: 130 },
  competition: { type: TripCompetitionSchema, default: () => ({}) },
  rounds: { type: [TripRoundSchema], default: [] },
  notes: { type: String }
}, { timestamps: true });
const TripModel = mongoose.model('Trip', TripSchema);
module.exports = TripModel;
module.exports.schema = TripSchema;
