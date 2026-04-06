const assert = require('assert');

const {
  buildInboundTeeTimeEmailLogEntry,
  buildInboundTeeTimeEmailLogResultUpdate,
  extractTtid,
  normalizeInboundEmailReceivedAt,
} = require('../utils/inboundTeeTimeEmailLog');

assert.strictEqual(
  extractTtid([
    'Reservation Details',
    'TTID: TTID_0327093435ecg9x',
  ]),
  'TTID_0327093435ecg9x'
);

const receivedAt = normalizeInboundEmailReceivedAt(
  { created_at: '2026-04-06T13:45:11.000Z' },
  {}
);
assert.strictEqual(receivedAt.toISOString(), '2026-04-06T13:45:11.000Z');

const entry = buildInboundTeeTimeEmailLogEntry({
  groupSlug: 'main',
  parsed: {
    action: 'CREATE',
    course: 'Blue Ridge Shadows Golf Club',
    dateStr: '4/12/26',
    timeStr: '7:33am',
    players: 12,
    holes: 18,
    rawLines: [
      'Facility',
      'Blue Ridge Shadows Golf Club',
      'TTID: TTID_0327093435ecg9x',
    ],
  },
  facility: 'Blue Ridge Shadows Golf Club',
  email: {
    id: 'email_123',
    from: 'no-reply@foreupsoftware.com',
    subject: 'Tee Time Reservation Confirmation',
    created_at: '2026-04-06T13:45:11.000Z',
  },
  eventData: {
    id: 'evt_123',
    email_id: 'email_123',
  },
  normalizedDate: '2026-04-12',
  normalizedTime: '07:33',
  generatedTeeTimes: ['07:33', '07:42', '07:51'],
});

assert.deepStrictEqual(
  {
    groupSlug: entry.groupSlug,
    sourceEmailId: entry.sourceEmailId,
    sourceEventId: entry.sourceEventId,
    action: entry.action,
    sourceEmail: entry.sourceEmail,
    subject: entry.subject,
    course: entry.course,
    facility: entry.facility,
    teeDateISO: entry.teeDateISO,
    teeTime: entry.teeTime,
    teeTimes: entry.teeTimes,
    rawDateStr: entry.rawDateStr,
    rawTimeStr: entry.rawTimeStr,
    golferCount: entry.golferCount,
    holes: entry.holes,
    ttid: entry.ttid,
    processingResult: entry.processingResult,
    processingNote: entry.processingNote,
    matchedEventId: entry.matchedEventId,
    createdEventId: entry.createdEventId,
    emailReceivedAt: entry.emailReceivedAt.toISOString(),
  },
  {
    groupSlug: 'main',
    sourceEmailId: 'email_123',
    sourceEventId: 'evt_123',
    action: 'create',
    sourceEmail: 'no-reply@foreupsoftware.com',
    subject: 'Tee Time Reservation Confirmation',
    course: 'Blue Ridge Shadows Golf Club',
    facility: 'Blue Ridge Shadows Golf Club',
    teeDateISO: '2026-04-12',
    teeTime: '07:33',
    teeTimes: ['07:33', '07:42', '07:51'],
    rawDateStr: '4/12/26',
    rawTimeStr: '7:33am',
    golferCount: 12,
    holes: 18,
    ttid: 'TTID_0327093435ecg9x',
    processingResult: 'received',
    processingNote: '',
    matchedEventId: '',
    createdEventId: '',
    emailReceivedAt: '2026-04-06T13:45:11.000Z',
  }
);

assert(entry.loggedAt instanceof Date);

const resultUpdate = buildInboundTeeTimeEmailLogResultUpdate({
  processingResult: 'created',
  processingNote: 'Created a new event from the inbound tee-time email.',
  createdEventId: 'event_123',
});
assert.deepStrictEqual(
  {
    processingResult: resultUpdate.processingResult,
    processingNote: resultUpdate.processingNote,
    matchedEventId: resultUpdate.matchedEventId,
    createdEventId: resultUpdate.createdEventId,
  },
  {
    processingResult: 'created',
    processingNote: 'Created a new event from the inbound tee-time email.',
    matchedEventId: '',
    createdEventId: 'event_123',
  }
);
assert(resultUpdate.loggedAt instanceof Date);

console.log('test_inbound_tee_time_email_log.js passed');
