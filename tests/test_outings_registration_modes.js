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
      if (Object.prototype.hasOwnProperty.call(expected, '$gte')) {
        if (new Date(actual).getTime() < new Date(expected.$gte).getTime()) return false;
      }
      if (Object.prototype.hasOwnProperty.call(expected, '$lt')) {
        if (new Date(actual).getTime() >= new Date(expected.$lt).getTime()) return false;
      }
      return true;
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

  limit(count) {
    if (!this.single && Array.isArray(this.value)) this.value = this.value.slice(0, Number(count) || 0);
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

function createModels({ event, teams = [], members = [], registrations = [], waitlist = [], ledgerEntries = [], mailingContacts = [], messages = [], audits = [] }) {
  const nextTeamId = buildDocFactory('7');
  const nextRegistrationId = buildDocFactory('8');
  const nextMemberId = buildDocFactory('9');
  const nextWaitlistId = buildDocFactory('a');
  const nextAuditId = buildDocFactory('b');
  const nextLedgerId = buildDocFactory('c');
  const nextMailingContactId = buildDocFactory('d');
  const nextMessageId = buildDocFactory('e');

  const state = {
    outings: createModelStore([event]),
    teams: createModelStore(teams),
    members: createModelStore(members),
    registrations: createModelStore(registrations),
    waitlist: createModelStore(waitlist),
    ledgerEntries: createModelStore(ledgerEntries),
    mailingContacts: createModelStore(mailingContacts),
    messages: createModelStore(messages),
    audits: createModelStore(audits),
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
    deleteMany(filter = {}) {
      const before = state.registrations.length;
      state.registrations = state.registrations.filter((doc) => !matches(doc, filter));
      const deletedCount = before - state.registrations.length;
      return Promise.resolve({ acknowledged: true, deletedCount });
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
    deleteOne(filter = {}) {
      const index = state.teams.findIndex((doc) => matches(doc, filter));
      if (index >= 0) state.teams.splice(index, 1);
      return Promise.resolve({ acknowledged: true, deletedCount: index >= 0 ? 1 : 0 });
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
    deleteMany(filter = {}) {
      const before = state.members.length;
      state.members = state.members.filter((doc) => !matches(doc, filter));
      const deletedCount = before - state.members.length;
      return Promise.resolve({ acknowledged: true, deletedCount });
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

  const BlueRidgeOutingLedgerEntry = {
    find(filter = {}) {
      return new FakeQuery(many(state.ledgerEntries, filter), { collection: state.ledgerEntries });
    },
    findOne(filter = {}) {
      return new FakeQuery(first(state.ledgerEntries, filter), { single: true, collection: state.ledgerEntries });
    },
    create(doc) {
      const saved = assignId(clone(doc), nextLedgerId);
      state.ledgerEntries.push(saved);
      return Promise.resolve(wrapStoredDoc(state.ledgerEntries, saved));
    },
    deleteOne(filter = {}) {
      const index = state.ledgerEntries.findIndex((doc) => matches(doc, filter));
      if (index >= 0) state.ledgerEntries.splice(index, 1);
      return Promise.resolve({ acknowledged: true, deletedCount: index >= 0 ? 1 : 0 });
    },
  };

  const BlueRidgeOutingMailingContact = {
    find(filter = {}) {
      return new FakeQuery(many(state.mailingContacts, filter), { collection: state.mailingContacts });
    },
    findOne(filter = {}) {
      return new FakeQuery(first(state.mailingContacts, filter), { single: true, collection: state.mailingContacts });
    },
    findOneAndUpdate(filter = {}, update = {}, options = {}) {
      let doc = first(state.mailingContacts, filter);
      if (!doc) {
        doc = assignId({}, nextMailingContactId);
        state.mailingContacts.push(doc);
      }
      if (update.$set) Object.assign(doc, clone(update.$set), { updatedAt: new Date().toISOString() });
      return Promise.resolve(wrapStoredDoc(state.mailingContacts, options && options.new === false ? null : doc));
    },
  };

  const BlueRidgeOutingMessage = {
    find(filter = {}) {
      return new FakeQuery(many(state.messages, filter), { collection: state.messages });
    },
    create(doc) {
      const saved = assignId(clone(doc), nextMessageId);
      state.messages.push(saved);
      return Promise.resolve(wrapStoredDoc(state.messages, saved));
    },
  };

  return {
    state,
    models: {
      BlueRidgeOuting,
      BlueRidgeOutingAuditLog,
      BlueRidgeOutingLedgerEntry,
      BlueRidgeOutingMailingContact,
      BlueRidgeOutingMessage,
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
  const event = buildEvent({ entryFee: 90 });
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
    assert.strictEqual(state.members[0].feePaidTo, 'tommy', 'Admin payment update should mark linked player fees collected by default');
    assert.strictEqual(state.members[1].feePaidTo, 'tommy', 'Admin payment update should mark all linked player fees collected by default');

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

async function assertAdminCheckInUpdate() {
  const event = buildEvent({ entryFee: 90 });
  const movingMemberId = '507f191e810c19729de863f1';
  const registrationId = '507f191e810c19729de863ee';
  const sourceTeamId = '507f191e810c19729de863ef';
  const targetTeamId = '507f191e810c19729de863f0';
  const { state, models } = createModels({
    event,
    registrations: [{
      _id: registrationId,
      eventId: event._id,
      mode: 'join_team',
      status: 'registered',
      teamId: sourceTeamId,
      submittedByName: 'Checkin Charlie',
      submittedByEmail: 'checkin@example.com',
      submittedByPhone: '555-0107',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    teams: [{
      _id: sourceTeamId,
      eventId: event._id,
      name: 'Original Team',
      targetSize: 2,
      status: 'incomplete',
    }, {
      _id: targetTeamId,
      eventId: event._id,
      name: 'Target Team',
      targetSize: 2,
      status: 'incomplete',
    }],
    members: [{
      _id: movingMemberId,
      eventId: event._id,
      teamId: sourceTeamId,
      registrationId,
      name: 'Checkin Charlie',
      email: 'checkin@example.com',
      emailKey: 'checkin@example.com',
      phone: '555-0107',
      isCaptain: false,
      isClubMember: false,
      feePaidTo: '',
      status: 'active',
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const result = await jsonRequest(baseUrl, `/admin/events/${event._id}/check-in/${movingMemberId}?code=2000`, {
      method: 'PUT',
      body: {
        checkedIn: true,
        feePaidTo: 'john',
        isClubMember: true,
        teamId: targetTeamId,
        checkInNotes: 'Paid cash at table one.',
      },
    });

    assert.strictEqual(result.response.status, 200, 'Admin check-in update should return 200');
    assert.strictEqual(state.members[0].checkedIn, true, 'Check-in should persist arrival status');
    assert.ok(state.members[0].checkedInAt, 'Check-in should stamp arrival time');
    assert.strictEqual(state.members[0].feePaidTo, 'john', 'Check-in should persist fee collection location');
    assert.strictEqual(state.members[0].isClubMember, true, 'Check-in should persist BRS member status');
    assert.strictEqual(state.members[0].teamId, targetTeamId, 'Check-in should move the player to the selected team');
    assert.strictEqual(state.registrations[0].teamId, targetTeamId, 'Check-in should keep the registration team assignment in sync');
    assert.strictEqual(state.teams.find((team) => team._id === sourceTeamId).status, 'cancelled', 'Empty source team should be cancelled');
    assert.strictEqual(state.teams.find((team) => team._id === targetTeamId).status, 'incomplete', 'Target team should remain incomplete until full');
    assert.strictEqual(result.payload.event.metrics.players, 1, 'Returned event metrics should stay current after check-in');
    assert.strictEqual(result.payload.event.teams.length, 1, 'Returned event should exclude the emptied cancelled team');
    assert.strictEqual(result.payload.event.members[0].feePaidTo, 'john', 'Returned event should include refreshed player payment state');
    assert.ok(
      state.audits.some((row) => String(row && row.action || '') === 'player_check_in_updated'),
      'Check-in update should write an audit row'
    );
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
  const event = buildEvent({ entryFee: 90, autoWaitlist: true, status: 'open' });
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

async function assertAuditChangeReport() {
  const event = buildEvent({ entryFee: 90 });
  const today = '2026-06-19';
  const { models } = createModels({
    event,
    audits: [{
      _id: 'a17f191e810c19729de86001',
      outingId: event._id,
      category: 'team',
      action: 'team_roster_admin_updated',
      actor: 'admin',
      method: 'PUT',
      route: '/api/outings/admin/events/team',
      summary: 'Team updated: Report Team',
      details: { teamName: 'Report Team', activePlayerCount: 2 },
      timestamp: `${today}T13:00:00.000Z`,
    }, {
      _id: 'a17f191e810c19729de86002',
      outingId: event._id,
      category: 'money',
      action: 'payment_status_updated',
      actor: 'admin',
      method: 'PUT',
      route: '/api/outings/admin/events/payment',
      summary: 'Payment updated for Pay Pat',
      details: { submittedByName: 'Pay Pat', from: 'unpaid', to: 'paid', amountDue: 90 },
      timestamp: `${today}T14:00:00.000Z`,
    }, {
      _id: 'a17f191e810c19729de86003',
      outingId: event._id,
      category: 'player',
      action: 'player_check_in_updated',
      actor: 'admin',
      method: 'PUT',
      route: '/api/outings/admin/events/check-in',
      summary: 'Check-in updated for Check Chuck',
      details: { name: 'Check Chuck', feePaidTo: { from: '', to: 'tommy' } },
      timestamp: `${today}T15:00:00.000Z`,
    }, {
      _id: 'a17f191e810c19729de86004',
      outingId: event._id,
      category: 'money',
      action: 'fee_planning_updated',
      actor: 'admin',
      method: 'PUT',
      route: '/api/outings/admin/events/planning',
      summary: 'Payout and raffle planning updated for Plastered Open',
      details: {},
      timestamp: `${today}T16:00:00.000Z`,
    }, {
      _id: 'a17f191e810c19729de86005',
      outingId: event._id,
      category: 'team',
      action: 'team_admin_deleted',
      actor: 'admin',
      method: 'DELETE',
      route: '/api/outings/admin/events/team',
      summary: 'Old team deleted',
      details: { teamName: 'Old Team' },
      timestamp: '2026-06-18T16:00:00.000Z',
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const result = await jsonRequest(baseUrl, `/admin/events/${event._id}/audit-report?code=2000&date=${today}`);
    assert.strictEqual(result.response.status, 200, 'Audit change report should load');
    assert.strictEqual(result.payload.totalChanges, 4, 'Audit change report should include only the requested date');
    const sectionCounts = Object.fromEntries(result.payload.sections.map((section) => [section.key, section.count]));
    assert.strictEqual(sectionCounts.teams, 1, 'Audit change report should group team changes');
    assert.strictEqual(sectionCounts.payments, 1, 'Audit change report should group payment changes');
    assert.strictEqual(sectionCounts.checkins, 1, 'Audit change report should group check-in changes');
    assert.strictEqual(sectionCounts.payouts, 1, 'Audit change report should group payout changes');
    const paymentRow = result.payload.sections.find((section) => section.key === 'payments').rows[0];
    assert.ok(/Amount: \$90/i.test(paymentRow.detailLine), 'Audit change report should expose readable payment details');
  });
}

async function assertAdminEventUpdateAudit() {
  const event = buildEvent({ entryFee: 90, registrationNotes: 'Original note' });
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

async function assertKegSponsorshipFlow() {
  const event = buildEvent();
  const { state, models } = createModels({ event });

  await withRouter(models, async (baseUrl) => {
    const createResult = await jsonRequest(baseUrl, `/${event._id}/register`, {
      method: 'POST',
      body: {
        mode: 'full_team',
        teamName: 'Keg Crew',
        kegSponsorshipAmount: 150,
        players: [
          player('Keg Kim', 'keg-kim@example.com'),
          player('Keg Ken', 'keg-ken@example.com'),
        ],
      },
    });
    assert.strictEqual(createResult.response.status, 201, 'Keg sponsorship signup should succeed');
    assert.strictEqual(state.registrations[0].kegSponsorshipAmount, 150, 'Registration should store the keg sponsorship amount');
    assert.strictEqual(createResult.payload.event.kegSponsorshipSummary.totalAmount, 150, 'Event detail should summarize keg sponsorship dollars');
    assert.strictEqual(createResult.payload.event.kegSponsorshipSummary.contributorCount, 1, 'Event detail should summarize keg sponsorship contributors');

    const registrationId = state.registrations[0]._id;
    const updateResult = await jsonRequest(baseUrl, `/${event._id}/registrations/${registrationId}`, {
      method: 'PUT',
      body: {
        requesterEmail: 'keg-kim@example.com',
        kegSponsorshipAmount: 200,
        notes: '',
        removeMemberIds: [],
        addPlayers: [],
      },
    });
    assert.strictEqual(updateResult.response.status, 200, 'Keg sponsorship update should succeed');
    assert.strictEqual(state.registrations[0].kegSponsorshipAmount, 200, 'Registration should update the keg sponsorship amount');
    assert.strictEqual(updateResult.payload.event.kegSponsorshipSummary.totalAmount, 200, 'Updated event detail should summarize changed keg sponsorship dollars');
  });
}

async function assertActiveTeamDeleteRemovesRecords() {
  const event = buildEvent();
  const teamId = '607f191e810c19729de861aa';
  const registrationId = '807f191e810c19729de861ab';
  const { state, models } = createModels({
    event,
    teams: [{
      _id: teamId,
      eventId: event._id,
      name: 'Delete Me',
      status: 'active',
      memberCount: 2,
    }],
    registrations: [{
      _id: registrationId,
      eventId: event._id,
      teamId,
      mode: 'full_team',
      status: 'registered',
      submittedByName: 'Delete Dan',
      submittedByEmail: 'delete-dan@example.com',
      submittedByPhone: '555-0302',
      paymentStatus: 'unpaid',
    }],
    members: [{
      _id: '907f191e810c19729de861ac',
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Delete Dan',
      email: 'delete-dan@example.com',
      emailKey: 'delete-dan@example.com',
      phone: '555-0302',
      status: 'active',
    }, {
      _id: '907f191e810c19729de861ad',
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Delete Deb',
      email: 'delete-deb@example.com',
      emailKey: 'delete-deb@example.com',
      phone: '555-0303',
      status: 'active',
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const result = await jsonRequest(baseUrl, `/admin/events/${event._id}/teams/${teamId}?code=2000`, {
      method: 'DELETE',
    });
    assert.strictEqual(result.response.status, 200, 'Active team delete should succeed');
    assert.strictEqual(state.teams.length, 0, 'Active team delete should remove the team record');
    assert.strictEqual(state.registrations.length, 0, 'Active team delete should remove registration records');
    assert.strictEqual(state.members.length, 0, 'Active team delete should remove member records');
    assert.ok(
      state.audits.some((row) => String(row && row.action || '') === 'team_admin_deleted'),
      'Active team delete should write an audit row'
    );
    assert.deepStrictEqual(result.payload.event.teams, [], 'Deleted team should disappear from returned team list');
    assert.deepStrictEqual(result.payload.event.registrations, [], 'Deleted team should disappear from returned registration list');
  });
}

async function assertAdminTeamEditUpdatesGolferInformation() {
  const event = buildEvent();
  const teamId = '607f191e810c19729de861ea';
  const registrationId = '807f191e810c19729de861eb';
  const captainId = '907f191e810c19729de861ec';
  const partnerId = '907f191e810c19729de861ed';
  const { state, models } = createModels({
    event,
    teams: [{
      _id: teamId,
      eventId: event._id,
      name: 'Edit Team',
      status: 'active',
    }],
    registrations: [{
      _id: registrationId,
      eventId: event._id,
      teamId,
      mode: 'full_team',
      status: 'registered',
      submittedByName: 'Edit Captain',
      submittedByEmail: 'edit-captain@example.com',
      submittedByPhone: '555-0401',
      paymentStatus: 'unpaid',
    }],
    members: [{
      _id: captainId,
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Edit Captain',
      email: 'edit-captain@example.com',
      emailKey: 'edit-captain@example.com',
      phone: '555-0401',
      isCaptain: true,
      isGuest: false,
      isClubMember: false,
      status: 'active',
    }, {
      _id: partnerId,
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Edit Partner',
      email: 'edit-partner@example.com',
      emailKey: 'edit-partner@example.com',
      phone: '555-0402',
      isGuest: false,
      isClubMember: false,
      status: 'active',
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const result = await jsonRequest(baseUrl, `/admin/events/${event._id}/teams/${teamId}?code=2000`, {
      method: 'PUT',
      body: {
        teamName: 'Edited Team Name',
        removeMemberIds: [],
        addPlayers: [],
        memberFeeLocations: [{ memberId: partnerId, feePaidTo: 'john' }],
        memberUpdates: [{
          memberId: captainId,
          name: 'Edited Captain',
          email: 'edited-captain@example.com',
          phone: '555-0499',
          isGuest: false,
          isClubMember: true,
        }, {
          memberId: partnerId,
          name: 'Edited Guest',
          email: 'edited-guest@example.com',
          phone: '555-0488',
          isGuest: true,
          isClubMember: false,
        }],
      },
    });

    assert.strictEqual(result.response.status, 200, 'Admin team edit should update golfer details');
    assert.strictEqual(state.teams[0].name, 'Edited Team Name', 'Team edit should persist team name');
    assert.strictEqual(state.members[0].name, 'Edited Captain', 'Team edit should persist captain name');
    assert.strictEqual(state.members[0].emailKey, 'edited-captain@example.com', 'Team edit should persist captain email key');
    assert.strictEqual(state.members[0].phone, '555-0499', 'Team edit should persist captain phone');
    assert.strictEqual(state.members[0].isClubMember, true, 'Team edit should persist captain member flag');
    assert.strictEqual(state.members[1].name, 'Edited Guest', 'Team edit should persist partner name');
    assert.strictEqual(state.members[1].emailKey, 'edited-guest@example.com', 'Team edit should persist partner email key');
    assert.strictEqual(state.members[1].phone, '555-0488', 'Team edit should persist partner phone');
    assert.strictEqual(state.members[1].isGuest, true, 'Team edit should persist partner guest flag');
    assert.strictEqual(state.members[1].feePaidTo, 'john', 'Team edit should persist fee location changes');
    assert.strictEqual(state.registrations[0].submittedByName, 'Edited Captain', 'Captain edit should sync registration submitter name');
    assert.strictEqual(state.registrations[0].submittedByEmail, 'edited-captain@example.com', 'Captain edit should sync registration submitter email');
    assert.strictEqual(state.registrations[0].submittedByPhone, '555-0499', 'Captain edit should sync registration submitter phone');
    assert.ok(
      state.audits.some((row) => {
        const details = row && row.details || {};
        return String(row && row.action || '') === 'team_roster_admin_updated'
          && Array.isArray(details.contactUpdates)
          && details.contactUpdates.length === 2
          && details.contactUpdates.some((entry) => entry.registrationUpdated === true);
      }),
      'Team edit should audit golfer information changes'
    );

    const duplicate = await jsonRequest(baseUrl, `/admin/events/${event._id}/teams/${teamId}?code=2000`, {
      method: 'PUT',
      body: {
        teamName: 'Edited Team Name',
        memberUpdates: [{
          memberId: partnerId,
          name: 'Edited Guest',
          email: 'edited-captain@example.com',
          phone: '555-0488',
          isGuest: true,
          isClubMember: false,
        }],
      },
    });
    assert.strictEqual(duplicate.response.status, 400, 'Team edit should reject duplicate active golfer emails');
  });
}

async function assertFeeManagementFlow() {
  const event = buildEvent({ entryFee: 90 });
  const teamId = '607f191e810c19729de861ba';
  const registrationId = '807f191e810c19729de861bb';
  const { state, models } = createModels({
    event,
    teams: [{
      _id: teamId,
      eventId: event._id,
      name: 'Money Team',
      status: 'active',
    }],
    registrations: [{
      _id: registrationId,
      eventId: event._id,
      teamId,
      mode: 'full_team',
      status: 'registered',
      submittedByName: 'Money Mike',
      submittedByEmail: 'money-mike@example.com',
      paymentStatus: 'paid',
    }],
    members: [{
      _id: '907f191e810c19729de861bc',
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Money Mike',
      email: 'money-mike@example.com',
      emailKey: 'money-mike@example.com',
      status: 'active',
      feePaidTo: 'tommy',
      checkedIn: true,
    }, {
      _id: '907f191e810c19729de861bd',
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Money Molly',
      email: 'money-molly@example.com',
      emailKey: 'money-molly@example.com',
      status: 'active',
      checkedIn: true,
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const fees = await jsonRequest(baseUrl, `/admin/events/${event._id}/fees?code=2000`);
    assert.strictEqual(fees.response.status, 200, 'Fee management should load');
    assert.strictEqual(fees.payload.summary.entryFee, 90, 'Fee management should use the $90 entry fee');
    assert.strictEqual(fees.payload.summary.courseDue, 130, 'Course allocation should be $65 per active player');
    assert.strictEqual(fees.payload.summary.prizePoolDue, 50, 'Prize pool allocation should be $25 per active player');
    assert.strictEqual(fees.payload.summary.perPlayerVariance, 0, 'Fee management should balance the per-player allocations');

    const ledgerCreate = await jsonRequest(baseUrl, `/admin/events/${event._id}/fee-ledger?code=2000`, {
      method: 'POST',
      body: {
        type: 'income',
        category: 'raffle_income',
        label: 'Raffle tickets',
        amount: 100,
        paidBy: 'Cash box',
      },
    });
    assert.strictEqual(ledgerCreate.response.status, 201, 'Ledger entry should be created');
    assert.strictEqual(state.ledgerEntries.length, 1, 'Ledger entry should be stored');
    assert.strictEqual(ledgerCreate.payload.summary.ledger.income, 100, 'Ledger summary should include raffle income');
    const ledgerId = state.ledgerEntries[0]._id;

    const ledgerUpdate = await jsonRequest(baseUrl, `/admin/events/${event._id}/fee-ledger/${ledgerId}?code=2000`, {
      method: 'PUT',
      body: {
        type: 'expense',
        category: 'raffle_purchase',
        label: 'Raffle prize buy',
        amount: 35,
        paidTo: 'Prize shop',
      },
    });
    assert.strictEqual(ledgerUpdate.response.status, 200, 'Ledger entry update should succeed');
    assert.strictEqual(state.ledgerEntries[0].type, 'expense', 'Ledger update should persist type changes');
    assert.strictEqual(ledgerUpdate.payload.summary.ledger.expense, 35, 'Ledger summary should include updated expense');

    const ledgerDelete = await jsonRequest(baseUrl, `/admin/events/${event._id}/fee-ledger/${ledgerId}?code=2000`, {
      method: 'DELETE',
    });
    assert.strictEqual(ledgerDelete.response.status, 200, 'Ledger entry delete should succeed');
    assert.strictEqual(state.ledgerEntries.length, 0, 'Ledger delete should remove the stored entry');
    assert.strictEqual(ledgerDelete.payload.summary.ledger.expense, 0, 'Ledger summary should clear deleted entries');

    const raffleIncome = await jsonRequest(baseUrl, `/admin/events/${event._id}/fee-ledger?code=2000`, {
      method: 'POST',
      body: {
        type: 'income',
        category: 'raffle_income',
        label: 'Day-of raffle tickets',
        amount: 300,
        paidBy: 'Cash box',
      },
    });
    assert.strictEqual(raffleIncome.response.status, 201, 'Raffle income should be tracked in the ledger');

    const fiftyFiftyIncome = await jsonRequest(baseUrl, `/admin/events/${event._id}/fee-ledger?code=2000`, {
      method: 'POST',
      body: {
        type: 'income',
        category: 'fifty_fifty_income',
        label: '50/50 tickets',
        amount: 200,
        paidBy: 'Cash box',
      },
    });
    assert.strictEqual(fiftyFiftyIncome.response.status, 201, '50/50 income should be tracked in the ledger');
    assert.strictEqual(fiftyFiftyIncome.payload.raffleCloseout.raffleIncome, 300, 'Raffle closeout should include raffle income');
    assert.strictEqual(fiftyFiftyIncome.payload.raffleCloseout.fiftyFiftyIncome, 200, 'Raffle closeout should include 50/50 income');
    assert.strictEqual(fiftyFiftyIncome.payload.raffleCloseout.fiftyFiftyPayout, 100, 'Default 50/50 payout should be half of income');

    const planningUpdate = await jsonRequest(baseUrl, `/admin/events/${event._id}/fee-planning?code=2000`, {
      method: 'PUT',
      body: {
        payoutPlanner: {
          finalPlayerCount: 72,
          flightCount: 3,
          notes: 'Finalize after check-in closes.',
        },
        raffleCloseout: {
          fiftyFiftyPayout: 100,
          rafflePrizeCost: 75,
          notes: 'Cash box balanced.',
        },
        contestPrizes: [
          { contest: 'Closest To Pin', winner: 'Money Mike', amount: 75, paid: true, notes: 'Hole 4' },
          { contest: 'Long Drive', winner: 'Money Molly', amount: 50, paid: false, notes: 'Hole 12' },
        ],
        cashReconciliation: {
          clubCash: 0,
          tommyCash: 90,
          johnCash: 0,
          raffleCash: 300,
          fiftyFiftyCash: 200,
          sponsorCash: 0,
          otherCash: 10,
          notes: 'Extra $10 from mulligans.',
        },
        flightBuilder: {
          flightCount: 3,
          checkedInOnly: true,
          teamsPerHole: 2,
          startingHoleStart: 4,
          notes: 'Start on assigned hole.',
          assignments: [{
            teamId,
            teamName: 'Money Team',
            flight: 2,
            startingHole: '4',
            pairingGroup: 1,
            position: 1,
            playerNames: ['Money Mike', 'Money Molly'],
          }],
        },
      },
    });
    assert.strictEqual(planningUpdate.response.status, 200, 'Payout and raffle planning update should succeed');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.finalPlayerCount, 72, 'Planner should persist final player count');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.flightCount, 3, 'Planner should persist flight count');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.totalPrizePool, 1800, 'Planner should calculate $25 per final player');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.perFlightPool, 600, 'Planner should divide prize pool by flight count');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.payouts.first, 300, 'Planner should calculate first-place payout per flight');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.payouts.second, 180, 'Planner should calculate second-place payout per flight');
    assert.strictEqual(planningUpdate.payload.payoutPlanner.payouts.third, 120, 'Planner should calculate third-place payout per flight');
    assert.strictEqual(planningUpdate.payload.raffleCloseout.raffleNet, 225, 'Raffle closeout should subtract prize costs from raffle income');
    assert.strictEqual(planningUpdate.payload.raffleCloseout.fiftyFiftyRetained, 100, '50/50 closeout should show retained amount');
    assert.strictEqual(planningUpdate.payload.raffleCloseout.totalRetained, 325, 'Closeout should total raffle net plus retained 50/50');
    assert.strictEqual(planningUpdate.payload.contestPrizes.totalPayouts, 125, 'Contest tracker should total contest payouts');
    assert.strictEqual(planningUpdate.payload.contestPrizes.paidPayouts, 75, 'Contest tracker should total paid contest payouts');
    assert.strictEqual(planningUpdate.payload.contestPrizes.unpaidPayouts, 50, 'Contest tracker should expose unpaid contest payouts');
    assert.strictEqual(planningUpdate.payload.cashReconciliation.expected.tommyCash, 90, 'Cash reconciliation should expect player cash by fee-paid location');
    assert.strictEqual(planningUpdate.payload.cashReconciliation.expected.raffleCash, 300, 'Cash reconciliation should expect raffle cash from ledger');
    assert.strictEqual(planningUpdate.payload.cashReconciliation.expected.fiftyFiftyCash, 200, 'Cash reconciliation should expect 50/50 cash from ledger');
    assert.strictEqual(planningUpdate.payload.cashReconciliation.countedTotal, 600, 'Cash reconciliation should total counted cash');
    assert.strictEqual(planningUpdate.payload.cashReconciliation.expectedTotal, 590, 'Cash reconciliation should total expected cash');
    assert.strictEqual(planningUpdate.payload.cashReconciliation.varianceTotal, 10, 'Cash reconciliation should expose counted-vs-expected variance');
    assert.strictEqual(planningUpdate.payload.flightBuilder.flightCount, 3, 'Flight builder should persist flight count');
    assert.strictEqual(planningUpdate.payload.flightBuilder.teamCount, 1, 'Flight builder should count checked-in eligible teams');
    assert.strictEqual(planningUpdate.payload.flightBuilder.assignedTeamCount, 1, 'Flight builder should count assigned teams');
    assert.strictEqual(planningUpdate.payload.flightBuilder.assignments[0].startingHole, '4', 'Starting-hole sheet should persist assigned holes');
    assert.strictEqual(planningUpdate.payload.flightBuilder.assignments[0].flight, 2, 'Flight builder should persist assigned flight');
    assert.strictEqual(planningUpdate.payload.flightBuilder.perFlightPool, 600, 'Flight builder should use payout planner per-flight pool');
    assert.strictEqual(state.outings[0].payoutPlanner.finalPlayerCount, 72, 'Planner should save on the outing record');
    assert.strictEqual(state.outings[0].raffleCloseout.rafflePrizeCost, 75, 'Raffle closeout should save on the outing record');
    assert.strictEqual(state.outings[0].contestPrizes.length, 2, 'Contest prize rows should save on the outing record');
    assert.strictEqual(state.outings[0].cashReconciliation.otherCash, 10, 'Cash reconciliation should save on the outing record');
    assert.strictEqual(state.outings[0].flightBuilder.assignments.length, 1, 'Flight assignments should save on the outing record');
    assert.ok(
      state.audits.some((row) => String(row && row.action || '') === 'fee_planning_updated'),
      'Planning update should write an audit row'
    );

    const scheduleUpdate = await jsonRequest(baseUrl, `/admin/events/${event._id}/fees?code=2000`, {
      method: 'PUT',
      body: {
        feeSchedule: [
          { key: 'entry_fee', label: 'Player entry fee', amount: 90, basis: 'per_player', category: 'income', enabled: true },
          { key: 'course_fee', label: 'Course fee', amount: 65, basis: 'per_player', category: 'course', enabled: true },
          { key: 'prize_pool', label: 'Prize pool', amount: 25, basis: 'per_player', category: 'prize', enabled: true },
          { key: 'tournament_fees', label: 'Tourney fees', amount: 40, basis: 'flat', category: 'tournament', enabled: true },
        ],
      },
    });
    assert.strictEqual(scheduleUpdate.response.status, 200, 'Fee schedule update should succeed');
    assert.strictEqual(state.outings[0].entryFee, 90, 'Fee schedule update should keep entry fee at $90');
    assert.strictEqual(scheduleUpdate.payload.summary.tournamentFees, 40, 'Fee schedule should include tourney fees');
    assert.ok(
      state.audits.some((row) => String(row && row.action || '') === 'fee_schedule_updated'),
      'Fee schedule update should write an audit row'
    );
  });
}

async function assertCommunicationsAdminFlow() {
  const previousE2eMode = process.env.E2E_TEST_MODE;
  process.env.E2E_TEST_MODE = '1';
  const event = buildEvent({ entryFee: 90 });
  const teamId = '607f191e810c19729de862ba';
  const registrationId = '807f191e810c19729de862bb';
  const { state, models } = createModels({
    event,
    teams: [{
      _id: teamId,
      eventId: event._id,
      name: 'Mail Team',
      status: 'active',
    }],
    registrations: [{
      _id: registrationId,
      eventId: event._id,
      teamId,
      mode: 'full_team',
      status: 'registered',
      submittedByName: 'Mail Owner',
      submittedByEmail: 'mail-owner@example.com',
      paymentStatus: 'paid',
      kegSponsorshipAmount: 50,
    }],
    members: [{
      _id: '907f191e810c19729de862bc',
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Mail Owner',
      email: 'mail-owner@example.com',
      emailKey: 'mail-owner@example.com',
      status: 'active',
      feePaidTo: 'tommy',
    }, {
      _id: '907f191e810c19729de862bd',
      eventId: event._id,
      teamId,
      registrationId,
      name: 'Mail Partner',
      email: 'mail-partner@example.com',
      emailKey: 'mail-partner@example.com',
      status: 'active',
    }],
    waitlist: [{
      _id: 'a07f191e810c19729de862be',
      eventId: event._id,
      name: 'Waiting Wendy',
      email: 'waiting@example.com',
      emailKey: 'waiting@example.com',
      status: 'active',
    }],
  });

  try {
    await withRouter(models, async (baseUrl) => {
      const blocked = await jsonRequest(baseUrl, `/admin/events/${event._id}/communications`);
      assert.strictEqual(blocked.response.status, 403, 'Communications should require admin code');

      const loaded = await jsonRequest(baseUrl, `/admin/events/${event._id}/communications?code=2000`);
      assert.strictEqual(loaded.response.status, 200, 'Admin communications should load');
      assert.strictEqual(loaded.payload.counts.registered, 2, 'Communications should include registered golfers');
      assert.strictEqual(loaded.payload.counts.waitlist, 1, 'Communications should include waitlist contacts');
      assert.strictEqual(loaded.payload.counts.sponsors, 1, 'Communications should include sponsor contacts');

      const contact = await jsonRequest(baseUrl, `/admin/events/${event._id}/communications/contacts?code=2000`, {
        method: 'POST',
        body: {
          name: 'Manual Mary',
          email: 'manual@example.com',
          phone: '555-0111',
          tags: 'volunteer, sponsor',
          notes: 'Manual contact',
        },
      });
      assert.strictEqual(contact.response.status, 201, 'Manual contact save should succeed');
      assert.strictEqual(state.mailingContacts.length, 1, 'Manual contact should be stored');
      assert.strictEqual(contact.payload.counts.manual, 1, 'Manual contact should be counted');

      const testSend = await jsonRequest(baseUrl, `/admin/events/${event._id}/communications/send?code=2000`, {
        method: 'POST',
        body: {
          testOnly: true,
          testEmail: 'tommy@example.com',
          audience: 'all',
          subject: 'Test Plastered message',
          body: 'This is a test.',
        },
      });
      assert.strictEqual(testSend.response.status, 201, 'Test message should send');
      assert.strictEqual(state.messages[0].status, 'test', 'Test message should be logged as test');
      assert.strictEqual(state.messages[0].recipientCount, 1, 'Test message should only go to the test recipient');

      const liveSend = await jsonRequest(baseUrl, `/admin/events/${event._id}/communications/send?code=2000`, {
        method: 'POST',
        body: {
          audience: 'registered',
          subject: 'Live Plastered update',
          body: 'Pairings will be posted soon.',
        },
      });
      assert.strictEqual(liveSend.response.status, 201, 'Live message should send');
      assert.strictEqual(state.messages[1].status, 'sent', 'Live message should be logged as sent');
      assert.strictEqual(state.messages[1].recipientCount, 2, 'Live registered message should include registered golfers');

      const deleteContact = await jsonRequest(baseUrl, `/admin/events/${event._id}/communications/contacts/${state.mailingContacts[0]._id}?code=2000`, {
        method: 'DELETE',
      });
      assert.strictEqual(deleteContact.response.status, 200, 'Manual contact delete should succeed');
      assert.strictEqual(state.mailingContacts[0].status, 'unsubscribed', 'Manual contact should be unsubscribed');
    });
  } finally {
    if (previousE2eMode === undefined) delete process.env.E2E_TEST_MODE;
    else process.env.E2E_TEST_MODE = previousE2eMode;
  }
}

async function assertArchivedTeamDeleteRemovesRecords() {
  const event = buildEvent();
  const archivedTeamId = '507f191e810c19729de861aa';
  const { state, models } = createModels({
    event,
    registrations: [{
      _id: '807f191e810c19729de861ab',
      eventId: event._id,
      teamId: archivedTeamId,
      mode: 'full_team',
      status: 'cancelled',
      submittedByName: 'Archived Ann',
      submittedByEmail: 'archived-ann@example.com',
      submittedByPhone: '555-0301',
      paymentStatus: 'unpaid',
      kegSponsorshipAmount: 25,
    }],
    members: [{
      _id: '907f191e810c19729de861ac',
      eventId: event._id,
      teamId: archivedTeamId,
      registrationId: '807f191e810c19729de861ab',
      name: 'Archived Ann',
      email: 'archived-ann@example.com',
      emailKey: 'archived-ann@example.com',
      phone: '555-0301',
      status: 'cancelled',
    }],
  });

  await withRouter(models, async (baseUrl) => {
    const result = await jsonRequest(baseUrl, `/admin/events/${event._id}/teams/${archivedTeamId}?code=2000`, {
      method: 'DELETE',
    });
    assert.strictEqual(result.response.status, 200, 'Archived team delete should succeed');
    assert.strictEqual(state.registrations.length, 0, 'Archived team delete should remove registration records');
    assert.strictEqual(state.members.length, 0, 'Archived team delete should remove member records');
    assert.ok(
      state.audits.some((row) => String(row && row.action || '') === 'archived_team_admin_deleted'),
      'Archived team delete should write an audit row'
    );
    assert.deepStrictEqual(result.payload.event.registrations, [], 'Archived team should disappear from returned registration list');
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
  await assertAdminCheckInUpdate();
  await assertAdminPaymentUpdateValidation();
  await assertAuditTrail();
  await assertAuditChangeReport();
  await assertAdminEventUpdateAudit();
  await assertKegSponsorshipFlow();
  await assertAdminTeamEditUpdatesGolferInformation();
  await assertActiveTeamDeleteRemovesRecords();
  await assertFeeManagementFlow();
  await assertCommunicationsAdminFlow();
  await assertArchivedTeamDeleteRemovesRecords();
}

run()
  .then(() => {
    console.log('Outings registration mode tests passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

