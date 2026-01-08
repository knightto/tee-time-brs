const express = require('express');
const ReunionPlan = require('../models/ReunionPlan');

const router = express.Router();

const PIN = process.env.REUNION_PIN || '123';

const seedPlan = () => ({
  slug: 'default',
  startedAt: new Date(),
  eventInfo: {
    location: 'Set city + main venue',
    contact: '',
    lodging: '',
    notes: '35th reunion - keep the weekend welcoming, nostalgic, and simple.',
  },
  attendees: [
    {
      name: 'Alex Morgan',
      status: 'going',
      role: 'Check-in + name badges',
      origin: 'Austin',
      notes: 'Arrives Fri mid-day, can run registration table.',
    },
    {
      name: 'Sam Lee',
      status: 'maybe',
      role: 'Playlist + photo slideshow',
      origin: 'Chicago',
      notes: 'Needs photos by Apr 30; DJ option TBD.',
    },
    {
      name: 'Taylor Kim',
      status: 'pending',
      role: 'Outreach to classmates',
      origin: 'Seattle',
      notes: 'Will text the west coast group.',
    },
  ],
  logistics: [
    {
      category: 'venue',
      title: 'Confirm contract with Riverview Hotel ballroom',
      owner: 'Jamie',
      due: '2026-02-15',
      status: 'in-progress',
      notes: 'Need deposit + AV package details.',
    },
    {
      category: 'catering',
      title: 'Decide menu + vegan/veg options',
      owner: 'Alex',
      due: '2026-03-01',
      status: 'open',
      notes: 'Collect dietary needs from attendees.',
    },
    {
      category: 'outreach',
      title: 'Send save-the-date email + social post',
      owner: 'Taylor',
      due: '2025-12-15',
      status: 'done',
      notes: 'Draft approved; ready to send.',
    },
  ],
  schedule: [
    {
      date: '2026-06-12',
      time: '18:00',
      title: 'Welcome mixer',
      location: 'Riverview Hotel lobby bar',
      type: 'social',
      status: 'planned',
      notes: 'Name badges + check-in QR code.',
    },
    {
      date: '2026-06-13',
      time: '11:00',
      title: 'Campus walk + photo',
      location: 'Old Main entrance',
      type: 'program',
      status: 'planned',
      notes: 'Group photo at noon.',
    },
    {
      date: '2026-06-13',
      time: '18:30',
      title: 'Reunion dinner',
      location: 'Riverview Ballroom',
      type: 'program',
      status: 'planned',
      notes: 'Emcee + short remarks at 7:15p.',
    },
    {
      date: '2026-06-14',
      time: '10:30',
      title: 'Farewell brunch',
      location: 'Westside Diner',
      type: 'social',
      status: 'planned',
      notes: 'Optional; pay-as-you-go.',
    },
  ],
  meetings: [
    {
      date: '2026-01-15',
      time: '19:00',
      topic: 'Budget + ticket price',
      host: 'Jamie',
      channel: 'Zoom',
      status: 'scheduled',
      notes: 'Share budget draft by Jan 12.',
    },
    {
      date: '2026-02-05',
      time: '19:00',
      topic: 'Program, music, slideshow',
      host: 'Sam',
      channel: 'Zoom',
      status: 'scheduled',
      notes: 'Collect photos; decide MC.',
    },
  ],
});

const requirePin = (req) => {
  const pin = String((req.body && req.body.pin) || req.query.pin || '').trim();
  return pin === PIN;
};

async function getPlan() {
  let plan = await ReunionPlan.findOne({ slug: 'default' });
  if (!plan) {
    plan = await ReunionPlan.create(seedPlan());
  }
  return plan;
}

const format = (plan) => plan.toJSON();

