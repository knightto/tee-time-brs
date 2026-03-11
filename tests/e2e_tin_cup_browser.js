const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

const PORT = Number(process.env.E2E_PORT || 5055);
const BASE = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = Number(process.env.E2E_TIN_CUP_BROWSER_DEBUG_PORT || 9224);
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

function resolveBrowserPath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function waitForBoot() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const health = await fetch(`${BASE}/api/health`);
      if (health.status === 200) return true;
    } catch {}
    await sleep(500);
  }
  return false;
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

async function runTinCupLiveFlow(results) {
  const target = await openTarget(`${BASE}/tin-cup/live-score-entry.html?local=1`);
  const errors = [];
  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
      let loaded = false;
      const removeLoad = on('Page.loadEventFired', () => { loaded = true; });
      const removeException = on('Runtime.exceptionThrown', (params) => {
        const details = params.exceptionDetails || {};
        const text = details.text || details.exception?.description || 'Runtime exception';
        errors.push(text);
      });
      const removeLog = on('Log.entryAdded', (params) => {
        const entry = params.entry || {};
        const textValue = entry.text || 'log error';
        if (/favicon\.ico/i.test(textValue)) return;
        if (entry.level === 'error' || entry.source === 'javascript') errors.push(textValue);
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
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

      for (let i = 0; i < 40 && !loaded; i += 1) await sleep(250);
      await sleep(800);

      await evalValue(send, `(() => {
        localStorage.removeItem('tinCupLiveLocalStateV1');
        localStorage.removeItem('tinCupScoringStateV2');
        localStorage.removeItem('tinCupScorecardCodesV1');
        sessionStorage.clear();
        window.prompt = () => 'E2E Scorer';
        return true;
      })()`);

      const openerExists = await waitFor(send, `(() => !!document.querySelector('[data-open-scorecard="Day 1|0"]'))()`);
      expect(results, openerExists, 'Tin Cup open button rendered', openerExists ? 'Day 1 Group 1 available' : 'missing');
      if (!openerExists) return { errors };

      await evalValue(send, `(() => { document.querySelector('[data-open-scorecard="Day 1|0"]').click(); return true; })()`);
      const opened = await waitFor(send, `(() => {
        const holeCard = document.getElementById('holeEntryCard');
        const status = document.getElementById('status');
        return holeCard && holeCard.style.display === 'block' && /opened/i.test((status && status.textContent) || '');
      })()`);
      expect(results, opened, 'Tin Cup scorecard opens', opened ? 'hole entry visible' : 'scorecard did not open');

      const openingState = await evalValue(send, `(() => ({
        title: document.getElementById('scorecardTitle')?.textContent || '',
        holeLabel: document.querySelector('.hole-nav-hole')?.textContent || '',
        mobile: document.body.classList.contains('mobile-scorecard-active')
      }))()`);
      expect(results, /Day 1/.test(openingState.title || ''), 'Tin Cup title populated', openingState.title || 'missing');
      expect(results, /Hole 1/.test(openingState.holeLabel || ''), 'Tin Cup starts on current hole', openingState.holeLabel || 'missing');
      expect(results, openingState.mobile === true, 'Tin Cup mobile scorecard mode toggled', String(openingState.mobile));

      await evalValue(send, `(() => { const btn = document.querySelector('[data-toggle-full-scorecard="1"]'); if (btn) btn.click(); return true; })()`);
      const fullShown = await waitFor(send, `(() => document.getElementById('scorecardCard')?.style.display === 'block')()`);
      expect(results, fullShown, 'Tin Cup full scorecard opens', fullShown ? 'scorecard panel visible' : 'scorecard panel hidden');

      await evalValue(send, `(() => { const btn = document.getElementById('hideFullScorecardBtn'); if (btn) btn.click(); return true; })()`);
      const fullHidden = await waitFor(send, `(() => document.getElementById('scorecardCard')?.style.display === 'none')()`);
      expect(results, fullHidden, 'Tin Cup full scorecard hides', fullHidden ? 'scorecard panel hidden' : 'scorecard panel still visible');

      await evalValue(send, `saveHole('Matt', 1, 4).then(() => true)`);
      const scoreSaved = await waitFor(send, `(() => {
        const row = Array.from(document.querySelectorAll('.hole-player-row')).find((node) => /Matt/.test(node.innerText || ''));
        const value = row && row.querySelector('.hole-current-value');
        const status = document.getElementById('status');
        return value && value.textContent.trim() === '4' && /Saved Matt H1/.test((status && status.textContent) || '');
      })()`);
      const savedDetail = await evalValue(send, `(() => document.getElementById('status')?.textContent || '')()`);
      expect(results, scoreSaved, 'Tin Cup hole score updates in UI', scoreSaved ? 'Matt H1 = 4' : (savedDetail || 'save state missing')); 

      await evalValue(send, `(() => { currentHole = 3; renderHoleEntry(active.view); renderMarkers(active.view); return true; })()`);
      const hole3 = await waitFor(send, `(() => /Hole 3/.test(document.querySelector('.hole-nav-hole')?.textContent || ''))()`);
      expect(results, hole3, 'Tin Cup hole navigation advances', hole3 ? 'navigated to hole 3' : 'did not reach hole 3');

      const ctpVisible = await waitFor(send, `(() => /Closest To Pin/i.test(document.getElementById('markerTableWrap')?.innerText || ''))()`);
      expect(results, ctpVisible, 'Tin Cup CTP marker appears on par 3', ctpVisible ? 'marker visible on hole 3' : 'marker missing');

      await evalValue(send, `saveMarker('ctp', 3, 'Matt').then(() => true)`);
      const ctpSaved = await waitFor(send, `(() => {
        const input = document.querySelector('[data-marker-input="ctp|3"]');
        const status = document.getElementById('status');
        return input && input.value === 'Matt' && /Saved CTP H3/.test((status && status.textContent) || '');
      })()`);
      const markerDetail = await evalValue(send, `(() => document.getElementById('status')?.textContent || '')()`);
      expect(results, ctpSaved, 'Tin Cup CTP marker updates in UI', ctpSaved ? 'CTP H3 = Matt' : (markerDetail || 'marker save missing')); 

      removeLoad();
      removeException();
      removeLog();
      removeConsole();
      expect(results, errors.length === 0, 'Tin Cup live entry console clean', errors.join(' | ') || 'no errors');
      return { errors };
    });
  } finally {
    await closeTarget(target.id);
  }
}

