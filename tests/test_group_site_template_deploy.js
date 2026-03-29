const assert = require('assert');
const mongoose = require('mongoose');

const app = require('../server');
const { getSecondaryConn } = require('../secondary-conn');
const Event = require('../models/Event');
const Settings = require('../models/Settings');
const Subscriber = require('../models/Subscriber');

const ADMIN_CODE = process.env.SITE_ADMIN_WRITE_CODE || '2000';

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const runId = Date.now();
  const groupSlug = `template-group-${runId}`;
  const requestDate = '2031-04-17';
  let testFailed = false;

  async function cleanup() {
    await Event.deleteMany({ groupSlug }).catch(() => {});
    await Settings.deleteMany({ groupSlug }).catch(() => {});
    await Subscriber.deleteMany({ groupSlug }).catch(() => {});
  }

  try {
    await cleanup();

    const deployResponse = await fetch(`${base}/api/admin/templates/tee-times-site-package`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': ADMIN_CODE,
      },
      body: JSON.stringify({
        siteTitle: 'Template Smoke Tee Times',
        shortTitle: 'Smoke Tee',
        groupName: 'Template Smoke Group',
        groupReference: 'Template Smoke',
        packageSlug: groupSlug,
        clubName: 'Template Smoke Club',
        clubRequestLabel: 'Request a Tee Time for Template Smoke Club',
        primaryContactEmail: 'captain@example.com',
        secondaryContactEmail: 'vicecaptain@example.com',
        clubRequestEmail: 'golfshop@example.com',
        replyToEmail: 'reply@example.com',
        supportPhone: '555-111-2222',
        clubPhone: '555-111-3333',
        smsPhone: '555-111-4444',
        adminAlertPhones: '555-111-5555\n555-111-6666',
        themeColor: '#24513b',
        iconAssetName: 'knight-club-icon.png',
        mongoDbName: 'teetimes_template_smoke',
        includeHandicaps: false,
        includeTrips: true,
        includeOutings: false,
        includeNotifications: true,
        includeScheduler: false,
        includeBackups: true,
        notes: 'Deployment smoke test',
      }),
    });
    assert.strictEqual(deployResponse.status, 201, 'Template deployment should return 201');
    const deployPayload = await deployResponse.json();
    assert.ok(deployPayload.deployment, 'Deployment details should be returned');
    assert.strictEqual(deployPayload.deployment.groupSlug, groupSlug, 'Deployment should use the requested group slug');
    assert.strictEqual(deployPayload.deployment.links.sitePath, `/groups/${groupSlug}`);
    assert.strictEqual(deployPayload.deployment.links.adminLitePath, `/groups/${groupSlug}/admin-lite`);

    const storedProfile = await Settings.findOne({ groupSlug, key: 'siteProfile' }).lean();
    assert.ok(storedProfile && storedProfile.value, 'Deployed group profile should be stored in settings');
    assert.strictEqual(storedProfile.value.clubName, 'Template Smoke Club');
    assert.strictEqual(storedProfile.value.features.includeScheduler, false);

    const publicProfileResponse = await fetch(`${base}/api/site-profile?group=${encodeURIComponent(groupSlug)}`);
    assert.strictEqual(publicProfileResponse.status, 200, 'Public site profile should load');
    const publicProfilePayload = await publicProfileResponse.json();
    assert.strictEqual(publicProfilePayload.profile.siteTitle, 'Template Smoke Tee Times');
    assert.strictEqual(publicProfilePayload.profile.groupReference, 'Template Smoke');
    assert.strictEqual(publicProfilePayload.profile.features.includeHandicaps, false);

    const groupDirectoryResponse = await fetch(`${base}/api/admin/site-groups?code=${encodeURIComponent(ADMIN_CODE)}`);
    assert.strictEqual(groupDirectoryResponse.status, 200, 'Golf group directory should load');
    const groupDirectoryPayload = await groupDirectoryResponse.json();
    const mainGroup = groupDirectoryPayload.groups.find((entry) => entry.groupSlug === 'main');
    const deployedGroup = groupDirectoryPayload.groups.find((entry) => entry.groupSlug === groupSlug);
    assert.ok(mainGroup, 'Golf group directory should include the main group');
    assert.strictEqual(mainGroup.groupReference, 'BRS Group');
    assert.ok(deployedGroup, 'Golf group directory should include the deployed group');
    assert.strictEqual(deployedGroup.groupReference, 'Template Smoke');

    const groupRedirect = await fetch(`${base}/groups/${groupSlug}`, { redirect: 'manual' });
    assert.strictEqual(groupRedirect.status, 302, 'Dedicated group site route should redirect');
    assert.strictEqual(groupRedirect.headers.get('location'), `/?group=${groupSlug}`);

    const adminRedirect = await fetch(`${base}/groups/${groupSlug}/admin`, { redirect: 'manual' });
    assert.strictEqual(adminRedirect.status, 302, 'Dedicated group admin route should redirect');
    assert.strictEqual(adminRedirect.headers.get('location'), `/group-admin-lite.html?group=${groupSlug}`);

    const scopedAdminRedirect = await fetch(`${base}/admin.html?group=${encodeURIComponent(groupSlug)}`, { redirect: 'manual' });
    assert.strictEqual(scopedAdminRedirect.status, 302, 'Scoped shared admin route should redirect to the group admin page');
    assert.strictEqual(scopedAdminRedirect.headers.get('location'), `/group-admin-lite.html?group=${groupSlug}`);

    const mainLiteRedirect = await fetch(`${base}/group-admin-lite.html`, { redirect: 'manual' });
    assert.strictEqual(mainLiteRedirect.status, 302, 'Main-site lite admin entry should redirect to the full admin page');
    assert.strictEqual(mainLiteRedirect.headers.get('location'), '/admin.html');

    const mainGroupLiteRedirect = await fetch(`${base}/groups/main/admin-lite`, { redirect: 'manual' });
    assert.strictEqual(mainGroupLiteRedirect.status, 302, 'Main group lite admin route should redirect to the full admin page');
    assert.strictEqual(mainGroupLiteRedirect.headers.get('location'), '/admin.html');

    const liteAdminPage = await fetch(`${base}/group-admin-lite.html?group=${encodeURIComponent(groupSlug)}`);
    assert.strictEqual(liteAdminPage.status, 200, 'Minimal admin page should be reachable');
    const liteAdminHtml = await liteAdminPage.text();
    assert.ok(liteAdminHtml.includes('Group Admin'), 'Minimal admin page should contain the live admin shell');

    const mainManifestResponse = await fetch(`${base}/manifest.json`);
    assert.strictEqual(mainManifestResponse.status, 200, 'Main manifest should load');
    const mainManifest = await mainManifestResponse.json();
    assert.ok(Array.isArray(mainManifest.shortcuts), 'Main manifest should include shortcuts');
    assert.ok(mainManifest.shortcuts.every((entry) => !String(entry && entry.url || '').includes('admin-lite')), 'Main manifest should not advertise a lite admin shortcut');

    const addSubscriberResponse = await fetch(`${base}/api/admin/subscribers?group=${encodeURIComponent(groupSlug)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': ADMIN_CODE,
      },
      body: JSON.stringify({ email: 'thursday.seniors@example.com' }),
    });
    assert.strictEqual(addSubscriberResponse.status, 201, 'Minimal admin subscriber add route should create a subscriber');
    const addSubscriberPayload = await addSubscriberResponse.json();
    assert.strictEqual(addSubscriberPayload.subscriber.email, 'thursday.seniors@example.com');

    const listSubscribersResponse = await fetch(`${base}/api/admin/subscribers?group=${encodeURIComponent(groupSlug)}`, {
      headers: {
        'x-admin-code': ADMIN_CODE,
      },
    });
    assert.strictEqual(listSubscribersResponse.status, 200, 'Group subscriber list should load through admin API');
    const subscribers = await listSubscribersResponse.json();
    assert.strictEqual(subscribers.length, 1, 'Group should have the seeded subscriber');
    assert.strictEqual(subscribers[0].email, 'thursday.seniors@example.com');

    const createEventResponse = await fetch(`${base}/api/events?group=${encodeURIComponent(groupSlug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: 'Template Smoke Course',
        date: requestDate,
        teeTime: '08:12',
        isTeamEvent: false,
      }),
    });
    assert.strictEqual(createEventResponse.status, 201, 'Group event should be created');

    const calendarResponse = await fetch(`${base}/groups/${groupSlug}/calendar.ics`);
    assert.strictEqual(calendarResponse.status, 200, 'Group calendar feed should load');
    const calendarBody = await calendarResponse.text();
    assert.ok(calendarBody.includes('Template Smoke Course'), 'Calendar feed should include the created event');
    assert.ok(calendarBody.includes('Smoke Tee Tee Times'), 'Calendar feed should use the group-specific calendar name');

    console.log('test_group_site_template_deploy.js passed');
  } catch (error) {
    testFailed = true;
    throw error;
  } finally {
    await cleanup();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    const secondaryConn = getSecondaryConn();
    if (secondaryConn && secondaryConn.readyState !== 0) {
      await secondaryConn.close().catch(() => {});
    }
    if (testFailed) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('test_group_site_template_deploy.js failed', error);
  process.exitCode = 1;
});
