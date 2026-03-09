const mongoose = require('mongoose');

const TripRoundSlotSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  time: { type: String, default: '' }, // HH:MM
  players: { type: [String], default: [] }
}, { _id: false });

const TripRoundSchema = new mongoose.Schema({
  course: { type: String, default: '' },
  address: { type: String, default: '' },
  date: { type: Date, default: null },
  time: { type: String, default: '' }, // HH:MM
  confirmation: { type: String, default: '' },
  teeTimes: { type: [TripRoundSlotSchema], default: [] },
  unassignedPlayers: { type: [String], default: [] }
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
  rounds: { type: [TripRoundSchema], default: [] },
  notes: { type: String }
}, { timestamps: true });
const TripModel = mongoose.model('Trip', TripSchema);
module.exports = TripModel;
module.exports.schema = TripSchema;
