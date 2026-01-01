// models/Golfer.js
const mongoose = require('mongoose');

const GolferSchema = new mongoose.Schema({
  clubId: { type: String, required: true, trim: true },
  ghin: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

GolferSchema.index({ clubId: 1, ghin: 1 }, { unique: true });
GolferSchema.index({ clubId: 1, lastName: 1, firstName: 1 });

module.exports = mongoose.model('Golfer', GolferSchema);
