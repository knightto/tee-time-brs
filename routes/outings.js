const express = require('express');
const { getSecondaryConn, initSecondaryConn } = require('../secondary-conn');

initSecondaryConn();

const router = express.Router();
const ADMIN_DELETE_CODE = process.env.ADMIN_DELETE_CODE || '';

function getSecondaryModels() {
  const conn = getSecondaryConn();
  if (!conn) return {};
  return {
    BlueRidgeOuting: conn.model('BlueRidgeOuting', require('../models/BlueRidgeOuting').schema),
    BlueRidgeRegistration: conn.model('BlueRidgeRegistration', require('../models/BlueRidgeRegistration').schema),
    BlueRidgeTeam: conn.model('BlueRidgeTeam', require('../models/BlueRidgeTeam').schema),
    BlueRidgeTeamMember: conn.model('BlueRidgeTeamMember', require('../models/BlueRidgeTeamMember').schema),
    BlueRidgeWaitlist: conn.model('BlueRidgeWaitlist', require('../models/BlueRidgeWaitlist').schema),
  };
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

function isAdmin(req) {
  const code = req.headers['x-admin-code'] || req.query.code || (req.body && req.body.adminCode);
  return Boolean(ADMIN_DELETE_CODE && code && code === ADMIN_DELETE_CODE);
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseBool(val, fallback = false) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  const x = String(val).toLowerCase();
  return x === '1' || x === 'true' || x === 'yes' || x === 'y' || x === 'on';
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function formatDateRange(startDate, endDate) {
  const a = new Date(startDate);
  const b = new Date(endDate);
  const sameDay = a.toDateString() === b.toDateString();
  if (sameDay) return a.toLocaleDateString();
  return `${a.toLocaleDateString()} - ${b.toLocaleDateString()}`;
}

function buildRuleSummary(event) {
  const parts = [];
  const exact = Number(event.teamSizeExact || 0);
  if (exact > 0) parts.push(`Exact team size: ${exact}`);
  else parts.push(`Team size: ${event.teamSizeMin}-${event.teamSizeMax}`);
  parts.push(event.memberOnly ? 'Member-only event' : event.allowGuests ? 'Guests allowed' : 'No guests');
  if (event.allowSingles) parts.push('Singles allowed');
  if (event.allowSeekingPartner) parts.push('Seeking partner allowed');
  if (event.allowSeekingTeam) parts.push('Seeking team allowed');
  if (event.handicapRequired) {
    if (event.handicapMaxIndex !== undefined && event.handicapMaxIndex !== null) {
      parts.push(`Handicap required (max ${event.handicapMaxIndex})`);
    } else {
      parts.push('Handicap required');
    }
  }
  return parts.join(' | ');
}

async function getMetrics(eventId, models) {
  const { BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember, BlueRidgeWaitlist } = models;
  const [registrations, teams, players, waitlist] = await Promise.all([
    BlueRidgeRegistration.countDocuments({ eventId, status: 'registered' }),
    BlueRidgeTeam.countDocuments({ eventId, status: { $in: ['active', 'incomplete'] } }),
    BlueRidgeTeamMember.countDocuments({ eventId, status: 'active' }),
    BlueRidgeWaitlist.countDocuments({ eventId, status: 'active' }),
  ]);
  return { registrations, teams, players, waitlist };
}

function enrichEvent(event, metrics) {
  const e = event.toObject ? event.toObject() : event;
  const maxPlayers = e.maxPlayers || null;
  const maxTeams = e.maxTeams || null;
  return {
    ...e,
    dateLabel: formatDateRange(e.startDate, e.endDate),
    ruleSummary: buildRuleSummary(e),
    metrics,
    spotsRemainingPlayers: maxPlayers ? Math.max(0, maxPlayers - metrics.players) : null,
    spotsRemainingTeams: maxTeams ? Math.max(0, maxTeams - metrics.teams) : null,
  };
}

function validateOutingConfig(payload) {
  const teamSizeMin = parseNum(payload.teamSizeMin);
  const teamSizeMax = parseNum(payload.teamSizeMax);
  const teamSizeExact = parseNum(payload.teamSizeExact);
  if (teamSizeMin !== undefined && teamSizeMax !== undefined && teamSizeMin > teamSizeMax) {
    return 'teamSizeMin cannot exceed teamSizeMax';
  }
  if (teamSizeExact !== undefined) {
    if (teamSizeMin !== undefined && teamSizeExact < teamSizeMin) return 'teamSizeExact cannot be below teamSizeMin';
    if (teamSizeMax !== undefined && teamSizeExact > teamSizeMax) return 'teamSizeExact cannot exceed teamSizeMax';
  }
  return null;
}

function coerceOutingInput(body) {
  const out = {
    name: String(body.name || '').trim(),
    formatType: String(body.formatType || '').trim(),
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    endDate: body.endDate ? new Date(body.endDate) : undefined,
    signupOpenAt: body.signupOpenAt ? new Date(body.signupOpenAt) : undefined,
    signupCloseAt: body.signupCloseAt ? new Date(body.signupCloseAt) : undefined,
    status: String(body.status || 'draft').toLowerCase(),
    teamSizeMin: parseNum(body.teamSizeMin),
    teamSizeMax: parseNum(body.teamSizeMax),
    teamSizeExact: parseNum(body.teamSizeExact),
    requirePartner: parseBool(body.requirePartner, false),
    maxTeams: parseNum(body.maxTeams),
    maxPlayers: parseNum(body.maxPlayers),
    allowSingles: parseBool(body.allowSingles, true),
    allowSeekingPartner: parseBool(body.allowSeekingPartner, true),
    allowSeekingTeam: parseBool(body.allowSeekingTeam, true),
    allowPartialTeamSignup: parseBool(body.allowPartialTeamSignup, true),
    allowFullTeamSignup: parseBool(body.allowFullTeamSignup, true),
    allowMemberGuestSignup: parseBool(body.allowMemberGuestSignup, false),
    allowCaptainSignup: parseBool(body.allowCaptainSignup, true),
    allowJoinExistingTeam: parseBool(body.allowJoinExistingTeam, true),
    allowGuests: parseBool(body.allowGuests, false),
    memberOnly: parseBool(body.memberOnly, true),
    handicapRequired: parseBool(body.handicapRequired, false),
    handicapMinIndex: parseNum(body.handicapMinIndex),
    handicapMaxIndex: parseNum(body.handicapMaxIndex),
    flights: body.flights ? String(body.flights).trim() : '',
    entryFee: parseNum(body.entryFee),
    registrationNotes: body.registrationNotes ? String(body.registrationNotes).trim() : '',
    cancellationPolicy: body.cancellationPolicy ? String(body.cancellationPolicy).trim() : '',
    autoWaitlist: parseBool(body.autoWaitlist, true),
  };

  Object.keys(out).forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });
  return out;
}

