// models/Subscriber.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const SubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  unsubscribeToken: { type: String, unique: true, sparse: true } // Token for unsubscribe link
}, { timestamps: true });

// Generate unsubscribe token before saving if not present
SubscriberSchema.pre('save', function(next) {
  if (!this.unsubscribeToken) {
    this.unsubscribeToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Subscriber', SubscriberSchema);
