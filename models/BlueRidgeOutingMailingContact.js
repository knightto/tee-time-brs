const mongoose = require('mongoose');

const MailingContactStatus = ['subscribed', 'unsubscribed'];
const MailingContactSource = ['manual', 'registration', 'waitlist', 'sponsor', 'import'];

const BlueRidgeOutingMailingContactSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    name: { type: String, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    emailKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    phone: { type: String, trim: true, maxlength: 40 },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
    source: { type: String, enum: MailingContactSource, default: 'manual', index: true },
    status: { type: String, enum: MailingContactStatus, default: 'subscribed', index: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

BlueRidgeOutingMailingContactSchema.index({ eventId: 1, emailKey: 1 }, { unique: true });
BlueRidgeOutingMailingContactSchema.index({ eventId: 1, status: 1, source: 1 });

const BlueRidgeOutingMailingContactModel =
  mongoose.models.BlueRidgeOutingMailingContact ||
  mongoose.model('BlueRidgeOutingMailingContact', BlueRidgeOutingMailingContactSchema);

module.exports = BlueRidgeOutingMailingContactModel;
module.exports.schema = BlueRidgeOutingMailingContactSchema;
module.exports.MailingContactStatus = MailingContactStatus;
module.exports.MailingContactSource = MailingContactSource;