async function runTinCupLeaderboardFlow(results) {
  const target = await openTarget(`${BASE}/tin-cup/leaderboard-2026.html`);
  const errors = [];
  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
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
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Network.enable');
      for (let i = 0; i < 40 && !loaded; i += 1) await sleep(250);
      await sleep(1200);

      const boardReady = await waitFor(send, `(() => !!document.querySelector('#tripBoard table') && /Matt/.test(document.body.innerText || ''))()`);
      expect(results, boardReady, 'Tin Cup leaderboard renders from local state', boardReady ? 'trip board visible' : 'trip board missing');

      const refreshText = await evalValue(send, `(() => document.getElementById('refreshNote')?.textContent || '')()`);
      expect(results, /Last refresh:/i.test(refreshText || ''), 'Tin Cup leaderboard refresh note shown', refreshText || 'missing');

      removeLoad();
      removeException();
      removeLog();
      expect(results, errors.length === 0, 'Tin Cup leaderboard console clean', errors.join(' | ') || 'no errors');
      return { errors };
    });
  } finally {
    await closeTarget(target.id);
  }
}

async function main() {
  const results = [];
  const browserPath = resolveBrowserPath();
  if (!browserPath) {
    expect(results, false, 'Browser available', 'No Edge/Chrome binary found');
    console.log(JSON.stringify({ summary: { passed: 0, failed: 1, total: 1 }, results }, null, 2));
    process.exit(1);
  }
  expect(results, true, 'Browser available', browserPath);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-time-tin-cup-browser-'));
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
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    const booted = await waitForBoot();
    expect(results, booted, 'Server boot', booted ? `Listening on ${PORT}` : `Failed to boot on ${PORT}`);
    if (!booted) throw new Error(`Server failed to boot on ${PORT}`);
    await waitForJsonVersion();
    expect(results, true, 'Browser DevTools endpoint', `Listening on ${DEBUG_PORT}`);

    await runTinCupLiveFlow(results);
    await runTinCupLeaderboardFlow(results);
  } finally {
    browser.kill('SIGTERM');
    server.kill('SIGTERM');
    setTimeout(() => {
      browser.kill('SIGKILL');
      server.kill('SIGKILL');
    }, 1200);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(JSON.stringify({ summary: { passed, failed, total: results.length }, results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