function normalizePlayers(rawPlayers) {
  const players = Array.isArray(rawPlayers) ? rawPlayers : [];
  return players
    .map((p) => ({
      name: String((p && p.name) || '').trim(),
      email: normalizeEmail((p && p.email) || ''),
      phone: String((p && p.phone) || '').trim(),
      isGuest: Boolean(p && p.isGuest),
      handicapIndex: parseNum(p && p.handicapIndex),
      isCaptain: Boolean(p && p.isCaptain),
    }))
    .filter((p) => p.name || p.email);
}

function validatePlayersShape(players) {
  if (!players.length) return 'At least one player is required';
  const seen = new Set();
  for (const p of players) {
    if (!p.name) return 'Each player requires a name';
    if (!p.email) return 'Each player requires an email';
    if (seen.has(p.email)) return `Duplicate email in signup payload: ${p.email}`;
    seen.add(p.email);
  }
  return null;
}

function validateModeAllowed(event, mode) {
  switch (mode) {
    case 'single':
      return event.allowSingles;
    case 'seeking_partner':
      return event.allowSeekingPartner;
    case 'seeking_team':
      return event.allowSeekingTeam;
    case 'partial_team':
      return event.allowPartialTeamSignup;
    case 'full_team':
      return event.allowFullTeamSignup;
    case 'member_guest':
      return event.allowMemberGuestSignup;
    case 'captain':
      return event.allowCaptainSignup;
    case 'join_team':
      return event.allowJoinExistingTeam;
    default:
      return false;
  }
}

function isSingleMode(mode) {
  return mode === 'single' || mode === 'seeking_partner' || mode === 'seeking_team';
}

function isTeamCreateMode(mode) {
  return mode === 'partial_team' || mode === 'full_team' || mode === 'member_guest' || mode === 'captain';
}

