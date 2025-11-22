const mongoose = require('mongoose');

const TeeTimeSchema = new mongoose.Schema({
  eventDate: { type: Date },
  dateStr: { type: String },
  timeStr: { type: String },
  holes: { type: Number },
  players: { type: Number },
  course: { type: String },
  status: { type: String, default: 'active' },
  source: { type: String, default: 'email' },
  rawEmail: {
    from: { type: String },
    to: { type: [String] },
    subject: { type: String },
    body: { type: String }
  }
}, { timestamps: true });

module.exports = mongoose.models.TeeTime || mongoose.model('TeeTime', TeeTimeSchema);
