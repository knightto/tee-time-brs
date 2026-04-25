process.env.SKIP_MONGO_CONNECT = '1';

const assert = require('assert');
const express = require('express');
const fetch = require('node-fetch');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sameValue(left, right) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right);
  }
  return String(left) === String(right);
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = doc == null ? undefined : doc[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
        return expected.$in.some((item) => sameValue(actual, item));
      }
    }
    return sameValue(actual, expected);
  });
}

function sortDocs(items, spec) {
  const entries = Object.entries(spec || {});
  const docs = items.slice();
  docs.sort((left, right) => {
    for (const [field, direction] of entries) {
      const dir = Number(direction) >= 0 ? 1 : -1;
      const a = left == null ? undefined : left[field];
      const b = right == null ? undefined : right[field];
      if (a === b) continue;
      if (a === undefined || a === null) return -1 * dir;
      if (b === undefined || b === null) return 1 * dir;
      if (a < b) return -1 * dir;
      if (a > b) return 1 * dir;
    }
    return 0;
  });
  return docs;
}

function applySelect(doc, selectSpec) {
  if (!selectSpec) return doc;
  const fields = Object.entries(selectSpec)
    .filter(([, include]) => include)
    .map(([field]) => field);
  if (!fields.length) return doc;
  if (Array.isArray(doc)) return doc.map((item) => applySelect(item, selectSpec));
  if (!doc) return doc;
  const out = {};
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(doc, field)) out[field] = doc[field];
  });
  return out;
}

class FakeQuery {
  constructor(value, options = {}) {
    this.value = value;
    this.single = Boolean(options.single);
    this.collection = options.collection || null;
  }

  select(selectSpec) {
    this.value = applySelect(this.value, selectSpec);
    this.collection = null;
    return this;
  }

  sort(spec) {
    if (!this.single && Array.isArray(this.value)) this.value = sortDocs(this.value, spec);
    return this;
  }

  lean() {
    return Promise.resolve(clone(this.value));
  }

  materialize() {
    if (this.single) {
      return this.collection ? wrapStoredDoc(this.collection, this.value) : clone(this.value);
    }
    if (!Array.isArray(this.value)) {
      return this.collection ? wrapStoredDoc(this.collection, this.value) : clone(this.value);
    }
    return this.collection ? this.value.map((doc) => wrapStoredDoc(this.collection, doc)) : clone(this.value);
  }

  then(resolve, reject) {
    return Promise.resolve(this.materialize()).then(resolve, reject);
  }

  catch(reject) {
    return this.then(undefined, reject);
  }
}

function buildDocFactory(prefix) {
  let counter = 0;
  return function nextId() {
    counter += 1;
    return `${prefix}${counter.toString(16).padStart(23, '0')}`.slice(0, 24);
  };
}

function createModelStore(seed = []) {
  return seed.map((item) => clone(item));
}

function wrapStoredDoc(collection, doc) {
  if (!doc) return null;
  const wrapped = clone(doc);

  Object.defineProperty(wrapped, 'save', {
    enumerable: false,
    value: async function save() {
      const idx = collection.findIndex((entry) => sameValue(entry && entry._id, wrapped && wrapped._id));
      if (idx >= 0) {
        const plain = clone(wrapped);
        plain.updatedAt = new Date().toISOString();
        collection[idx] = plain;
      }
      return wrapped;
    },
  });

  Object.defineProperty(wrapped, 'toObject', {
    enumerable: false,
    value: function toObject() {
      return clone(wrapped);
    },
  });

  return wrapped;
}