function validateRuleConstraints(event, mode, players, existingTeamSize = 0) {
  const exact = Number(event.teamSizeExact || 0);
  const minSize = Number(event.teamSizeMin || 1);
  const maxSize = Number(event.teamSizeMax || Math.max(minSize, 1));

  if (isSingleMode(mode) && players.length !== 1) return 'Single/partner/team-seeker modes require exactly one player';
  if (event.requirePartner && mode === 'single') return 'This event requires a partner (use Find a Partner)';

  if (mode === 'captain' && players.length !== 1) return 'Captain signup starts with one captain player';

  if (mode === 'full_team') {
    if (exact > 0 && players.length !== exact) return `This event requires exactly ${exact} players for full-team signup`;
    if (exact === 0 && players.length < minSize) return `This event requires at least ${minSize} players for team signup`;
  }

  if (mode === 'partial_team' && exact > 0 && players.length >= exact) {
    return `Partial-team signup must be smaller than ${exact} players`;
  }

  if (mode === 'member_guest') {
    const members = players.filter((p) => !p.isGuest).length;
    const guests = players.filter((p) => p.isGuest).length;
    if (!members || !guests) return 'Member + Guest signup requires at least one member and one guest';
  }

  if (mode === 'join_team') {
    const projected = existingTeamSize + players.length;
    if (exact > 0 && projected > exact) return `Team cannot exceed exact size ${exact}`;
    if (exact === 0 && projected > maxSize) return `Team cannot exceed max size ${maxSize}`;
  }

  if (event.memberOnly && players.some((p) => p.isGuest)) return 'This is a member-only event';
  if (!event.allowGuests && players.some((p) => p.isGuest)) return 'Guests are not allowed for this event';

  if (event.handicapRequired) {
    for (const p of players) {
      if (p.handicapIndex === undefined || p.handicapIndex === null || Number.isNaN(Number(p.handicapIndex))) {
        return `Handicap is required for ${p.name}`;
      }
      if (event.handicapMinIndex !== undefined && event.handicapMinIndex !== null && p.handicapIndex < event.handicapMinIndex) {
        return `Handicap for ${p.name} must be at least ${event.handicapMinIndex}`;
      }
      if (event.handicapMaxIndex !== undefined && event.handicapMaxIndex !== null && p.handicapIndex > event.handicapMaxIndex) {
        return `Handicap for ${p.name} cannot exceed ${event.handicapMaxIndex}`;
      }
    }
  }

  return null;
}

function assertSignupWindowOpen(event) {
  const now = Date.now();
  if (event.status !== 'open') return 'Signup is not open for this event';
  if (event.signupOpenAt && now < new Date(event.signupOpenAt).getTime()) return 'Signup has not opened yet';
  if (event.signupCloseAt && now > new Date(event.signupCloseAt).getTime()) return 'Signup deadline has passed';
  return null;
}

async function ensurePlayersNotRegistered(eventId, players, BlueRidgeTeamMember) {
  const emails = players.map((p) => p.email);
  const existing = await BlueRidgeTeamMember.find({
    eventId,
    status: 'active',
    emailKey: { $in: emails },
  })
    .select({ emailKey: 1 })
    .lean();
  if (existing.length) {
    const dupes = [...new Set(existing.map((x) => x.emailKey))];
    return `Player already registered for this event: ${dupes.join(', ')}`;
  }
  return null;
}

async function buildEventDetail(event, models, includeRegistrations = false) {
  const metrics = await getMetrics(event._id, models);
  const enriched = enrichEvent(event, metrics);
  const teams = await models.BlueRidgeTeam.find({ eventId: event._id, status: { $in: ['active', 'incomplete'] } })
    .sort({ name: 1 })
    .lean();

  const teamIds = teams.map((t) => t._id);
  const members = teamIds.length
    ? await models.BlueRidgeTeamMember.find({ teamId: { $in: teamIds }, status: 'active' }).lean()
    : [];

  const byTeam = new Map();
  for (const m of members) {
    const key = String(m.teamId);
    const list = byTeam.get(key) || [];
    list.push(m);
    byTeam.set(key, list);
  }

  enriched.teams = teams.map((t) => {
    const list = byTeam.get(String(t._id)) || [];
    const teamSize = list.length;
    const exact = Number(event.teamSizeExact || 0);
    const target = exact > 0 ? exact : Number(event.teamSizeMax || t.targetSize || 4);
    return {
      ...t,
      memberCount: teamSize,
      spotsOpen: Math.max(0, target - teamSize),
      canJoin: event.allowJoinExistingTeam && t.status !== 'cancelled' && (exact > 0 ? teamSize < exact : teamSize < Number(event.teamSizeMax || 4)),
      members: list,
    };
  });

  if (includeRegistrations) {
    enriched.registrations = await models.BlueRidgeRegistration.find({ eventId: event._id }).sort({ createdAt: -1 }).lean();
    enriched.waitlist = await models.BlueRidgeWaitlist.find({ eventId: event._id }).sort({ createdAt: -1 }).lean();
  }

  return enriched;
}

