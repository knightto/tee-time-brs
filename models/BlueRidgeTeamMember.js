const mongoose = require('mongoose');

const TeamMemberStatus = ['active', 'cancelled'];

const BlueRidgeTeamMemberSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeOuting', required: true, index: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeTeam', index: true },
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlueRidgeRegistration', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    emailKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    phone: { type: String, trim: true, maxlength: 40 },
    isGuest: { type: Boolean, default: false },
    handicapIndex: { type: Number },
    isCaptain: { type: Boolean, default: false },
    status: { type: String, enum: TeamMemberStatus, default: 'active', index: true },
  },
  { timestamps: true }
);

BlueRidgeTeamMemberSchema.index(
  { eventId: 1, emailKey: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

const BlueRidgeTeamMemberModel =
  mongoose.models.BlueRidgeTeamMember || mongoose.model('BlueRidgeTeamMember', BlueRidgeTeamMemberSchema);
module.exports = BlueRidgeTeamMemberModel;
module.exports.schema = BlueRidgeTeamMemberSchema;
module.exports.TeamMemberStatus = TeamMemberStatus;
