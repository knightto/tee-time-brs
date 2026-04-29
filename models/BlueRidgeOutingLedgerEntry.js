const mongoose = require('mongoose');

const LedgerEntryType = ['income', 'expense'];
const LedgerEntryCategory = [
  'raffle_income',
  'fifty_fifty_income',
  'raffle_purchase',
  'outing_expense',
  'course_payment',
  'prize_pool',
  'tournament_fee',
  'sponsor_income',
  'other',
];

const BlueRidgeOutingLedgerEntrySchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    type: { type: String, enum: LedgerEntryType, required: true, index: true },
    category: { type: String, enum: LedgerEntryCategory, default: 'other', index: true },
    label: { type: String, required: true, trim: true, maxlength: 140 },
    amount: { type: Number, required: true, min: 0 },
    paidTo: { type: String, trim: true, maxlength: 120 },
    paidBy: { type: String, trim: true, maxlength: 120 },
    method: { type: String, trim: true, maxlength: 80 },
    occurredAt: { type: Date, default: Date.now, index: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

BlueRidgeOutingLedgerEntrySchema.index({ eventId: 1, occurredAt: -1, createdAt: -1 });

const BlueRidgeOutingLedgerEntryModel =
  mongoose.models.BlueRidgeOutingLedgerEntry ||
  mongoose.model('BlueRidgeOutingLedgerEntry', BlueRidgeOutingLedgerEntrySchema);

module.exports = BlueRidgeOutingLedgerEntryModel;
module.exports.schema = BlueRidgeOutingLedgerEntrySchema;
module.exports.LedgerEntryType = LedgerEntryType;
module.exports.LedgerEntryCategory = LedgerEntryCategory;
