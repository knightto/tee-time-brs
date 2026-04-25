const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');

const app = require('../server');
const { getSecondaryConn } = require('../secondary-conn');
const Event = require('../models/Event');

const DEBUG_PORT = Number(process.env.E2E_PUBLIC_EVENT_LAYOUT_DEBUG_PORT || 9256);
const BROWSER_CANDIDATES = [
  process.env.E2E_BROWSER_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const DEVICE_SPECS = [
  { label: 'mobile', width: 390, height: 844, mobile: true },
  { label: 'desktop', width: 1280, height: 960, mobile: false },
];

const PAGE_SPECS = [
  { label: 'main', path: '' },
  { label: 'seniors', path: '?group=seniors' },
];

function debugLog(message) {
  if (String(process.env.LAYOUT_TEST_DEBUG || '').trim() !== '1') return;
  console.log(`[layout-debug] ${message}`);
}

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

async function inspectPage(targetUrl, device, options = {}) {
  debugLog(`inspect start ${device.label} ${targetUrl}`);
  const target = await openTarget(targetUrl);
  try {
    return await withCdp(target.webSocketDebuggerUrl, async ({ send }) => {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Emulation.setDeviceMetricsOverride', {
        width: device.width,
        height: device.height,
        deviceScaleFactor: device.mobile ? 2 : 1,
        mobile: device.mobile,
      });
      await send('Page.navigate', { url: targetUrl });
      await waitForExpression(send, `Boolean(document.querySelector('.card'))`, 20000);
      await sleep(1200);
      await evaluate(send, `(() => {
        document.querySelectorAll('[data-toggle-actions]').forEach((button) => {
          if (!button.closest('.card.actions-open')) button.click();
        });
        return true;
      })()`);
      await sleep(250);
      await evaluate(send, `(() => {
        const removeBtn = document.querySelector('[data-del-player]');
        if (removeBtn) removeBtn.click();
        return Boolean(removeBtn);
      })()`);
      await waitForExpression(send, `Boolean(document.querySelector('#actionModal[open]'))`, 10000);
      await sleep(150);
      const expectAddPlayerDialog = options.expectAddPlayerDialog ? 'true' : 'false';
      const addPlayerCourseName = JSON.stringify(String(options.addPlayerCourseName || ''));
      const expectAddFifthDialog = options.expectAddFifthDialog ? 'true' : 'false';
      const addFifthCourseName = JSON.stringify(String(options.addFifthCourseName || ''));
      return evaluate(send, `(async () => {
        const SELECTORS = [
          '.event-controls',
          '.event-control-btn',
          '#requestClubTimeBtn',
          '#lastUpdated',
          '.card-title',
          '.card-title-link',
          '.card-date-badge',
          '.weather-summary',
          '.course-detail-item',
          '.maybe-btn',
          '.maybe-name',
          '.maybe-chip',
          '.chip',
          '.chip-name',
          '.tee-summary',
          '.notes',
          '.event-action-item',
          '.event-bottom-audit-btn',
          '.event-actions-toggle',
          '.event-toolbar-share',
          '.maybe-count-pill',
          '.action-menu-btn',
          '.button-row > button',
          '.tee-time',
          '.tee-count'
        ];
        const visible = (node) => {
          if (!node) return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const containerFor = (node) => (
          node.closest('.chip')
          || node.closest('.maybe-chip')
          || node.closest('.course-detail-item')
          || node.closest('.tee')
          || node.closest('.maybe-section')
          || node.closest('.card')
          || node.closest('.events-header')
          || document.body
        );
        const violations = [];
        const addViolation = (kind, detail) => violations.push({ kind, ...detail });
        const viewportWidth = window.innerWidth;

        if (document.documentElement.scrollWidth > (viewportWidth + 1)) {
          addViolation('document-overflow', {
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth,
          });
        }

        document.querySelectorAll('.card, .tee, .maybe-section, .events-header').forEach((node, index) => {
          if (!visible(node)) return;
          const rect = node.getBoundingClientRect();
          if (rect.left < -1 || rect.right > (viewportWidth + 1)) {
            addViolation('container-overflow', {
              index,
              className: node.className,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              viewportWidth,
            });
          }
        });

        SELECTORS.forEach((selector) => {
          document.querySelectorAll(selector).forEach((node, index) => {
            if (!visible(node)) return;
            const rect = node.getBoundingClientRect();
            const container = containerFor(node);
            const containerRect = container.getBoundingClientRect();
            const style = getComputedStyle(node);
            const overflowShows = !['hidden', 'clip'].includes(style.overflowX) && !['hidden', 'clip'].includes(style.overflow);
            const overflowX = node.scrollWidth > (node.clientWidth + 1);
            const outsideContainer = rect.left < (containerRect.left - 1) || rect.right > (containerRect.right + 1);
            if ((overflowX && overflowShows) || outsideContainer) {
              addViolation('element-overflow', {
                selector,
                index,
                className: node.className,
                text: (node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 140),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                containerLeft: Math.round(containerRect.left),
                containerRight: Math.round(containerRect.right),
                clientWidth: node.clientWidth,
                scrollWidth: node.scrollWidth,
                overflowX: style.overflowX,
                overflow: style.overflow,
              });
            }
          });
        });

        const firstTeePlayers = document.querySelector('.tee-players');
        const gridColumns = firstTeePlayers ? getComputedStyle(firstTeePlayers).gridTemplateColumns : '';
        const firstTeePositions = firstTeePlayers
          ? Array.from(firstTeePlayers.querySelectorAll('.chip'))
              .slice(0, 4)
              .map((chip) => {
                const rect = chip.getBoundingClientRect();
                return { left: Math.round(rect.left), top: Math.round(rect.top) };
              })
          : [];
        const uniqueLefts = [...new Set(firstTeePositions.map((pos) => pos.left))];
        const uniqueTops = [...new Set(firstTeePositions.map((pos) => pos.top))];
        const directShareCount = Array.from(document.querySelectorAll('.event-toolbar-share')).filter(visible).length;
        const actionsToggleCount = Array.from(document.querySelectorAll('.event-actions-toggle')).filter(visible).length;
        const actionDialogViolations = [];
        const inspectActionDialog = (label) => {
          const actionModal = document.querySelector('#actionModal[open]');
          if (!actionModal || !visible(actionModal)) {
            actionDialogViolations.push({ kind: 'dialog-missing', label });
            return;
          }
          const dialogRect = actionModal.getBoundingClientRect();
          const dialogStyle = getComputedStyle(actionModal);
          if (dialogRect.left < -1 || dialogRect.right > (viewportWidth + 1)) {
            actionDialogViolations.push({
              kind: 'dialog-overflow',
              label,
              left: Math.round(dialogRect.left),
              right: Math.round(dialogRect.right),
              viewportWidth,
            });
          }
          const dialogOverflowShows = !['hidden', 'clip'].includes(dialogStyle.overflowX) && !['hidden', 'clip'].includes(dialogStyle.overflow);
          if (actionModal.scrollWidth > (actionModal.clientWidth + 1) && dialogOverflowShows) {
            actionDialogViolations.push({
              kind: 'dialog-scroll-overflow',
              label,
              clientWidth: actionModal.clientWidth,
              scrollWidth: actionModal.scrollWidth,
            });
          }
          const fields = actionModal.querySelector('.dialog-fields');
          if (fields && visible(fields)) {
            const fieldsRect = fields.getBoundingClientRect();
            Array.from(fields.querySelectorAll('input, textarea, select')).forEach((fieldNode, index) => {
              if (!visible(fieldNode)) return;
              const rect = fieldNode.getBoundingClientRect();
              if (rect.left < (fieldsRect.left - 1) || rect.right > (fieldsRect.right + 1)) {
                actionDialogViolations.push({
                  kind: 'dialog-field-overflow',
                  label,
                  index,
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  fieldsLeft: Math.round(fieldsRect.left),
                  fieldsRight: Math.round(fieldsRect.right),
                });
              }
              if (fieldNode.scrollWidth > (fieldNode.clientWidth + 1)) {
                actionDialogViolations.push({
                  kind: 'dialog-field-scroll-overflow',
                  label,
                  index,
                  clientWidth: fieldNode.clientWidth,
                  scrollWidth: fieldNode.scrollWidth,
                });
              }
            });
          }
          const menu = actionModal.querySelector('menu');
          if (menu && visible(menu)) {
            const menuRect = menu.getBoundingClientRect();
            Array.from(menu.querySelectorAll('button')).forEach((button, index) => {
              if (!visible(button)) return;
              const rect = button.getBoundingClientRect();
              if (rect.left < (menuRect.left - 1) || rect.right > (menuRect.right + 1)) {
                actionDialogViolations.push({
                  kind: 'dialog-button-overflow',
                  label,
                  index,
                  text: (button.textContent || '').trim(),
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  menuLeft: Math.round(menuRect.left),
                  menuRight: Math.round(menuRect.right),
                });
              }
              if (button.scrollWidth > (button.clientWidth + 1)) {
                actionDialogViolations.push({
                  kind: 'dialog-button-scroll-overflow',
                  label,
                  index,
                  text: (button.textContent || '').trim(),
                  clientWidth: button.clientWidth,
                  scrollWidth: button.scrollWidth,
                });
              }
            });
          }
        };

        inspectActionDialog('remove-player');
        document.querySelector('#actionDialogCancelBtn')?.click();

        const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
        const waitForActionDialogState = async (shouldBeOpen, timeoutMs = 5000) => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const isOpen = !!document.querySelector('#actionModal[open]');
            if (isOpen === shouldBeOpen) return true;
            await sleep(40);
          }
          return !!document.querySelector('#actionModal[open]') === shouldBeOpen;
        };
        const openAndInspectActionDialog = async (label, courseName, buttonPattern, fallbackCardPattern) => {
          await waitForActionDialogState(false, 2500);
          const allAddPlayerButtons = Array.from(document.querySelectorAll('[data-add-player]'));
          const targetCard = Array.from(document.querySelectorAll('.card')).find((card) => {
            const text = (card.textContent || '').trim();
            return courseName && text.includes(courseName);
          }) || (fallbackCardPattern
            ? Array.from(document.querySelectorAll('.card')).find((card) => fallbackCardPattern.test((card.textContent || '').trim()))
            : null);
          const triggerCandidates = (targetCard ? Array.from(targetCard.querySelectorAll('[data-add-player]')) : allAddPlayerButtons)
            .filter((button) => buttonPattern.test((button.textContent || '').trim()));
          const trigger = triggerCandidates.find((button) => !button.disabled) || null;
          if (!trigger) {
            actionDialogViolations.push({
              kind: 'dialog-trigger-missing',
              label,
              buttonTexts: allAddPlayerButtons.map((button) => ((button.textContent || '').trim() + ':' + (button.disabled ? 'disabled' : 'enabled'))).filter(Boolean),
            });
            return;
          }
          trigger.click();
          const opened = await waitForActionDialogState(true, 5000);
          if (!opened) {
            actionDialogViolations.push({ kind: 'dialog-missing', label });
            return;
          }
          inspectActionDialog(label);
          document.querySelector('#actionDialogCancelBtn')?.click();
        };

        if (${expectAddPlayerDialog}) {
          await openAndInspectActionDialog('add-player', ${addPlayerCourseName}, /add player/i, /\\bopen\\b/i);
        }

        if (${expectAddFifthDialog}) {
          await openAndInspectActionDialog('add-fifth-player', ${addFifthCourseName}, /add 5th/i, /5th available/i);
        }

        return {
          viewportWidth,
          cardCount: document.querySelectorAll('.card').length,
          teeCount: document.querySelectorAll('.tee').length,
          gridColumns,
          uniqueLefts: uniqueLefts.length,
          uniqueTops: uniqueTops.length,
          directShareCount,
          actionsToggleCount,
          violations,
          actionDialogViolations,
        };
      })()`);
    });
  } finally {
    await closeTarget(target.id);
    debugLog(`inspect end ${device.label} ${targetUrl}`);
  }
}

