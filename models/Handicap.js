// models/Handicap.js
const mongoose = require('mongoose');

const HandicapSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ghinNumber: { type: String, required: true, trim: true, unique: true },
  handicapIndex: { type: Number, default: null },
  notes: { type: String, default: '' },
  lastFetchedAt: { type: Date, default: null },
  lastFetchSuccess: { type: Boolean, default: false },
  lastFetchError: { type: String, default: null }
}, { timestamps: true });

// Index for efficient lookups
HandicapSchema.index({ ghinNumber: 1 });
HandicapSchema.index({ name: 1 });

module.exports = mongoose.model('Handicap', HandicapSchema);
