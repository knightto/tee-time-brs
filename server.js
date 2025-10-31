// Load environment variables from .env file
require('dotenv').config(); 

const express = require('express');
const mongoose = require('mongoose'); 
const path = require('path');
const cors = require('cors'); 
const nodemailer = require('nodemailer'); 
const Event = require('./models/Event'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security Constant ---
// ADMIN CODE IS HARDCODED TO 55555
const ADMIN_DELETE_CODE = '55555';

// --- Nodemailer Setup ---
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- Subscription Schema for Email Addresses ---
const SubscriptionSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true,
        match: [/\S+@\S+\.\S+/, 'is invalid'] 
    },
    subscribedAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

// *** Email Helper Function ***
const sendNotificationEmail = async (event) => {
    try {
        const subscriptions = await Subscription.find({}, 'email'); 
        const recipientList = subscriptions.map(sub => sub.email).join(', ');

        if (!recipientList) {
            console.log('No subscribers found. Email notification skipped.');
            return;
        }

        const eventDate = new Date(event.date).toLocaleDateString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipientList, 
            subject: `[Tee Time Alert] NEW Event Created: ${event.eventName}`,
            html: `
                <h2>A New Golf Event Has Been Scheduled!</h2>
                <p>The following event is now open for sign-up:</p>
                <ul>
                    <li><strong>Event:</strong> ${event.eventName}</li>
                    <li><strong>Course:</strong> ${event.course}</li>
                    <li><strong>Date:</strong> ${eventDate}</li>
                    <li><strong>First Tee Time:</strong> ${event.teeTimes[0].time}</li>
                </ul>
                <p>Please visit the sign-up page to secure your spot!</p>
                <p><a href="https://tee-time-brs.onrender.com/">Go to Sign-up Page</a></p>
                <p>---<br>You received this because you subscribed to event notifications.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('Notification email sent successfully.');

    } catch (error) {
        // Log the error but do NOT throw it further up.
        console.error('Error sending email notification:', error);
    }
};

// --- Middleware ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// --- Database Connection (FIXED: Removed deprecated options) ---
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/teeTimeApp';

// Removed useNewUrlParser and useUnifiedTopology to resolve MongoDB warnings
mongoose.connect(mongoURI, {}) 
.then(() => console.log('MongoDB connected successfully.'))
.catch(err => console.error('MongoDB connection error:', err));

// --- API Routes ---

// Route to handle email subscription
app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Email is required." });
    }

    try {
        const newSubscription = new Subscription({ email });
        await newSubscription.save();
        res.status(201).json({ message: 'Successfully subscribed to notifications!' });
    } catch (err) {
        if (err.code === 11000) { 
             return res.status(409).json({ message: 'This email is already subscribed.' });
        }
        res.status(400).json({ message: err.message });
    }
});


// GET all events
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 }); 
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CREATE a new event (Non-blocking email)
app.post('/api/events', async (req, res) => {
    const { course, eventName, date, startTime, numTeeTimes } = req.body;

    let newTeeTimes = [];
    let currentTime = new Date(`${date}T${startTime}`);

    for (let i = 0; i < numTeeTimes; i++) {
        newTeeTimes.push({
            time: currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            players: [] 
        });
        currentTime.setMinutes(currentTime.getMinutes() + 10);
    }

    const event = new Event({
        course,
        eventName,
        date,
        teeTimes: newTeeTimes
    });

    try {
        const newEvent = await event.save();
        
        // 1. Send success response IMMEDIATELY.
        res.status(201).json(newEvent); 
        
        // 2. Trigger email notification in the background without 'await'.
        sendNotificationEmail(newEvent).catch(err => {
            console.error('Background Email Sending Failed:', err);
        });

    } catch (err) {
        res.status(400).json({ message: err.message }); 
    }
});


// ADD a player to a tee time
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
        
        // Basic check for duplicate player name (case-insensitive)
        const existingPlayer = teeTime.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (existingPlayer) {
             return res.status(400).json({ message: 'Player is already registered for this tee time.' });
        }
        
        teeTime.players.push({ name: playerName });
        
        await event.save();
        res.json(event); 
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// REMOVE a player from a tee time (REQUIRES CODE)
app.delete('/api/events/:eventId/teetimes/:teeTimeId/players/:playerId', async (req, res) => {
    const { deleteCode } = req.body; // Extract the delete code

    // 1. Check for Admin Code
    if (!deleteCode || deleteCode !== ADMIN_DELETE_CODE) {
        return res.status(401).json({ message: 'Unauthorized: Invalid delete code.' });
    }

    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });

        const teeTime = event.teeTimes.id(req.params.teeTimeId);
        if (!teeTime) return res.status(404).json({ message: 'Tee time not found.' });

        // Use .pull() to remove the sub-document by its ID
        teeTime.players.pull(req.params.playerId); 
        
        await event.save();
        res.json({ message: 'Player successfully removed.' }); 
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// REMOVE a tee time from an event (REQUIRES CODE)
app.delete('/api/events/:eventId/teetimes/:teeTimeId', async (req, res) => {
    const { deleteCode } = req.body; // Extract the delete code
    
    // 1. Check for Admin Code
    if (!deleteCode || deleteCode !== ADMIN_DELETE_CODE) {
        return res.status(401).json({ message: 'Unauthorized: Invalid delete code.' });
    }
    
    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });
        
        event.teeTimes.pull(req.params.teeTimeId);

        await event.save();
        res.json({ message: 'Tee time successfully removed.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ADD a new tee time to the event
app.post('/api/events/:eventId/teetimes', async (req, res) => {
    const { time } = req.body;
    if (!time) {
        return res.status(400).json({ message: 'Time is required to add a new tee time.' });
    }

    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });
        
        event.teeTimes.push({ time, players: [] });
        // Re-sort the tee times to keep them in order
        event.teeTimes.sort((a, b) => a.time.localeCompare(b.time)); 

        await event.save();
        res.status(201).json(event);
    } catch (err) {