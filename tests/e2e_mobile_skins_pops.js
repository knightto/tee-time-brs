const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');

process.env.E2E_TEST_MODE = '1';

const app = require('../server');
const Event = require('../models/Event');
const { getSecondaryConn } = require('../secondary-conn');

const PORT = Number(process.env.E2E_MOBILE_SKINS_PORT || 0);
const DEBUG_PORT = Number(process.env.E2E_MOBILE_SKINS_DEBUG_PORT || 9246);
const ADMIN_CODE = process.env.SITE_ADMIN_WRITE_CODE || process.env.SITE_ACCESS_CODE || '123';
function eventDateForTodayInEastern() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

const EVENT_DATE = eventDateForTodayInEastern();
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

async function terminateChild(child, forceAfterMs = 2500) {
  if (!child) return;
  if (child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      finish();
    }, forceAfterMs);
    child.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

async function closeServer(server, forceAfterMs = 2500) {
  if (!server || !server.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
      finish();
    }, forceAfterMs);
    server.close(() => {
      clearTimeout(timer);
      finish();
    });
  });
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
    await sleep(200);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function waitForSkinsPopsDraw(eventId, timeoutMs = 10000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const event = await Event.findById(eventId).lean();
    const sharedHoles = Array.isArray(event?.skinsPops?.sharedHoles) ? event.skinsPops.sharedHoles : [];
    const bonusHoles = Array.isArray(event?.skinsPops?.bonusHoles) ? event.skinsPops.bonusHoles : [];
    if (sharedHoles.length === 4 && bonusHoles.length === 2) return event;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for skins pops draw on event ${eventId}`);
}

async function main() {
  const browserPath = resolveBrowserPath();
  if (!browserPath) throw new Error('No Chromium-based browser was found for the mobile skins pops e2e.');

  const server = app.listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const runId = Date.now();
  const course = `Mobile Skins Pops ${runId}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-times-mobile-skins-'));
  let browser = null;
  let eventId = null;

  async function cleanup() {
    if (eventId) await Event.deleteOne({ _id: eventId }).catch(() => {});
    await Event.deleteMany({ course }).catch(() => {});
  }

  try {
    await cleanup();
    const event = await Event.create({
      groupSlug: 'main',
      course,
      date: new Date(`${EVENT_DATE}T00:00:00.000Z`),
      isTeamEvent: false,
      teeTimes: [
        { time: '08:00', players: [] },
        { time: '08:09', players: [] },
      ],
      notes: 'Mobile skins pops regression',
    });
    eventId = String(event._id);

    browser = spawn(browserPath, [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    await waitForJsonVersion();
    const target = await openTarget('about:blank');
    const errors = [];
    try {
      await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
        on('Runtime.exceptionThrown', (params) => {
          const details = params.exceptionDetails || {};
          const text = details.text || details.exception?.description || 'Runtime exception';
          errors.push(text);
        });
        on('Log.entryAdded', (params) => {
          const entry = params.entry || {};
          const text = entry.text || '';
          if (/favicon\.ico/i.test(text)) return;
          if (/ERR_CACHE_WRITE_FAILURE/i.test(text)) return;
          if (entry.level === 'error' || entry.source === 'javascript') errors.push(text || 'log error');
        });
        on('Runtime.consoleAPICalled', (params) => {
          if (params.type === 'error' || params.type === 'assert') {
            const parts = (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean);
            errors.push(parts.join(' ') || params.type);
          }
        });

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Log.enable');
        await send('Network.enable');
        await send('Emulation.setDeviceMetricsOverride', {
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          mobile: true,
        });
        await send('Emulation.setTouchEmulationEnabled', {
          enabled: true,
          maxTouchPoints: 5,
        });

        await send('Page.navigate', { url: `${base}/?date=${encodeURIComponent(EVENT_DATE)}` });
        await waitForExpression(send, `Boolean(document.querySelector('.card[data-event-id="${eventId}"]'))`, 20000);
        await waitForExpression(send, `Boolean(document.querySelector('.card[data-event-id="${eventId}"] [data-toggle-actions]'))`, 10000);

        const skinsButtonLabel = await evaluate(send, `(() => {
          const toggle = document.querySelector('.card[data-event-id="${eventId}"] [data-toggle-actions]');
          if (toggle) toggle.click();
          const button = document.querySelector('.card[data-event-id="${eventId}"] [data-randomize-skins-pops="${eventId}"]');
          return button ? button.textContent.trim() : '';
        })()`);
        assert.ok(/Draw(?:\s+Skins)?\s+Pops/i.test(skinsButtonLabel), 'Skins pops button should render for eligible mobile event');

        await evaluate(send, `(() => {
          const button = document.querySelector('.card[data-event-id="${eventId}"] [data-randomize-skins-pops="${eventId}"]');
          if (!button) return false;
          button.click();
          return true;
        })()`);
        await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open] input[name="adminCode"]'))`, 10000);

        const dialogState = await evaluate(send, `(() => {
          const dialog = document.getElementById('actionModal');
          const input = dialog?.querySelector('input[name="adminCode"]');
          const title = document.getElementById('actionDialogTitle');
          return {
            open: Boolean(dialog && dialog.open),
            title: title ? title.textContent.trim() : '',
            fieldType: input ? input.type : '',
          };
        })()`);
        assert.strictEqual(dialogState.open, true, 'Admin dialog should open on mobile');
        assert.ok(/Draw Skins Pops/i.test(dialogState.title), 'Admin dialog should show the skins pops title');
        assert.strictEqual(dialogState.fieldType, 'password', 'Admin dialog should use password input');

        await evaluate(send, `(() => {
          const input = document.querySelector('#actionModal input[name="adminCode"]');
          if (!input) return false;
          input.focus();
          input.value = ${JSON.stringify(ADMIN_CODE)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          const form = document.getElementById('actionForm');
          const submit = document.getElementById('actionDialogConfirmBtn');
          if (!form || !submit) return false;
          if (typeof form.requestSubmit === 'function') form.requestSubmit(submit);
          else submit.click();
          return true;
        })()`);

        await waitForExpression(send, `Boolean(!document.querySelector('#actionModal[open]'))`, 10000);
        await waitForExpression(send, `(() => {
          const card = document.querySelector('.card[data-event-id="${eventId}"]');
          const text = card?.querySelector('.event-sidegame-box')?.innerText || '';
          return /12–17:/i.test(text) && /18\\+:/i.test(text) && /Drawn/i.test(text);
        })()`, 10000);

        const summaryText = await evaluate(send, `(() => {
          const card = document.querySelector('.card[data-event-id="${eventId}"]');
          return card?.querySelector('.event-sidegame-box')?.innerText || '';
        })()`);
        assert.ok(/12–17:/i.test(summaryText), '12-17 summary should render');
        assert.ok(/18\+:/i.test(summaryText), '18+ summary should render');
        assert.ok(/Drawn/i.test(summaryText), 'Skins pops meta should show draw time');

        await evaluate(send, `sessionStorage.removeItem('teeTimeMainAdminCode')`);
        await send('Page.reload', { ignoreCache: true });
        await waitForExpression(send, `(() => {
          const card = document.querySelector('.card[data-event-id="${eventId}"]');
          if (!card) return false;
          const text = card.querySelector('.event-sidegame-box')?.innerText || '';
          return /Finalized for this event\\./i.test(text);
        })()`, 10000);
        const redrawVisibleWithoutAdmin = await evaluate(send, `Boolean(document.querySelector('.card[data-event-id="${eventId}"] [data-randomize-skins-pops="${eventId}"]'))`);
        assert.strictEqual(redrawVisibleWithoutAdmin, false, 'Re-draw button should be hidden once the draw is locked outside admin mode');
      });
    } finally {
      await closeTarget(target.id);
    }

    assert.deepStrictEqual(errors, [], `Browser console should stay clean during mobile skins pops draw: ${errors.join(' | ')}`);

    const savedEvent = await waitForSkinsPopsDraw(eventId);
    const sharedHoles = savedEvent.skinsPops.sharedHoles.slice().sort((a, b) => a - b);
    const bonusHoles = savedEvent.skinsPops.bonusHoles.slice().sort((a, b) => a - b);
    const allHoles = [...sharedHoles, ...bonusHoles];

    assert.strictEqual(sharedHoles.length, 4, '12-17 holes should save four picks');
    assert.strictEqual(bonusHoles.length, 2, 'Bonus holes should save two picks');
    assert.strictEqual(new Set(allHoles).size, 6, '12-17 and 18+ holes should be unique');
    assert.ok(allHoles.every((value) => Number.isInteger(value) && value >= 1 && value <= 17), 'All skins pops holes should stay within 1-17');

    console.log('e2e_mobile_skins_pops.js passed');
  } finally {
    if (browser) {
      await terminateChild(browser);
    }
    await cleanup().catch(() => {});
    await closeServer(server).catch(() => {});
    await mongoose.connection.close().catch(() => {});
    const secondary = getSecondaryConn();
    if (secondary) await secondary.close().catch(() => {});
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((error) => {
  console.error('e2e_mobile_skins_pops.js failed', error);
  process.exitCode = 1;
});
