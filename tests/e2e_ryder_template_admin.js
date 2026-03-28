const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

const { initSecondaryConn, getSecondaryConn } = require('../secondary-conn');
const TripModel = require('../models/Trip');
const TripParticipantModel = require('../models/TripParticipant');
const TripAuditLogModel = require('../models/TripAuditLog');

const PORT = Number(process.env.E2E_PORT || 5058);
const BASE = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = Number(process.env.E2E_RYDER_ADMIN_DEBUG_PORT || 9238);
const ADMIN_CODE = process.env.SITE_ADMIN_WRITE_CODE || '2000';
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expect(results, condition, name, detail = '') {
  results.push({ ok: Boolean(condition), name, detail });
}

async function api(pathname, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (opts.admin) headers['x-admin-code'] = ADMIN_CODE;
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function waitForBoot() {
  for (let index = 0; index < 120; index += 1) {
    try {
      const health = await api('/api/health');
      if (health.status === 200) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

function resolveBrowserPath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function waitForJsonVersion() {
  for (let index = 0; index < 80; index += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`Browser DevTools endpoint did not open on ${DEBUG_PORT}`);
}

async function openTarget(url) {
  const endpoint = `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`;
  let res;
  try {
    res = await fetch(endpoint, { method: 'PUT' });
  } catch {
    res = await fetch(endpoint);
  }
  if (!res.ok) throw new Error(`Failed to create browser target for ${url}: status=${res.status}`);
  return res.json();
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
    const msg = JSON.parse(event.data);
    if (typeof msg.id === 'number' && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
      else resolve(msg.result);
      return;
    }
    if (msg.method && listeners.has(msg.method)) {
      for (const handler of listeners.get(msg.method)) handler(msg.params || {});
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

async function waitForExpression(send, expression, timeoutMs = 10000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const value = await evaluate(send, expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function ensureSecondaryConnection() {
  await initSecondaryConn();
  const conn = getSecondaryConn();
  if (!conn) throw new Error('Secondary Mongo connection unavailable');
  if (conn.readyState === 1) return conn;
  if (conn.readyState === 2) {
    await new Promise((resolve, reject) => {
      conn.once('open', resolve);
      conn.once('error', reject);
    });
    return conn;
  }
  throw new Error(`Secondary Mongo connection unavailable (state ${conn.readyState})`);
}

async function cleanupTrip(tripId) {
  const conn = await ensureSecondaryConnection();
  const Trip = conn.model('Trip', TripModel.schema);
  const TripParticipant = conn.model('TripParticipant', TripParticipantModel.schema);
  const TripAuditLog = conn.model('TripAuditLog', TripAuditLogModel.schema);
  await TripAuditLog.deleteMany({ tripId });
  await TripParticipant.deleteMany({ trip: tripId });
  await Trip.deleteOne({ _id: tripId });
}

function buildTemplatePayload(runId, count) {
  return {
    code: ADMIN_CODE,
    name: `Admin Ryder ${count} ${runId}`,
    groupName: `Ryder Group ${count}`,
    location: 'Hilton Head, SC',
    startDate: '2031-09-14',
    teamAName: 'Blue',
    teamBName: 'Gold',
    firstTeeTime: '07:30',
    teeIntervalMinutes: 10,
    packageType: '5 Rounds Ryder Cup',
    reservationNumber: '',
    preparedBy: 'E2E',
    contactPhone: '',
    courseNames: ['Harbor', 'Atlantic', 'Ocean', 'Dunes', 'Palmetto'],
    playerNames: Array.from({ length: count }, (_, index) => `Admin Player ${count}-${index + 1}`),
    handicapIndexes: Array.from({ length: count }, (_, index) => index + 0.5),
  };
}

async function createTripFromAdminPage(results, runId) {
  const payload = buildTemplatePayload(runId, 12);
  const target = await openTarget('about:blank');
  const errors = [];
  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
      const requestMap = new Map();
      on('Runtime.exceptionThrown', (params) => {
        const details = params.exceptionDetails || {};
        errors.push(details.text || details.exception?.description || 'Runtime exception');
      });
      on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'error' || params.type === 'assert') {
          const parts = (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean);
          errors.push(parts.join(' '));
        }
      });
      on('Network.requestWillBeSent', (params) => {
        requestMap.set(params.requestId, params.request?.url || '');
      });
      on('Network.responseReceived', (params) => {
        const url = params.response?.url || requestMap.get(params.requestId) || '';
        const status = params.response?.status;
        if (url.includes('favicon.ico')) return;
        if (typeof status === 'number' && status >= 400) {
          errors.push(`response:${status}:${url}`);
        }
      });

      await send('Page.enable');
      await send('Runtime.enable');
      await send('Network.enable');
      await send('Log.enable');
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.prompt = () => ${JSON.stringify(ADMIN_CODE)};`,
      });
      await send('Page.navigate', { url: `${BASE}/admin.html` });
      await waitForExpression(send, `Boolean(document.getElementById('openRyderCupTemplateBtn'))`, 15000);
      await evaluate(send, `(() => {
        const payload = ${JSON.stringify(payload)};
        const setValue = (id, value) => {
          const el = document.getElementById(id);
          if (!el) throw new Error('Missing field: ' + id);
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        document.getElementById('openRyderCupTemplateBtn').click();
        setValue('ryderTripNameInput', payload.name);
        setValue('ryderGroupNameInput', payload.groupName);
        setValue('ryderLocationInput', payload.location);
        setValue('ryderStartDateInput', payload.startDate);
        setValue('ryderTeamANameInput', payload.teamAName);
        setValue('ryderTeamBNameInput', payload.teamBName);
        setValue('ryderFirstTeeTimeInput', payload.firstTeeTime);
        setValue('ryderTeeIntervalInput', String(payload.teeIntervalMinutes));
        setValue('ryderPackageTypeInput', payload.packageType);
        setValue('ryderPreparedByInput', payload.preparedBy);
        setValue('ryderPlayerNamesInput', payload.playerNames.join('\\n'));
        setValue('ryderHandicapIndexesInput', payload.handicapIndexes.join('\\n'));
        document.getElementById('ryderCupTemplateForm').requestSubmit();
        return true;
      })()`);
      const adminState = await waitForExpression(send, `(() => {
        const result = document.getElementById('ryderCupTemplateResult');
        const link = document.querySelector('#ryderCupTemplateLinks a[href*="tripId="]');
        if (!result || !link || !/successfully/i.test(result.textContent || '')) return '';
        const href = link.getAttribute('href') || '';
        const url = new URL(href, window.location.origin);
        return JSON.stringify({
          message: result.textContent.trim(),
          tripId: url.searchParams.get('tripId'),
          teeTimeCount: String((document.getElementById('ryderTeeTimeCountInput') || {}).value || '').trim(),
          links: Array.from(document.querySelectorAll('#ryderCupTemplateLinks a')).map((anchor) => anchor.href),
        });
      })()`, 30000);
      const parsed = JSON.parse(adminState);
      expect(results, parsed.teeTimeCount === '3', 'Admin form auto-calculates 12-player foursomes', `value=${parsed.teeTimeCount}`);
      expect(results, errors.length === 0, 'Admin page console clean during template create', errors.join(' | ') || 'no errors');
      return parsed;
    });
  } finally {
    await closeTarget(target.id);
  }
}

async function inspectDynamicPage(url, selector = 'body') {
  const target = await openTarget(url);
  const errors = [];
  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
      const requestMap = new Map();
      on('Runtime.exceptionThrown', (params) => {
        const details = params.exceptionDetails || {};
        errors.push(details.text || details.exception?.description || 'Runtime exception');
      });
      on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'error' || params.type === 'assert') {
          const parts = (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean);
          errors.push(parts.join(' '));
        }
      });
      on('Network.requestWillBeSent', (params) => {
        requestMap.set(params.requestId, params.request?.url || '');
      });
      on('Network.responseReceived', (params) => {
        const urlValue = params.response?.url || requestMap.get(params.requestId) || '';
        const status = params.response?.status;
        if (urlValue.includes('favicon.ico')) return;
        if (typeof status === 'number' && status >= 400) errors.push(`response:${status}:${urlValue}`);
      });
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Network.enable');
      await waitForExpression(send, `document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(selector)}))`, 15000);
      await sleep(1500);
      const state = await evaluate(send, `JSON.stringify({
        bodyTextLength: (document.body?.innerText || '').trim().length,
        roundCount: document.querySelectorAll('[data-ryder-round-index]').length,
        teamText: (document.getElementById('ryderTeamsSection')?.innerText || '').trim(),
      })`);
      const parsed = JSON.parse(state);
      return { ...parsed, errors };
    });
  } finally {
    await closeTarget(target.id);
  }
}

async function verifyCreatedTrip(results, tripId, expectedCount) {
  const bundle = await api(`/api/trips/${tripId}?myrtleBeach2026=true`);
  expect(results, bundle.status === 200, `Trip bundle ${expectedCount}`, `status=${bundle.status}`);
  const trip = bundle.body?.trip || {};
  const participants = Array.isArray(bundle.body?.participants) ? bundle.body.participants : [];
  const teamAPlayers = trip?.competition?.ryderCup?.teams?.[0]?.players || [];
  const teamBPlayers = trip?.competition?.ryderCup?.teams?.[1]?.players || [];
  expect(results, participants.length === expectedCount, `Trip participants ${expectedCount}`, `count=${participants.length}`);
  expect(results, (trip.rounds?.[0]?.teeTimes || []).length === (expectedCount / 4), `Round 1 tee times ${expectedCount}`, `count=${(trip.rounds?.[0]?.teeTimes || []).length}`);
  expect(results, teamAPlayers.length === (expectedCount / 2), `Team A size ${expectedCount}`, `count=${teamAPlayers.length}`);
  expect(results, teamBPlayers.length === (expectedCount / 2), `Team B size ${expectedCount}`, `count=${teamBPlayers.length}`);
  return bundle.body;
}

async function main() {
  const results = [];
  const browserPath = resolveBrowserPath();
  if (!ADMIN_CODE) {
    expect(results, false, 'Admin code available', 'ADMIN_WRITE_CODE / ADMIN_CODE / ADMIN_DELETE_CODE is missing');
    console.log(JSON.stringify({ summary: { passed: 0, failed: 1, total: 1 }, results }, null, 2));
    process.exit(1);
  }
  if (!browserPath) {
    expect(results, false, 'Browser available', 'No Edge/Chrome binary found');
    console.log(JSON.stringify({ summary: { passed: 0, failed: 1, total: 1 }, results }, null, 2));
    process.exit(1);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-time-ryder-admin-'));
  const runId = crypto.randomBytes(3).toString('hex');
  const createdTripIds = [];
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), E2E_TEST_MODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const booted = await waitForBoot();
    expect(results, booted, 'Server boot', booted ? `Listening on ${PORT}` : `Failed to boot on ${PORT}`);
    if (!booted) throw new Error(`Server failed to boot on ${PORT}`);
    await waitForJsonVersion();
    expect(results, true, 'Browser DevTools endpoint', `Listening on ${DEBUG_PORT}`);

    const adminCreated = await createTripFromAdminPage(results, runId);
    expect(results, Boolean(adminCreated.tripId), 'Admin page created trip id', adminCreated.tripId || 'missing');
    createdTripIds.push(adminCreated.tripId);
    const adminBundle = await verifyCreatedTrip(results, adminCreated.tripId, 12);

    const tripPage = await inspectDynamicPage(`${BASE}/myrtle/trip-2026.html?tripId=${encodeURIComponent(adminCreated.tripId)}`);
    expect(results, tripPage.roundCount === 5, 'Trip page shows five Ryder Cup rounds', `rounds=${tripPage.roundCount}`);
    expect(results, /6\/6/.test(tripPage.teamText), 'Trip page shows 6-vs-6 Ryder Cup team counts', tripPage.teamText || 'missing');
    expect(results, tripPage.errors.length === 0, 'Trip page console clean', tripPage.errors.join(' | ') || 'no errors');

    for (const link of adminCreated.links || []) {
      const page = await inspectDynamicPage(link);
      expect(results, page.bodyTextLength > 40, `Generated page loads ${link}`, `chars=${page.bodyTextLength}`);
      expect(results, page.errors.length === 0, `Generated page console clean ${link}`, page.errors.join(' | ') || 'no errors');
    }

    for (const count of [16, 20]) {
      const createResponse = await api('/api/trips/templates/ryder-cup?myrtleBeach2026=true', {
        method: 'POST',
        admin: true,
        body: JSON.stringify(buildTemplatePayload(runId, count)),
      });
      expect(results, createResponse.status === 201, `API template create ${count}`, `status=${createResponse.status}`);
      const tripId = createResponse.body?.trip?._id;
      expect(results, Boolean(tripId), `API template trip id ${count}`, tripId || 'missing');
      if (!tripId) continue;
      createdTripIds.push(tripId);
      await verifyCreatedTrip(results, tripId, count);
    }

    const competition = await api(`/api/trips/${adminCreated.tripId}/competition?myrtleBeach2026=true`);
    expect(results, competition.status === 200, 'Competition API for admin-created trip', `status=${competition.status}`);
    expect(results, (competition.body?.ryderCup?.teams?.[0]?.players?.length || 0) === 6, 'Competition API keeps 6-player Team A for admin-created trip', `count=${competition.body?.ryderCup?.teams?.[0]?.players?.length || 0}`);
    expect(results, (competition.body?.ryderCup?.rounds?.[0]?.matches?.length || 0) === 3, 'Competition API keeps 3 matches in round 1 for admin-created trip', `count=${competition.body?.ryderCup?.rounds?.[0]?.matches?.length || 0}`);
    expect(results, (competition.body?.ryderCup?.individualLeaderboard?.length || 0) === 12, 'Competition API keeps 12-player leaderboard for admin-created trip', `count=${competition.body?.ryderCup?.individualLeaderboard?.length || 0}`);
    expect(results, adminBundle?.trip?.competition?.ryderCup?.payout?.totalPot === 1200, 'Admin-created 12-player trip scales payout pot', `pot=${adminBundle?.trip?.competition?.ryderCup?.payout?.totalPot}`);
  } finally {
    browser.kill('SIGTERM');
    server.kill('SIGTERM');
    setTimeout(() => {
      browser.kill('SIGKILL');
      server.kill('SIGKILL');
    }, 1200);
    for (const tripId of createdTripIds) {
      if (!tripId) continue;
      try {
        await cleanupTrip(tripId);
      } catch {}
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }

  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok).length;
  console.log(JSON.stringify({ summary: { passed, failed, total: results.length }, results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
