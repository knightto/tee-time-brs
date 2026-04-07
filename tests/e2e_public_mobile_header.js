const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

const PORT = Number(process.env.E2E_PUBLIC_MOBILE_PORT || 5056);
const BASE = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = Number(process.env.E2E_PUBLIC_MOBILE_DEBUG_PORT || 9248);
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const PAGE_SPECS = [
  { label: 'Main public page', path: '/', expectInfoVisible: true, expectSeniorsBadgeVisible: false },
  { label: 'Seniors public page', path: '/?group=seniors', expectInfoVisible: true, expectSeniorsBadgeVisible: false },
];

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
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {}
    await sleep(500);
  }
  return false;
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

async function inspectPublicPage(spec) {
  const target = await openTarget(`${BASE}${spec.path}`);
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
        const text = entry.text || 'log error';
        if (/favicon\.ico/i.test(text)) return;
        if (entry.level === 'error' || entry.source === 'javascript') errors.push(text);
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
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });

      loaded = false;
      await send('Page.navigate', { url: `${BASE}${spec.path}` });
      for (let i = 0; i < 40 && !loaded; i += 1) await sleep(250);
      await waitForExpression(send, `Boolean(document.querySelector('.topbar') && document.querySelector('.calendar-sidebar'))`, 20000);
      await sleep(800);

      const metrics = await evaluate(send, `(() => {
        const topbar = document.querySelector('.topbar');
        const topbarLinks = document.querySelector('.topbar-links');
        const title = document.getElementById('topbarTitleText');
        const subscribe = document.getElementById('openSubscribeBtn');
        const info = document.querySelector('.topbar-dropdown');
        const calendar = document.querySelector('.calendar-sidebar');
        const visible = (node) => {
          if (!node) return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const topbarRect = topbar ? topbar.getBoundingClientRect() : { top: 0, bottom: 0, height: 0 };
        const titleRect = title ? title.getBoundingClientRect() : { height: 0 };
        const subscribeRect = subscribe ? subscribe.getBoundingClientRect() : { right: 0 };
        const calendarRect = calendar ? calendar.getBoundingClientRect() : { top: 0, width: 0 };
        const titleAfter = title ? getComputedStyle(title, '::after') : null;
        return {
          readyState: document.readyState,
          title: document.title,
          topbarDisplay: topbar ? getComputedStyle(topbar).display : '',
          topbarHeight: Math.round(topbarRect.height),
          topbarBottom: Math.round(topbarRect.bottom),
          topbarLinksDirection: topbarLinks ? getComputedStyle(topbarLinks).flexDirection : '',
          titleText: title ? title.textContent.trim() : '',
          titleHeight: Math.round(titleRect.height),
          subscribeVisible: visible(subscribe),
          subscribeRight: Math.round(subscribeRect.right),
          infoVisible: visible(info),
          seniorsBadgeVisible: Boolean(
            titleAfter
            && titleAfter.display !== 'none'
            && titleAfter.content
            && titleAfter.content !== 'none'
            && titleAfter.content !== 'normal'
            && titleAfter.content !== '""'
          ),
          calendarTop: Math.round(calendarRect.top),
          calendarWidth: Math.round(calendarRect.width),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth > (window.innerWidth + 1),
          overflowAmount: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          bodyTextLength: (document.body?.innerText || '').trim().length,
        };
      })()`);

      removeLoad();
      removeException();
      removeLog();
      removeConsole();
      return { metrics, errors };
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-time-public-mobile-'));
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), E2E_TEST_MODE: '1' },
    stdio: 'ignore',
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
  ], { stdio: 'ignore' });

  try {
    const booted = await waitForBoot();
    expect(results, booted, 'Server boot', `Listening on ${PORT}`);
    if (!booted) {
      console.log(JSON.stringify({ summary: summarize(results), results }, null, 2));
      process.exit(1);
    }

    await waitForJsonVersion();

    for (const spec of PAGE_SPECS) {
      const { metrics, errors } = await inspectPublicPage(spec);
      const detail = JSON.stringify(metrics);
      expect(results, metrics.readyState === 'complete', `${spec.label} ready`, detail);
      expect(results, metrics.bodyTextLength > 100, `${spec.label} rendered content`, detail);
      expect(results, metrics.topbarDisplay === 'grid', `${spec.label} uses compact mobile topbar grid`, detail);
      expect(results, metrics.topbarLinksDirection === 'column', `${spec.label} stacks header actions on mobile`, detail);
      expect(results, metrics.topbarHeight > 0 && metrics.topbarHeight <= 118, `${spec.label} topbar height stays compact`, detail);
      expect(results, metrics.titleHeight > 0 && metrics.titleHeight <= 78, `${spec.label} title stays compact`, detail);
      expect(results, metrics.subscribeVisible, `${spec.label} subscribe button visible`, detail);
      expect(results, metrics.subscribeRight <= metrics.viewportWidth, `${spec.label} subscribe button stays inside viewport`, detail);
      expect(results, metrics.infoVisible === spec.expectInfoVisible, `${spec.label} info control visibility`, detail);
      expect(results, metrics.seniorsBadgeVisible === spec.expectSeniorsBadgeVisible, `${spec.label} seniors badge visibility`, detail);
      expect(results, metrics.calendarTop >= metrics.topbarBottom && metrics.calendarTop <= (metrics.topbarBottom + 24), `${spec.label} calendar stays close to header`, detail);
      expect(results, metrics.calendarWidth <= (metrics.viewportWidth - 8), `${spec.label} calendar fits mobile viewport`, detail);
      expect(results, !metrics.horizontalOverflow, `${spec.label} avoids horizontal overflow`, detail);
      expect(results, errors.length === 0, `${spec.label} console clean`, errors.join(' | ') || detail);
    }

    const summary = summarize(results);
    console.log(JSON.stringify({ summary, results }, null, 2));
    if (summary.failed) process.exit(1);
  } finally {
    if (server.exitCode === null && !server.killed) server.kill('SIGTERM');
    if (browser.exitCode === null && !browser.killed) browser.kill('SIGTERM');
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

function summarize(results) {
  const total = results.length;
  const failed = results.filter((result) => !result.ok).length;
  return { passed: total - failed, failed, total };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
