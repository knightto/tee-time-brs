const assert = require('assert');

process.env.SKIP_MONGO_CONNECT = '1';
process.env.BRS_TEE_RETURN_CC = 'alerts@example.com, Tommy.Knight@gmail.com';

const {
  clubCancelCcRecipientsForEvent,
} = require('../server');

function run() {
  assert.deepStrictEqual(
    clubCancelCcRecipientsForEvent(
      { groupSlug: 'main', course: 'Blue Ridge Shadows Golf Club' },
      ['ops@example.com']
    ),
    ['ops@example.com', 'alerts@example.com', 'tommy.knight@gmail.com'],
    'Main-group Blue Ridge Shadows hand-backs should CC Tommy plus any configured extra recipients'
  );

  assert.deepStrictEqual(
    clubCancelCcRecipientsForEvent(
      { groupSlug: 'main', course: 'Blue Ridge Shadows' },
      ['Ops@example.com', 'tommy.knight@gmail.com']
    ),
    ['ops@example.com', 'tommy.knight@gmail.com', 'alerts@example.com'],
    'Duplicate Tommy addresses should be deduped while preserving other CC recipients'
  );

  assert.deepStrictEqual(
    clubCancelCcRecipientsForEvent(
      { groupSlug: 'seniors', course: 'Blue Ridge Shadows' },
      ['ops@example.com']
    ),
    ['ops@example.com'],
    'Non-main groups should not automatically add the Blue Ridge Shadows return CC list'
  );

  assert.deepStrictEqual(
    clubCancelCcRecipientsForEvent(
      { groupSlug: 'main', course: 'Cacapon Resort' },
      ['ops@example.com']
    ),
    ['ops@example.com'],
    'Non-Blue Ridge Shadows events should not automatically add the return CC list'
  );

  console.log('test_club_cancel_recipients.js passed');
}

run();
