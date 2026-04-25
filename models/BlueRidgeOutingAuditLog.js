const mongoose = require('mongoose');

const AuditCategory = ['money', 'player', 'team', 'waitlist', 'registration', 'event'];

const BlueRidgeOutingAuditLogSchema = new mongoose.Schema(
  {
    outingId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    category: { type: String, enum: AuditCategory, default: 'event', index: true },
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

BlueRidgeOutingAuditLogSchema.index({ outingId: 1, timestamp: -1 });

const BlueRidgeOutingAuditLogModel =
  mongoose.models.BlueRidgeOutingAuditLog || mongoose.model('BlueRidgeOutingAuditLog', BlueRidgeOutingAuditLogSchema);

module.exports = BlueRidgeOutingAuditLogModel;
module.exports.schema = BlueRidgeOutingAuditLogSchema;
module.exports.AuditCategory = AuditCategory;
