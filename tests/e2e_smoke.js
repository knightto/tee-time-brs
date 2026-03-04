const { spawn } = require('child_process');
const crypto = require('crypto');
require('dotenv').config();

const PORT = Number(process.env.E2E_PORT || 5055);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_CODE = process.env.ADMIN_DELETE_CODE || '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

function expect(results, condition, name, detail = '') {
  results.push({ ok: Boolean(condition), name, detail });
}

async function waitForBoot() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const health = await api('/api/health');
      if (health.status === 200) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

async function main() {
  const results = [];
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const booted = await waitForBoot();
  if (!booted) {
    expect(results, false, 'Server boot', `Failed to boot on port ${PORT}`);
    console.log(JSON.stringify({ summary: { passed: 0, failed: 1, total: 1 }, results }, null, 2));
    child.kill('SIGTERM');
    process.exit(1);
  }
  expect(results, true, 'Server boot', `Listening on ${PORT}`);

  const runId = crypto.randomBytes(3).toString('hex');
  const teeCourse = `E2E Tee ${runId}`;
  const teamCourse = `E2E Team ${runId}`;
  let teeEventId = null;
  let teamEventId = null;
  let teeId = null;

  try {
    const pages = [
      '/',
      '/index.html',
      '/valley-sip-and-smoke.html',
      '/blue-ridge-outings.html',
      '/blue-ridge-outings-admin.html',
      '/myrtle-trip-2026.html',
      '/rules.html',
      '/handicaps.html',
      '/user-guide.html',
    ];
    for (const page of pages) {
      const res = await api(page, { headers: { 'Content-Type': 'text/html' } });
      expect(results, res.status === 200, `Page ${page}`, `status=${res.status}`);
    }

    const createTee = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        course: teeCourse,
        date: '2026-12-20',
        teeTime: '07:00',
        notes: 'E2E tee event',
        isTeamEvent: false,
      }),
    });
    expect(results, createTee.status === 201 || createTee.status === 200, 'Create tee-time event', `status=${createTee.status}`);
    teeEventId = createTee.body?._id;
    expect(results, Boolean(teeEventId), 'Tee event id returned', teeEventId || 'missing');

    const maybeAdd = await api(`/api/events/${teeEventId}/maybe`, {
      method: 'POST',
      body: JSON.stringify({ name: `E2E Maybe ${runId}` }),
    });
    expect(results, maybeAdd.status === 200, 'Add maybe entry', `status=${maybeAdd.status}`);

    const maybeNoCode = await api(`/api/events/${teeEventId}/maybe/0`, { method: 'DELETE' });
    expect(results, maybeNoCode.status === 200, 'Maybe delete without admin code', `status=${maybeNoCode.status}`);

    const addTee = await api(`/api/events/${teeEventId}/tee-times`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(results, addTee.status === 200, 'Add tee time slot (auto time)', `status=${addTee.status}`);
    teeId = addTee.body?.teeTimes?.slice(-1)?.[0]?._id;
    expect(results, Boolean(teeId), 'Added tee id located', teeId || 'missing');

    const addPlayer = await api(`/api/events/${teeEventId}/tee-times/${teeId}/players`, {
      method: 'POST',
      body: JSON.stringify({ name: `E2E Player ${runId}` }),
    });
    expect(results, addPlayer.status === 200, 'Add player to tee', `status=${addPlayer.status}`);
    const playerId = addPlayer.body?.teeTimes?.find((t) => t._id === teeId)?.players?.slice(-1)?.[0]?._id;
    expect(results, Boolean(playerId), 'Player id returned', playerId || 'missing');

    const delPlayerNoCode = await api(`/api/events/${teeEventId}/tee-times/${teeId}/players/${playerId}`, { method: 'DELETE' });
    expect(results, delPlayerNoCode.status === 200, 'Player delete without admin code', `status=${delPlayerNoCode.status}`);

    const reqExtra = await api(`/api/events/${teeEventId}/request-extra-tee-time`, {
      method: 'POST',
      body: JSON.stringify({ note: `E2E request ${runId}` }),
    });
    expect(results, reqExtra.status === 200, 'Request additional tee time email', `status=${reqExtra.status}`);

    const delTeeNoCode = await api(`/api/events/${teeEventId}/tee-times/${teeId}`, { method: 'DELETE' });
    expect(results, delTeeNoCode.status === 403, 'Tee delete blocked without admin code', `status=${delTeeNoCode.status}`);
    if (ADMIN_CODE) {
      const delTeeWithCode = await api(`/api/events/${teeEventId}/tee-times/${teeId}?code=${encodeURIComponent(ADMIN_CODE)}`, { method: 'DELETE' });
      expect(results, delTeeWithCode.status === 200, 'Tee delete with admin code', `status=${delTeeWithCode.status}`);
    } else {
      expect(results, false, 'Tee delete with admin code', 'ADMIN_DELETE_CODE missing in env');
    }

    const createTeam = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        course: teamCourse,
        date: '2026-12-21',
        isTeamEvent: true,
        teamSizeMax: 4,
        teamStartType: 'shotgun',
        teamStartTime: '08:00',
        notes: 'E2E team event',
      }),
    });
    expect(results, createTeam.status === 201 || createTeam.status === 200, 'Create team event', `status=${createTeam.status}`);
    teamEventId = createTeam.body?._id;
    expect(results, Boolean(teamEventId), 'Team event id returned', teamEventId || 'missing');

    const addTeam = await api(`/api/events/${teamEventId}/tee-times`, { method: 'POST', body: JSON.stringify({}) });
    expect(results, addTeam.status === 200, 'Add team to team event', `status=${addTeam.status}`);
    expect(results, (addTeam.body?.teeTimes?.length || 0) >= 4, 'Team count increments', `teamCount=${addTeam.body?.teeTimes?.length || 0}`);

    const outings = await api('/api/outings');
    expect(results, outings.status === 200, 'Outings list API', `status=${outings.status}`);

    const valley = await api('/api/valley/state');
    expect(results, valley.status === 200, 'Valley state API', `status=${valley.status}`);

    const trips = await api('/api/trips?myrtleBeach2026=true');
    expect(results, trips.status === 200, 'Trips API (secondary DB)', `status=${trips.status}`);

    const schedule = valley.body?.schedule || [];
    if (schedule.length) {
      const addAttendee = await api('/api/valley/attendees', {
        method: 'POST',
        body: JSON.stringify({
          name: `E2E Attendee ${runId}`,
          passcode: `pass-${runId}`,
          eventId: schedule[0].id,
        }),
      });
      expect(results, addAttendee.status === 201, 'Valley add attendee', `status=${addAttendee.status}`);
      const attendeeId = addAttendee.body?._id;
      if (attendeeId) {
        const checkIn = await api(`/api/valley/attendees/${attendeeId}/check-in`, {
          method: 'PATCH',
          body: JSON.stringify({ checkedIn: true }),
        });
        expect(results, checkIn.status === 200, 'Valley attendee check-in update', `status=${checkIn.status}`);

        const deleteAttendee = await api(`/api/valley/attendees/${attendeeId}`, { method: 'DELETE' });
        expect(results, deleteAttendee.status === 200, 'Valley attendee delete', `status=${deleteAttendee.status}`);
      }
    } else {
      expect(results, false, 'Valley add attendee', 'No schedule items returned');
    }
  } finally {
    if (ADMIN_CODE && teeEventId) {
      await api(`/api/events/${teeEventId}?code=${encodeURIComponent(ADMIN_CODE)}`, { method: 'DELETE' });
    }
    if (ADMIN_CODE && teamEventId) {
      await api(`/api/events/${teamEventId}?code=${encodeURIComponent(ADMIN_CODE)}`, { method: 'DELETE' });
    }
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 1200);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(JSON.stringify({ summary: { passed, failed, total: results.length }, results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
