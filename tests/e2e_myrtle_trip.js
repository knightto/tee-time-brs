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
const { buildDefaultMyrtleRyderCup } = require('../services/myrtleRyderCupDefaults');
const { getDefaultTripRyderCupState } = require('../services/tripRyderCupService');

const PORT = Number(process.env.E2E_PORT || 5057);
const BASE = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = Number(process.env.E2E_MYRTLE_BROWSER_DEBUG_PORT || 9227);
const ADMIN_CODE = process.env.ADMIN_WRITE_CODE || process.env.ADMIN_CODE || process.env.ADMIN_DELETE_CODE || '';
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  for (let i = 0; i < 120; i += 1) {
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
  for (let i = 0; i < 80; i += 1) {
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

async function evalValue(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result && result.result ? result.result.value : undefined;
}

async function waitFor(send, predicateExpression, timeoutMs = 12000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const ok = await evalValue(send, predicateExpression);
    if (ok) return true;
    await sleep(150);
  }
  return false;
}

async function ensureSecondaryConnection() {
  initSecondaryConn();
  const conn = getSecondaryConn();
  if (!conn) throw new Error('Secondary Mongo connection is not configured');
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

async function createTempMyrtleTrip() {
  const conn = await ensureSecondaryConnection();
  const Trip = conn.model('Trip', TripModel.schema);
  const TripParticipant = conn.model('TripParticipant', TripParticipantModel.schema);
  const TripAuditLog = conn.model('TripAuditLog', TripAuditLogModel.schema);
  const candidateTrips = await Trip.find({ name: /Myrtle Beach/i }).sort({ updatedAt: -1 }).lean();
  if (!candidateTrips.length) throw new Error('Source Myrtle trip not found in secondary database');
  let sourceTrip = null;
  let sourceParticipants = [];
  for (const candidate of candidateTrips) {
    const participants = await TripParticipant.find({ trip: candidate._id }).lean();
    sourceTrip = sourceTrip || candidate;
    if (participants.length) {
      sourceTrip = candidate;
      sourceParticipants = participants;
      break;
    }
  }
  if (!sourceTrip) throw new Error('Source Myrtle trip not found');

  const runId = crypto.randomBytes(3).toString('hex');
  const payload = clone(sourceTrip);
  delete payload._id;
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.__v;
  payload.name = `${sourceTrip.name} E2E ${runId}`;
  payload.groupName = `${sourceTrip.groupName} E2E ${runId}`;
  payload.rounds = (payload.rounds || []).map((round) => ({
    ...round,
    playerScores: [],
    teamMatches: [],
    ctpWinners: [],
    skinsResults: [],
  }));
  payload.competition = payload.competition || {};
  payload.competition.ryderCup = buildDefaultMyrtleRyderCup();
  payload.ryderCup = getDefaultTripRyderCupState(sourceParticipants);

  const createdTrip = await Trip.create(payload);
  const participantPayloads = sourceParticipants.map((participant) => {
    const next = clone(participant);
    delete next._id;
    delete next.createdAt;
    delete next.updatedAt;
    delete next.__v;
    next.trip = createdTrip._id;
    return next;
  });
  if (participantPayloads.length) {
    await TripParticipant.insertMany(participantPayloads);
  }

  async function cleanup() {
    await TripAuditLog.deleteMany({ trip: createdTrip._id });
    await TripParticipant.deleteMany({ trip: createdTrip._id });
    await Trip.deleteOne({ _id: createdTrip._id });
  }

  return {
    tripId: String(createdTrip._id),
    tripSummary: clone(createdTrip.toObject()),
    cleanup,
  };
}

async function fetchTripBundle(tripId) {
  const response = await api(`/api/trips/${tripId}?myrtleBeach2026=true`);
  if (response.status !== 200) {
    throw new Error(`Trip bundle fetch failed: status=${response.status}`);
  }
  return response.body;
}

async function runApiFlow(results, tripId) {
  const overlay = await api(`/api/trips/${tripId}/rydercup?myrtleBeach2026=true`);
  expect(results, overlay.status === 200, 'Myrtle overlay GET', `status=${overlay.status}`);
  expect(results, (overlay.body?.teamAPlayers?.length || 0) === 10, 'Overlay Team A count', `count=${overlay.body?.teamAPlayers?.length || 0}`);
  expect(results, (overlay.body?.teamBPlayers?.length || 0) === 10, 'Overlay Team B count', `count=${overlay.body?.teamBPlayers?.length || 0}`);
  expect(results, overlay.body?.balance?.teamASum === 105, 'Overlay Team A seed sum', `sum=${overlay.body?.balance?.teamASum}`);
  expect(results, overlay.body?.balance?.teamBSum === 105, 'Overlay Team B seed sum', `sum=${overlay.body?.balance?.teamBSum}`);

  const swappedTeamA = clone(overlay.body.teamAPlayers);
  const swappedTeamB = clone(overlay.body.teamBPlayers);
  const movedA = swappedTeamA.shift();
  const movedB = swappedTeamB.shift();
  swappedTeamA.push(movedB);
  swappedTeamB.push(movedA);

  const overlaySave = await api(`/api/trips/${tripId}/rydercup?myrtleBeach2026=true`, {
    method: 'PUT',
    admin: true,
    body: JSON.stringify({
      enabled: true,
      teamAName: 'API Team A',
      teamBName: 'API Team B',
      teamAPlayers: swappedTeamA,
      teamBPlayers: swappedTeamB,
      notes: 'API E2E update',
    }),
  });
  expect(results, overlaySave.status === 200, 'Myrtle overlay PUT', `status=${overlaySave.status}`);
  expect(results, overlaySave.body?.teamAName === 'API Team A', 'Overlay Team A rename persisted', overlaySave.body?.teamAName || 'missing');
  expect(results, overlaySave.body?.teamBName === 'API Team B', 'Overlay Team B rename persisted', overlaySave.body?.teamBName || 'missing');
  expect(results, overlaySave.body?.teamAPlayers?.some((player) => player.name === movedB.name), 'Overlay Team A player move persisted', movedB.name);
  expect(results, overlaySave.body?.teamBPlayers?.some((player) => player.name === movedA.name), 'Overlay Team B player move persisted', movedA.name);

  const competition = await api(`/api/trips/${tripId}/competition?myrtleBeach2026=true`);
  expect(results, competition.status === 200, 'Myrtle competition GET', `status=${competition.status}`);
  expect(results, (competition.body?.ryderCup?.rounds?.length || 0) === 5, 'Myrtle Ryder Cup rounds available', `rounds=${competition.body?.ryderCup?.rounds?.length || 0}`);

  const tripBundle = await fetchTripBundle(tripId);
  const firstSlotPlayers = tripBundle.trip.rounds[0].teeTimes[0].players || [];
  const scorePlayerName = firstSlotPlayers[0];

  const scoreSave = await api(`/api/trips/${tripId}/competition/rounds/0/scores?myrtleBeach2026=true`, {
    method: 'PUT',
    admin: true,
    body: JSON.stringify({
      playerName: scorePlayerName,
      holes: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5],
    }),
  });
  const savedPlayerScore = (scoreSave.body?.rounds?.[0]?.playerScores || []).find((entry) => entry.playerName === scorePlayerName);
  expect(results, scoreSave.status === 200, 'Round player score PUT', `status=${scoreSave.status}`);
  expect(results, savedPlayerScore?.grossTotal === 73, 'Round player gross total calculated', `gross=${savedPlayerScore?.grossTotal}`);

  const matchSave = await api(`/api/trips/${tripId}/competition/rounds/0/matches/0?myrtleBeach2026=true`, {
    method: 'PUT',
    admin: true,
    body: JSON.stringify({
      teamA: firstSlotPlayers.slice(0, 2),
      teamB: firstSlotPlayers.slice(2, 4),
    }),
  });
  const savedMatch = (matchSave.body?.rounds?.[0]?.matches || []).find((entry) => Number(entry.slotIndex) === 0);
  expect(results, matchSave.status === 200, 'Round team match PUT', `status=${matchSave.status}`);
  expect(results, Array.isArray(savedMatch?.teamA) && savedMatch.teamA.length === 2, 'Round Team A match saved', JSON.stringify(savedMatch?.teamA || []));
  expect(results, Array.isArray(savedMatch?.teamB) && savedMatch.teamB.length === 2, 'Round Team B match saved', JSON.stringify(savedMatch?.teamB || []));

  const sideGameSave = await api(`/api/trips/${tripId}/competition/rounds/0/side-games?myrtleBeach2026=true`, {
    method: 'PUT',
    admin: true,
    body: JSON.stringify({
      ctpWinners: [{ hole: 7, winners: [firstSlotPlayers[0]], note: 'E2E CTP' }],
      skinsResults: [{ playerName: firstSlotPlayers[1], holes: [1, 2], amount: 20, note: 'E2E skins' }],
    }),
  });
  expect(results, sideGameSave.status === 200, 'Round side-games PUT', `status=${sideGameSave.status}`);
  expect(results, (sideGameSave.body?.rounds?.[0]?.ctpWinners?.length || 0) === 1, 'Round CTP winner saved', JSON.stringify(sideGameSave.body?.rounds?.[0]?.ctpWinners || []));
  expect(results, (sideGameSave.body?.rounds?.[0]?.skinsResults?.length || 0) === 1, 'Round skins result saved', JSON.stringify(sideGameSave.body?.rounds?.[0]?.skinsResults || []));

  const currentCompetition = await api(`/api/trips/${tripId}/competition?myrtleBeach2026=true`);
  const currentRyderRound = clone(currentCompetition.body?.ryderCup?.rounds?.[0] || {});
  currentRyderRound.matches = (currentRyderRound.matches || []).map((match, index) => {
    if (index !== 0) return match;
    return {
      ...match,
      teamAPlayerScores: [80, 82],
      teamBPlayerScores: [81, 83],
      teamAScore: 162,
      teamBScore: 164,
      enteredResult: '',
      notes: 'E2E round scoring',
    };
  });
  const ryderRoundSave = await api(`/api/trips/${tripId}/competition/ryder-cup/rounds/0?myrtleBeach2026=true`, {
    method: 'PUT',
    admin: true,
    body: JSON.stringify(currentRyderRound),
  });
  const savedRyderMatch = ryderRoundSave.body?.ryderCup?.rounds?.[0]?.matches?.[0];
  expect(results, ryderRoundSave.status === 200, 'Ryder Cup round scoring PUT', `status=${ryderRoundSave.status}`);
  expect(results, savedRyderMatch?.teamAScore === 162, 'Ryder Cup team A score saved', `score=${savedRyderMatch?.teamAScore}`);
  expect(results, savedRyderMatch?.teamBScore === 164, 'Ryder Cup team B score saved', `score=${savedRyderMatch?.teamBScore}`);
  expect(results, savedRyderMatch?.result === 'teamA', 'Ryder Cup round winner resolved', `result=${savedRyderMatch?.result}`);

  const currentSettings = clone(currentCompetition.body?.ryderCup || {});
  currentSettings.sideGames = currentSettings.sideGames || {};
  currentSettings.sideGames.dailyLowGross = (currentSettings.sideGames.dailyLowGross || []).map((entry, index) => (
    index === 0
      ? { ...entry, winnerName: firstSlotPlayers[0], amount: 25, notes: 'API daily low gross' }
      : entry
  ));
  currentSettings.sideGames.weeklyLowGross = {
    ...(currentSettings.sideGames.weeklyLowGross || {}),
    winnerName: firstSlotPlayers[1],
    amount: 50,
    notes: 'API weekly low gross',
  };
  currentSettings.payout = {
    ...(currentSettings.payout || {}),
    totalPot: 1200,
  };
  const settingsSave = await api(`/api/trips/${tripId}/competition/ryder-cup/settings?myrtleBeach2026=true`, {
    method: 'PUT',
    admin: true,
    body: JSON.stringify({
      sideGames: currentSettings.sideGames,
      payout: currentSettings.payout,
    }),
  });
  expect(results, settingsSave.status === 200, 'Ryder Cup settings PUT', `status=${settingsSave.status}`);
  expect(results, settingsSave.body?.ryderCup?.sideGames?.dailyLowGross?.[0]?.winnerName === firstSlotPlayers[0], 'Ryder daily low gross saved', settingsSave.body?.ryderCup?.sideGames?.dailyLowGross?.[0]?.winnerName || 'missing');
  expect(results, settingsSave.body?.ryderCup?.payout?.totalPot === 1200, 'Ryder payout total pot saved', `pot=${settingsSave.body?.ryderCup?.payout?.totalPot}`);
}

async function runBrowserFlow(results, tempTripSummary, tripId) {
  const browserPath = resolveBrowserPath();
  expect(results, Boolean(browserPath), 'Browser available', browserPath || 'No Edge/Chrome binary found');
  if (!browserPath) return;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-time-myrtle-browser-'));
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
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForJsonVersion();
    expect(results, true, 'Browser DevTools endpoint', `Listening on ${DEBUG_PORT}`);

    const target = await openTarget(`${BASE}/myrtle/trip-2026.html`);
    const errors = [];
    try {
      await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
        let loaded = false;
        const removeLoad = on('Page.loadEventFired', () => { loaded = true; });
        const removeException = on('Runtime.exceptionThrown', (params) => {
          const details = params.exceptionDetails || {};
          errors.push(details.text || details.exception?.description || 'Runtime exception');
        });
        const removeLog = on('Log.entryAdded', (params) => {
          const entry = params.entry || {};
          if (entry.level === 'error' || entry.source === 'javascript') errors.push(entry.text || 'log error');
        });
        const removeConsole = on('Runtime.consoleAPICalled', (params) => {
          if (params.type === 'error' || params.type === 'assert') {
            const parts = (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean);
            errors.push(parts.join(' ') || params.type);
          }
        });

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Log.enable');
        await send('Network.enable');
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: `(() => {
            const tripList = ${JSON.stringify([tempTripSummary])};
            const adminCode = ${JSON.stringify(ADMIN_CODE)};
            const nativeFetch = window.fetch.bind(window);
            window.__copiedText = '';
            if (!navigator.clipboard) navigator.clipboard = {};
            navigator.clipboard.writeText = (value) => {
              window.__copiedText = String(value || '');
              return Promise.resolve();
            };
            window.prompt = () => adminCode;
            window.fetch = (input, init) => {
              const rawUrl = typeof input === 'string' ? input : ((input && input.url) || '');
              const url = new URL(rawUrl, window.location.origin);
              if (url.pathname === '/api/trips' && url.searchParams.get('myrtleBeach2026') === 'true') {
                return Promise.resolve(new Response(JSON.stringify(tripList), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                }));
              }
              return nativeFetch(input, init);
            };
          })();`
        });
        loaded = false;
        await send('Page.reload', { ignoreCache: true });
        for (let i = 0; i < 60 && !loaded; i += 1) await sleep(250);
        await sleep(1500);

        const pageReady = await waitFor(send, `(() => {
          const edit = document.querySelector('[data-trip-ryder-edit]');
          return !!edit && String(window.tripId || '') === ${JSON.stringify(tripId)};
        })()`, 15000);
        expect(results, pageReady, 'Myrtle page bound to temp trip', pageReady ? tripId : 'page did not bind to temp trip');
        if (!pageReady) return;

        await evalValue(send, `(() => { document.querySelector('[data-trip-ryder-edit]')?.click(); return true; })()`);
        const editOpen = await waitFor(send, `(() => !!document.querySelector('[data-trip-ryder-drag-seed]'))()`);
        expect(results, editOpen, 'Overlay edit mode opens', editOpen ? 'drag handles visible' : 'handles missing');
        if (!editOpen) return;

        await evalValue(send, `(() => {
          const handle = document.querySelector('[data-trip-ryder-team="teamA"] [data-trip-ryder-drag-seed]');
          const target = document.querySelector('[data-trip-ryder-team="teamB"]');
          if (!handle || !target || typeof DataTransfer !== 'function') return false;
          const dataTransfer = new DataTransfer();
          handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
          target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
          handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
          return true;
        })()`);
        const invalidCounts = await waitFor(send, `(() => {
          const save = document.querySelector('[data-trip-ryder-save]');
          const text = document.querySelector('.ryder-overlay-balance')?.textContent || '';
          return !!save && save.disabled === true && /9\\/10/.test(text) && /11\\/10/.test(text);
        })()`);
        expect(results, invalidCounts, 'Overlay drag changes team counts', invalidCounts ? '9/10 and 11/10 shown' : 'drag did not change counts');

        await evalValue(send, `(() => {
          const handle = document.querySelector('[data-trip-ryder-team="teamB"] [data-trip-ryder-drag-seed]');
          const target = document.querySelector('[data-trip-ryder-team="teamA"]');
          if (!handle || !target || typeof DataTransfer !== 'function') return false;
          const dataTransfer = new DataTransfer();
          handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
          target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
          handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
          return true;
        })()`);
        const countsRestored = await waitFor(send, `(() => {
          const save = document.querySelector('[data-trip-ryder-save]');
          const text = document.querySelector('.ryder-overlay-balance')?.textContent || '';
          return !!save && save.disabled === false && /10\\/10/.test(text);
        })()`);
        expect(results, countsRestored, 'Overlay drag restores valid counts', countsRestored ? 'both teams back to 10' : 'counts did not recover');

        await evalValue(send, `(() => {
          const teamA = document.querySelector('[data-trip-ryder-team-name="teamAName"]');
          const teamB = document.querySelector('[data-trip-ryder-team-name="teamBName"]');
          const notes = document.querySelector('[data-trip-ryder-notes]');
          if (teamA) {
            teamA.value = 'Browser Team A';
            teamA.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (teamB) {
            teamB.value = 'Browser Team B';
            teamB.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (notes) {
            notes.value = 'Browser drag-drop save';
            notes.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return true;
        })()`);

        await evalValue(send, `(() => { document.querySelector('[data-trip-ryder-copy="both"]')?.click(); return true; })()`);
        const copied = await waitFor(send, `(() => /BROWSER TEAM A/.test(window.__copiedText || '') && /BROWSER TEAM B/.test(window.__copiedText || ''))()`);
        expect(results, copied, 'Overlay copy-to-clipboard works', copied ? 'copied both team rosters' : 'clipboard stub not updated');

        await evalValue(send, `(() => { document.querySelector('[data-trip-ryder-save]')?.click(); return true; })()`);
        const saved = await waitFor(send, `(() => !!document.querySelector('[data-trip-ryder-edit]') && !document.querySelector('[data-trip-ryder-save]'))()`, 15000);
        expect(results, saved, 'Overlay browser save completes', saved ? 'edit mode closed' : 'save did not complete');

        removeLoad();
        removeException();
        removeLog();
        removeConsole();
      });
    } finally {
      await closeTarget(target.id);
    }

    const overlayAfterBrowserSave = await api(`/api/trips/${tripId}/rydercup?myrtleBeach2026=true`);
    expect(results, overlayAfterBrowserSave.body?.teamAName === 'Browser Team A', 'Overlay browser save persisted Team A name', overlayAfterBrowserSave.body?.teamAName || 'missing');
    expect(results, overlayAfterBrowserSave.body?.teamBName === 'Browser Team B', 'Overlay browser save persisted Team B name', overlayAfterBrowserSave.body?.teamBName || 'missing');
    expect(results, overlayAfterBrowserSave.body?.notes === 'Browser drag-drop save', 'Overlay browser save persisted notes', overlayAfterBrowserSave.body?.notes || 'missing');
    expect(results, errors.length === 0, 'Myrtle page console clean during e2e', errors.join(' | ') || 'no errors');
  } finally {
    browser.kill('SIGTERM');
    setTimeout(() => browser.kill('SIGKILL'), 1200);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

async function main() {
  const results = [];
  if (!ADMIN_CODE) {
    expect(results, false, 'Admin code available', 'ADMIN_WRITE_CODE / ADMIN_CODE / ADMIN_DELETE_CODE is missing');
    console.log(JSON.stringify({ summary: { passed: 0, failed: 1, total: 1 }, results }, null, 2));
    process.exit(1);
  }

  const tempTrip = await createTempMyrtleTrip();
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const booted = await waitForBoot();
    expect(results, booted, 'Server boot', booted ? `Listening on ${PORT}` : `Failed to boot on ${PORT}`);
    if (!booted) throw new Error(`Server failed to boot on ${PORT}`);

    await runApiFlow(results, tempTrip.tripId);

    const refreshedBundle = await fetchTripBundle(tempTrip.tripId);
    await runBrowserFlow(results, refreshedBundle.trip, tempTrip.tripId);
  } finally {
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 1200);
    await tempTrip.cleanup().catch(() => {});
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
