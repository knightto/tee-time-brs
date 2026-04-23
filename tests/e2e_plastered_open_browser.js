process.env.SKIP_MONGO_CONNECT = '1';
process.env.SITE_ADMIN_WRITE_CODE = process.env.SITE_ADMIN_WRITE_CODE || '2000';

const assert = require('assert');
const { spawn } = require('child_process');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fetch = global.fetch || require('node-fetch');

const DEBUG_PORT = Number(process.env.E2E_PLASTERED_OPEN_DEBUG_PORT || 9251);
const ADMIN_CODE = String(process.env.SITE_ADMIN_WRITE_CODE || '2000').trim();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function first(collection, filter) {
  return collection.find((doc) => matches(doc, filter)) || null;
}

function many(collection, filter) {
  return collection.filter((doc) => matches(doc, filter));
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

function assignId(doc, fallback) {
  if (!doc._id) doc._id = fallback();
  if (!doc.createdAt) doc.createdAt = new Date().toISOString();
  if (!doc.updatedAt) doc.updatedAt = doc.createdAt;
  return doc;
}

function createModels({ event, teams = [], members = [], registrations = [], waitlist = [] }) {
  const nextTeamId = buildDocFactory('7');
  const nextRegistrationId = buildDocFactory('8');
  const nextMemberId = buildDocFactory('9');
  const nextWaitlistId = buildDocFactory('a');

  const state = {
    outings: createModelStore([event]),
    teams: createModelStore(teams),
    members: createModelStore(members),
    registrations: createModelStore(registrations),
    waitlist: createModelStore(waitlist),
  };

  const BlueRidgeOuting = {
    findById(id) {
      return Promise.resolve(wrapStoredDoc(state.outings, first(state.outings, { _id: id })));
    },
    find(filter = {}) {
      return new FakeQuery(many(state.outings, filter), { collection: state.outings });
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
      if (doc && update.$set) Object.assign(doc, clone(update.$set), { updatedAt: new Date().toISOString() });
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

  return {
    state,
    models: {
      BlueRidgeOuting,
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

async function withServer(models, run) {
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
  app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));
  app.use('/api/outings', router);
  app.use(express.static(PUBLIC_DIR));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function resolveBrowserPath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function waitForJsonVersion() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`Browser DevTools endpoint did not open on ${DEBUG_PORT}`);
}

async function openTarget(url) {
  const endpoint = `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`;
  let response;
  try {
    response = await fetch(endpoint, { method: 'PUT' });
  } catch {
    response = await fetch(endpoint);
  }
  if (!response.ok) throw new Error(`Failed to create browser target for ${url}: status=${response.status}`);
  return response.json();
}

async function closeTarget(id) {
  try {
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${id}`);
  } catch {}
}

async function withCdp(webSocketUrl, fn) {
  if (typeof WebSocket !== 'function') throw new Error('Global WebSocket is not available in this Node runtime');
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 0;

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await opened;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'CDP error'));
      else resolve(message.result);
      return;
    }
    if (message.method && listeners.has(message.method)) {
      for (const handler of listeners.get(message.method)) handler(message.params || {});
    }
  });

  function send(method, params = {}) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function on(method, handler) {
    const set = listeners.get(method) || new Set();
    set.add(handler);
    listeners.set(method, set);
    return () => set.delete(handler);
  }

  try {
    return await fn({ send, on });
  } finally {
    for (const { reject } of pending.values()) reject(new Error('CDP connection closed'));
    pending.clear();
    ws.close();
  }
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result && result.result ? result.result.value : undefined;
}

async function waitForExpression(send, expression, timeoutMs = 15000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const value = await evaluate(send, expression);
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

function isIgnorableBrowserError(detail = '') {
  const text = String(detail || '').toLowerCase();
  return text.includes('favicon.ico')
    || text.includes('fonts.googleapis.com')
    || text.includes('fonts.gstatic.com');
}

async function withPage(baseUrl, pathname, fn) {
  const target = await openTarget('about:blank');
  const errors = [];

  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
      let loaded = false;
      const requestMap = new Map();
      const removeLoad = on('Page.loadEventFired', () => { loaded = true; });
      const removeException = on('Runtime.exceptionThrown', (params) => {
        const details = params.exceptionDetails || {};
        const text = details.text || details.exception?.description || 'Runtime exception';
        errors.push(`exception: ${text}`);
      });
      const removeLog = on('Log.entryAdded', (params) => {
        const entry = params.entry || {};
        if (entry.level === 'error' || entry.source === 'javascript') {
          errors.push(`log:${entry.level || entry.source}: ${entry.text || 'unknown error'}`);
        }
      });
      const removeConsole = on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'error' || params.type === 'assert') {
          const parts = (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean);
          errors.push(`console:${params.type}: ${parts.join(' ') || params.type}`);
        }
      });
      const removeRequest = on('Network.requestWillBeSent', (params) => {
        requestMap.set(params.requestId, params.request?.url || '');
      });
      const removeResponse = on('Network.responseReceived', (params) => {
        const url = params.response?.url || requestMap.get(params.requestId) || '';
        const status = params.response?.status;
        if (typeof status === 'number' && status >= 400) errors.push(`response:${status}: ${url}`);
      });
      const removeLoadingFailed = on('Network.loadingFailed', (params) => {
        const url = requestMap.get(params.requestId) || '';
        errors.push(`network:${params.errorText || 'failed'}: ${url}`);
      });

      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Network.enable');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await send('Page.navigate', { url: `${baseUrl}${pathname}` });
      for (let i = 0; i < 40 && !loaded; i += 1) await sleep(200);
      await waitForExpression(send, `document.readyState === 'complete'`, 10000);

      const result = await fn({ send });
      const filteredErrors = errors.filter((entry) => !isIgnorableBrowserError(entry));
      assert.strictEqual(filteredErrors.length, 0, `${pathname} should load without browser errors:\n${filteredErrors.join('\n')}`);

      removeLoad();
      removeException();
      removeLog();
      removeConsole();
      removeRequest();
      removeResponse();
      removeLoadingFailed();

      return result;
    });
  } finally {
    await closeTarget(target.id);
  }
}

async function jsonFetch(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

function buildEvent() {
  const now = new Date();
  return {
    _id: '507f191e810c19729de860ea',
    name: 'Plastered "Open"',
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
    allowMemberGuestSignup: false,
    allowCaptainSignup: true,
    allowJoinExistingTeam: true,
    allowGuests: true,
    memberOnly: false,
    handicapRequired: false,
    entryFee: 85,
    registrationNotes: 'Friday, June 19, 2026 in Front Royal, Virginia.',
    cancellationPolicy: 'Cancel before the close date so the spot can be reassigned.',
    autoWaitlist: true,
    createdAt: '2026-04-19T01:49:56.301Z',
    updatedAt: '2026-04-19T01:49:56.301Z',
  };
}

async function main() {
  const browserPath = resolveBrowserPath();
  if (!browserPath) throw new Error('No Chromium-based browser was found for the Plastered Open e2e test.');

  const event = buildEvent();
  const { state, models } = createModels({ event });

  await withServer(models, async (baseUrl) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-time-plastered-open-'));
    const browser = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ], { stdio: 'ignore' });

    try {
      await waitForJsonVersion();

      const { response: outingsResponse, payload: outingsPayload } = await jsonFetch(baseUrl, '/api/outings');
      assert.strictEqual(outingsResponse.status, 200, 'Outings list should respond');
      assert.ok(Array.isArray(outingsPayload) && outingsPayload.length === 1, 'Outings list should include the seeded event');
      assert.strictEqual(outingsPayload[0].dateLabel, '6/19/2026', 'Event dateLabel should preserve the June 19 outing date');

      await withPage(baseUrl, '/plastered-open.html', async ({ send }) => {
        await waitForExpression(send, `(() => {
          const subtitle = document.getElementById('signupSubtitle');
          return subtitle && /Plastered/.test(subtitle.textContent || '') && document.querySelectorAll('#modeButtons [data-action]').length >= 1;
        })()`, 15000);

        const stats = await evaluate(send, `Array.from(document.querySelectorAll('#statsGrid .stat-box')).map((node) => ({
          value: node.querySelector('strong')?.textContent?.trim() || '',
          label: node.querySelector('span')?.textContent?.trim() || ''
        }))`);
        assert.strictEqual(stats[0].label, '120 player cap', 'Signup page should render the real player cap');
        assert.strictEqual(stats[1].label, '60 team cap', 'Signup page should render the real team cap');

        await evaluate(send, `(() => {
          document.querySelector('#modeButtons [data-mode="full_team"]').click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.getElementById('signupDialog')?.open)`, 10000);
        await evaluate(send, `(() => {
          const setValue = (selector, value) => {
            const node = document.querySelector(selector);
            if (!node) return false;
            node.value = value;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          setValue('#teamNameInput', 'Fairway Foundry');
          setValue('#notesInput', 'Original full-team note');
          const rows = Array.from(document.querySelectorAll('[data-player-row]'));
          if (rows.length < 2) return false;
          const first = rows[0];
          const second = rows[1];
          const setRowValue = (row, selector, value) => {
            const node = row.querySelector(selector);
            if (!node) return false;
            node.value = value;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          setRowValue(first, '[data-player-name]', 'Captain Casey');
          setRowValue(first, '[data-player-email]', 'captain@example.com');
          setRowValue(first, '[data-player-phone]', '555-0101');
          setRowValue(second, '[data-player-name]', 'Partner Pam');
          setRowValue(second, '[data-player-email]', 'partner@example.com');
          setRowValue(second, '[data-player-phone]', '555-0102');
          document.querySelector('#signupForm button[type="submit"]').click();
          return true;
        })()`);
        await waitForExpression(send, `(() => {
          const status = document.getElementById('statusNote');
          return status && /active signup/i.test(status.textContent || '') && !document.getElementById('signupDialog')?.open;
        })()`, 20000);

        assert.strictEqual(state.registrations.length, 1, 'Full-team signup should create a registration');
        assert.strictEqual(state.registrations[0].status, 'registered', 'Registration should start active');
        assert.strictEqual(state.registrations[0].notes, 'Original full-team note', 'Registration notes should persist');
        assert.strictEqual(state.teams.length, 1, 'Full-team signup should create one team');
        assert.strictEqual(state.teams[0].status, 'active', 'Full team should create an active team');
        assert.strictEqual(state.members.filter((member) => member.status === 'active').length, 2, 'Full-team signup should create two active golfers');

        const { response: statusResponse, payload: statusPayload } = await jsonFetch(
          baseUrl,
          `/api/outings/${event._id}/status?email=${encodeURIComponent('captain@example.com')}`
        );
        assert.strictEqual(statusResponse.status, 200, 'Status lookup should respond for the registration owner');
        assert.ok(statusPayload.registration, 'Status lookup should include the registration');
        assert.strictEqual(statusPayload.teamMembers.length, 2, 'Status lookup should include both team members');

        await withPage(baseUrl, `/plastered-open-registration-list.html?code=${encodeURIComponent(ADMIN_CODE)}`, async ({ send: adminSend }) => {
          await waitForExpression(adminSend, `(() => {
            const topMsg = document.getElementById('topMsg');
            return topMsg && /Loaded/.test(topMsg.textContent || '') && document.querySelectorAll('#teamsList .team-card').length === 1;
          })()`, 15000);

          const summaryText = normalizeText(await evaluate(adminSend, `document.getElementById('eventSummary')?.innerText || ''`));
          assert.ok(summaryText.includes('6/19/2026'), 'Admin list should display the correct June 19 outing date');

          const teamText = normalizeText(await evaluate(adminSend, `document.querySelector('#teamsList .team-card')?.innerText || ''`));
          assert.ok(teamText.includes('Fairway Foundry'), 'Admin list should show the team card');
          assert.ok(teamText.includes('Captain Casey'), 'Admin list should show the captain');
          assert.ok(teamText.includes('Partner Pam'), 'Admin list should show the partner');
          assert.ok(teamText.includes('Fees due $170'), 'Admin team card should show the amount still due before payment is collected');

          const ledgerText = normalizeText(await evaluate(adminSend, `document.getElementById('ledgerBody')?.innerText || ''`));
          assert.ok(ledgerText.includes('Original full-team note'), 'Admin ledger should include the registration note');

          const paymentSummaryBefore = normalizeText(await evaluate(adminSend, `document.getElementById('paymentSummary')?.innerText || ''`));
          assert.ok(paymentSummaryBefore.includes('Paid entries: 0 / 1'), 'Payment snapshot should start with no paid entries');
          assert.ok(paymentSummaryBefore.includes('Outstanding: $170'), 'Payment snapshot should show the outstanding amount');

          await evaluate(adminSend, `(() => {
            const row = document.querySelector('#paymentBody [data-registration-id]');
            if (!row) return false;
            const select = row.querySelector('[data-payment-select]');
            const button = row.querySelector('[data-action="save-payment"]');
            if (!select || !button) return false;
            select.value = 'paid';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            button.click();
            return true;
          })()`);
          await waitForExpression(adminSend, `(() => {
            const topMsg = document.getElementById('topMsg');
            const summary = document.getElementById('paymentSummary');
            const teamCard = document.querySelector('#teamsList .team-card');
            return topMsg && /Saved Paid/i.test(topMsg.textContent || '')
              && summary && /Collected: \\$170/i.test(summary.textContent || '')
              && teamCard && /Fees paid \\$170/i.test(teamCard.textContent || '');
          })()`, 20000);
        });

        assert.strictEqual(state.registrations[0].paymentStatus, 'paid', 'Payment panel should persist the paid status');

        await evaluate(send, `(() => {
          document.getElementById('manageSignupBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.getElementById('manageDialog')?.open)`, 10000);
        await evaluate(send, `(() => {
          const notes = document.getElementById('manageNotesInput');
          const checkbox = document.querySelector('[data-remove-member-id]');
          if (!notes || !checkbox) return false;
          notes.value = 'Updated captain note';
          notes.dispatchEvent(new Event('input', { bubbles: true }));
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('manageSaveBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `(() => {
          const status = document.getElementById('statusNote');
          return status && /active signup/i.test(status.textContent || '') && !document.getElementById('manageDialog')?.open;
        })()`, 20000);

        assert.strictEqual(state.registrations[0].notes, 'Updated captain note', 'Manage flow should update registration notes');
        assert.strictEqual(state.members.filter((member) => member.status === 'active').length, 1, 'Manage flow should remove the selected golfer');
        assert.strictEqual(state.members.filter((member) => member.status === 'cancelled').length, 1, 'Removed golfer should be cancelled');
        assert.strictEqual(state.teams[0].status, 'incomplete', 'Removing a golfer should reopen the team');

        await waitForExpression(send, `(() => {
          const wrap = document.getElementById('openTeamsWrap');
          return wrap && !wrap.classList.contains('hidden') && document.querySelectorAll('#openTeamsList .team-pill').length === 1;
        })()`, 10000);

        await evaluate(send, `(() => {
          document.getElementById('manageSignupBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.getElementById('manageDialog')?.open)`, 10000);
        await evaluate(send, `(() => {
          const button = document.getElementById('manageAddPlayerBtn');
          if (!button || button.classList.contains('hidden')) return false;
          button.click();
          const row = document.querySelector('[data-manage-player-row]');
          if (!row) return false;
          const setValue = (selector, value) => {
            const node = row.querySelector(selector);
            if (!node) return false;
            node.value = value;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          setValue('[data-manage-player-name]', 'Replacement Ray');
          setValue('[data-manage-player-email]', 'replacement@example.com');
          setValue('[data-manage-player-phone]', '555-0103');
          document.getElementById('manageSaveBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `(() => {
          const status = document.getElementById('statusNote');
          return status && /active signup/i.test(status.textContent || '') && !document.getElementById('manageDialog')?.open;
        })()`, 20000);

        const activeMembersAfterAdd = state.members.filter((member) => member.status === 'active');
        assert.strictEqual(activeMembersAfterAdd.length, 2, 'Manage flow should add the replacement golfer');
        assert.ok(activeMembersAfterAdd.some((member) => member.emailKey === 'replacement@example.com'), 'Replacement golfer should be active');
        assert.strictEqual(state.teams[0].status, 'active', 'Team should return to active when full again');

        await withPage(baseUrl, `/plastered-open-registration-list.html?code=${encodeURIComponent(ADMIN_CODE)}`, async ({ send: adminSend }) => {
          await waitForExpression(adminSend, `(() => {
            const topMsg = document.getElementById('topMsg');
            return topMsg && /Loaded/.test(topMsg.textContent || '') && document.querySelectorAll('#teamsList .team-card').length === 1;
          })()`, 15000);

          const teamText = normalizeText(await evaluate(adminSend, `document.querySelector('#teamsList .team-card')?.innerText || ''`));
          assert.ok(teamText.includes('Replacement Ray'), 'Admin list should reflect the replacement golfer');

          const ledgerText = normalizeText(await evaluate(adminSend, `document.getElementById('ledgerBody')?.innerText || ''`));
          assert.ok(ledgerText.includes('Updated captain note'), 'Admin ledger should reflect the updated note');
        });

        await evaluate(send, `window.confirm = () => true; true`);
        await evaluate(send, `(() => {
          document.getElementById('manageSignupBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.getElementById('manageDialog')?.open)`, 10000);
        await evaluate(send, `(() => {
          document.getElementById('manageCancelEntryBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `(() => {
          const status = document.getElementById('statusNote');
          return status && /No active signup was found/i.test(status.textContent || '');
        })()`, 20000);

        assert.strictEqual(state.registrations[0].status, 'cancelled', 'Cancellation should cancel the registration');
        assert.strictEqual(state.members.filter((member) => member.status === 'active').length, 0, 'Cancellation should remove all active team members');
        assert.strictEqual(state.teams[0].status, 'cancelled', 'Cancellation should cancel the empty team');

        await evaluate(send, `(() => {
          document.querySelector('#modeButtons [data-action="waitlist"]').click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.getElementById('waitlistDialog')?.open)`, 10000);
        await evaluate(send, `(() => {
          const setValue = (selector, value) => {
            const node = document.querySelector(selector);
            if (!node) return false;
            node.value = value;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          setValue('#waitlistName', 'Waitlist Wendy');
          setValue('#waitlistEmail', 'waitlist@example.com');
          setValue('#waitlistPhone', '555-0104');
          setValue('#waitlistNotes', 'Keep me posted');
          document.querySelector('#waitlistForm button[type="submit"]').click();
          return true;
        })()`);
        await waitForExpression(send, `(() => {
          const status = document.getElementById('statusNote');
          return status && /currently on the waitlist/i.test(status.textContent || '') && !document.getElementById('waitlistDialog')?.open;
        })()`, 20000);

        assert.strictEqual(state.waitlist.length, 1, 'Waitlist submission should create an entry');
        assert.strictEqual(state.waitlist[0].status, 'active', 'Waitlist entry should start active');

        await evaluate(send, `window.confirm = () => true; true`);
        await evaluate(send, `(() => {
          document.getElementById('manageSignupBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.getElementById('manageDialog')?.open)`, 10000);
        await evaluate(send, `(() => {
          document.getElementById('manageCancelEntryBtn').click();
          return true;
        })()`);
        await waitForExpression(send, `(() => {
          const status = document.getElementById('statusNote');
          return status && /No active signup was found/i.test(status.textContent || '');
        })()`, 20000);

        assert.strictEqual(state.waitlist[0].status, 'cancelled', 'Leaving the waitlist should cancel the entry');

        const { response: finalStatusResponse, payload: finalStatusPayload } = await jsonFetch(
          baseUrl,
          `/api/outings/${event._id}/status?email=${encodeURIComponent('waitlist@example.com')}`
        );
        assert.strictEqual(finalStatusResponse.status, 200, 'Status lookup should still respond after waitlist removal');
        assert.strictEqual(Boolean(finalStatusPayload.waitlist), false, 'Cancelled waitlist entry should no longer appear as active');
      });

      await withPage(baseUrl, `/plastered-open-registration-list.html?code=${encodeURIComponent(ADMIN_CODE)}`, async ({ send }) => {
        await waitForExpression(send, `(() => {
          const topMsg = document.getElementById('topMsg');
          return topMsg && /Loaded/.test(topMsg.textContent || '');
        })()`, 15000);

        const teamsText = normalizeText(await evaluate(send, `document.getElementById('teamsList')?.innerText || ''`));
        assert.ok(teamsText.includes('No active or incomplete teams'), 'Cancelled team should disappear from the active team cards');

        const ledgerText = normalizeText(await evaluate(send, `document.getElementById('ledgerBody')?.innerText || ''`));
        assert.ok(/cancelled/i.test(ledgerText), 'Ledger should show the cancelled registration');
        assert.ok(ledgerText.includes('Updated captain note'), 'Ledger should keep the final note history');

        const waitlistText = normalizeText(await evaluate(send, `document.getElementById('waitlistList')?.innerText || ''`));
        assert.ok(waitlistText.includes('Waitlist Wendy'), 'Waitlist card should remain visible in the admin audit view');
        assert.ok(waitlistText.includes('cancelled'), 'Waitlist card should show the cancelled status');
      });
    } finally {
      if (browser.exitCode === null && !browser.killed) browser.kill('SIGTERM');
      setTimeout(() => {
        if (browser.exitCode === null && !browser.killed) browser.kill('SIGKILL');
      }, 1200);
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {}
    }
  });

  console.log('e2e_plastered_open_browser.js passed');
}

main().catch((error) => {
  console.error('e2e_plastered_open_browser.js failed', error);
  process.exitCode = 1;
});
