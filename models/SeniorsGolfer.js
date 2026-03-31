const mongoose = require('mongoose');

const SeniorsGolferSchema = new mongoose.Schema({
  groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'seniors' },
  name: { type: String, required: true, trim: true },
  nameKey: { type: String, required: true, trim: true, lowercase: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  ghinNumber: { type: String, trim: true, default: '' },
  handicapIndex: { type: Number, default: null },
  notes: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

SeniorsGolferSchema.pre('validate', function(next) {
  this.name = String(this.name || '').trim();
  this.nameKey = String(this.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  this.email = String(this.email || '').trim().toLowerCase();
  this.phone = String(this.phone || '').trim();
  this.ghinNumber = String(this.ghinNumber || '').trim();
  this.notes = String(this.notes || '').trim();
  next();
});

SeniorsGolferSchema.index({ groupSlug: 1, nameKey: 1 }, { unique: true });
SeniorsGolferSchema.index({ groupSlug: 1, email: 1 });

module.exports = mongoose.model('SeniorsGolfer', SeniorsGolferSchema);
