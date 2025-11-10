// models/Subscriber.js
const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  phone: { type: String, trim: true }, // Phone number for SMS (10 digits)
  carrier: { type: String, trim: true }, // Carrier name for email-to-SMS gateway
  subscriptionType: { type: String, enum: ['email', 'sms'], default: 'email' } // Notification type
}, { timestamps: true });

module.exports = mongoose.model('Subscriber', SubscriberSchema);
