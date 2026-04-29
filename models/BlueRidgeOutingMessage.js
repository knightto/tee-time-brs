const mongoose = require('mongoose');

const OutingMessageStatus = ['sent', 'test', 'failed'];

const OutingMessageRecipientSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    groups: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
  },
  { _id: false }
);

const BlueRidgeOutingMessageSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, required: true, trim: true, maxlength: 12000 },
    audience: { type: String, trim: true, lowercase: true, maxlength: 40, default: 'all' },
    status: { type: String, enum: OutingMessageStatus, default: 'sent', index: true },
    recipientCount: { type: Number, default: 0, min: 0 },
    recipients: { type: [OutingMessageRecipientSchema], default: [] },
    testEmail: { type: String, trim: true, lowercase: true, maxlength: 180 },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    error: { type: String, trim: true, maxlength: 1000 },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

BlueRidgeOutingMessageSchema.index({ eventId: 1, sentAt: -1 });

const BlueRidgeOutingMessageModel =
  mongoose.models.BlueRidgeOutingMessage ||
  mongoose.model('BlueRidgeOutingMessage', BlueRidgeOutingMessageSchema);

module.exports = BlueRidgeOutingMessageModel;
module.exports.schema = BlueRidgeOutingMessageSchema;
module.exports.OutingMessageStatus = OutingMessageStatus;