router.get('/', async (_req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const outings = await models.BlueRidgeOuting.find({}).sort({ startDate: 1 }).lean();
    const payload = await Promise.all(
      outings.map(async (e) => {
        const metrics = await getMetrics(e._id, models);
        return enrichEvent(e, metrics);
      })
    );
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:eventId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const detail = await buildEventDetail(event, models, false);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:eventId([0-9a-fA-F]{24})/status', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    // This project has no per-user auth for outings yet, so status lookup is email-based.
    const email = normalizeEmail(req.query.email || '');
    if (!email) return badRequest(res, 'email is required');

    const models = getSecondaryModels();
    const eventId = req.params.eventId;

    const [activeMember, registration, waitlist] = await Promise.all([
      models.BlueRidgeTeamMember.findOne({ eventId, emailKey: email, status: 'active' }).lean(),
      models.BlueRidgeRegistration.findOne({ eventId, submittedByEmail: email, status: 'registered' }).lean(),
      models.BlueRidgeWaitlist.findOne({ eventId, emailKey: email, status: 'active' }).lean(),
    ]);

    res.json({
      isRegistered: Boolean(activeMember || registration),
      isWaitlisted: Boolean(waitlist),
      registration,
      waitlist,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:eventId([0-9a-fA-F]{24})/register', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (!event.autoWaitlist && event.status !== 'waitlist') return badRequest(res, 'Waitlist is disabled for this event');

    const mode = String((req.body && req.body.mode) || '').trim();
    const notes = String((req.body && req.body.notes) || '').trim();
    const teamNameInput = String((req.body && req.body.teamName) || '').trim();
    const teamIdInput = String((req.body && req.body.teamId) || '').trim();
    const players = normalizePlayers(req.body && req.body.players);

    const signupWindowErr = assertSignupWindowOpen(event);
    if (signupWindowErr) return badRequest(res, signupWindowErr);
    if (!validateModeAllowed(event, mode)) return badRequest(res, `Signup mode '${mode}' is not allowed for this event`);

    const shapeErr = validatePlayersShape(players);
    if (shapeErr) return badRequest(res, shapeErr);

    let targetTeam = null;
    if (mode === 'join_team') {
      if (!teamIdInput) return badRequest(res, 'teamId is required when joining an existing team');
      targetTeam = await BlueRidgeTeam.findOne({ _id: teamIdInput, eventId: event._id, status: { $in: ['active', 'incomplete'] } });
      if (!targetTeam) return badRequest(res, 'Target team not found');
    }

    const dupesErr = await ensurePlayersNotRegistered(event._id, players, BlueRidgeTeamMember);
    if (dupesErr) return badRequest(res, dupesErr);

    const metrics = await getMetrics(event._id, models);
    const createsTeam = isTeamCreateMode(mode);
    if (createsTeam && event.maxTeams && metrics.teams >= event.maxTeams) {
      return res.status(409).json({ error: 'Event has reached max teams', canJoinWaitlist: true });
    }

    if (event.maxPlayers && metrics.players + players.length > event.maxPlayers) {
      return res.status(409).json({ error: 'Event is full', canJoinWaitlist: true });
    }

    let existingTeamSize = 0;
    if (mode === 'join_team' && targetTeam) {
      existingTeamSize = await BlueRidgeTeamMember.countDocuments({ teamId: targetTeam._id, status: 'active' });
    }

    const constraintsErr = validateRuleConstraints(event, mode, players, existingTeamSize);
    if (constraintsErr) return badRequest(res, constraintsErr);

    const submitter = players[0];
    let createdTeam = targetTeam;

    if (createsTeam) {
      const exact = Number(event.teamSizeExact || 0);
      const defaultTarget = exact > 0 ? exact : Number(event.teamSizeMax || players.length || 4);
      const baseName = teamNameInput || `${submitter.name} Team`;
      let teamName = baseName;
      let tries = 0;
      while (tries < 3) {
        try {
          createdTeam = await BlueRidgeTeam.create({
            eventId: event._id,
            name: teamName,
            captainName: submitter.name,
            captainEmail: submitter.email,
            targetSize: defaultTarget,
            status: mode === 'captain' || mode === 'partial_team' ? 'incomplete' : 'active',
          });
          break;
        } catch (err) {
          if (err && err.code === 11000) {
            tries += 1;
            teamName = `${baseName} (${tries + 1})`;
            continue;
          }
          throw err;
        }
      }
      if (!createdTeam) return res.status(500).json({ error: 'Unable to create team' });
    }

    const registration = await BlueRidgeRegistration.create({
      eventId: event._id,
      mode,
      status: 'registered',
      teamId: createdTeam ? createdTeam._id : undefined,
      submittedByName: submitter.name,
      submittedByEmail: submitter.email,
      submittedByPhone: submitter.phone,
      notes,
    });

    const memberDocs = players.map((p, idx) => ({
      eventId: event._id,
      teamId: createdTeam ? createdTeam._id : undefined,
      registrationId: registration._id,
      name: p.name,
      email: p.email,
      emailKey: p.email,
      phone: p.phone,
      isGuest: Boolean(p.isGuest),
      handicapIndex: p.handicapIndex,
      isCaptain: Boolean(p.isCaptain || idx === 0),
      status: 'active',
    }));

    await BlueRidgeTeamMember.insertMany(memberDocs, { ordered: true });

    if (createdTeam) {
      const teamCount = await BlueRidgeTeamMember.countDocuments({ teamId: createdTeam._id, status: 'active' });
      const exact = Number(event.teamSizeExact || 0);
      const fullThreshold = exact > 0 ? exact : Number(event.teamSizeMax || createdTeam.targetSize || 4);
      const targetStatus = teamCount >= fullThreshold ? 'active' : 'incomplete';
      if (createdTeam.status !== targetStatus) {
        await BlueRidgeTeam.updateOne({ _id: createdTeam._id }, { $set: { status: targetStatus } });
      }
    }

    const detail = await buildEventDetail(event, models, false);
    res.status(201).json({ ok: true, registration, event: detail });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A player is already registered for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:eventId([0-9a-fA-F]{24})/registrations/:registrationId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const registration = await BlueRidgeRegistration.findOne({ _id: req.params.registrationId, eventId: event._id, status: 'registered' });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    const requesterEmail = normalizeEmail((req.body && req.body.requesterEmail) || req.query.requesterEmail || '');
    if (!requesterEmail || requesterEmail !== registration.submittedByEmail) {
      return res.status(403).json({ error: 'Only the registration owner can edit this signup' });
    }

    const teamId = registration.teamId;
    if (!teamId) return badRequest(res, 'This registration is not a team/captain registration');

    const team = await BlueRidgeTeam.findById(teamId);
    if (!team || team.status === 'cancelled') return badRequest(res, 'Team is not available for updates');

    const removeMemberIds = Array.isArray(req.body && req.body.removeMemberIds) ? req.body.removeMemberIds : [];
    if (removeMemberIds.length) {
      await BlueRidgeTeamMember.updateMany(
        { _id: { $in: removeMemberIds }, teamId: team._id, status: 'active' },
        { $set: { status: 'cancelled' } }
      );
    }

    const addPlayers = normalizePlayers(req.body && req.body.addPlayers);
    if (addPlayers.length) {
      const shapeErr = validatePlayersShape(addPlayers);
      if (shapeErr) return badRequest(res, shapeErr);

      const dupesErr = await ensurePlayersNotRegistered(event._id, addPlayers, BlueRidgeTeamMember);
      if (dupesErr) return badRequest(res, dupesErr);

      const currentCount = await BlueRidgeTeamMember.countDocuments({ teamId: team._id, status: 'active' });
      const constraintsErr = validateRuleConstraints(event, 'join_team', addPlayers, currentCount);
      if (constraintsErr) return badRequest(res, constraintsErr);

      const metrics = await getMetrics(event._id, models);
      if (event.maxPlayers && metrics.players + addPlayers.length > event.maxPlayers) {
        return res.status(409).json({ error: 'Not enough open player spots for this update' });
      }

      const docs = addPlayers.map((p) => ({
        eventId: event._id,
        teamId: team._id,
        registrationId: registration._id,
        name: p.name,
        email: p.email,
        emailKey: p.email,
        phone: p.phone,
        isGuest: Boolean(p.isGuest),
        handicapIndex: p.handicapIndex,
        isCaptain: false,
        status: 'active',
      }));
      await BlueRidgeTeamMember.insertMany(docs, { ordered: true });
    }

    if (req.body && typeof req.body.notes === 'string') {
      registration.notes = req.body.notes.trim();
      await registration.save();
    }

    const teamCount = await BlueRidgeTeamMember.countDocuments({ teamId: team._id, status: 'active' });
    const exact = Number(event.teamSizeExact || 0);
    const fullThreshold = exact > 0 ? exact : Number(event.teamSizeMax || team.targetSize || 4);
    const teamStatus = teamCount >= fullThreshold ? 'active' : 'incomplete';
    if (team.status !== teamStatus) {
      await BlueRidgeTeam.updateOne({ _id: team._id }, { $set: { status: teamStatus } });
    }

    const detail = await buildEventDetail(event, models, false);
    res.json({ ok: true, event: detail });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A player is already registered for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:eventId([0-9a-fA-F]{24})/registrations/:registrationId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const registration = await BlueRidgeRegistration.findOne({ _id: req.params.registrationId, eventId: event._id });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    const requesterEmail = normalizeEmail(req.query.requesterEmail || (req.body && req.body.requesterEmail) || '');
    if (!requesterEmail || requesterEmail !== registration.submittedByEmail) {
      return res.status(403).json({ error: 'Only the registration owner can cancel this signup' });
    }

    if (registration.status === 'cancelled') return res.json({ ok: true });

    registration.status = 'cancelled';
    registration.cancelledAt = new Date();
    await registration.save();

    await BlueRidgeTeamMember.updateMany(
      { eventId: event._id, registrationId: registration._id, status: 'active' },
      { $set: { status: 'cancelled' } }
    );

    if (registration.teamId) {
      const teamActiveCount = await BlueRidgeTeamMember.countDocuments({ teamId: registration.teamId, status: 'active' });
      if (teamActiveCount === 0) {
        await BlueRidgeTeam.updateOne({ _id: registration.teamId }, { $set: { status: 'cancelled' } });
      }
    }

    const detail = await buildEventDetail(event, models, false);
    res.json({ ok: true, event: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:eventId([0-9a-fA-F]{24})/waitlist', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeWaitlist, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const name = String((req.body && req.body.name) || '').trim();
    const email = normalizeEmail((req.body && req.body.email) || '');
    const phone = String((req.body && req.body.phone) || '').trim();
    const mode = String((req.body && req.body.mode) || 'single').trim();
    const notes = String((req.body && req.body.notes) || '').trim();

    if (!name || !email) return badRequest(res, 'name and email are required');

    const existingActive = await BlueRidgeTeamMember.findOne({ eventId: event._id, emailKey: email, status: 'active' }).lean();
    if (existingActive) return badRequest(res, 'Player is already registered for this event');

    const waitlist = await BlueRidgeWaitlist.create({
      eventId: event._id,
      name,
      email,
      emailKey: email,
      phone,
      mode,
      notes,
      status: 'active',
    });

    res.status(201).json(waitlist);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'This email is already on the waitlist for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/events', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const outings = await models.BlueRidgeOuting.find({}).sort({ startDate: 1 });
    const payload = await Promise.all(outings.map((e) => buildEventDetail(e, models, true)));
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/events', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const payload = coerceOutingInput(req.body || {});
    if (!payload.name || !payload.formatType || !payload.startDate || !payload.endDate) {
      return badRequest(res, 'name, formatType, startDate, and endDate are required');
    }
    const configErr = validateOutingConfig(payload);
    if (configErr) return badRequest(res, configErr);

    const models = getSecondaryModels();
    const created = await models.BlueRidgeOuting.create(payload);
    const detail = await buildEventDetail(created, models, true);
    res.status(201).json(detail);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Event with this name/date already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/events/:eventId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const payload = coerceOutingInput(req.body || {});
    const configErr = validateOutingConfig(payload);
    if (configErr) return badRequest(res, configErr);

    const models = getSecondaryModels();
    const updated = await models.BlueRidgeOuting.findByIdAndUpdate(req.params.eventId, payload, { new: true });
    if (!updated) return res.status(404).json({ error: 'Event not found' });

    const detail = await buildEventDetail(updated, models, true);
    res.json(detail);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Event with this name/date already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
