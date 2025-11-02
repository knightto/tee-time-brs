
/* models/Event.js v3.4 */
const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true }
}, { _id: true });

const TeeTimeSchema = new mongoose.Schema({
  time: { type: String, required: true }, // HH:MM
  players: {
    type: [PlayerSchema],
    validate: [arr => arr.length <= 4, 'Max 4 players per tee time']
  }
}, { timestamps: false });

const EventSchema = new mongoose.Schema({
    course: { type: String, trim: true, required: true },
  date: { type: String, required: true },         // YYYY-MM-DD
  notes: { type: String, trim: true },
  teeTimes: { type: [TeeTimeSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Event', EventSchema);
