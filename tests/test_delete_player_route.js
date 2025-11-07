// Test the DELETE player route end-to-end against the Express app.
// Requires a running MongoDB matching env MONGO_URI.
const assert = require('assert');
const mongoose = require('mongoose');
const app = require('../server');

async function main(){
  const server = app.listen(0); // ephemeral port
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    // 1. Create an event (non-team) with initial tee time seed
    let res = await fetch(base + '/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: 'RouteTest Course',
        date: '2025-11-07',
        notes: 'route test',
        isTeamEvent: false,
        teamSizeMax: 4,
        teeTime: '08:00'
      })
    });
    assert.ok(res.ok, 'Event create failed');
    const ev = await res.json();
    assert.ok(ev._id, 'Missing event id');
    const teeId = ev.teeTimes[0]._id;

    // 2. Add a player
    res = await fetch(`${base}/api/events/${ev._id}/tee-times/${teeId}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' })
    });
    assert.ok(res.ok, 'Add player failed');
    let ev2 = await res.json();
    assert.equal(ev2.teeTimes[0].players.length, 1, 'Player not added');
    const playerId = ev2.teeTimes[0].players[0]._id;

    // 3. Delete the player via new route
    res = await fetch(`${base}/api/events/${ev._id}/tee-times/${teeId}/players/${playerId}`, { method: 'DELETE' });
    assert.ok(res.ok, 'Delete player failed');
    const ev3 = await res.json();
    assert.equal(ev3.teeTimes[0].players.length, 0, 'Player not deleted');

    console.log('test_delete_player_route.js passed');
  } finally {
    // Always clean up server and DB connection
    await new Promise(resolve => server.close(resolve));
    await mongoose.connection.close();
    process.exit(0);
  }
}

main().catch(e => { 
  console.error('Route test failed', e); 
  process.exit(1); 
});