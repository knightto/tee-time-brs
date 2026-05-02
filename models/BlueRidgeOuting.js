const mongoose = require('mongoose');

const OutingStatus = ['draft', 'open', 'closed', 'waitlist', 'completed'];
const FeeScheduleItemSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, maxlength: 60 },
    label: { type: String, trim: true, maxlength: 120 },
    amount: { type: Number, min: 0, default: 0 },
    basis: { type: String, enum: ['per_player', 'per_team', 'flat'], default: 'per_player' },
    category: { type: String, enum: ['income', 'course', 'prize', 'tournament', 'raffle', 'expense', 'other'], default: 'other' },
    enabled: { type: Boolean, default: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const PayoutPlannerSchema = new mongoose.Schema(
  {
    finalPlayerCount: { type: Number, min: 0, default: 0 },
    flightCount: { type: Number, min: 1, default: 1 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const RaffleCloseoutSchema = new mongoose.Schema(
  {
    fiftyFiftyPayout: { type: Number, min: 0, default: 0 },
    rafflePrizeCost: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const BlueRidgeOutingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    formatType: { type: String, required: true, trim: true, maxlength: 80 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    signupOpenAt: { type: Date },
    signupCloseAt: { type: Date },
    status: { type: String, enum: OutingStatus, default: 'draft', index: true },

    teamSizeMin: { type: Number, default: 1, min: 1, max: 8 },
    teamSizeMax: { type: Number, default: 4, min: 1, max: 8 },
    teamSizeExact: { type: Number, min: 1, max: 8 },
    requirePartner: { type: Boolean, default: false },

    maxTeams: { type: Number, min: 1 },
    maxPlayers: { type: Number, min: 1 },

    allowSingles: { type: Boolean, default: true },
    allowSeekingPartner: { type: Boolean, default: true },
    allowSeekingTeam: { type: Boolean, default: true },
    allowPartialTeamSignup: { type: Boolean, default: true },
    allowFullTeamSignup: { type: Boolean, default: true },
    allowMemberGuestSignup: { type: Boolean, default: false },
    allowCaptainSignup: { type: Boolean, default: true },
    allowJoinExistingTeam: { type: Boolean, default: true },

    allowGuests: { type: Boolean, default: false },
    memberOnly: { type: Boolean, default: true },

    handicapRequired: { type: Boolean, default: false },
    handicapMinIndex: { type: Number },
    handicapMaxIndex: { type: Number },

    flights: { type: String, trim: true, maxlength: 280 },
    entryFee: { type: Number, min: 0 },
    feeSchedule: { type: [FeeScheduleItemSchema], default: undefined },
    payoutPlanner: { type: PayoutPlannerSchema, default: undefined },
    raffleCloseout: { type: RaffleCloseoutSchema, default: undefined },
    registrationNotes: { type: String, trim: true, maxlength: 4000 },
    cancellationPolicy: { type: String, trim: true, maxlength: 4000 },

    autoWaitlist: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BlueRidgeOutingSchema.index({ startDate: 1, name: 1 }, { unique: true });

const BlueRidgeOutingModel =
  mongoose.models.BlueRidgeOuting || mongoose.model('BlueRidgeOuting', BlueRidgeOutingSchema);
module.exports = BlueRidgeOutingModel;
module.exports.schema = BlueRidgeOutingSchema;
module.exports.OutingStatus = OutingStatus;