async function main() {
  const browserPath = resolveBrowserPath();
  if (!browserPath) throw new Error('No Chromium-based browser was found for the public event layout e2e.');

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const runId = Date.now();
  const eventDate = '2031-04-18';
  const mainCourse = `Blue Ridge Shadows Championship Routing Showcase ${runId}`;
  const mainFifthCourse = `Blue Ridge Shadows Fifth Player Dialog Review ${runId}`;
  const seniorsCourse = `Thursday Seniors Invitational Layout Review ${runId}`;
  const seniorsSignupCourse = `Thursday Seniors Signup Review ${runId}`;
  const longCity = 'Front Royal Valley Heights Estates and Recreation District';
  const longNote = 'This is an intentionally long event note used to confirm that notes, headers, and tee-card content wrap cleanly instead of spilling past the edge of the card.';
  const longWeather = 'Overcast with lingering mountain valley drizzle and steady afternoon breeze through the afternoon';
  const longPlayers = [
    `Maximilian Theodore Longlastname ${runId}`,
    `Christopher Jonathan Example-Surname ${runId}`,
    `Alexandria Penelope Verylongname ${runId}`,
    `Benjamin Harrison Placeholder ${runId}`,
    `Fifth Player Overflow Case ${runId}`,
  ];
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-times-public-layout-'));
  let browser;

  async function cleanup() {
    await Event.deleteMany({ course: { $in: [mainCourse, mainFifthCourse, seniorsCourse, seniorsSignupCourse] } }).catch(() => {});
  }

  try {
    debugLog('cleanup start');
    await cleanup();
    debugLog('seed start');

    await Event.create({
      groupSlug: 'main',
      course: mainCourse,
      date: new Date(`${eventDate}T12:00:00`),
      notes: longNote,
      courseInfo: {
        city: longCity,
        state: 'VA',
        phone: '(540) 631-9661 ext 204 for tournament operations',
        website: 'https://example.com/blue-ridge-shadows-golf-club-tournament-center-and-registration',
        holes: 18,
      },
      weather: {
        icon: '☁️',
        tempLow: 52,
        tempHigh: 75,
        description: longWeather,
        rainChance: 35,
      },
      maybeList: [
        `Interested Golfer Overflow Name ${runId}`,
        `Another Interested Player With Long Name ${runId}`,
      ],
      teeTimes: [
        { time: '08:00', players: longPlayers.map((name, index) => ({ name, isFifth: index === 4 })) },
        { time: '08:09', players: [{ name: `Open Group Member ${runId}` }] },
      ],
    });

    await Event.create({
      groupSlug: 'main',
      course: mainFifthCourse,
      date: new Date(`${eventDate}T12:00:00`),
      notes: longNote,
      courseInfo: {
        city: longCity,
        state: 'VA',
        phone: '(540) 631-9661 ext 205 for overflow operations',
        website: 'https://example.com/blue-ridge-shadows-fifth-player-review',
      },
      weather: {
        icon: '☀️',
        tempLow: 55,
        tempHigh: 76,
        description: longWeather,
        rainChance: 5,
      },
      teeTimes: [
        { time: '07:51', players: longPlayers.slice(0, 4).map((name) => ({ name })) },
        { time: '08:00', players: longPlayers.slice(0, 4).map((name, index) => ({ name: `${name} Alt ${index}` })) },
      ],
    });

    await Event.create({
      groupSlug: 'seniors',
      course: seniorsCourse,
      date: new Date(`${eventDate}T12:00:00`),
      notes: longNote,
      seniorsEventType: 'tee-times',
      courseInfo: {
        city: longCity,
        state: 'VA',
        phone: '(540) 555-1200 ext 99 for seniors operations',
        website: 'https://example.com/seniors-tournament-and-events-registration-center',
        holes: 18,
      },
      weather: {
        icon: '⛅',
        tempLow: 49,
        tempHigh: 73,
        description: longWeather,
        rainChance: 20,
      },
      teeTimes: [
        { time: '09:00', players: longPlayers.map((name, index) => ({ name, isFifth: index === 4 })) },
        { time: '09:09', players: [{ name: `Senior Open Slot Member ${runId}` }] },
      ],
    });

    await Event.create({
      groupSlug: 'seniors',
      course: seniorsSignupCourse,
      date: new Date(`${eventDate}T12:00:00`),
      notes: longNote,
      seniorsEventType: 'outing',
      seniorsRegistrationMode: 'event-only',
      seniorsRegistrations: [
        { name: `Senior Signup Overflow Name ${runId}` },
        { name: `Second Senior Signup With Long Name ${runId}` },
      ],
      courseInfo: {
        city: longCity,
        state: 'VA',
        phone: '(540) 555-0000 ext 112 for signup support',
        website: 'https://example.com/seniors-signup-and-outings-center',
        holes: 18,
      },
      weather: {
        icon: '🌤️',
        tempLow: 51,
        tempHigh: 74,
        description: longWeather,
        rainChance: 10,
      },
    });
    debugLog('seed done');

    browser = spawn(browserPath, [
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

    await waitForJsonVersion();
    debugLog('browser ready');

    for (const page of PAGE_SPECS) {
      for (const device of DEVICE_SPECS) {
        const query = page.path ? `${page.path}&date=${encodeURIComponent(eventDate)}` : `?date=${encodeURIComponent(eventDate)}`;
        debugLog(`scenario start ${page.label} ${device.label}`);
        const metrics = await inspectPage(`${base}/${query}`, device, {
          expectAddPlayerDialog: page.label === 'main',
          addPlayerCourseName: mainCourse,
          expectAddFifthDialog: page.label === 'main',
          addFifthCourseName: mainFifthCourse,
        });
        assert(metrics.cardCount >= 1, `${page.label} ${device.label} should render at least one card`);
        assert(metrics.violations.length === 0, `${page.label} ${device.label} layout overflow violations:\n${JSON.stringify(metrics.violations, null, 2)}`);
        assert(metrics.actionDialogViolations.length === 0, `${page.label} ${device.label} action dialog layout violations:\n${JSON.stringify(metrics.actionDialogViolations, null, 2)}`);
        if (page.label === 'seniors') {
          assert(metrics.directShareCount >= 1, `${page.label} ${device.label} should render a direct toolbar share button`);
          assert(metrics.actionsToggleCount === 0, `${page.label} ${device.label} should not render the actions toggle when share is the only action`);
        }
        if (device.label === 'desktop' && metrics.teeCount >= 1) {
          assert(metrics.uniqueLefts <= 2 && metrics.uniqueLefts >= 1, `${page.label} desktop tee players should stay within two columns`);
          assert(metrics.uniqueTops >= 2, `${page.label} desktop tee players should wrap into at least two rows for four players`);
        }
        debugLog(`scenario end ${page.label} ${device.label}`);
      }
    }

    console.log('e2e_public_event_layout.js passed');
  } finally {
    if (browser) {
      if (browser.exitCode === null && !browser.killed) browser.kill('SIGTERM');
      if (browser.exitCode === null && !browser.killed) {
        await Promise.race([
          new Promise((resolve) => browser.once('exit', resolve)),
          sleep(1200),
        ]).catch(() => {});
      }
      if (browser.exitCode === null && !browser.killed) browser.kill('SIGKILL');
    }
    await cleanup();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    const secondary = getSecondaryConn();
    if (secondary) await secondary.close().catch(() => {});
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((error) => {
  console.error('e2e_public_event_layout.js failed', error);
  process.exit(1);
});
