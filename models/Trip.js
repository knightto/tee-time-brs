const mongoose = require('mongoose');
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
  notes: { type: String }
}, { timestamps: true });
const TripModel = mongoose.model('Trip', TripSchema);
module.exports = TripModel;
module.exports.schema = TripSchema;
