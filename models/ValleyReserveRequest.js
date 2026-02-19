const mongoose = require('mongoose');

const ValleyReserveRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, trim: true, maxlength: 80, index: true },
    eventId: { type: String, required: true, trim: true, index: true },
    eventLabel: { type: String, required: true, trim: true, maxlength: 120 },
    bottle: { type: String, required: true, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 280, default: '' },
  },
  { timestamps: true }
);

const ValleyReserveRequestModel =
  mongoose.models.ValleyReserveRequest || mongoose.model('ValleyReserveRequest', ValleyReserveRequestSchema);
module.exports = ValleyReserveRequestModel;
module.exports.schema = ValleyReserveRequestSchema;
