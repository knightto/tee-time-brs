const mongoose = require('mongoose');

const TEE_TIME_RECOVERY_TTL_SECONDS = 30 * 24 * 60 * 60;

const DeletedTeeTimeArchiveSchema = new mongoose.Schema(
  {
    groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'main', index: true },
    archiveType: { type: String, enum: ['event', 'tee_time'], required: true },
    originalEventId: { type: String, required: true, trim: true, index: true },
    originalTeeId: { type: String, default: '', trim: true },
    eventCourse: { type: String, default: '', trim: true },
    eventDateISO: { type: String, default: '', trim: true, index: true },
    isTeamEvent: { type: Boolean, default: false },
    slotIndex: { type: Number, default: null },
    slotLabel: { type: String, default: '', trim: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    eventSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    deleteSource: { type: String, default: '', trim: true, lowercase: true },
    deletedBy: { type: String, default: 'SYSTEM', trim: true },
    notes: { type: String, default: '', trim: true },
    deletedAt: { type: Date, default: Date.now },
    restoredAt: { type: Date, default: null },
    restoredEventId: { type: String, default: '', trim: true },
    restoredTeeId: { type: String, default: '', trim: true },
  },
  { timestamps: false }
);

DeletedTeeTimeArchiveSchema.index({ deletedAt: 1 }, { expireAfterSeconds: TEE_TIME_RECOVERY_TTL_SECONDS });
DeletedTeeTimeArchiveSchema.index({ groupSlug: 1, eventDateISO: 1, deletedAt: -1 });

module.exports = mongoose.model('DeletedTeeTimeArchive', DeletedTeeTimeArchiveSchema);
