// models/HandicapSnapshot.js
const mongoose = require('mongoose');

const HandicapSnapshotSchema = new mongoose.Schema({
  golferId: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer', required: true },
  handicapIndex: { type: Number, required: true },
  asOfDate: { type: Date, required: true },
  importedAt: { type: Date, default: () => new Date() },
  importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportBatch' },
  source: { type: String, default: 'manual_csv' }
}, { timestamps: true });

HandicapSnapshotSchema.index({ golferId: 1, asOfDate: -1, importedAt: -1 });

module.exports = mongoose.model('HandicapSnapshot', HandicapSnapshotSchema);
