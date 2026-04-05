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
}

run();

setTimeout(() => {
  process.exit(0);
}, 50);
