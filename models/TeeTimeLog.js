const mongoose = require('mongoose');

const TeeTimeLogSchema = new mongoose.Schema(
  {
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
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

TeeTimeLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TeeTimeLog', TeeTimeLogSchema);
