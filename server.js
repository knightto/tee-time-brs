// Load environment variables from .env file
require('dotenv').config(); 

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Event = require('./models/Event'); // Import our Event model

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
// This tells Express to automatically parse JSON in request bodies
app.use(express.json()); 
// This serves all static files (like index.html, script.js) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public'))); 

// --- Database Connection ---
// We use the MONGO_URI from the .env file.
// If it's not found, it defaults to a local MongoDB instance.
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/teeTimeApp';

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully.'))
.catch(err => console.error('MongoDB connection error:', err));

// --- API Routes ---

// GET all events
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 }); // Find all, sort by date
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CREATE a new event
app.post('/api/events', async (req, res) => {
    const { course, eventName, date, startTime, numTeeTimes } = req.body;

    // --- Logic to create tee time slots ---
    let newTeeTimes = [];
    let currentTime = new Date(`${date}T${startTime}`);

    for (let i = 0; i < numTeeTimes; i++) {
        newTeeTimes.push({
            time: currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            players: [] // Start with an empty players array
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
        res.status(201).json(newEvent); // 201 = "Created"
    } catch (err) {
        res.status(400).json({ message: err.message }); // 400 = "Bad Request" (e.g., missing data)
    }
});

// ADD a player to a tee time
// We use a PUT request, which is standard for updates.
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
        
        // This is where your "max 4" rule is enforced!
        if (teeTime.players.length >= 4) {
            return res.status(400).json({ message: 'This tee time is full.' });
        }
        
        teeTime.players.push({ name: playerName });
        
        await event.save();
        res.json(event); // Send back the updated event
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// REMOVE a player from a tee time
app.delete('/api/events/:eventId/teetimes/:teeTimeId/players/:playerId', async (req, res) => {
    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });

        const teeTime = event.teeTimes.id(req.params.teeTimeId);
        if (!teeTime) return res.status(404).json({ message: 'Tee time not found.' });

        // Mongoose sub-documents have an .id() method to find and .remove() to delete
        teeTime.players.id(req.params.playerId).remove();
        
        await event.save();
        res.json(event); // Send back the updated event
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});