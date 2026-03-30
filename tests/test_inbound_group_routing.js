const assert = require('assert');

const {
  parseGroupSlugFromInboundAddress,
  parseGroupSlugFromSubject,
  isAllowedInboundRecipient,
  inferInboundGroupRouting,
} = require('../utils/inboundGroupRouting');

const INBOUND_ADDRESS = 'teetime@xenailexou.resend.app';

assert.strictEqual(
  parseGroupSlugFromInboundAddress('teetime+seniors@xenailexou.resend.app', INBOUND_ADDRESS),
  'seniors'
);

assert.strictEqual(
  parseGroupSlugFromInboundAddress('teetime+Thursday_Seniors_Group@xenailexou.resend.app', INBOUND_ADDRESS),
  'thursday-seniors-group'
);

assert.strictEqual(
  parseGroupSlugFromSubject('ForeUp confirmation [group:seniors]'),
  'seniors'
);

assert.strictEqual(isAllowedInboundRecipient(INBOUND_ADDRESS, INBOUND_ADDRESS), true);
assert.strictEqual(isAllowedInboundRecipient('teetime+seniors@xenailexou.resend.app', INBOUND_ADDRESS), true);
assert.strictEqual(isAllowedInboundRecipient('someoneelse@xenailexou.resend.app', INBOUND_ADDRESS), false);

const aliasRouting = inferInboundGroupRouting({
  eventTo: ['teetime+seniors@xenailexou.resend.app'],
  subject: 'New tee time confirmation',
  baseAddress: INBOUND_ADDRESS,
});
assert.deepStrictEqual(aliasRouting, {
  groupSlug: 'seniors',
  source: 'recipient-alias',
  marker: 'teetime+seniors@xenailexou.resend.app',
});

const subjectRouting = inferInboundGroupRouting({
  eventTo: [INBOUND_ADDRESS],
  subject: 'New tee time confirmation [group:seniors]',
  baseAddress: INBOUND_ADDRESS,
});
assert.deepStrictEqual(subjectRouting, {
  groupSlug: 'seniors',
  source: 'subject-tag',
  marker: 'New tee time confirmation [group:seniors]',
});

const defaultRouting = inferInboundGroupRouting({
  eventTo: [INBOUND_ADDRESS],
  subject: 'New tee time confirmation',
  baseAddress: INBOUND_ADDRESS,
});
assert.deepStrictEqual(defaultRouting, {
  groupSlug: '',
  source: 'default',
  marker: '',
});

console.log('test_inbound_group_routing.js passed');
