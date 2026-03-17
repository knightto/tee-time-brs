const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

const PORT = Number(process.env.E2E_PORT || 5055);
const BASE = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = Number(process.env.E2E_BROWSER_DEBUG_PORT || 9233);
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const PAGE_SPECS = [
  { path: '/', label: 'Home', selector: 'body' },
  { path: '/myrtle/trip-2026.html', label: 'Myrtle Trip', selector: 'body' },
  { path: '/myrtle/lodging-and-maps.html', label: 'Myrtle Lodging', selector: 'body' },
  { path: '/tin-cup/trip-2026.html', label: 'Tin Cup Trip', selector: '.container' },
  { path: '/tin-cup/admin-guide.html', label: 'Tin Cup Admin Guide', selector: '.guide-wrap, main, body' },
  { path: '/tin-cup/live-score-entry.html', label: 'Tin Cup Live Entry', selector: '.container, main, body' },
  { path: '/tin-cup/leaderboard-2026.html', label: 'Tin Cup Leaderboard', selector: '.container, main, body' },
  { path: '/blue-ridge-outings.html', label: 'Blue Ridge Outings', selector: 'body' },
  { path: '/valley-sip-and-smoke.html', label: 'Valley Sip and Smoke', selector: 'body' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expect(results, condition, name, detail = '') {
  results.push({ ok: Boolean(condition), name, detail });
}

async function api(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, opts);
  return { status: res.status, text: await res.text() };
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
  if (!res.ok) {
    throw new Error(`Failed to create browser target for ${url}: status=${res.status}`);
  }
  return res.json();
}

async function closeTarget(id) {
  try {
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${id}`);
  } catch {}
}

async function withCdp(webSocketUrl, fn) {
  if (typeof WebSocket !== 'function') {
    throw new Error('Global WebSocket is not available in this Node runtime');
  }
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
    for (const { reject } of pending.values()) {
      reject(new Error('CDP connection closed'));
    }
    pending.clear();
    ws.close();
  }
}

async function inspectPage(spec) {
  const target = await openTarget(`${BASE}${spec.path}`);
  const errors = [];
  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send, on }) => {
      let loaded = false;
      const removeLoad = on('Page.loadEventFired', () => {
        loaded = true;
      });
      const removeException = on('Runtime.exceptionThrown', (params) => {
        const details = params.exceptionDetails || {};
        const text = details.text || details.exception?.description || 'Runtime exception';
        const location = [details.url, details.lineNumber, details.columnNumber].filter((v) => v !== undefined && v !== '').join(':');
        errors.push(`exception: ${text}${location ? ` @ ${location}` : ''}`);
      });
      const removeLog = on('Log.entryAdded', (params) => {
        const entry = params.entry || {};
        if (entry.level === 'error' || entry.source === 'javascript') {
          errors.push(`log:${entry.level || entry.source}: ${entry.text || 'unknown error'}`);
        }
      });
      const requestMap = new Map();
      const removeConsole = on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'error' || params.type === 'assert') {
          const parts = (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean);
          errors.push(`console:${params.type}: ${parts.join(' ')}`.trim());
        }
      });
      const removeRequest = on('Network.requestWillBeSent', (params) => {
        requestMap.set(params.requestId, params.request?.url || '');
      });
      const removeResponse = on('Network.responseReceived', (params) => {
        const url = params.response?.url || requestMap.get(params.requestId) || '';
        const status = params.response?.status;
        if (url.includes('favicon.ico')) return;
        if (typeof status === 'number' && status >= 400) {
          errors.push(`response:${status}: ${url}`);
        }
      });
      const removeLoadingFailed = on('Network.loadingFailed', (params) => {
        const url = requestMap.get(params.requestId) || '';
        if (url.includes('favicon.ico')) return;
        errors.push(`network:${params.errorText || 'failed'}: ${url}`.trim());
      });

      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Network.enable');

      for (let i = 0; i < 40 && !loaded; i += 1) {
        await sleep(250);
      }
      await sleep(1200);

      const state = await send('Runtime.evaluate', {
        expression: `(() => {
          const sel = ${JSON.stringify(spec.selector)};
          const node = document.querySelector(sel);
          return JSON.stringify({
            readyState: document.readyState,
            title: document.title,
            hasSelector: !!node,
            bodyTextLength: (document.body?.innerText || '').trim().length,
          });
        })()`,
        returnByValue: true,
      });
      const value = JSON.parse(state.result.value);

      removeLoad();
      removeException();
      removeLog();
      removeConsole();
      removeRequest();
      removeResponse();
      removeLoadingFailed();

      return {
        targetId: target.id,
        readyState: value.readyState,
        title: value.title,
        hasSelector: value.hasSelector,
        bodyTextLength: value.bodyTextLength,
        errors,
      };
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-time-browser-'));
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
    if (!booted) {
      throw new Error(`Server failed to boot on ${PORT}`);
    }

    await waitForJsonVersion();
    expect(results, true, 'Browser DevTools endpoint', `Listening on ${DEBUG_PORT}`);

    for (const spec of PAGE_SPECS) {
      const http = await api(spec.path);
      expect(results, http.status === 200, `HTTP ${spec.path}`, `status=${http.status}`);
      const page = await inspectPage(spec);
      expect(results, page.readyState === 'complete', `Browser load ${spec.label}`, `readyState=${page.readyState}`);
      expect(results, page.hasSelector, `Browser DOM ${spec.label}`, `selector=${spec.selector}`);
      expect(results, page.bodyTextLength > 40, `Browser content ${spec.label}`, `chars=${page.bodyTextLength}`);
      expect(results, page.errors.length === 0, `Browser console ${spec.label}`, page.errors.join(' | ') || 'no errors');
    }
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
