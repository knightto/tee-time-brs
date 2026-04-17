const mongoose = require('mongoose');
const TEE_TIME_AUDIT_TTL_SECONDS = 30 * 24 * 60 * 60;

const TeeTimeLogSchema = new mongoose.Schema(
  {
    groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'main', index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', index: true },
    teeId: { type: mongoose.Schema.Types.ObjectId },
    action: { type: String, enum: ['add', 'update', 'delete'], required: true },
    labelBefore: { type: String, default: '' },
    labelAfter: { type: String, default: '' },
    isTeamEvent: { type: Boolean, default: false },
    course: { type: String, default: '' },
    dateISO: { type: String, default: '' },
    notifyClub: { type: Boolean, default: false },
    mailMethod: { type: String, default: null },
    mailError: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

TeeTimeLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: TEE_TIME_AUDIT_TTL_SECONDS });
TeeTimeLogSchema.index({ groupSlug: 1, createdAt: -1 });

module.exports = mongoose.model('TeeTimeLog', TeeTimeLogSchema);
