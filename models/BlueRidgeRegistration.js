const mongoose = require('mongoose');

const RegistrationMode = [
  'single',
  'seeking_partner',
  'seeking_team',
  'partial_team',
  'full_team',
  'member_guest',
  'captain',
  'join_team',
];

const RegistrationStatus = ['registered', 'waitlisted', 'cancelled'];
const PaymentStatus = ['unpaid', 'pending', 'paid', 'refunded'];

const BlueRidgeRegistrationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    mode: { type: String, enum: RegistrationMode, required: true },
    status: { type: String, enum: RegistrationStatus, default: 'registered', index: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeTeam', index: true },
    submittedByName: { type: String, required: true, trim: true, maxlength: 80 },
    submittedByEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    submittedByPhone: { type: String, trim: true, maxlength: 40 },
    notes: { type: String, trim: true, maxlength: 2000 },
    paymentStatus: { type: String, enum: PaymentStatus, default: 'unpaid' },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

BlueRidgeRegistrationSchema.index({ eventId: 1, status: 1, createdAt: -1 });

const BlueRidgeRegistrationModel =
  mongoose.models.BlueRidgeRegistration || mongoose.model('BlueRidgeRegistration', BlueRidgeRegistrationSchema);
module.exports = BlueRidgeRegistrationModel;
module.exports.schema = BlueRidgeRegistrationSchema;
module.exports.RegistrationMode = RegistrationMode;
module.exports.RegistrationStatus = RegistrationStatus;
module.exports.PaymentStatus = PaymentStatus;
