// Quick test harness for add-tee logic from public/script.js
// Mirrors the logic used when clicking Add Team / Add Tee Time

function nextTeamName(ev) {
  const used = new Set();
  (ev.teeTimes || []).forEach((tt, idx) => {
    if (tt && tt.name) used.add(String(tt.name).trim());
    else used.add(`Team ${idx+1}`);
  });
  let nextTeamNum = 1;
  while (used.has(`Team ${nextTeamNum}`)) nextTeamNum++;
  return `Team ${nextTeamNum}`;
}

function nextTeeTime(ev) {
  let time;
  if (ev.teeTimes && ev.teeTimes.length) {
    for (let i = ev.teeTimes.length - 1; i >= 0; i--) {
      const lt = ev.teeTimes[i] && ev.teeTimes[i].time;
      if (typeof lt === 'string') {
        const m = /^(\d{1,2}):(\d{2})$/.exec(lt.trim());
        if (m) {
          const hours = parseInt(m[1], 10);
          const minutes = parseInt(m[2], 10);
          if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            const total = hours * 60 + minutes + 8;
            const newHours = Math.floor(total / 60) % 24;
            const newMinutes = total % 60;
            time = `${String(newHours).padStart(2,'0')}:${String(newMinutes).padStart(2,'0')}`;
            break;
          }
        }
      }
    }
  }
  if (!time) time = '07:00';
  return time;
}

// Test cases
const tests = [
  {
    name: 'Consecutive numbered teams',
    ev: { teeTimes: [{ name: 'Team 1' }, { name: 'Team 2' }] },
    expectTeam: 'Team 3'
  },
  {
    name: 'Unnamed and named collision',
    ev: { teeTimes: [{ }, { name: 'Team 1' }] },
    expectTeam: 'Team 2'
  },
  {
    name: 'Existing custom names keep incrementing',
    ev: { teeTimes: [{ name: 'Alpha' }, { name: 'Team 1' }, { name: 'Team 3' }] },
    expectTeam: 'Team 2' // Team 2 is missing
  },
  {
    name: 'Simple tee increment 08:56 -> 09:04',
    ev: { teeTimes: [{ time: '08:56' }] },
    expectTime: '09:04'
  },
  {
    name: 'Midnight wrap 23:55 -> 00:03',
    ev: { teeTimes: [{ time: '23:55' }] },
    expectTime: '00:03'
  },
  {
    name: 'Malformed last time -> default 07:00',
    ev: { teeTimes: [{ time: 'abc' }, { time: '8:5' }] },
    expectTime: '07:00'
  },
  {
    name: 'No teeTimes -> default 07:00',
    ev: { teeTimes: [] },
    expectTime: '07:00'
  }
];

console.log('Running add-tee logic tests...');
for (const t of tests) {
  const team = nextTeamName(t.ev);
  const time = nextTeeTime(t.ev);
  console.log(`\nTest: ${t.name}`);
  if (t.expectTeam) console.log(`  expected team: ${t.expectTeam}  -> computed: ${team}`);
  if (t.expectTime) console.log(`  expected time: ${t.expectTime}  -> computed: ${time}`);
}

console.log('\nDone.');
