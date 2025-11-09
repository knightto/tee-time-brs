// models/Event.js
const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }
}, { _id: true });

// Tee or Team slot
const SlotSchema = new mongoose.Schema({
  // For tee-time events
  time: { type: String },            // HH:MM (optional for team events)
  // For team events
  name: { type: String, trim: true },// Optional team name like "Team 1" or "Blue"
  players: { type: [PlayerSchema], default: [] }
}, { _id: true });

const EventSchema = new mongoose.Schema({
  course: { type: String, required: true, trim: true },
  date:   { type: Date,   required: true },
  notes:  { type: String, default: '' },
  isTeamEvent: { type: Boolean, default: false },
  teamSizeMax: { type: Number, default: 4, min: 2, max: 4 },
  teeTimes: { type: [SlotSchema], default: [] },
  maybeList: { type: [String], default: [] },  // Array of player names interested but not committed
  weather: {
    condition: { type: String, default: null },  // 'sunny', 'cloudy', 'rainy', 'stormy', etc.
    icon: { type: String, default: null },       // Weather emoji
    temp: { type: Number, default: null },       // Temperature in Fahrenheit
    description: { type: String, default: null },// Human readable description
    lastFetched: { type: Date, default: null }
  }
}, { timestamps: true });

// Conditional validation: require time for non-team events, and forbid empty slots for both types
EventSchema.pre('validate', function(next){
  const ev = this;
  if (!Array.isArray(ev.teeTimes)) ev.teeTimes = [];

  if (!ev.isTeamEvent) {
    // Non-team events must have a time on every slot
    for (const slot of ev.teeTimes) {
      if (!slot.time) {
        return next(new mongoose.Error.ValidationError(Object.assign(new Error('Event validation failed'), {
          errors: { 'teeTimes.time': new mongoose.Error.ValidatorError({ path:'time', message:'Path `time` is required for tee-time events.' }) }
        })));
      }
    }
  } else {
    // Team events should not enforce time; allow optional name
    // nothing to enforce
  }
  next();
});

module.exports = mongoose.model('Event', EventSchema);
