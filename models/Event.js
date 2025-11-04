const mongoose = require('mongoose');
const { Schema } = mongoose;

const PlayerSchema = new Schema({ name: { type: String, required: true } }, { _id: true });

const TeeTimeSchema = new Schema({
  time: { type: String, required: true },
  players: { type: [PlayerSchema], default: [] }
}, { _id: true });

const EventSchema = new Schema({
  title:  { type: String },
  course: { type: String, required: true },
  date:   { type: String, required: true }, // YYYY-MM-DD
  notes:  { type: String },

  // Team mode
  isTeamEvent: { type: Boolean, default: false },
  teamSizeMax: { type: Number, default: 4, min: 2, max: 4 },

  teeTimes: { type: [TeeTimeSchema], default: [] }
}, { timestamps: true, collection: 'events' });

module.exports = mongoose.model('Event', EventSchema);
