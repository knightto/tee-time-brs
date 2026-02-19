const express = require('express');
const crypto = require('crypto');
const { getSecondaryConn, initSecondaryConn } = require('../secondary-conn');

initSecondaryConn();

const router = express.Router();
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';

function getModels() {
  const conn = getSecondaryConn();
  if (!conn) return {};
  return {
    ValleyAttendee: conn.model('ValleyAttendee', require('../models/ValleyAttendee').schema),
    ValleyReserveRequest: conn.model('ValleyReserveRequest', require('../models/ValleyReserveRequest').schema),
    ValleyMember: conn.model('ValleyMember', require('../models/ValleyMember').schema),
  };
}

function hashPasscode(passcode) {
  return crypto.createHash('sha256').update(String(passcode || '')).digest('hex');
}

async function ensureMemberIdentity(ValleyMember, name, passcode) {
  const nameKey = String(name || '').trim().toLowerCase();
  const passcodeHash = hashPasscode(passcode);
  const existing = await ValleyMember.findOne({ nameKey });
  if (!existing) {
    return ValleyMember.create({ name: String(name || '').trim(), nameKey, passcodeHash });
  }
  if (existing.passcodeHash !== passcodeHash) {
    const err = new Error('Member passcode does not match this name');
    err.statusCode = 403;
    throw err;
  }
  return existing;
}

function waitForOpen(conn, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!conn) return resolve(false);
    if (conn.readyState === 1) return resolve(true);
    const timer = setTimeout(() => resolve(conn.readyState === 1), timeoutMs);
    const onOpen = () => {
      clearTimeout(timer);
      resolve(true);
    };
    conn.once('open', onOpen);
  });
}

async function requireSecondaryConnection(res) {
  const conn = getSecondaryConn() || initSecondaryConn();
  if (!conn) {
    res.status(503).json({ error: 'Secondary database is unavailable (missing MONGO_URI_SECONDARY)' });
    return false;
  }
  if (conn.readyState !== 1) {
    const opened = await waitForOpen(conn, 5000);
    if (!opened) {
      res.status(503).json({ error: 'Secondary database is unavailable (connection timeout)' });
      return false;
    }
  }
  return true;
}

function nextDatesByWeekday(weekday, count) {
  const out = [];
  const d = new Date();
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === weekday) out.push(new Date(d));
  }
  return out;
}

function buildSchedule() {
  const thursdays = nextDatesByWeekday(4, 3).map((d, idx) => ({
    id: `thu-${idx + 1}`,
    date: d,
    label: 'Thursday Night Pour',
    state: 'Open RSVP',
    hour: 18,
    minute: 30,
  }));

  const sundays = nextDatesByWeekday(0, 3).map((d, idx) => ({
    id: `sun-${idx + 1}`,
    date: d,
    label: 'Sunday Smoke Session',
    state: 'Waitlist',
    hour: 16,
    minute: 0,
  }));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 14);

  return thursdays
    .concat(sundays)
    .filter((item) => item.date <= cutoff)
    .sort((a, b) => a.date - b.date)
    .map((item) => ({ ...item, date: item.date.toISOString() }));
}

function isAdmin(req) {
  const code = req.headers['x-admin-code'] || req.query.code || (req.body && req.body.adminCode);
  return Boolean(ADMIN_DELETE_CODE && code && code === ADMIN_DELETE_CODE);
}

router.get('/state', async (_req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const { ValleyAttendee, ValleyReserveRequest } = getModels();
    const [attendees, reserveRequests] = await Promise.all([
      ValleyAttendee.find().sort({ createdAt: -1 }).lean(),
      ValleyReserveRequest.find().sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ schedule: buildSchedule(), attendees, reserveRequests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendees', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const { ValleyAttendee, ValleyMember } = getModels();
    const name = String((req.body && req.body.name) || '').trim();
    const eventId = String((req.body && req.body.eventId) || '').trim();
    const passcode = String((req.body && req.body.passcode) || '').trim();

    if (!name || !eventId || !passcode) return res.status(400).json({ error: 'name, passcode, and eventId required' });

    const schedule = buildSchedule();
    const event = schedule.find((s) => s.id === eventId);
    if (!event) return res.status(400).json({ error: 'Invalid event selection' });

    await ensureMemberIdentity(ValleyMember, name, passcode);

    const doc = await ValleyAttendee.create({
      name,
      nameKey: name.toLowerCase(),
      eventId,
      eventLabel: event.label,
      checkedIn: false,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'You are already RSVP\'d for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.patch('/attendees/:id/check-in', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const { ValleyAttendee } = getModels();
    const checkedIn = Boolean(req.body && req.body.checkedIn);
    const updated = await ValleyAttendee.findByIdAndUpdate(
      req.params.id,
      { checkedIn },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Attendee not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/attendees/:id', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const { ValleyAttendee } = getModels();
    const deleted = await ValleyAttendee.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Attendee not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reserve-requests', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const { ValleyReserveRequest, ValleyMember } = getModels();
    const name = String((req.body && req.body.name) || '').trim();
    const passcode = String((req.body && req.body.passcode) || '').trim();
    const eventId = String((req.body && req.body.eventId) || '').trim();
    const bottle = String((req.body && req.body.bottle) || '').trim();
    const notes = String((req.body && req.body.notes) || '').trim();
    if (!name || !passcode || !eventId || !bottle) {
      return res.status(400).json({ error: 'name, passcode, eventId, and bottle required' });
    }
    const schedule = buildSchedule();
    const event = schedule.find((s) => s.id === eventId);
    if (!event) return res.status(400).json({ error: 'Invalid event selection' });

    await ensureMemberIdentity(ValleyMember, name, passcode);
    const doc = await ValleyReserveRequest.create({
      name,
      nameKey: name.toLowerCase(),
      eventId,
      eventLabel: event.label,
      bottle,
      notes,
    });
    res.status(201).json(doc);
  } catch (err) {
    if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/state', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    const { ValleyAttendee, ValleyReserveRequest } = getModels();
    await Promise.all([ValleyAttendee.deleteMany({}), ValleyReserveRequest.deleteMany({})]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
