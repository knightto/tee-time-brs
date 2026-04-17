// models/AuditLog.js
const mongoose = require('mongoose');
const TEE_TIME_AUDIT_TTL_SECONDS = 30 * 24 * 60 * 60;

const AuditLogSchema = new mongoose.Schema({
  groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'main', index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  action: { type: String, required: true, trim: true, lowercase: true },
  playerName: { type: String, default: '', trim: true },
  teeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  fromTeeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  toTeeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  teeLabel: { type: String, default: '' },
  fromTeeLabel: { type: String, default: '' },
  toTeeLabel: { type: String, default: '' },
  eventCourse: { type: String, default: '' },
  eventDateISO: { type: String, default: '' },
  isTeamEvent: { type: Boolean, default: false },
  message: { type: String, default: '', trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: TEE_TIME_AUDIT_TTL_SECONDS });
// Index for efficient queries by event and time
AuditLogSchema.index({ eventId: 1, timestamp: -1 });
AuditLogSchema.index({ groupSlug: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