function createModels({ event, teams = [], members = [], registrations = [], waitlist = [] }) {
  const nextTeamId = buildDocFactory('7');
  const nextRegistrationId = buildDocFactory('8');
  const nextMemberId = buildDocFactory('9');
  const nextWaitlistId = buildDocFactory('a');
  const nextAuditId = buildDocFactory('b');

  const state = {
    outings: createModelStore([event]),
    teams: createModelStore(teams),
    members: createModelStore(members),
    registrations: createModelStore(registrations),
    waitlist: createModelStore(waitlist),
    audits: createModelStore([]),
  };

  function first(collection, filter) {
    return collection.find((doc) => matches(doc, filter)) || null;
  }

  function many(collection, filter) {
    return collection.filter((doc) => matches(doc, filter));
  }

  function assignId(doc, fallback) {
    if (!doc._id) doc._id = fallback();
    if (!doc.createdAt) doc.createdAt = new Date().toISOString();
    if (!doc.updatedAt) doc.updatedAt = doc.createdAt;
    return doc;
  }

  const BlueRidgeOuting = {
    findById(id) {
      return Promise.resolve(wrapStoredDoc(state.outings, first(state.outings, { _id: id })));
    },
    find(filter = {}) {
      return new FakeQuery(many(state.outings, filter), { collection: state.outings });
    },
    findByIdAndUpdate(id, update = {}, options = {}) {
      const doc = first(state.outings, { _id: id });
      if (!doc) return Promise.resolve(null);
      Object.assign(doc, clone(update), { updatedAt: new Date().toISOString() });
      return Promise.resolve(wrapStoredDoc(state.outings, options && options.new === false ? null : doc));
    },
  };

  const BlueRidgeRegistration = {
    countDocuments(filter = {}) {
      return Promise.resolve(many(state.registrations, filter).length);
    },
    create(doc) {
      const saved = assignId(clone(doc), nextRegistrationId);
      state.registrations.push(saved);
      return Promise.resolve(wrapStoredDoc(state.registrations, saved));
    },
    find(filter = {}) {
      return new FakeQuery(many(state.registrations, filter), { collection: state.registrations });
    },
    findOne(filter = {}) {
      return new FakeQuery(first(state.registrations, filter), { single: true, collection: state.registrations });
    },
    updateOne(filter = {}, update = {}) {
      const doc = first(state.registrations, filter);
      if (doc && update.$set) Object.assign(doc, clone(update.$set), { updatedAt: new Date().toISOString() });
      return Promise.resolve({ acknowledged: true, matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 });
    },
  };

  const BlueRidgeTeam = {
    countDocuments(filter = {}) {
      return Promise.resolve(many(state.teams, filter).length);
    },
    create(doc) {
      const duplicate = state.teams.find((team) => sameValue(team.eventId, doc.eventId) && sameValue(team.name, doc.name));
      if (duplicate) {
        const error = new Error('duplicate team');
        error.code = 11000;
        return Promise.reject(error);
      }
      const saved = assignId(clone(doc), nextTeamId);
      state.teams.push(saved);
      return Promise.resolve(wrapStoredDoc(state.teams, saved));
    },
    find(filter = {}) {
      return new FakeQuery(many(state.teams, filter), { collection: state.teams });
    },
    findOne(filter = {}) {
      return new FakeQuery(first(state.teams, filter), { single: true, collection: state.teams });
    },
    findById(id) {
      return Promise.resolve(wrapStoredDoc(state.teams, first(state.teams, { _id: id })));
    },
    updateOne(filter = {}, update = {}) {
      const doc = first(state.teams, filter);
      if (doc && update.$set) Object.assign(doc, clone(update.$set));
      return Promise.resolve({ acknowledged: true, matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 });
    },
  };

  const BlueRidgeTeamMember = {
    countDocuments(filter = {}) {
      return Promise.resolve(many(state.members, filter).length);
    },
    find(filter = {}) {
      return new FakeQuery(many(state.members, filter), { collection: state.members });
    },
    findOne(filter = {}) {
      return new FakeQuery(first(state.members, filter), { single: true, collection: state.members });
    },
    insertMany(docs) {
      docs.forEach((doc) => {
        const duplicate = state.members.find((member) => member.status === 'active' && matches(member, {
          eventId: doc.eventId,
          emailKey: doc.emailKey,
          status: 'active',
        }));
        if (duplicate) {
          const error = new Error('duplicate member');
          error.code = 11000;
          throw error;
        }
        state.members.push(assignId(clone(doc), nextMemberId));
      });
      return Promise.resolve(clone(docs));
    },
    updateMany(filter = {}, update = {}) {
      const docs = many(state.members, filter);
      docs.forEach((doc) => {
        if (update.$set) Object.assign(doc, clone(update.$set), { updatedAt: new Date().toISOString() });
      });
      return Promise.resolve({ acknowledged: true, matchedCount: docs.length, modifiedCount: docs.length });
    },
  };

  const BlueRidgeWaitlist = {
    countDocuments(filter = {}) {
      return Promise.resolve(many(state.waitlist, filter).length);
    },
    create(doc) {
      const duplicate = state.waitlist.find((entry) => entry.status === 'active' && matches(entry, {
        eventId: doc.eventId,
        emailKey: doc.emailKey,
        status: 'active',
      }));
      if (duplicate) {
        const error = new Error('duplicate waitlist');
        error.code = 11000;
        return Promise.reject(error);
      }
      const saved = assignId(clone(doc), nextWaitlistId);
      state.waitlist.push(saved);
      return Promise.resolve(wrapStoredDoc(state.waitlist, saved));
    },
    find(filter = {}) {
      return new FakeQuery(many(state.waitlist, filter), { collection: state.waitlist });
    },
    findOne(filter = {}) {
      return new FakeQuery(first(state.waitlist, filter), { single: true, collection: state.waitlist });
    },
  };

  const BlueRidgeOutingAuditLog = {
    create(doc) {
      const saved = assignId(clone(doc), nextAuditId);
      if (!saved.timestamp) saved.timestamp = new Date().toISOString();
      state.audits.push(saved);
      return Promise.resolve(wrapStoredDoc(state.audits, saved));
    },
    find(filter = {}) {
      return new FakeQuery(many(state.audits, filter), { collection: state.audits });
    },
  };

  return {
    state,
    models: {
      BlueRidgeOuting,
      BlueRidgeOutingAuditLog,
      BlueRidgeRegistration,
      BlueRidgeTeam,
      BlueRidgeTeamMember,
      BlueRidgeWaitlist,
    },
  };
}

