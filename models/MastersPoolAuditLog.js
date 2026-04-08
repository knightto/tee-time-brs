const mongoose = require('mongoose');

const MastersPoolAuditLogSchema = new mongoose.Schema(
  {
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'MastersPool', required: true, index: true },
    action: { type: String, required: true, trim: true },
    actor: { type: String, enum: ['admin', 'public'], default: 'public' },
    method: { type: String, default: '' },
    route: { type: String, default: '' },
    summary: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

MastersPoolAuditLogSchema.index({ poolId: 1, timestamp: -1 });

const MastersPoolAuditLogModel =
  mongoose.models.MastersPoolAuditLog || mongoose.model('MastersPoolAuditLog', MastersPoolAuditLogSchema);

module.exports = MastersPoolAuditLogModel;
module.exports.schema = MastersPoolAuditLogSchema;
