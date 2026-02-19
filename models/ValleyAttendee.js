const mongoose = require('mongoose');

const ValleyAttendeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, trim: true, maxlength: 80, index: true },
    eventId: { type: String, required: true, trim: true, index: true },
    eventLabel: { type: String, required: true, trim: true, maxlength: 120 },
    checkedIn: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ValleyAttendeeSchema.index({ eventId: 1, nameKey: 1 }, { unique: true });

const ValleyAttendeeModel = mongoose.models.ValleyAttendee || mongoose.model('ValleyAttendee', ValleyAttendeeSchema);
module.exports = ValleyAttendeeModel;
module.exports.schema = ValleyAttendeeSchema;
