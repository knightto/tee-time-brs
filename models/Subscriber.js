// models/Subscriber.js
const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('Subscriber', SubscriberSchema);
