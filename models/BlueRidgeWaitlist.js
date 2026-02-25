const mongoose = require('mongoose');

const WaitlistStatus = ['active', 'converted', 'cancelled'];

const BlueRidgeWaitlistSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    emailKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    phone: { type: String, trim: true, maxlength: 40 },
    mode: { type: String, trim: true, maxlength: 40, default: 'single' },
    notes: { type: String, trim: true, maxlength: 1500 },
    status: { type: String, enum: WaitlistStatus, default: 'active', index: true },
  },
  { timestamps: true }
);

BlueRidgeWaitlistSchema.index(
  { eventId: 1, emailKey: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

const BlueRidgeWaitlistModel =
  mongoose.models.BlueRidgeWaitlist || mongoose.model('BlueRidgeWaitlist', BlueRidgeWaitlistSchema);
module.exports = BlueRidgeWaitlistModel;
module.exports.schema = BlueRidgeWaitlistSchema;
module.exports.WaitlistStatus = WaitlistStatus;
