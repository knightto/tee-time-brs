const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');

const app = require('../server');
const { getSecondaryConn } = require('../secondary-conn');
const Event = require('../models/Event');
const SeniorsGolfer = require('../models/SeniorsGolfer');

const PORT = Number(process.env.E2E_SENIORS_PICKER_PORT || 0);
const DEBUG_PORT = Number(process.env.E2E_SENIORS_PICKER_DEBUG_PORT || 9247);
const SENIORS_ADMIN_CODE = '000';
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    }
  });

  function send(method, params = {}) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  try {
    return await fn({ send });
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
    await sleep(200);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function main() {
  const browserPath = resolveBrowserPath();
  if (!browserPath) throw new Error('No Chromium-based browser was found for the seniors roster picker e2e.');

  const server = app.listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const runId = Date.now();
  const eventDate = '2031-04-17';
  const teeCourse = `Seniors Picker Tee ${runId}`;
  const signupCourse = `Seniors Picker Signup ${runId}`;
  const golferA = `Alice Picker ${runId}`;
  const golferB = `Bob Picker ${runId}`;
  const golferC = `Charlie Picker ${runId}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-times-seniors-picker-'));
  let browser;

  async function cleanup() {
    await Event.deleteMany({ course: { $in: [teeCourse, signupCourse] } }).catch(() => {});
    await SeniorsGolfer.deleteMany({ name: { $in: [golferA, golferB, golferC] } }).catch(() => {});
  }

  try {
    await cleanup();

    await SeniorsGolfer.create([
      { groupSlug: 'seniors', name: golferA, handicapIndex: 11.2, active: true },
      { groupSlug: 'seniors', name: golferB, handicapIndex: 14.6, active: true },
      { groupSlug: 'seniors', name: golferC, handicapIndex: 18.4, active: true },
    ]);

    const { response: teeEventResponse, payload: teeEvent } = await jsonFetch(`${base}/api/events?group=seniors&code=${encodeURIComponent(SENIORS_ADMIN_CODE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: teeCourse,
        date: eventDate,
        teeTime: '09:00',
        isTeamEvent: false,
      }),
    });
    assert.strictEqual(teeEventResponse.status, 201, 'Seniors tee-time event should create');
    assert.ok(Array.isArray(teeEvent.teeTimes) && teeEvent.teeTimes.length >= 2, 'Seniors tee-time event should have open tee times');
    const assignedTee = teeEvent.teeTimes[0];
    const openTee = teeEvent.teeTimes[1];

    const { response: addPlayerResponse, payload: addPlayerPayload } = await jsonFetch(`${base}/api/events/${teeEvent._id}/tee-times/${assignedTee._id}/players?group=seniors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: golferA }),
    });
    assert.strictEqual(addPlayerResponse.status, 200, 'Assigned seniors golfer should add to tee time');
    const addedPlayer = ((addPlayerPayload.teeTimes || []).find((entry) => String(entry._id) === String(assignedTee._id)) || {}).players?.find((entry) => entry.name === golferA);
    assert.ok(addedPlayer && addedPlayer._id, 'Added tee-time golfer should be returned');

    const { response: signupEventResponse, payload: signupEvent } = await jsonFetch(`${base}/api/events?group=seniors&code=${encodeURIComponent(SENIORS_ADMIN_CODE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: signupCourse,
        date: eventDate,
        seniorsRegistrationMode: 'event-only',
        seniorsEventType: 'outing',
      }),
    });
    assert.strictEqual(signupEventResponse.status, 201, 'Seniors event-only signup event should create');

    const { response: signupResponse, payload: signupPayload } = await jsonFetch(`${base}/api/events/${signupEvent._id}/seniors-register?group=seniors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: golferB }),
    });
    assert.strictEqual(signupResponse.status, 200, 'Seniors event signup should succeed');
    const registration = Array.isArray(signupPayload.event?.seniorsRegistrations)
      ? signupPayload.event.seniorsRegistrations.find((entry) => entry.name === golferB)
      : null;
    assert.ok(registration && registration._id, 'Seniors event signup should create a registration');

    browser = spawn(browserPath, [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      'about:blank',
    ], { stdio: 'ignore' });

    await waitForJsonVersion();
    const target = await openTarget(`${base}/?group=seniors&date=${encodeURIComponent(eventDate)}`);
    try {
      await withCdp(target.webSocketDebuggerUrl, async ({ send }) => {
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.navigate', { url: `${base}/?group=seniors&date=${encodeURIComponent(eventDate)}` });
        await waitForExpression(send, `Boolean(document.querySelector('[data-add-player="${teeEvent._id}:${openTee._id}"]'))`, 20000);
        await waitForExpression(send, `Boolean(document.querySelector('[data-seniors-register="${signupEvent._id}"]'))`, 20000);

        await evaluate(send, `document.querySelector('[data-add-player="${teeEvent._id}:${openTee._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        const teeOptionsBefore = await evaluate(send, `Array.from(document.querySelectorAll('#actionModal select[name="name"] option')).map((node) => node.value)`);
        assert.ok(!teeOptionsBefore.includes(golferA), 'Assigned tee-time golfer should be hidden from tee-time add options');
        assert.ok(teeOptionsBefore.includes(golferB), 'Unassigned golfer should remain available in tee-time add options');
        assert.ok(teeOptionsBefore.includes(golferC), 'Other unassigned golfer should remain available in tee-time add options');
        await evaluate(send, `document.getElementById('actionModal').close('cancel')`);
        await waitForExpression(send, `Boolean(document.getElementById('actionModal') && !document.getElementById('actionModal').open)`);
        await sleep(250);

        await evaluate(send, `document.querySelector('[data-seniors-register="${signupEvent._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        const signupOptionsBefore = await evaluate(send, `Array.from(document.querySelectorAll('#actionModal select[name="name"] option')).map((node) => node.value)`);
        assert.ok(!signupOptionsBefore.includes(golferB), 'Existing signup golfer should be hidden from event signup options');
        assert.ok(signupOptionsBefore.includes(golferA), 'Unregistered golfer should remain available in event signup options');
        assert.ok(signupOptionsBefore.includes(golferC), 'Other unregistered golfer should remain available in event signup options');
        await evaluate(send, `document.getElementById('actionModal').close('cancel')`);
        await waitForExpression(send, `Boolean(document.getElementById('actionModal') && !document.getElementById('actionModal').open)`);
        await sleep(250);

        await evaluate(send, `document.querySelector('[data-seniors-register="${signupEvent._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        await evaluate(send, `(() => {
          const select = document.querySelector('#actionModal select[name="name"]');
          if (!select) return false;
          select.value = ${JSON.stringify(golferC)};
          document.getElementById('actionDialogConfirmBtn').click();
          return true;
        })()`);
        await waitForExpression(
          send,
          `(() => {
            const card = document.querySelector('[data-event-id="${signupEvent._id}"]');
            if (!card) return false;
            const signupCount = card.querySelector('.maybe-count-pill');
            const chipNames = Array.from(card.querySelectorAll('.chip-name')).map((node) => node.textContent.trim());
            return signupCount && signupCount.textContent.includes('2 signed up') && chipNames.includes(${JSON.stringify(golferC)});
          })()`,
          20000
        );

        await evaluate(send, `document.querySelector('[data-seniors-register="${signupEvent._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        const signupOptionsAfterInlineAdd = await evaluate(send, `Array.from(document.querySelectorAll('#actionModal select[name="name"] option')).map((node) => node.value)`);
        assert.ok(!signupOptionsAfterInlineAdd.includes(golferC), 'Newly signed-up golfer should be removed from options without a page reload');
        await evaluate(send, `document.getElementById('actionModal').close('cancel')`);
        await waitForExpression(send, `Boolean(document.getElementById('actionModal') && !document.getElementById('actionModal').open)`);
        await sleep(250);

        await evaluate(send, `(() => {
          const chips = Array.from(document.querySelectorAll('[data-event-id="${signupEvent._id}"] .chip'));
          const target = chips.find((chip) => {
            const name = chip.querySelector('.chip-name');
            return name && name.textContent.trim() === ${JSON.stringify(golferC)};
          });
          const removeButton = target && target.querySelector('[data-remove-seniors-registration]');
          if (!removeButton) return false;
          removeButton.click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open]'))`);
        await evaluate(send, `document.getElementById('actionDialogConfirmBtn').click()`);
        await waitForExpression(
          send,
          `(() => {
            const card = document.querySelector('[data-event-id="${signupEvent._id}"]');
            if (!card) return false;
            const signupCount = card.querySelector('.maybe-count-pill');
            const chipNames = Array.from(card.querySelectorAll('.chip-name')).map((node) => node.textContent.trim());
            return signupCount && signupCount.textContent.includes('1 signed up') && !chipNames.includes(${JSON.stringify(golferC)});
          })()`,
          20000
        );

        await evaluate(send, `document.querySelector('[data-seniors-register="${signupEvent._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        const signupOptionsAfterInlineRemove = await evaluate(send, `Array.from(document.querySelectorAll('#actionModal select[name="name"] option')).map((node) => node.value)`);
        assert.ok(signupOptionsAfterInlineRemove.includes(golferC), 'Removed signup golfer should return to options without a page reload');
        await evaluate(send, `document.getElementById('actionModal').close('cancel')`);
        await waitForExpression(send, `Boolean(document.getElementById('actionModal') && !document.getElementById('actionModal').open)`);
      });
    } finally {
      await closeTarget(target.id);
    }

    const removePlayerResponse = await fetch(`${base}/api/events/${teeEvent._id}/tee-times/${assignedTee._id}/players/${addedPlayer._id}?group=seniors`, {
      method: 'DELETE',
      headers: { 'x-delete-confirmed': 'true' },
    });
    assert.strictEqual(removePlayerResponse.status, 200, 'Removing a seniors tee-time golfer should succeed');

    const removeSignupResponse = await fetch(`${base}/api/events/${signupEvent._id}/seniors-registrations/${registration._id}?group=seniors`, {
      method: 'DELETE',
    });
    assert.strictEqual(removeSignupResponse.status, 200, 'Removing a seniors event signup should succeed');

    const refreshTarget = await openTarget(`${base}/?group=seniors&date=${encodeURIComponent(eventDate)}`);
    try {
      await withCdp(refreshTarget.webSocketDebuggerUrl, async ({ send }) => {
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.navigate', { url: `${base}/?group=seniors&date=${encodeURIComponent(eventDate)}` });
        await waitForExpression(send, `Boolean(document.querySelector('[data-add-player="${teeEvent._id}:${openTee._id}"]'))`, 20000);
        await waitForExpression(send, `Boolean(document.querySelector('[data-seniors-register="${signupEvent._id}"]'))`, 20000);

        await evaluate(send, `document.querySelector('[data-add-player="${teeEvent._id}:${openTee._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        const teeOptionsAfter = await evaluate(send, `Array.from(document.querySelectorAll('#actionModal select[name="name"] option')).map((node) => node.value)`);
        assert.ok(teeOptionsAfter.includes(golferA), 'Removed tee-time golfer should return to the add options');
        await evaluate(send, `document.getElementById('actionModal').close('cancel')`);
        await sleep(250);

        await evaluate(send, `document.querySelector('[data-seniors-register="${signupEvent._id}"]').click()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] select[name="name"]'))`);
        const signupOptionsAfter = await evaluate(send, `Array.from(document.querySelectorAll('#actionModal select[name="name"] option')).map((node) => node.value)`);
        assert.ok(signupOptionsAfter.includes(golferB), 'Removed signup golfer should return to the event signup options');
        await evaluate(send, `document.getElementById('actionModal').close('cancel')`);
      });
    } finally {
      await closeTarget(refreshTarget.id);
    }

    console.log('e2e_seniors_roster_picker.js passed');
  } finally {
    if (browser) {
      browser.kill();
      await new Promise((resolve) => browser.once('exit', resolve)).catch(() => {});
    }
    await cleanup().catch(() => {});
    await new Promise((resolve) => server.close(resolve)).catch(() => {});
    await mongoose.connection.close().catch(() => {});
    const secondary = getSecondaryConn();
    if (secondary) await secondary.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('e2e_seniors_roster_picker.js failed', error);
  process.exitCode = 1;
});
