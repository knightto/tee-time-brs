// Load environment variables from .env file
require('dotenv').config(); 

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors'); // Ensure cors is included if you use separate domains
const Event = require('./models/Event'); // Import our Event model

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// --- Database Connection ---
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/teeTimeApp';

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully.'))
.catch(err => console.error('MongoDB connection error:', err));

// --- API Routes ---

// GET all events (No change)
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 }); // Find all, sort by date
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CREATE a new event (No change)
app.post('/api/events', async (req, res) => {
    const { course, eventName, date, startTime, numTeeTimes } = req.body;

    // --- Logic to create tee time slots ---
    let newTeeTimes = [];
    let currentTime = new Date(`${date}T${startTime}`);

    for (let i = 0; i < numTeeTimes; i++) {
        const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        newTeeTimes.push({
            time: formattedTime,
            players: []
        });
        // Increment by 10 minutes for the next tee time
        currentTime.setMinutes(currentTime.getMinutes() + 10);
    }
    // --- End of tee time logic ---

    const event = new Event({
        course,
        eventName,
        date,
        teeTimes: newTeeTimes
    });

    try {
        const newEvent = await event.save();
        res.status(201).json(newEvent);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// ADD a player to a tee time (No change)
app.put('/api/events/:eventId/teetimes/:teeTimeId/add', async (req, res) => {
    const { playerName } = req.body;
    if (!playerName) {
        return res.status(400).json({ message: "Player name is required." });
    }

    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });

        const teeTime = event.teeTimes.id(req.params.teeTimeId);
        if (!teeTime) return res.status(404).json({ message: 'Tee time not found.' });
        
        if (teeTime.players.length >= 4) {
            return res.status(400).json({ message: 'This tee time is full.' });
        }
        
        teeTime.players.push({ name: playerName });
        
        await event.save();
        res.json(event);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// REMOVE a player from a tee time (No change)
app.delete('/api/events/:eventId/teetimes/:teeTimeId/players/:playerId', async (req, res) => {
    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });

        const teeTime = event.teeTimes.id(req.params.teeTimeId);
        if (!teeTime) return res.status(404).json({ message: 'Tee time not found.' });

        teeTime.players.id(req.params.playerId).remove();
        
        await event.save();
        res.json(event);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// *** NEW: DELETE an entire event ***
app.delete('/api/events/:eventId', async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.eventId);
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        // Respond with a success message or the deleted document
        res.json({ message: 'Event successfully deleted.', deletedEvent: event });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});