function loadOutingsRouter(fakeConn) {
  const secondaryPath = require.resolve('../secondary-conn');
  const routerPath = require.resolve('../routes/outings');
  const previousSecondary = require.cache[secondaryPath];

  delete require.cache[secondaryPath];
  delete require.cache[routerPath];

  require.cache[secondaryPath] = {
    id: secondaryPath,
    filename: secondaryPath,
    loaded: true,
    exports: {
      initSecondaryConn: () => fakeConn,
      getSecondaryConn: () => fakeConn,
    },
  };

  const router = require('../routes/outings');

  delete require.cache[routerPath];
  if (previousSecondary) require.cache[secondaryPath] = previousSecondary;
  else delete require.cache[secondaryPath];

  return router;
}

async function withRouter(models, run) {
  const fakeConn = {
    readyState: 1,
    model(name) {
      const found = models[name];
      if (!found) throw new Error(`Unknown fake model requested: ${name}`);
      return found;
    },
    once() {},
  };

  const router = loadOutingsRouter(fakeConn);
  const app = express();
  app.use(express.json());
  app.use('/api/outings', router);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api/outings`;
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function jsonRequest(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_err) {
    payload = text;
  }
  return { response, payload };
}

function buildEvent(overrides = {}) {
  const now = new Date();
  return {
    _id: '507f191e810c19729de860ea',
    name: 'Plastered Open',
    formatType: '2-Man Scramble',
    startDate: '2026-06-19T00:00:00.000Z',
    endDate: '2026-06-19T00:00:00.000Z',
    status: 'open',
    signupOpenAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    signupCloseAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    teamSizeMin: 1,
    teamSizeMax: 2,
    teamSizeExact: 2,
    requirePartner: false,
    maxTeams: 60,
    maxPlayers: 120,
    allowSingles: true,
    allowSeekingPartner: true,
    allowSeekingTeam: true,
    allowPartialTeamSignup: true,
    allowFullTeamSignup: true,
    allowMemberGuestSignup: true,
    allowCaptainSignup: true,
    allowJoinExistingTeam: true,
    allowGuests: true,
    memberOnly: false,
    handicapRequired: false,
    autoWaitlist: true,
    ...overrides,
  };
}

function player(name, email, extra = {}) {
  return {
    name,
    email,
    phone: '555-0101',
    ...extra,
  };
}

async function assertRegisterFlow({
  label,
  eventOverrides,
  mode,
  teamName,
  teamId,
  players,
  seedTeams = [],
  seedMembers = [],
  expectedTeamCount,
  expectedMemberCount,
  expectedRegistrationTeam,
  expectedTeamStatus,
}) {
  const event = buildEvent(eventOverrides);
  const { state, models } = createModels({ event, teams: seedTeams, members: seedMembers });

  await withRouter(models, async (baseUrl) => {
    const { response, payload } = await jsonRequest(baseUrl, `/${event._id}/register`, {
      method: 'POST',
      body: {
        mode,
        teamName,
        teamId,
        players,
      },
    });

    assert.strictEqual(response.status, 201, `${label} should return 201`);
    assert.strictEqual(payload.registration.mode, mode, `${label} should store the mode`);
    assert.strictEqual(state.registrations.length, 1, `${label} should create one registration`);
    assert.strictEqual(state.members.length, expectedMemberCount, `${label} should create the expected active members`);

    if (expectedRegistrationTeam) {
      assert.ok(payload.registration.teamId, `${label} should return a team id`);
      assert.ok(state.registrations[0].teamId, `${label} should persist a team id`);
    } else {
      assert.strictEqual(payload.registration.teamId, undefined, `${label} should not return a team id`);
      assert.strictEqual(state.registrations[0].teamId, undefined, `${label} should not persist a team id`);
    }

    assert.strictEqual(state.teams.length, expectedTeamCount, `${label} should leave the expected team count`);
    if (expectedTeamStatus) {
      const team = state.teams.find((entry) => sameValue(entry._id, state.registrations[0].teamId || teamId));
      assert(team, `${label} should have a matching team`);
      assert.strictEqual(team.status, expectedTeamStatus, `${label} should leave the team in the right status`);
    }
  });
}

async function assertWaitlistFlow() {
  const event = buildEvent({ autoWaitlist: true, status: 'waitlist' });
  const { state, models } = createModels({ event });

  await withRouter(models, async (baseUrl) => {
    const { response, payload } = await jsonRequest(baseUrl, `/${event._id}/waitlist`, {
      method: 'POST',
      body: {
        name: 'Wait List Wendy',
        email: 'waitlist@example.com',
        phone: '555-0202',
        notes: 'Keep me posted',
        mode: 'single',
      },
    });

    assert.strictEqual(response.status, 201, 'Waitlist signup should return 201');
    assert.strictEqual(payload.emailKey, 'waitlist@example.com', 'Waitlist signup should normalize the email');
    assert.strictEqual(state.waitlist.length, 1, 'Waitlist signup should persist one entry');
  });
}

async function assertWaitlistDisabledFlow() {
  const event = buildEvent({ autoWaitlist: false, status: 'open' });
  const { state, models } = createModels({ event });

  await withRouter(models, async (baseUrl) => {
    const { response, payload } = await jsonRequest(baseUrl, `/${event._id}/waitlist`, {
      method: 'POST',
      body: {
        name: 'Blocked Wendy',
        email: 'blocked@example.com',
      },
    });

    assert.strictEqual(response.status, 400, 'Disabled waitlist should reject signups');
    assert.strictEqual(payload.error, 'Waitlist is disabled for this event', 'Disabled waitlist should explain why it was blocked');
    assert.strictEqual(state.waitlist.length, 0, 'Disabled waitlist should not create entries');
  });
}

async function assertAdminPaymentUpdate() {
  const event = buildEvent({ entryFee: 85 });
  const { state, models } = createModels({
    event,
    registrations: [{
      _id: '507f191e810c19729de860ee',
      eventId: event._id,
      mode: 'full_team',
      status: 'registered',
      teamId: '507f191e810c19729de860ef',
      submittedByName: 'Captain Casey',
      submittedByEmail: 'captain@example.com',
      submittedByPhone: '555-0101',
      notes: 'Original note',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    teams: [{
      _id: '507f191e810c19729de860ef',
      eventId: event._id,
      name: 'Fairway Foundry',
      captainName: 'Captain Casey',
      captainEmail: 'captain@example.com',
      targetSize: 2,
      status: 'active',
    }],
    members: [
      {
        _id: '507f191e810c19729de860f1',
        eventId: event._id,
        teamId: '507f191e810c19729de860ef',
        registrationId: '507f191e810c19729de860ee',
        name: 'Captain Casey',
        email: 'captain@example.com',
        emailKey: 'captain@example.com',
        phone: '555-0101',
        isCaptain: true,
        status: 'active',
      },
      {
        _id: '507f191e810c19729de860f2',
        eventId: event._id,
        teamId: '507f191e810c19729de860ef',
        registrationId: '507f191e810c19729de860ee',
        name: 'Partner Pam',
        email: 'partner@example.com',
        emailKey: 'partner@example.com',
        phone: '555-0102',
        isCaptain: false,
        status: 'active',
      },
    ],
  });

  await withRouter(models, async (baseUrl) => {
    const { response, payload } = await jsonRequest(
      baseUrl,
      `/admin/events/${event._id}/registrations/507f191e810c19729de860ee/payment?code=2000`,
      {
        method: 'PUT',
        body: { paymentStatus: 'paid' },
      }
    );

    assert.strictEqual(response.status, 200, 'Admin payment update should return 200');
    assert.strictEqual(payload.registration.paymentStatus, 'paid', 'Admin payment update should return the new status');
    assert.strictEqual(state.registrations[0].paymentStatus, 'paid', 'Admin payment update should persist the new status');

    const auditResult = await jsonRequest(baseUrl, `/admin/events/${event._id}/audit-log?code=2000`);
    assert.strictEqual(auditResult.response.status, 200, 'Admin audit log should load');
    assert.ok(Array.isArray(auditResult.payload.rows), 'Admin audit log should return rows');
    assert.ok(
      auditResult.payload.rows.some((row) =>
        String(row && row.action || '') === 'payment_status_updated'
        && String(row && row.category || '') === 'money'
        && String(row && row.summary || '').includes('Payment updated')
      ),
      'Admin audit log should include the payment change'
    );
    assert.ok(state.audits.some((row) => String(row && row.action || '') === 'payment_status_updated'), 'Payment change should persist in audit state');
  });
}

async function assertAdminPaymentUpdateValidation() {
  const event = buildEvent();
  const { state, models } = createModels({
    event,
    registrations: [{
      _id: '507f191e810c19729de860fa',
      eventId: event._id,
      mode: 'single',
      status: 'registered',
      submittedByName: 'Single Sam',
      submittedByEmail: 'single@example.com',
      submittedByPhone: '555-0101',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const { response, payload } = await jsonRequest(
      baseUrl,
      `/admin/events/${event._id}/registrations/507f191e810c19729de860fa/payment?code=2000`,
      {
        method: 'PUT',
        body: { paymentStatus: 'banana' },
      }
    );

    assert.strictEqual(response.status, 400, 'Invalid payment status should be rejected');
    assert.ok(/paymentStatus must be one of/i.test(payload.error), 'Invalid payment status should explain valid options');
    assert.strictEqual(state.registrations[0].paymentStatus, 'unpaid', 'Invalid payment status should not change the registration');
  });
}

async function assertAuditTrail() {
  const event = buildEvent({ entryFee: 85, autoWaitlist: true, status: 'open' });
  const { state, models } = createModels({ event });

  await withRouter(models, async (baseUrl) => {
    const registerResult = await jsonRequest(baseUrl, `/${event._id}/register`, {
      method: 'POST',
      body: {
        mode: 'full_team',
        teamName: 'Audit Pair',
        notes: 'Initial audit note',
        players: [
          player('Audit Amy', 'amy@example.com'),
          player('Audit Ben', 'ben@example.com'),
        ],
      },
    });
    assert.strictEqual(registerResult.response.status, 201, 'Audit register flow should create a team registration');

    const registrationId = String(registerResult.payload.registration._id);
    const removeMember = state.members.find((member) => member.status === 'active' && member.emailKey === 'ben@example.com');
    assert.ok(removeMember, 'Audit trail test should have an active golfer to remove');

    const paymentResult = await jsonRequest(
      baseUrl,
      `/admin/events/${event._id}/registrations/${registrationId}/payment?code=2000`,
      {
        method: 'PUT',
        body: { paymentStatus: 'paid' },
      }
    );
    assert.strictEqual(paymentResult.response.status, 200, 'Audit trail payment update should succeed');

    const updateResult = await jsonRequest(baseUrl, `/${event._id}/registrations/${registrationId}`, {
      method: 'PUT',
      body: {
        requesterEmail: 'amy@example.com',
        notes: 'Updated audit note',
        removeMemberIds: [String(removeMember._id)],
        addPlayers: [player('Audit Cal', 'cal@example.com', { phone: '555-0103' })],
      },
    });
    assert.strictEqual(updateResult.response.status, 200, 'Audit trail registration update should succeed');

    const cancelResult = await jsonRequest(
      baseUrl,
      `/${event._id}/registrations/${registrationId}?requesterEmail=${encodeURIComponent('amy@example.com')}`,
      { method: 'DELETE' }
    );
    assert.strictEqual(cancelResult.response.status, 200, 'Audit trail registration cancel should succeed');

    const waitlistJoin = await jsonRequest(baseUrl, `/${event._id}/waitlist`, {
      method: 'POST',
      body: {
        name: 'Audit Wendy',
        email: 'audit-wendy@example.com',
        phone: '555-0202',
        notes: 'Keep me posted',
        mode: 'single',
      },
    });
    assert.strictEqual(waitlistJoin.response.status, 201, 'Audit trail waitlist join should succeed');

    const waitlistId = String(waitlistJoin.payload._id);
    const waitlistCancel = await jsonRequest(
      baseUrl,
      `/${event._id}/waitlist/${waitlistId}?requesterEmail=${encodeURIComponent('audit-wendy@example.com')}`,
      { method: 'DELETE' }
    );
    assert.strictEqual(waitlistCancel.response.status, 200, 'Audit trail waitlist cancel should succeed');

    const auditResult = await jsonRequest(baseUrl, `/admin/events/${event._id}/audit-log?code=2000&limit=100`);
    assert.strictEqual(auditResult.response.status, 200, 'Audit trail log should load');

    const actions = new Set((auditResult.payload.rows || []).map((row) => String(row && row.action || '')));
    [
      'registration_created',
      'payment_status_updated',
      'players_removed',
      'players_added',
      'registration_notes_updated',
      'registration_cancelled',
      'waitlist_joined',
      'waitlist_cancelled',
      'team_status_changed',
    ].forEach((action) => {
      assert.ok(actions.has(action), `Audit trail should include ${action}`);
    });
    assert.ok(
      state.audits.some((row) => String(row && row.action || '') === 'team_status_changed' && String(row && row.category || '') === 'team'),
      'Audit trail should persist team status changes'
    );
  });
}

async function assertAdminEventUpdateAudit() {
  const event = buildEvent({ entryFee: 85, registrationNotes: 'Original note' });
  const { state, models } = createModels({ event });

  await withRouter(models, async (baseUrl) => {
    const updatePayload = {
      name: event.name,
      formatType: event.formatType,
      startDate: event.startDate,
      endDate: event.endDate,
      signupOpenAt: event.signupOpenAt,
      signupCloseAt: event.signupCloseAt,
      status: 'waitlist',
      teamSizeMin: event.teamSizeMin,
      teamSizeMax: event.teamSizeMax,
      teamSizeExact: event.teamSizeExact,
      requirePartner: event.requirePartner,
      maxTeams: 64,
      maxPlayers: 128,
      allowSingles: event.allowSingles,
      allowSeekingPartner: event.allowSeekingPartner,
      allowSeekingTeam: event.allowSeekingTeam,
      allowPartialTeamSignup: event.allowPartialTeamSignup,
      allowFullTeamSignup: event.allowFullTeamSignup,
      allowMemberGuestSignup: event.allowMemberGuestSignup,
      allowCaptainSignup: event.allowCaptainSignup,
      allowJoinExistingTeam: event.allowJoinExistingTeam,
      allowGuests: event.allowGuests,
      memberOnly: event.memberOnly,
      handicapRequired: event.handicapRequired,
      entryFee: 95,
      registrationNotes: 'Updated admin note',
      cancellationPolicy: 'No refunds after June 1',
      autoWaitlist: true,
    };

    const updateResult = await jsonRequest(baseUrl, `/admin/events/${event._id}?code=2000`, {
      method: 'PUT',
      body: updatePayload,
    });
    assert.strictEqual(updateResult.response.status, 200, 'Admin event update should succeed');
    assert.strictEqual(state.outings[0].maxTeams, 64, 'Admin event update should persist the team cap change');
    assert.strictEqual(state.outings[0].entryFee, 95, 'Admin event update should persist the entry fee change');

    const auditResult = await jsonRequest(baseUrl, `/admin/events/${event._id}/audit-log?code=2000`);
    assert.strictEqual(auditResult.response.status, 200, 'Admin event update audit should load');
    const updateRow = (auditResult.payload.rows || []).find((row) => String(row && row.action || '') === 'event_updated');
    assert.ok(updateRow, 'Admin event update should create an event_updated audit row');
    assert.strictEqual(updateRow.category, 'event', 'Admin event update audit should use the event category');
    assert.strictEqual(updateRow.details.changedFields.maxTeams.to, 64, 'Admin event update audit should include changed maxTeams');
    assert.strictEqual(updateRow.details.changedFields.entryFee.to, 95, 'Admin event update audit should include changed entryFee');
  });
}

async function run() {
  await assertRegisterFlow({
    label: 'Single signup with auto-waitlist disabled',
    eventOverrides: { autoWaitlist: false },
    mode: 'single',
    players: [player('Single Sam', 'single@example.com')],
    expectedTeamCount: 0,
    expectedMemberCount: 1,
    expectedRegistrationTeam: false,
  });

  await assertRegisterFlow({
    label: 'Seeking-partner signup',
    mode: 'seeking_partner',
    players: [player('Partner Pat', 'partner@example.com')],
    expectedTeamCount: 0,
    expectedMemberCount: 1,
    expectedRegistrationTeam: false,
  });

  await assertRegisterFlow({
    label: 'Seeking-team signup',
    mode: 'seeking_team',
    players: [player('Team Terry', 'seeking-team@example.com')],
    expectedTeamCount: 0,
    expectedMemberCount: 1,
    expectedRegistrationTeam: false,
  });

  await assertRegisterFlow({
    label: 'Captain signup',
    mode: 'captain',
    teamName: 'Captain Crew',
    players: [player('Captain Carla', 'captain@example.com')],
    expectedTeamCount: 1,
    expectedMemberCount: 1,
    expectedRegistrationTeam: true,
    expectedTeamStatus: 'incomplete',
  });

  await assertRegisterFlow({
    label: 'Full-team signup',
    mode: 'full_team',
    teamName: 'Full Send',
    players: [
      player('Full Fran', 'full-fran@example.com'),
      player('Full Fred', 'full-fred@example.com'),
    ],
    expectedTeamCount: 1,
    expectedMemberCount: 2,
    expectedRegistrationTeam: true,
    expectedTeamStatus: 'active',
  });

  await assertRegisterFlow({
    label: 'Partial-team signup',
    mode: 'partial_team',
    teamName: 'Half Built',
    players: [player('Partial Penny', 'partial@example.com')],
    expectedTeamCount: 1,
    expectedMemberCount: 1,
    expectedRegistrationTeam: true,
    expectedTeamStatus: 'incomplete',
  });

  await assertRegisterFlow({
    label: 'Member-guest signup',
    mode: 'member_guest',
    teamName: 'Member Guest Duo',
    players: [
      player('Member Mike', 'member@example.com', { isGuest: false }),
      player('Guest Gina', 'guest@example.com', { isGuest: true }),
    ],
    expectedTeamCount: 1,
    expectedMemberCount: 2,
    expectedRegistrationTeam: true,
    expectedTeamStatus: 'active',
  });

  await assertRegisterFlow({
    label: 'Join-team signup',
    mode: 'join_team',
    teamId: '507f191e810c19729de860eb',
    players: [player('Joiner June', 'joiner@example.com')],
    seedTeams: [{
      _id: '507f191e810c19729de860eb',
      eventId: '507f191e810c19729de860ea',
      name: 'Open Team',
      captainName: 'Captain Carla',
      captainEmail: 'captain@example.com',
      targetSize: 2,
      status: 'incomplete',
    }],
    seedMembers: [{
      _id: '507f191e810c19729de860ec',
      eventId: '507f191e810c19729de860ea',
      teamId: '507f191e810c19729de860eb',
      registrationId: '507f191e810c19729de860ed',
      name: 'Captain Carla',
      email: 'captain@example.com',
      emailKey: 'captain@example.com',
      phone: '555-0101',
      isGuest: false,
      handicapIndex: undefined,
      isCaptain: true,
      status: 'active',
    }],
    expectedTeamCount: 1,
    expectedMemberCount: 2,
    expectedRegistrationTeam: true,
    expectedTeamStatus: 'active',
  });

  await assertWaitlistFlow();
  await assertWaitlistDisabledFlow();
  await assertAdminPaymentUpdate();
  await assertAdminPaymentUpdateValidation();
  await assertAuditTrail();
  await assertAdminEventUpdateAudit();
}

run()
  .then(() => {
    console.log('Outings registration mode tests passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
