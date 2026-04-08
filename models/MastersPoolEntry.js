const mongoose = require('mongoose');

const MastersPickSchema = new mongoose.Schema(
  {
    tierKey: { type: String, required: true, trim: true },
    golferId: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const MastersPoolEntrySchema = new mongoose.Schema(
  {
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'MastersPool', required: true, index: true },
    entrantName: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    entryFeeSnapshot: { type: Number, default: 10, min: 0 },
    picks: { type: [MastersPickSchema], default: [] },
    predictedWinningScoreToPar: { type: Number, default: null },
    submittedAt: { type: Date, default: Date.now, index: true },
    computed: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

MastersPoolEntrySchema.index({ poolId: 1, entrantName: 1 });
MastersPoolEntrySchema.index({ poolId: 1, submittedAt: 1 });

const MastersPoolEntryModel =
  mongoose.models.MastersPoolEntry || mongoose.model('MastersPoolEntry', MastersPoolEntrySchema);

module.exports = MastersPoolEntryModel;
module.exports.schema = MastersPoolEntrySchema;
