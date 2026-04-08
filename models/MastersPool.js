const mongoose = require('mongoose');

const MastersPayoutSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true, min: 1, max: 3 },
    label: { type: String, required: true, trim: true },
    mode: { type: String, enum: ['percentage', 'amount'], default: 'percentage' },
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const MastersGolferSchema = new mongoose.Schema(
  {
    golferId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    shortName: { type: String, default: '', trim: true },
    seed: { type: Number, required: true, min: 1, max: 256 },
    tierKey: { type: String, required: true, trim: true, default: 'A' },
    worldRanking: { type: Number, default: null },
    bettingOdds: { type: String, default: '', trim: true },
    status: { type: String, enum: ['active', 'withdrew', 'missed_cut', 'finished'], default: 'active' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const MastersTierSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const MastersRoundResultGolferSchema = new mongoose.Schema(
  {
    golferId: { type: String, required: true, trim: true },
    name: { type: String, default: '', trim: true },
    position: { type: Number, default: null },
    madeCut: { type: Boolean, default: null },
    scoreToPar: { type: Number, default: null },
    strokes: { type: Number, default: null },
    note: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const MastersRoundResultSchema = new mongoose.Schema(
  {
    round: { type: Number, required: true, min: 1, max: 4 },
    label: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'in_progress', 'complete'], default: 'pending' },
    actualWinningScoreToPar: { type: Number, default: null },
    updatedAt: { type: Date, default: Date.now },
    golfers: { type: [MastersRoundResultGolferSchema], default: [] },
  },
  { _id: false }
);

const MastersPoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    season: { type: Number, default: 2026 },
    tournamentName: { type: String, default: 'Masters Tournament', trim: true },
    poolFormat: { type: String, enum: ['tiered_picks', 'bracket'], default: 'tiered_picks' },
    selectionMode: { type: String, enum: ['tiers', 'bracket'], default: 'tiers' },
    accessCode: { type: String, default: '', trim: true },
    tiers: { type: [MastersTierSchema], default: () => ([]) },
    tierRules: { type: mongoose.Schema.Types.Mixed, default: () => ({ tierCount: 6, picksPerTier: 4 }) },
    lineupRules: { type: mongoose.Schema.Types.Mixed, default: () => ({ countMode: 'all', bestX: null }) },
    status: { type: String, enum: ['draft', 'live', 'complete'], default: 'draft' },
    entryFee: { type: Number, default: 10, min: 0 },
    expectedEntrants: { type: Number, default: 0, min: 0 },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockReason: { type: String, default: '', trim: true },
    payouts: {
      type: [MastersPayoutSchema],
      default: () => ([
        { position: 1, label: '1st Place', mode: 'percentage', value: 60 },
        { position: 2, label: '2nd Place', mode: 'percentage', value: 30 },
        { position: 3, label: '3rd Place', mode: 'percentage', value: 10 },
      ]),
    },
    scoringRules: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    dataSource: { type: mongoose.Schema.Types.Mixed, default: () => ({ mode: 'manual', provider: 'manual' }) },
    golfers: { type: [MastersGolferSchema], default: [] },
    roundResults: { type: [MastersRoundResultSchema], default: [] },
    computed: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

MastersPoolSchema.index({ slug: 1 }, { unique: true });
MastersPoolSchema.index({ status: 1, season: -1, createdAt: -1 });

const MastersPoolModel =
  mongoose.models.MastersPool || mongoose.model('MastersPool', MastersPoolSchema);

module.exports = MastersPoolModel;
module.exports.schema = MastersPoolSchema;
