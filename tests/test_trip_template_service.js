const assert = require('assert');
const {
  RYDER_CUP_TEMPLATE_NAME,
  buildRyderCupTripTemplate,
} = require('../services/tripTemplateService');

function run() {
  const ryder = buildRyderCupTripTemplate({
    name: '2027 Hilton Head Ryder Cup',
    teamAName: 'Blue',
    teamBName: 'Gold',
    startDate: '2031-09-14',
    firstTeeTime: '07:30',
    teeIntervalMinutes: 10,
    courseNames: ['Harbor', 'Atlantic', 'Ocean', 'Dunes', 'Palmetto'],
    playerNames: Array.from({ length: 20 }, (_, index) => `Player ${index + 1}`),
    handicapIndexes: Array.from({ length: 20 }, (_, index) => index + 0.5),
  });
  assert.strictEqual(ryder.trip.name, '2027 Hilton Head Ryder Cup', 'Ryder Cup trip name should be applied');
  assert.strictEqual(ryder.trip.rounds.length, 5, 'Ryder Cup template should always create five rounds');
  assert.strictEqual(ryder.trip.rounds[0].course, 'Harbor', 'Custom course names should populate round labels');
  assert.strictEqual(ryder.trip.rounds[0].teeTimes.length, 5, 'Ryder Cup template should seed five tee times per round');
  assert.strictEqual(ryder.trip.rounds[0].teeTimes[0].time, '07:30', 'Custom first tee time should be applied');
  assert.strictEqual(ryder.trip.rounds[0].teeTimes[1].time, '07:40', 'Tee interval should shift later tee times');
  assert.strictEqual(ryder.participants.length, 20, 'Ryder Cup template should seed twenty participants');
  assert.strictEqual(ryder.participants[0].name, 'Player 1', 'Seeded player names should override Myrtle defaults');
  assert.strictEqual(ryder.participants[0].handicapIndex, 0.5, 'Seeded handicap indexes should be applied');
  assert.strictEqual(ryder.ryderCup.teamAName, 'Blue', 'Overlay should use custom Team A name');
  assert.strictEqual(ryder.ryderCup.teamBName, 'Gold', 'Overlay should use custom Team B name');
  assert.strictEqual(ryder.trip.competition.ryderCup.title, 'Ryder Cup', 'Competition title should default to Ryder Cup');
  assert.strictEqual(ryder.trip.competition.ryderCup.teams[0].players[0], 'Player 1', 'Seeded roster should flow into the Ryder Cup teams');
  assert.strictEqual(ryder.trip.competition.ryderCup.sideGames.birdiePool.counts[19].playerName, 'Player 20', 'Birdie pool should follow the seeded roster');
  assert.strictEqual(RYDER_CUP_TEMPLATE_NAME, 'Ryder Cup Template', 'Ryder Cup template constant should expose the public template name');

  console.log('test_trip_template_service.js passed');
}

run();
