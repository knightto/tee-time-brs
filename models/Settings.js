// models/Settings.js
const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  groupSlug: { type: String, required: true, trim: true, lowercase: true, default: 'main' },
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

SettingsSchema.index({ groupSlug: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Settings', SettingsSchema);
