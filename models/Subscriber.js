// models/Subscriber.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const SubscriberSchema = new mongoose.Schema({
  groupSlug: { type: String, required: true, lowercase: true, trim: true, default: 'main' },
  email: { type: String, required: true, lowercase: true, trim: true },
  ghinNumber: { type: String, trim: true, default: '' },
  handicapIndex: { type: Number, default: null },
  unsubscribeToken: { type: String, unique: true, sparse: true } // Token for unsubscribe link
}, { timestamps: true });

SubscriberSchema.index({ groupSlug: 1, email: 1 }, { unique: true });

// Generate unsubscribe token before saving if not present
SubscriberSchema.pre('save', function(next) {
  if (!this.unsubscribeToken) {
    this.unsubscribeToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Subscriber', SubscriberSchema);
