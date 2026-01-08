const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['going', 'maybe', 'pending'], default: 'going' },
    role: { type: String, trim: true, default: '' },
    origin: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true, timestamps: true }
);

const logisticsSchema = new mongoose.Schema(
  {
    category: { type: String, trim: true, default: 'other' },
    title: { type: String, required: true, trim: true },
    owner: { type: String, trim: true, default: '' },
    due: { type: String, trim: true, default: '' }, // store as YYYY-MM-DD string
    status: { type: String, enum: ['open', 'in-progress', 'booked', 'done'], default: 'open' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true, timestamps: true }
);

const scheduleSchema = new mongoose.Schema(
  {
    date: { type: String, trim: true, default: '' },
    time: { type: String, trim: true, default: '' },
    title: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: '' },
    type: { type: String, trim: true, default: 'program' },
    status: { type: String, enum: ['planned', 'firm', 'done'], default: 'planned' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true, timestamps: true }
);

const meetingSchema = new mongoose.Schema(
  {
    date: { type: String, trim: true, default: '' },
    time: { type: String, trim: true, default: '' },
    topic: { type: String, required: true, trim: true },
    host: { type: String, trim: true, default: '' },
    channel: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['scheduled', 'done'], default: 'scheduled' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true, timestamps: true }
);

const reunionPlanSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, default: 'default' },
    startedAt: { type: Date, default: Date.now },
    eventInfo: {
      location: { type: String, trim: true, default: 'Set city + main venue' },
      contact: { type: String, trim: true, default: '' },
      lodging: { type: String, trim: true, default: '' },
      notes: { type: String, trim: true, default: '35th reunion - keep the weekend welcoming, nostalgic, and simple.' },
    },
    attendees: [attendeeSchema],
    logistics: [logisticsSchema],
    schedule: [scheduleSchema],
    meetings: [meetingSchema],
  },
  { timestamps: true }
);

reunionPlanSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    const stripIds = (arr = []) =>
      arr.map((item) => {
        const obj = item && typeof item.toObject === 'function' ? item.toObject({ virtuals: true }) : { ...item };
        obj.id = obj.id || (obj._id ? obj._id.toString() : undefined);
        delete obj._id;
        delete obj.__v;
        return obj;
      });
    ret.attendees = stripIds(ret.attendees || []);
    ret.logistics = stripIds(ret.logistics || []);
    ret.schedule = stripIds(ret.schedule || []);
    ret.meetings = stripIds(ret.meetings || []);
    return ret;
  },
});

module.exports = mongoose.model('ReunionPlan', reunionPlanSchema);
