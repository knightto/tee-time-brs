// models/Handicap.js
const mongoose = require('mongoose');

const HandicapSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ghinNumber: { type: String, trim: true, unique: true, sparse: true },
  clubName: { type: String, default: '', trim: true },
  ownerCode: { type: String, required: false, trim: true }, // personal code for this entry
  handicapIndex: { type: Number, default: null },
  notes: { type: String, default: '' },
  lastFetchedAt: { type: Date, default: null },
  lastFetchSuccess: { type: Boolean, default: false },
  lastFetchError: { type: String, default: null }
}, { timestamps: true });

// Index for efficient lookups
// ghinNumber already marked unique+sparse on the field; keep only name index here to avoid duplicate warnings
HandicapSchema.index({ name: 1 });

module.exports = mongoose.model('Handicap', HandicapSchema);
