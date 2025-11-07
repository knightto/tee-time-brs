// Test server helper functions exported by server.js
const srv = require('../server');

function run(){
  const tests = [
    { name: 'Team auto-name when none (unnamed becomes Team 1)', ev: { teeTimes: [{}, {name:'Team 2'}] }, expect: 'Team 3' },
    { name: 'Team auto-name skips used', ev: { teeTimes: [{name:'Team 1'}, {}, {name:'Team 3'}] }, expect: 'Team 4' },
    { name: 'Tee time increment normal', ev: { teeTimes: [{time:'08:56'}] }, expectTime: '09:04' },
    { name: 'Tee time wrap', ev: { teeTimes: [{time:'23:55'}] }, expectTime: '00:03' },
    { name: 'No teeTimes default', ev: { teeTimes: [] }, expectTime: '07:00' }
  ];

  tests.forEach(t => {
    console.log('\nTest:', t.name);
    if (t.expect) console.log('  expected team:', t.expect, '->', srv.nextTeamNameForEvent(t.ev));
    if (t.expectTime) console.log('  expected time:', t.expectTime, '->', srv.nextTeeTimeForEvent(t.ev));
  });
}

run();
