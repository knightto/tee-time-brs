// models/AuditLog.js
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  action: { type: String, required: true, enum: ['add_player', 'remove_player', 'move_player'] },
  playerName: { type: String, required: true, trim: true },
  teeId: { type: mongoose.Schema.Types.ObjectId },        // For add/remove
  fromTeeId: { type: mongoose.Schema.Types.ObjectId },    // For move
  toTeeId: { type: mongoose.Schema.Types.ObjectId },      // For move
  teeLabel: { type: String },                             // Human-readable tee/team name
  fromTeeLabel: { type: String },                         // Human-readable source
  toTeeLabel: { type: String },                           // Human-readable destination
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

// Index for efficient queries by event and time
AuditLogSchema.index({ eventId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
