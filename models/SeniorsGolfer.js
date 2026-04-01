const mongoose = require('mongoose');

const SeniorsGolferSchema = new mongoose.Schema({
  groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'seniors' },
  rosterNumber: { type: Number, default: null },
  name: { type: String, required: true, trim: true },
  nameKey: { type: String, required: true, trim: true, lowercase: true },
  firstName: { type: String, trim: true, default: '' },
  lastName: { type: String, trim: true, default: '' },
  preferredFirstName: { type: String, trim: true, default: '' },
  preferredLastName: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  ghinNumber: { type: String, trim: true, default: '' },
  handicapGold: { type: Number, default: null },
  handicapRed: { type: Number, default: null },
  handicapIndex: { type: Number, default: null },
  notes: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

SeniorsGolferSchema.pre('validate', function(next) {
  if (this.rosterNumber === '' || this.rosterNumber === undefined) this.rosterNumber = null;
  this.name = String(this.name || '').trim();
  this.nameKey = String(this.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  this.firstName = String(this.firstName || '').trim();
  this.lastName = String(this.lastName || '').trim();
  this.preferredFirstName = String(this.preferredFirstName || '').trim();
  this.preferredLastName = String(this.preferredLastName || '').trim();
  this.email = String(this.email || '').trim().toLowerCase();
  this.phone = String(this.phone || '').trim();
  this.address = String(this.address || '').trim();
  this.ghinNumber = String(this.ghinNumber || '').trim();
  this.notes = String(this.notes || '').trim();
  next();
});

SeniorsGolferSchema.index({ groupSlug: 1, nameKey: 1 }, { unique: true });
SeniorsGolferSchema.index({ groupSlug: 1, email: 1 });

module.exports = mongoose.model('SeniorsGolfer', SeniorsGolferSchema);
