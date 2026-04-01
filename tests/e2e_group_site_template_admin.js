const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');

const app = require('../server');
const { getSecondaryConn } = require('../secondary-conn');
const Event = require('../models/Event');
const Settings = require('../models/Settings');
const Subscriber = require('../models/Subscriber');

const PORT = Number(process.env.E2E_GROUP_TEMPLATE_PORT || 0);
const DEBUG_PORT = Number(process.env.E2E_GROUP_TEMPLATE_DEBUG_PORT || 9246);
const ADMIN_CODE = process.env.SITE_ADMIN_WRITE_CODE || process.env.SITE_ACCESS_CODE || '123';
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
  for (let index = 0; index < 80; index += 1) {
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

async function cleanupGroup(groupSlug) {
  await Event.deleteMany({ groupSlug }).catch(() => {});
  await Settings.deleteMany({ groupSlug }).catch(() => {});
  await Subscriber.deleteMany({ groupSlug }).catch(() => {});
}

async function main() {
  const browserPath = resolveBrowserPath();
  if (!browserPath) throw new Error('No Chromium-based browser was found for the admin template e2e.');
  console.log(`Using browser: ${browserPath}`);

  const server = app.listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Server listening on ${base}`);

  const runId = Date.now();
  const groupSlug = `admin-template-${runId}`;
  const payload = {
    siteTitle: 'Admin Template Tee Times',
    shortTitle: 'Admin Smoke',
    groupName: 'Admin Smoke Group',
    groupReference: 'Admin Smoke',
    packageSlug: groupSlug,
    clubName: 'Admin Smoke Club',
    clubRequestLabel: 'Request a Tee Time for Admin Smoke Club',
    primaryContactEmail: 'captain@example.com',
    secondaryContactEmail: 'vicecaptain@example.com',
    clubRequestEmail: 'golfshop@example.com',
    replyToEmail: 'reply@example.com',
    supportPhone: '555-777-1000',
    clubPhone: '555-777-2000',
    smsPhone: '555-777-3000',
    adminCode: `grp${String(runId).slice(-4)}`,
    deleteCode: `del${String(runId).slice(-4)}`,
    inboundEmailAlias: `teetime+${groupSlug}@xenailexou.resend.app`,
    themeColor: '#24513b',
    iconAssetName: 'knight-club-icon.png',
    includeHandicaps: false,
    includeTrips: true,
    includeOutings: false,
    includeNotifications: true,
    includeScheduler: false,
    includeBackups: true,
    notes: 'Admin page e2e deploy test',
  };

  await cleanupGroup(groupSlug);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-times-admin-template-'));
  const browser = spawn(browserPath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    'about:blank',
  ], {
    stdio: 'ignore',
  });

  try {
    console.log(`Waiting for browser DevTools on ${DEBUG_PORT}`);
    await waitForJsonVersion();
    console.log('Browser DevTools ready');

    const adminTarget = await openTarget('about:blank');
    try {
      console.log('Opening admin template flow');
      await withCdp(adminTarget.webSocketDebuggerUrl, async ({ send }) => {
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: `window.prompt = () => ${JSON.stringify(ADMIN_CODE)};`,
        });
        await send('Page.navigate', { url: `${base}/admin.html` });
        await waitForExpression(send, `Boolean(document.getElementById('openTeeTimesSiteTemplateBtn'))`);
        await waitForExpression(send, `document.querySelectorAll('#groupReferenceGrid .group-reference-title').length >= 1`, 20000);
        await sleep(2500);
        const defaultTemplateValues = await evaluate(send, `(() => ({
          slug: document.getElementById('siteTemplatePackageSlugInput') && document.getElementById('siteTemplatePackageSlugInput').value,
          adminCode: document.getElementById('siteTemplateAdminCodeInput') && document.getElementById('siteTemplateAdminCodeInput').value
        }))()`);
        assert.notStrictEqual(defaultTemplateValues.slug, 'seniors', 'Template builder should not default new groups to the Seniors slug');
        assert.notStrictEqual(defaultTemplateValues.adminCode, '000', 'Template builder should not default new groups to the Seniors admin code');
        await evaluate(send, `(() => {
          const payload = ${JSON.stringify(payload)};
          document.getElementById('openTeeTimesSiteTemplateBtn').click();
          const assign = (id, value) => {
            const el = document.getElementById(id);
            if (!el) throw new Error('Missing field: ' + id);
            if (el.type === 'checkbox') el.checked = !!value;
            else el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };
          assign('siteTemplateTitleInput', payload.siteTitle);
          assign('siteTemplateShortTitleInput', payload.shortTitle);
          assign('siteTemplateGroupNameInput', payload.groupName);
          assign('siteTemplateGroupReferenceInput', payload.groupReference);
          assign('siteTemplatePackageSlugInput', payload.packageSlug);
          assign('siteTemplateClubNameInput', payload.clubName);
          assign('siteTemplateClubRequestLabelInput', payload.clubRequestLabel);
          assign('siteTemplatePrimaryEmailInput', payload.primaryContactEmail);
          assign('siteTemplateSecondaryEmailInput', payload.secondaryContactEmail);
          assign('siteTemplateClubEmailInput', payload.clubRequestEmail);
          assign('siteTemplateReplyToEmailInput', payload.replyToEmail);
          assign('siteTemplatePhoneInput', payload.supportPhone);
          assign('siteTemplateClubPhoneInput', payload.clubPhone);
          assign('siteTemplateSmsPhoneInput', payload.smsPhone);
          assign('siteTemplateAdminCodeInput', payload.adminCode);
          assign('siteTemplateDeleteCodeInput', payload.deleteCode);
          assign('siteTemplateInboundAliasInput', payload.inboundEmailAlias);
          assign('siteTemplateThemeColorInput', payload.themeColor);
          assign('siteTemplateIconInput', payload.iconAssetName);
          assign('siteTemplateIncludeHandicapsInput', payload.includeHandicaps);
          assign('siteTemplateIncludeTripsInput', payload.includeTrips);
          assign('siteTemplateIncludeOutingsInput', payload.includeOutings);
          assign('siteTemplateIncludeNotificationsInput', payload.includeNotifications);
          assign('siteTemplateIncludeSchedulerInput', payload.includeScheduler);
          assign('siteTemplateIncludeBackupsInput', payload.includeBackups);
          assign('siteTemplateNotesInput', payload.notes);
          const form = document.getElementById('teeTimesSiteTemplateForm');
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.querySelector('button[type=\"submit\"]').click();
        })()`);
        await waitForExpression(send, `document.getElementById('teeTimesSiteTemplateResult').textContent.includes('Deployed')`, 30000);
        const adminResult = await evaluate(send, `(() => ({
          resultText: document.getElementById('teeTimesSiteTemplateResult').textContent,
          links: Array.from(document.querySelectorAll('#teeTimesSiteTemplateLinks a')).map((node) => node.getAttribute('href')),
          groupReferences: Array.from(document.querySelectorAll('#groupReferenceGrid .group-reference-title')).map((node) => node.textContent)
        }))()`);
        assert.ok(adminResult.resultText.includes('Deployed Admin Template Tee Times'), 'Admin page should report a deployed group');
        assert.ok(adminResult.links.includes(`/groups/${groupSlug}`), 'Admin page should expose the dedicated group site URL');
        assert.ok(adminResult.links.includes(`/groups/${groupSlug}/admin`), 'Admin page should expose the group admin URL');
        assert.ok(adminResult.groupReferences.includes('BRS Group'), 'Admin page should show the main group reference');
      });
      console.log('Admin template deployment flow completed');
    } finally {
      await closeTarget(adminTarget.id);
    }

    const publicProfileResponse = await fetch(`${base}/api/site-profile?group=${encodeURIComponent(groupSlug)}`);
    assert.strictEqual(publicProfileResponse.status, 200, 'Deployed group profile should be available after admin flow');
    const publicProfilePayload = await publicProfileResponse.json();
    assert.strictEqual(publicProfilePayload.profile.siteTitle, payload.siteTitle);
    assert.strictEqual(publicProfilePayload.profile.groupReference, payload.groupReference);
    assert.strictEqual(publicProfilePayload.profile.features.includeHandicaps, false);

    const siteTarget = await openTarget(`${base}/groups/${groupSlug}`);
    try {
      console.log('Opening deployed group site');
      await withCdp(siteTarget.webSocketDebuggerUrl, async ({ send }) => {
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.navigate', { url: `${base}/groups/${groupSlug}` });
        await waitForExpression(send, `document.querySelector('.topbar-title-link') && document.querySelector('.topbar-title-link').textContent === ${JSON.stringify(payload.siteTitle)}`, 20000);
        const siteState = await evaluate(send, `(() => ({
          title: document.querySelector('.topbar-title-link') && document.querySelector('.topbar-title-link').textContent,
          titleHref: document.querySelector('.topbar-title-link') && document.querySelector('.topbar-title-link').getAttribute('href'),
          requestLabel: document.getElementById('requestClubTimeBtn') && document.getElementById('requestClubTimeBtn').textContent,
          infoMenuHidden: document.querySelector('.topbar-dropdown')?.hidden === true,
          handicapsHidden: document.querySelector('[data-feature-link="includeHandicaps"]')?.hidden === true,
          adminLinkHref: document.querySelector('[data-group-admin-link]') && document.querySelector('[data-group-admin-link]').getAttribute('href'),
          adminLinkText: document.querySelector('[data-group-admin-link]') && document.querySelector('[data-group-admin-link]').textContent,
          mainOnlyLinksHidden: Array.from(document.querySelectorAll('[data-main-only-link]')).every((node) => node.hidden === true),
          bodyText: document.body && document.body.innerText
        }))()`);
        assert.strictEqual(siteState.title, payload.siteTitle);
        assert.strictEqual(siteState.titleHref, null);
        assert.strictEqual(siteState.requestLabel, payload.clubRequestLabel);
        assert.strictEqual(siteState.infoMenuHidden, true);
        assert.strictEqual(siteState.handicapsHidden, true);
        assert.strictEqual(siteState.adminLinkHref, `/groups/${groupSlug}/admin`);
        assert.strictEqual(siteState.adminLinkText, 'Group Admin');
        assert.strictEqual(siteState.mainOnlyLinksHidden, true);
        assert.ok(!String(siteState.bodyText || '').includes('BRS Group'), 'Group site should not mention the main group reference');
        assert.ok(!String(siteState.bodyText || '').includes('Knight Group'), 'Group site should not mention the main group name');
        assert.ok(!String(siteState.bodyText || '').includes('Blue Ridge Shadows'), 'Group site should not mention the main club');
      });
      console.log('Deployed group site verified');
    } finally {
      await closeTarget(siteTarget.id);
    }

    const liteTarget = await openTarget('about:blank');
    try {
      console.log('Opening lite admin page');
      await withCdp(liteTarget.webSocketDebuggerUrl, async ({ send }) => {
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: `window.prompt = () => ${JSON.stringify(payload.adminCode)};`,
        });
        await send('Page.navigate', { url: `${base}/groups/${groupSlug}/admin-lite` });
        await waitForExpression(send, `document.getElementById('profileForm') && document.getElementById('profileForm').hidden === false`, 20000);
        await evaluate(send, `(() => {
          const input = document.getElementById('subscriberEmailInput');
          const form = document.getElementById('subscriberForm');
          input.value = 'lite-admin@example.com';
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.querySelector('button[type="submit"]').click();
        })()`);
        await waitForExpression(send, `document.getElementById('subscriberCount') && document.getElementById('subscriberCount').textContent === '1'`, 20000);
        const liteState = await evaluate(send, `(() => ({
          title: document.getElementById('pageTitle') && document.getElementById('pageTitle').textContent,
          siteLink: document.getElementById('summarySiteLink') && document.getElementById('summarySiteLink').textContent,
          subscriberCount: document.getElementById('subscriberCount') && document.getElementById('subscriberCount').textContent,
          hasFrame: Boolean(document.getElementById('teeTimesFrame')),
          links: Array.from(document.querySelectorAll('a')).map((node) => node.getAttribute('href')),
          bodyText: document.body && document.body.innerText
        }))()`);
        assert.ok(String(liteState.title || '').includes('Admin Smoke Group Admin'));
        assert.strictEqual(liteState.siteLink, `/groups/${groupSlug}`);
        assert.strictEqual(liteState.subscriberCount, '1');
        assert.strictEqual(liteState.hasFrame, true);
        assert.ok(!liteState.links.includes('/admin.html'), 'Group admin page should not expose the shared main admin');
        assert.ok(!String(liteState.bodyText || '').includes('BRS Group'), 'Group admin page should not mention the main group reference');
        assert.ok(!String(liteState.bodyText || '').includes('Knight Group'), 'Group admin page should not mention the main group name');
        assert.ok(!String(liteState.bodyText || '').includes('Blue Ridge Shadows'), 'Group admin page should not mention the main club');
      });
      console.log('Lite admin page verified');
    } finally {
      await closeTarget(liteTarget.id);
    }

    console.log('e2e_group_site_template_admin.js passed');
  } finally {
    await cleanupGroup(groupSlug);
    browser.kill('SIGTERM');
    await sleep(1000);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    const secondaryConn = getSecondaryConn();
    if (secondaryConn && secondaryConn.readyState !== 0) {
      await secondaryConn.close().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error('e2e_group_site_template_admin.js failed', error);
  process.exitCode = 1;
});