router.get('/', async (_req, res) => {
  try {
    const plan = await getPlan();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/event-info', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const { eventInfo = {} } = req.body || {};
    const plan = await getPlan();
    plan.eventInfo = {
      location: String(eventInfo.location || '').trim(),
      contact: String(eventInfo.contact || '').trim(),
      lodging: String(eventInfo.lodging || '').trim(),
      notes: String(eventInfo.notes || '').trim(),
    };
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendees', async (req, res) => {
  try {
    const { name, status = 'going', role = '', origin = '', notes = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const plan = await getPlan();
    plan.attendees.push({
      name: String(name).trim(),
      status: String(status || 'going').trim(),
      role: String(role || '').trim(),
      origin: String(origin || '').trim(),
      notes: String(notes || '').trim(),
    });
    await plan.save();
    res.status(201).json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/attendees/:id/status', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const attendee = plan.attendees.id(req.params.id);
    if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
    attendee.status = String(req.body?.status || attendee.status || '').trim() || attendee.status;
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/attendees/:id', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const attendee = plan.attendees.id(req.params.id);
    if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
    attendee.deleteOne();
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logistics', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const { category = 'other', title, owner = '', due = '', status = 'open', notes = '' } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const plan = await getPlan();
    plan.logistics.push({
      category: String(category || 'other').trim(),
      title: String(title).trim(),
      owner: String(owner || '').trim(),
      due: String(due || '').trim(),
      status: String(status || 'open').trim(),
      notes: String(notes || '').trim(),
    });
    await plan.save();
    res.status(201).json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/logistics/:id/status', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const item = plan.logistics.id(req.params.id);
    if (!item) return res.status(404).json({ error: 'Logistics item not found' });
    item.status = String(req.body?.status || item.status || '').trim() || item.status;
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/logistics/:id', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const item = plan.logistics.id(req.params.id);
    if (!item) return res.status(404).json({ error: 'Logistics item not found' });
    item.deleteOne();
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/schedule', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const { date = '', time = '', title, location = '', type = 'program', notes = '' } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const plan = await getPlan();
    plan.schedule.push({
      date: String(date || '').trim(),
      time: String(time || '').trim(),
      title: String(title).trim(),
      location: String(location || '').trim(),
      type: String(type || 'program').trim(),
      status: 'planned',
      notes: String(notes || '').trim(),
    });
    await plan.save();
    res.status(201).json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/schedule/:id/status', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const item = plan.schedule.id(req.params.id);
    if (!item) return res.status(404).json({ error: 'Schedule item not found' });
    item.status = String(req.body?.status || item.status || '').trim() || item.status;
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/schedule/:id', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const item = plan.schedule.id(req.params.id);
    if (!item) return res.status(404).json({ error: 'Schedule item not found' });
    item.deleteOne();
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meetings', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const { date = '', time = '', topic, host = '', channel = '', status = 'scheduled', notes = '' } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'topic required' });
    const plan = await getPlan();
    plan.meetings.push({
      date: String(date || '').trim(),
      time: String(time || '').trim(),
      topic: String(topic).trim(),
      host: String(host || '').trim(),
      channel: String(channel || '').trim(),
      status: String(status || 'scheduled').trim(),
      notes: String(notes || '').trim(),
    });
    await plan.save();
    res.status(201).json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/meetings/:id/status', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const item = plan.meetings.id(req.params.id);
    if (!item) return res.status(404).json({ error: 'Meeting not found' });
    item.status = String(req.body?.status || item.status || '').trim() || item.status;
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/meetings/:id', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    const plan = await getPlan();
    const item = plan.meetings.id(req.params.id);
    if (!item) return res.status(404).json({ error: 'Meeting not found' });
    item.deleteOne();
    await plan.save();
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset', async (req, res) => {
  try {
    if (!requirePin(req)) return res.status(403).json({ error: 'Invalid PIN' });
    await ReunionPlan.deleteMany({ slug: 'default' });
    const plan = await ReunionPlan.create(seedPlan());
    res.json({ ok: true, plan: format(plan) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
