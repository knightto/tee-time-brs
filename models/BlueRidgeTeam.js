const mongoose = require('mongoose');

const TeamStatus = ['active', 'incomplete', 'cancelled'];

const BlueRidgeTeamSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    captainName: { type: String, trim: true, maxlength: 80 },
    captainEmail: { type: String, trim: true, lowercase: true, maxlength: 180 },
    targetSize: { type: Number, min: 1, max: 8 },
    status: { type: String, enum: TeamStatus, default: 'active', index: true },
  },
  { timestamps: true }
);

BlueRidgeTeamSchema.index({ eventId: 1, name: 1 }, { unique: true });

const BlueRidgeTeamModel = mongoose.models.BlueRidgeTeam || mongoose.model('BlueRidgeTeam', BlueRidgeTeamSchema);
module.exports = BlueRidgeTeamModel;
module.exports.schema = BlueRidgeTeamSchema;
module.exports.TeamStatus = TeamStatus;
