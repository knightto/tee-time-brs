const assert = require('assert');
const mongoose = require('mongoose');
const app = require('../server');

async function api(base, path, options = {}) {
  const response = await fetch(base + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

function addMinutesToTime(time, minutesToAdd) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) throw new Error(`Invalid time: ${time}`);
  const totalMinutes = (Number(match[1]) * 60) + Number(match[2]) + Number(minutesToAdd || 0);
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

async function createEvent(base) {
  const uniqueOffset = Date.now() % (10 * 60);
  const teeTime = `${String(6 + Math.floor(uniqueOffset / 60)).padStart(2, '0')}:${String(uniqueOffset % 60).padStart(2, '0')}`;
  const { response, body } = await api(base, '/api/events', {
    method: 'POST',
    body: JSON.stringify({
      course: 'Fifth Limit Test',
      date: '2026-04-15',
      notes: 'event fifth limit test',
      isTeamEvent: false,
      teamSizeMax: 4,
      teeTime
    })
  });
  assert.ok(response.ok, 'Event create failed');
  return body;
}

async function addTee(base, eventId, time) {
  const { response, body } = await api(base, `/api/events/${eventId}/tee-times`, {
    method: 'POST',
    body: JSON.stringify({ time })
  });
  assert.ok(response.ok, `Add tee ${time} failed`);
  return body;
}

async function addPlayer(base, eventId, teeId, name, asFifth = false) {
  return api(base, `/api/events/${eventId}/tee-times/${teeId}/players`, {
    method: 'POST',
    body: JSON.stringify({ name, asFifth })
  });
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    let event = await createEvent(base);
    const extraTeeTime = addMinutesToTime(event.teeTimes[event.teeTimes.length - 1].time, 9);
    event = await addTee(base, event._id, extraTeeTime);

    const firstTeeId = event.teeTimes[0]._id;
    const secondTeeId = event.teeTimes.find((teeTime) => teeTime.time === extraTeeTime)._id;

    for (const name of ['A1', 'A2', 'A3', 'A4']) {
      const { response } = await addPlayer(base, event._id, firstTeeId, name);
      assert.ok(response.ok, `Failed to add ${name} to first tee`);
    }

    let result = await addPlayer(base, event._id, firstTeeId, 'A5', true);
    assert.ok(result.response.ok, 'Failed to add the first event-wide 5th player');
    event = result.body;

    const firstTeeAfterFifth = event.teeTimes.find((teeTime) => String(teeTime._id) === String(firstTeeId));
    const firstFifthPlayer = (firstTeeAfterFifth.players || []).find((player) => player && player.isFifth);
    assert.ok(firstFifthPlayer, 'Expected the first tee to have a marked 5th player');

    for (const name of ['B1', 'B2', 'B3', 'B4']) {
      const { response } = await addPlayer(base, event._id, secondTeeId, name);
      assert.ok(response.ok, `Failed to add ${name} to second tee`);
    }

    result = await addPlayer(base, event._id, secondTeeId, 'B5', true);
    assert.equal(result.response.status, 400, 'Direct add should reject a second 5-some');
    assert.equal(result.body.error, 'only one 5-some is allowed per event');

    result = await api(base, `/api/events/${event._id}/maybe`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Waitlist Wendy' })
    });
    assert.ok(result.response.ok, 'Failed to add maybe-list player');

    result = await api(base, `/api/events/${event._id}/maybe/fill`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Waitlist Wendy', teeId: secondTeeId, asFifth: true })
    });
    assert.equal(result.response.status, 409, 'Maybe fill should reject a second 5-some');
    assert.equal(result.body.error, 'only one 5-some is allowed per event');

    result = await api(base, `/api/events/${event._id}/move-player`, {
      method: 'POST',
      body: JSON.stringify({
        fromTeeId: firstTeeId,
        toTeeId: secondTeeId,
        playerId: firstFifthPlayer._id,
        asFifth: true
      })
    });
    assert.ok(result.response.ok, 'Moving the existing 5th to another full tee should succeed');

    const movedEvent = result.body;
    const movedFromTee = movedEvent.teeTimes.find((teeTime) => String(teeTime._id) === String(firstTeeId));
    const movedToTee = movedEvent.teeTimes.find((teeTime) => String(teeTime._id) === String(secondTeeId));
    assert.equal((movedFromTee.players || []).length, 4, 'Source tee should drop back to four players');
    assert.equal((movedFromTee.players || []).filter((player) => !!(player && player.isFifth)).length, 0, 'Source tee should not keep a 5th marker');
    assert.equal((movedToTee.players || []).length, 5, 'Destination tee should now have five players');
    assert.equal((movedToTee.players || []).filter((player) => !!(player && player.isFifth)).length, 1, 'Destination tee should have exactly one marked 5th player');

    console.log('test_event_fifth_limit.js passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled(mongoose.connections.map((connection) => {
      if (!connection || connection.readyState === 0) return Promise.resolve();
      return connection.close();
    }));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('test_event_fifth_limit.js failed', error);
    process.exit(1);
  });
