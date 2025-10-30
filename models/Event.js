const mongoose = require('mongoose');

// This is a sub-document. It doesn't get its own file.
const PlayerSchema = new mongoose.Schema({
    name: { type: String, required: true }
});

// This is also a sub-document.
const TeeTimeSchema = new mongoose.Schema({
    time: { type: String, required: true }, // e.g., "08:00 AM"
    // This is the important part:
    // It's an array of Players, and we add a custom validation rule.
    players: {
        type: [PlayerSchema],
        validate: [arrayLimit, 'Tee time is full (max 4 players).']
    }
});

// Custom validator function
function arrayLimit(val) {
    return val.length <= 4;
}

const EventSchema = new mongoose.Schema({
    course: { type: String, required: true },
    eventName: { type: String, required: true },
    date: { type: Date, required: true },
    // An event has an array of TeeTime sub-documents
    teeTimes: [TeeTimeSchema]
});

// This line "compiles" the schema into a model you can use
module.exports = mongoose.model('Event', EventSchema);