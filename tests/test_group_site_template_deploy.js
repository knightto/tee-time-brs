const assert = require('assert');
const mongoose = require('mongoose');

const app = require('../server');
const { getSecondaryConn } = require('../secondary-conn');
const Event = require('../models/Event');
const Settings = require('../models/Settings');
const Subscriber = require('../models/Subscriber');

const ADMIN_CODE = process.env.SITE_ADMIN_WRITE_CODE || process.env.SITE_ACCESS_CODE || '123';

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const runId = Date.now();
  const groupSlug = `template-group-${runId}`;
  const groupAdminCode = `grp${String(runId).slice(-4)}`;
  const groupDeleteCode = `del${String(runId).slice(-4)}`;
  const previewGroupSlug = `preview-group-${runId}`;
  const requestDate = '2031-04-17';
  const seniorsDeleteCourse = `Seniors Isolation ${runId}`;
  let testFailed = false;

  async function cleanup() {
    await Event.deleteMany({ groupSlug }).catch(() => {});
    await Event.deleteMany({ course: seniorsDeleteCourse }).catch(() => {});
    await Settings.deleteMany({ groupSlug }).catch(() => {});
    await Settings.deleteMany({ groupSlug: previewGroupSlug }).catch(() => {});
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
        adminCode: groupAdminCode,
        deleteCode: groupDeleteCode,
        inboundEmailAlias: `teetime+${groupSlug}@xenailexou.resend.app`,
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
    assert.strictEqual(storedProfile.value.adminCode, groupAdminCode);
    assert.strictEqual(storedProfile.value.deleteCode, groupDeleteCode);

    const publicProfileResponse = await fetch(`${base}/api/site-profile?group=${encodeURIComponent(groupSlug)}`);
    assert.strictEqual(publicProfileResponse.status, 200, 'Public site profile should load');
    const publicProfilePayload = await publicProfileResponse.json();
    assert.strictEqual(publicProfilePayload.profile.siteTitle, 'Template Smoke Tee Times');
    assert.strictEqual(publicProfilePayload.profile.groupReference, 'Template Smoke');
    assert.strictEqual(publicProfilePayload.profile.features.includeHandicaps, false);

    const scopedAdminOk = await fetch(`${base}/api/admin/site-profile?group=${encodeURIComponent(groupSlug)}&code=${encodeURIComponent(groupAdminCode)}`);
    assert.strictEqual(scopedAdminOk.status, 200, 'Deployed group should accept its dedicated admin code');
    const scopedAdminPayload = await scopedAdminOk.json();
    assert.strictEqual(scopedAdminPayload.profile.adminCode, undefined, 'Scoped admin profile response should not leak the admin code');
    assert.strictEqual(scopedAdminPayload.profile.deleteCode, undefined, 'Scoped admin profile response should not leak the delete code');
    assert.strictEqual(scopedAdminPayload.profile.confirmCode, undefined, 'Scoped admin profile response should not leak the confirm code');

    const scopedAdminWrong = await fetch(`${base}/api/admin/site-profile?group=${encodeURIComponent(groupSlug)}&code=${encodeURIComponent(ADMIN_CODE)}`);
    assert.strictEqual(scopedAdminWrong.status, 403, 'Main admin code should not open a deployed scoped group admin');

    const operationsGuideApiResponse = await fetch(`${base}/api/operations-guide`);
    assert.strictEqual(operationsGuideApiResponse.status, 200, 'Operations guide API should load');
    const operationsGuidePayload = await operationsGuideApiResponse.json();
    assert.ok(Array.isArray(operationsGuidePayload.allOperationalEmails), 'Operations guide should include operational email list');
    assert.ok(operationsGuidePayload.allOperationalEmails.includes('teetime@xenailexou.resend.app'), 'Operations guide should expose the inbound Resend address');
    assert.ok(operationsGuidePayload.allOperationalEmails.includes(`teetime+${groupSlug}@xenailexou.resend.app`), 'Operations guide should include the group-specific inbound alias');
    assert.strictEqual(operationsGuidePayload.inboundRouting.defaultGroupSlug, 'main', 'Operations guide should describe the default imported group');
    assert.strictEqual(operationsGuidePayload.inboundRouting.recipientAliasPattern, 'teetime+<group>@xenailexou.resend.app', 'Operations guide should expose the inbound alias routing pattern');
    assert.strictEqual(operationsGuidePayload.inboundRouting.subjectTagPattern, '[group:<slug>]', 'Operations guide should expose the subject tag routing pattern');

    const operationsGuidePageResponse = await fetch(`${base}/process-guide.html`);
    assert.strictEqual(operationsGuidePageResponse.status, 200, 'Operations guide page should load');
    const operationsGuideHtml = await operationsGuidePageResponse.text();
    assert.ok(operationsGuideHtml.includes('Operations Guide'), 'Operations guide page should contain the guide shell');
    assert.ok(operationsGuideHtml.includes('How The System Routes Imported Tee Time Emails'), 'Operations guide page should explain inbound routing');

    const seniorsAdminOk = await fetch(`${base}/api/admin/site-profile?group=seniors&code=000`);
    assert.strictEqual(seniorsAdminOk.status, 200, 'Thursday Seniors admin should accept its scoped admin code');

    const seniorsAdminOldCode = await fetch(`${base}/api/admin/site-profile?group=seniors&code=${encodeURIComponent(ADMIN_CODE)}`);
    assert.strictEqual(seniorsAdminOldCode.status, 403, 'Thursday Seniors admin should reject the main site admin code');

    const mainAdminWrongCode = await fetch(`${base}/api/admin/site-profile?group=main&code=000`);
    assert.strictEqual(mainAdminWrongCode.status, 403, 'Main admin should not accept the Thursday Seniors admin code');

    const seniorsPublicProfileResponse = await fetch(`${base}/api/site-profile?group=seniors`);
    assert.strictEqual(seniorsPublicProfileResponse.status, 200, 'Seniors public site profile should load');
    const seniorsPublicProfilePayload = await seniorsPublicProfileResponse.json();
    assert.strictEqual(seniorsPublicProfilePayload.profile.features.includeHandicaps, false, 'Seniors should not expose the shared handicap module');
    assert.strictEqual(seniorsPublicProfilePayload.profile.features.includeTrips, false, 'Seniors should not expose the shared trip module');
    assert.strictEqual(seniorsPublicProfilePayload.profile.features.includeOutings, false, 'Seniors should not expose the shared outings module');

    const legacySeniorsRoute = await fetch(`${base}/groups/thursday-seniors-group`, { redirect: 'manual' });
    assert.strictEqual(legacySeniorsRoute.status, 302, 'Legacy Thursday Seniors route should redirect');
    assert.strictEqual(legacySeniorsRoute.headers.get('location'), '/?group=seniors');

    const legacySeniorsQuery = await fetch(`${base}/?group=thursday-seniors-group`, { redirect: 'manual' });
    assert.strictEqual(legacySeniorsQuery.status, 302, 'Legacy Thursday Seniors query should redirect to canonical slug');
    assert.strictEqual(legacySeniorsQuery.headers.get('location'), '/?group=seniors');

    const groupDirectoryResponse = await fetch(`${base}/api/admin/site-groups?code=${encodeURIComponent(ADMIN_CODE)}`);
    assert.strictEqual(groupDirectoryResponse.status, 200, 'Golf group directory should load');
    const groupDirectoryPayload = await groupDirectoryResponse.json();
    const mainGroup = groupDirectoryPayload.groups.find((entry) => entry.groupSlug === 'main');
    const deployedGroup = groupDirectoryPayload.groups.find((entry) => entry.groupSlug === groupSlug);
    assert.ok(mainGroup, 'Golf group directory should include the main group');
    assert.strictEqual(mainGroup.groupReference, 'BRS Group');
    assert.ok(deployedGroup, 'Golf group directory should include the deployed group');
    assert.strictEqual(deployedGroup.groupReference, 'Template Smoke');

    const groupDirectoryForbidden = await fetch(`${base}/api/admin/site-groups?group=seniors&code=000`);
    assert.strictEqual(groupDirectoryForbidden.status, 403, 'Scoped group admins should not access the global group directory');

    const backupsForbidden = await fetch(`${base}/api/admin/backups?group=seniors&code=000`);
    assert.strictEqual(backupsForbidden.status, 403, 'Scoped group admins should not access global backup endpoints');

    const previewSaveResponse = await fetch(`${base}/api/admin/site-profile?group=${encodeURIComponent(previewGroupSlug)}&code=${encodeURIComponent(ADMIN_CODE)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteTitle: 'Preview Group Tee Times',
        groupName: 'Preview Group',
        groupReference: 'Preview Group',
        primaryContactEmail: 'preview@example.com',
        clubRequestEmail: 'preview-club@example.com',
      }),
    });
    assert.strictEqual(previewSaveResponse.status, 200, 'A new scoped group profile should save through the admin API');
    const previewStoredProfile = await Settings.findOne({ groupSlug: previewGroupSlug, key: 'siteProfile' }).lean();
    assert.ok(previewStoredProfile && previewStoredProfile.value, 'Preview group profile should persist');
    assert.strictEqual(previewStoredProfile.value.adminCode, '', 'Saving a scoped group profile should not persist a placeholder admin code');
    assert.strictEqual(previewStoredProfile.value.deleteCode, '', 'Saving a scoped group profile should not persist a placeholder delete code');

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
        'x-admin-code': groupAdminCode,
      },
      body: JSON.stringify({ email: 'thursday.seniors@example.com' }),
    });
    assert.strictEqual(addSubscriberResponse.status, 201, 'Minimal admin subscriber add route should create a subscriber');
    const addSubscriberPayload = await addSubscriberResponse.json();
    assert.strictEqual(addSubscriberPayload.subscriber.email, 'thursday.seniors@example.com');

    const listSubscribersResponse = await fetch(`${base}/api/admin/subscribers?group=${encodeURIComponent(groupSlug)}`, {
      headers: {
        'x-admin-code': groupAdminCode,
      },
    });
    assert.strictEqual(listSubscribersResponse.status, 200, 'Group subscriber list should load through admin API');
    const subscribers = await listSubscribersResponse.json();
    assert.strictEqual(subscribers.length, 1, 'Group should have the seeded subscriber');
    assert.strictEqual(subscribers[0].email, 'thursday.seniors@example.com');

    const createSeniorsEventResponse = await fetch(`${base}/api/events?group=seniors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: seniorsDeleteCourse,
        date: requestDate,
        teeTime: '09:03',
        isTeamEvent: false,
      }),
    });
    assert.strictEqual(createSeniorsEventResponse.status, 403, 'Public seniors event creation should require scoped admin access');

    const createSeniorsEventWithCodeResponse = await fetch(`${base}/api/events?group=seniors&code=000`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: seniorsDeleteCourse,
        date: requestDate,
        teeTime: '09:03',
        isTeamEvent: false,
      }),
    });
    assert.strictEqual(createSeniorsEventWithCodeResponse.status, 201, 'Scoped seniors admin code should create seniors events');
    const createdSeniorsEvent = await createSeniorsEventWithCodeResponse.json();

    const createdSeniorsTeeId = createdSeniorsEvent && createdSeniorsEvent.teeTimes && createdSeniorsEvent.teeTimes[0] && createdSeniorsEvent.teeTimes[0]._id;
    assert.ok(createdSeniorsTeeId, 'Created seniors event should include a tee time');

    const addSeniorsPlayerResponse = await fetch(`${base}/api/events/${createdSeniorsEvent._id}/tee-times/${createdSeniorsTeeId}/players?group=seniors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Public Seniors Player' }),
    });
    assert.strictEqual(addSeniorsPlayerResponse.status, 200, 'Public seniors player signup should still be allowed');
    const addSeniorsPlayerPayload = await addSeniorsPlayerResponse.json();
    const createdSeniorsPlayerId = addSeniorsPlayerPayload
      && addSeniorsPlayerPayload.teeTimes
      && addSeniorsPlayerPayload.teeTimes[0]
      && addSeniorsPlayerPayload.teeTimes[0].players
      && addSeniorsPlayerPayload.teeTimes[0].players[0]
      && addSeniorsPlayerPayload.teeTimes[0].players[0]._id;
    assert.ok(createdSeniorsPlayerId, 'Created seniors player should be returned');

    const removeSeniorsPlayerResponse = await fetch(`${base}/api/events/${createdSeniorsEvent._id}/tee-times/${createdSeniorsTeeId}/players/${createdSeniorsPlayerId}?group=seniors`, {
      method: 'DELETE',
      headers: { 'x-delete-confirmed': 'true' },
    });
    assert.strictEqual(removeSeniorsPlayerResponse.status, 200, 'Public seniors player removal should still be allowed');

    const seniorsDeleteWithMainCode = await fetch(`${base}/api/events/${createdSeniorsEvent._id}?group=seniors&code=${encodeURIComponent(ADMIN_CODE)}`, {
      method: 'DELETE',
    });
    assert.strictEqual(seniorsDeleteWithMainCode.status, 403, 'Main BRS admin code should not delete Seniors events');

    const seniorsDeleteWithScopedCode = await fetch(`${base}/api/events/${createdSeniorsEvent._id}?group=seniors&code=000`, {
      method: 'DELETE',
    });
    assert.strictEqual(seniorsDeleteWithScopedCode.status, 200, 'Seniors admin code should delete Seniors events');

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
