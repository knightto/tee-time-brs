const assert = require('assert');
const mongoose = require('mongoose');

const app = require('../server');
const { getSecondaryConn } = require('../secondary-conn');
const Subscriber = require('../models/Subscriber');

const MAIN_ADMIN_CODE = process.env.SITE_ADMIN_WRITE_CODE || process.env.SITE_ACCESS_CODE || '123';
const SENIORS_ADMIN_CODE = '000';

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const runId = Date.now();
  const sharedEmail = `shared-subscriber-${runId}@example.com`;
  let testFailed = false;

  async function cleanup() {
    await Subscriber.deleteMany({ email: sharedEmail }).catch(() => {});
  }

  try {
    await cleanup();

    const mainSubscribe = await fetch(`${base}/api/subscribe?group=main`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sharedEmail }),
    });
    assert.strictEqual(mainSubscribe.status, 200, 'Main group subscribe should succeed');
    const mainPayload = await mainSubscribe.json();
    assert.strictEqual(mainPayload.isNew, true, 'First main group subscribe should create a record');
    assert.strictEqual(mainPayload.groupSlug, 'main');
    assert.strictEqual(mainPayload.groupReference, 'BRS Group');

    const seniorsSubscribe = await fetch(`${base}/api/subscribe?group=seniors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sharedEmail }),
    });
    assert.strictEqual(seniorsSubscribe.status, 200, 'Seniors group subscribe should succeed');
    const seniorsPayload = await seniorsSubscribe.json();
    assert.strictEqual(seniorsPayload.isNew, true, 'First seniors group subscribe should create a separate record');
    assert.strictEqual(seniorsPayload.groupSlug, 'seniors');
    assert.strictEqual(seniorsPayload.groupReference, 'Thursday Seniors');

    const repeatMainSubscribe = await fetch(`${base}/api/subscribe?group=main`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sharedEmail }),
    });
    assert.strictEqual(repeatMainSubscribe.status, 200, 'Repeat main subscribe should still succeed');
    const repeatMainPayload = await repeatMainSubscribe.json();
    assert.strictEqual(repeatMainPayload.isNew, false, 'Repeat main subscribe should not create a duplicate');

    const mainSubscribersResponse = await fetch(`${base}/api/admin/subscribers?group=main`, {
      headers: { 'x-admin-code': MAIN_ADMIN_CODE },
    });
    assert.strictEqual(mainSubscribersResponse.status, 200, 'Main admin subscriber list should load');
    const mainSubscribers = await mainSubscribersResponse.json();
    const mainRecord = mainSubscribers.find((entry) => entry.email === sharedEmail);
    assert.ok(mainRecord, 'Main subscriber list should include the shared email');

    const seniorsSubscribersResponse = await fetch(`${base}/api/admin/subscribers?group=seniors`, {
      headers: { 'x-admin-code': SENIORS_ADMIN_CODE },
    });
    assert.strictEqual(seniorsSubscribersResponse.status, 200, 'Seniors admin subscriber list should load');
    const seniorsSubscribers = await seniorsSubscribersResponse.json();
    const seniorsRecord = seniorsSubscribers.find((entry) => entry.email === sharedEmail);
    assert.ok(seniorsRecord, 'Seniors subscriber list should include the shared email');
    assert.notStrictEqual(String(mainRecord._id), String(seniorsRecord._id), 'Each group should keep its own subscriber record');

    const unsubscribeResponse = await fetch(`${base}/api/unsubscribe/${encodeURIComponent(seniorsRecord.unsubscribeToken)}`);
    assert.strictEqual(unsubscribeResponse.status, 200, 'Group unsubscribe should succeed');
    const unsubscribeHtml = await unsubscribeResponse.text();
    assert.ok(unsubscribeHtml.includes('Thursday Seniors'), 'Unsubscribe page should name the removed group');
    assert.ok(unsubscribeHtml.includes('still active'), 'Unsubscribe page should clarify other groups remain active');

    const mainAfterUnsubscribe = await Subscriber.findOne({ groupSlug: 'main', email: sharedEmail }).lean();
    assert.ok(mainAfterUnsubscribe, 'Main group subscription should remain after seniors unsubscribe');

    const seniorsAfterUnsubscribe = await Subscriber.findOne({ groupSlug: { $in: ['seniors', 'thursday-seniors-group'] }, email: sharedEmail }).lean();
    assert.strictEqual(seniorsAfterUnsubscribe, null, 'Seniors subscription should be removed by its unsubscribe link');

    console.log('test_group_subscriber_scope.js passed');
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
  console.error('test_group_subscriber_scope.js failed', error);
  process.exitCode = 1;
});
