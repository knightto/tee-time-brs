// Test server helper functions exported by server.js
process.env.SKIP_MONGO_CONNECT = '1';
const assert = require('assert');
const srv = require('../server');

function run(){
  const tests = [
    { name: 'Team auto-name when none (unnamed becomes Team 1)', ev: { teeTimes: [{}, {name:'Team 2'}] }, expect: 'Team 3' },
    { name: 'Seniors shotgun auto-name uses Group prefix', ev: { groupSlug: 'seniors', seniorsEventType: 'regular-shotgun', isTeamEvent: true, teeTimes: [{ name: 'Group 1' }, { name: 'Group 2' }] }, expect: 'Group 3' },
    { name: 'Team auto-name skips used', ev: { teeTimes: [{name:'Team 1'}, {}, {name:'Team 3'}] }, expect: 'Team 4' },
    { name: 'Tee time increment normal', ev: { teeTimes: [{time:'08:56'}] }, expectTime: '09:05' },
    { name: 'Tee time wrap', ev: { teeTimes: [{time:'23:55'}] }, expectTime: '00:04' },
    { name: 'No teeTimes default', ev: { teeTimes: [] }, expectTime: '07:00' }
  ];

  tests.forEach(t => {
    console.log('\nTest:', t.name);
    if (t.expect) {
      const actual = srv.nextTeamNameForEvent(t.ev);
      console.log('  expected team:', t.expect, '->', actual);
      assert.strictEqual(actual, t.expect);
    }
    if (t.expectTime) {
      const actualTime = srv.nextTeeTimeForEvent(t.ev);
      console.log('  expected time:', t.expectTime, '->', actualTime);
      assert.strictEqual(actualTime, t.expectTime);
    }
  });

  const seniorsShotgunSlots = srv.buildInitialGroupedSlots({
    count: 4,
    startType: 'shotgun',
    startTime: '09:00',
    prefix: 'Group',
  });
  assert.strictEqual(seniorsShotgunSlots.length, 4, 'Shotgun generator should honor requested foursome count');
  assert.deepStrictEqual(
    seniorsShotgunSlots.map((slot) => slot.name),
    ['Group 1', 'Group 2', 'Group 3', 'Group 4'],
    'Shotgun generator should create Group labels for seniors grouped events'
  );
  assert(seniorsShotgunSlots.every((slot) => slot.time === '09:00'), 'Shotgun generator should keep the same start time for each group');

  const skinsDraw = srv.buildWeekendSkinsPopsDraw();
  assert.strictEqual(skinsDraw.sharedHoles.length, 4, 'Skins draw should create 4 pop holes for 12-17 handicaps');
  assert.strictEqual(skinsDraw.bonusHoles.length, 2, 'Skins draw should create 2 bonus holes for 18+ handicaps');
  const allDrawnHoles = skinsDraw.sharedHoles.concat(skinsDraw.bonusHoles);
  assert.strictEqual(new Set(allDrawnHoles).size, 6, 'Skins draw holes should be unique across both buckets');
  assert(allDrawnHoles.every((hole) => Number.isInteger(hole) && hole >= 1 && hole <= 17), 'Skins draw holes should stay within 1-17');
  assert(skinsDraw.generatedAt instanceof Date, 'Skins draw should include a generated timestamp');

  const weekendEvent = {
    groupSlug: 'main',
    date: '2026-04-04',
    teeTimes: [{ time: '08:30' }, { time: '11:10' }, { time: '10:05' }],
  };
  assert.strictEqual(srv.weekendGameEligibleEvent(weekendEvent), true, 'Weekend tee-time events should be eligible for skins pops');
  const unlockAt = srv.skinsPopsUnlockAt(weekendEvent);
  assert(unlockAt instanceof Date && !Number.isNaN(unlockAt.getTime()), 'Skins pops unlock time should be computed for eligible events');
  assert.strictEqual(unlockAt.toISOString(), '2026-04-04T04:00:00.000Z', 'Skins pops should unlock at the start of the event day in local time');
  assert.strictEqual(
    srv.weekendGameEligibleEvent({ groupSlug: 'main', date: '2026-04-06', teeTimes: [{ time: '09:00' }] }),
    true,
    'Weekday main-group tee-time events should also be eligible for skins pops'
  );

  assert.strictEqual(
    srv.buildAuditMessage('move_player', 'Tommy', { fromTeeLabel: '08:00', toTeeLabel: '08:09', isTeamEvent: false }),
    'Moved Tommy from 8:00 AM to 8:09 AM.',
    'Audit messages should format tee-time labels independently of live tee data'
  );
  assert.strictEqual(
    srv.buildEventUpdateAuditMessage(
      { course: 'Blue Ridge', dateISO: '2026-04-04', notes: '', isTeamEvent: false, teamSizeMax: 4, seniorsEventType: '', seniorsRegistrationMode: '', teeCount: 3, courseInfoKey: '{}' },
      { course: 'Rock Harbor', dateISO: '2026-04-05', notes: 'New note', isTeamEvent: true, teamSizeMax: 4, seniorsEventType: '', seniorsRegistrationMode: '', teeCount: 4, courseInfoKey: '{}' }
    ),
    'Updated event details: course, date, notes, format, slot count.',
    'Event update audit message should summarize changed fields'
  );

  const legacyDeleteEntry = srv.buildLegacyTeeAuditEntry({
    _id: 'abc123',
    groupSlug: 'main',
    eventId: 'event123',
    teeId: 'tee123',
    action: 'delete',
    labelBefore: '09:18',
    isTeamEvent: false,
    course: 'Blue Ridge',
    dateISO: '2026-04-04',
    notifyClub: true,
    mailError: null,
    createdAt: new Date('2026-04-05T12:00:00Z'),
  });
  assert.strictEqual(legacyDeleteEntry.message, 'Deleted tee time 9:18 AM. Club notification requested.', 'Legacy tee log entries should carry a durable message');

  const auditWindowStart = srv.getTeeTimeAuditWindowStart(new Date('2026-04-15T12:00:00Z'));
  assert.strictEqual(
    auditWindowStart.toISOString(),
    '2026-03-16T12:00:00.000Z',
    'Tee-time audit window should retain the last 30 days'
  );

  const aprilRange = srv.parseYearMonthRange('2026-04');
  assert(aprilRange && aprilRange.start instanceof Date && aprilRange.end instanceof Date, 'Year-month parsing should build a UTC range');
  assert.strictEqual(aprilRange.start.toISOString(), '2026-04-01T00:00:00.000Z', 'Year-month range should start on the first day of the selected month');
  assert.strictEqual(aprilRange.end.toISOString(), '2026-05-01T00:00:00.000Z', 'Year-month range should end on the first day of the next month');
  assert.strictEqual(
    srv.isPastYearMonth('2026-03', new Date('2026-04-17T12:00:00Z')),
    true,
    'Past-month detection should allow prior months'
  );
  assert.strictEqual(
    srv.isPastYearMonth('2026-04', new Date('2026-04-17T12:00:00Z')),
    false,
    'Past-month detection should reject the current month'
  );

  const archivedEventSnapshot = srv.normalizeArchivedEventSnapshot({
    _id: '507f191e810c19729de860ea',
    groupSlug: 'main',
    course: 'Blue Ridge',
    date: '2026-04-19T00:00:00.000Z',
    notes: 'Keep me',
    isTeamEvent: false,
    teamSizeMax: 4,
    teeTimes: [{ _id: '507f191e810c19729de860eb', time: '08:00', players: [{ name: 'Tommy', checkedIn: true, isFifth: false }] }],
    maybeList: ['Waitlist A'],
  });
  assert.strictEqual(archivedEventSnapshot.course, 'Blue Ridge', 'Archived event snapshots should preserve course names');
  assert.strictEqual(archivedEventSnapshot.teeTimes.length, 1, 'Archived event snapshots should preserve tee times');
  assert.strictEqual(archivedEventSnapshot.teeTimes[0].players[0].name, 'Tommy', 'Archived event snapshots should preserve player names');

  const conflictingSlot = srv.findArchivedSlotConflict(
    { isTeamEvent: false, teeTimes: [{ _id: 'tee-live', time: '08:00', players: [] }] },
    { _id: 'tee-archived', time: '08:00', players: [] },
    false
  );
  assert(conflictingSlot, 'Archived tee-time conflict detection should flag existing tee times with the same time');

  const adminAuditFeed = srv.buildAdminTeeTimeAuditEntries({
    auditLogs: [
      {
        _id: 'audit-1',
        groupSlug: 'main',
        eventId: 'event-deleted',
        action: 'delete_event',
        playerName: 'SYSTEM',
        eventCourse: 'Blue Ridge',
        eventDateISO: '2026-04-04',
        message: 'Deleted event Blue Ridge on 2026-04-04.',
        timestamp: new Date('2026-04-05T09:00:00Z'),
      },
    ],
    teeTimeLogs: [
      {
        _id: 'tee-log-1',
        groupSlug: 'main',
        eventId: 'event-active',
        action: 'delete',
        labelBefore: '09:18',
        isTeamEvent: false,
        course: 'Rock Harbor',
        dateISO: '2026-04-06',
        createdAt: new Date('2026-04-06T10:00:00Z'),
      },
    ],
    activeEventIds: new Set(['event-active']),
  });
  assert.deepStrictEqual(
    adminAuditFeed.map((entry) => [entry.eventId, entry.eventExists, entry.source]),
    [
      ['event-active', true, 'legacy_tee_time_log'],
      ['event-deleted', false, 'audit_log'],
    ],
    'Admin tee-time audit feed should mark deleted events and sort newest entries first'
  );

  const recoveryFeed = srv.buildTeeTimeRecoveryEntries({
    archives: [
      {
        _id: 'archive-tee',
        archiveType: 'tee_time',
        originalEventId: 'event-live',
        originalTeeId: 'tee-deleted',
        eventCourse: 'Blue Ridge',
        eventDateISO: '2026-04-19',
        isTeamEvent: false,
        slotLabel: '08:00',
        snapshot: { _id: 'tee-deleted', time: '08:00', players: [] },
        deletedAt: new Date('2026-04-17T09:00:00Z'),
      },
      {
        _id: 'archive-event',
        archiveType: 'event',
        originalEventId: 'event-gone',
        eventCourse: 'Rock Harbor',
        eventDateISO: '2026-04-20',
        isTeamEvent: false,
        snapshot: { course: 'Rock Harbor' },
        deletedAt: new Date('2026-04-16T09:00:00Z'),
      },
    ],
    activeEvents: [
      { _id: 'event-live', isTeamEvent: false, teeTimes: [] },
    ],
  });
  assert.deepStrictEqual(
    recoveryFeed.map((entry) => [entry.archiveId, entry.canRestore, entry.restoreHint]),
    [
      ['archive-tee', true, 'Restores the deleted tee time.'],
      ['archive-event', true, 'Restores the full event.'],
    ],
    'Delete recovery feed should describe how each archive can be restored'
  );

  assert.strictEqual(
    srv.shouldSendBrsTeeTimeChangeAlert({ groupSlug: 'main', isTeamEvent: false }),
    true,
    'BRS tee-time alerts should send for main-group tee-time events'
  );
  assert.strictEqual(
    srv.shouldSendBrsTeeTimeChangeAlert({ groupSlug: 'main', isTeamEvent: true }),
    false,
    'BRS tee-time alerts should not send for team events'
  );
  assert.strictEqual(
    srv.shouldSendBrsTeeTimeChangeAlert({ groupSlug: 'seniors', isTeamEvent: false }),
    false,
    'BRS tee-time alerts should not send for non-BRS groups'
  );
}

run();

setTimeout(() => {
  process.exit(0);
}, 50);
