const mongoose = require('mongoose');

const InboundTeeTimeEmailLogSchema = new mongoose.Schema(
  {
    groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'main', index: true },
    sourceEmailId: { type: String, trim: true, default: '', index: true },
    sourceEventId: { type: String, trim: true, default: '' },
    action: { type: String, trim: true, lowercase: true, default: 'create' },
    sourceEmail: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, default: '' },
    course: { type: String, trim: true, default: '' },
    facility: { type: String, trim: true, default: '' },
    teeDateISO: { type: String, trim: true, default: '', index: true },
    teeTime: { type: String, trim: true, default: '' },
    teeTimes: { type: [String], default: [] },
    rawDateStr: { type: String, trim: true, default: '' },
    rawTimeStr: { type: String, trim: true, default: '' },
    golferCount: { type: Number, default: 0 },
    holes: { type: Number, default: 0 },
    ttid: { type: String, trim: true, default: '' },
    processingResult: { type: String, trim: true, lowercase: true, default: 'received', index: true },
    processingNote: { type: String, trim: true, default: '' },
    matchedEventId: { type: String, trim: true, default: '' },
    createdEventId: { type: String, trim: true, default: '' },
    emailReceivedAt: { type: Date, default: Date.now, index: true },
    loggedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

InboundTeeTimeEmailLogSchema.index({ groupSlug: 1, emailReceivedAt: -1 });
InboundTeeTimeEmailLogSchema.index(
  { groupSlug: 1, sourceEmailId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceEmailId: { $type: 'string', $ne: '' },
    },
  }
);

module.exports = mongoose.model('InboundTeeTimeEmailLog', InboundTeeTimeEmailLogSchema);
