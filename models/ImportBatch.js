// models/ImportBatch.js
const mongoose = require('mongoose');

const ImportBatchSchema = new mongoose.Schema({
  clubId: { type: String, required: true, trim: true },
  importedBy: { type: String, default: null },
  fileName: { type: String, default: null },
  rowCount: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  errorsJson: { type: Array, default: [] }
}, { timestamps: true });

ImportBatchSchema.index({ clubId: 1, createdAt: -1 });

module.exports = mongoose.model('ImportBatch', ImportBatchSchema);
