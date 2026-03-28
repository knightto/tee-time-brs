const assert = require('assert');
const {
  RYDER_CUP_TEMPLATE_NAME,
  buildRyderCupTripTemplate,
} = require('../services/tripTemplateService');

function run() {
  const buildTemplate = (count, name = `2027 Hilton Head Ryder Cup ${count}`) => buildRyderCupTripTemplate({
    name,
    teamAName: 'Blue',
    teamBName: 'Gold',
    startDate: '2031-09-14',
    firstTeeTime: '07:30',
    teeIntervalMinutes: 10,
    courseNames: ['Harbor', 'Atlantic', 'Ocean', 'Dunes', 'Palmetto'],
    playerNames: Array.from({ length: count }, (_, index) => `Player ${index + 1}`),
    handicapIndexes: Array.from({ length: count }, (_, index) => index + 0.5),
  });
  const ryder = buildTemplate(20, '2027 Hilton Head Ryder Cup');
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
  assert.strictEqual(RYDER_CUP_TEMPLATE_NAME, 'Ryder Cup 5 round template', 'Ryder Cup template constant should expose the public template name');

  const twelvePlayerTemplate = buildTemplate(12);
  assert.strictEqual(twelvePlayerTemplate.trip.rounds[0].teeTimes.length, 3, 'Twelve-player Ryder Cup templates should seed three foursomes');
  assert.strictEqual(twelvePlayerTemplate.participants.length, 12, 'Twelve-player Ryder Cup templates should seed twelve participants');
  assert.strictEqual(twelvePlayerTemplate.trip.competition.ryderCup.teams[0].players.length, 6, 'Twelve-player Ryder Cup templates should split into two six-player teams');
  assert.strictEqual(twelvePlayerTemplate.trip.competition.ryderCup.rounds[4].matches.length, 6, 'Twelve-player Ryder Cup singles should create one match per golfer');
  assert.strictEqual(twelvePlayerTemplate.trip.competition.ryderCup.sideGames.birdiePool.counts.length, 12, 'Birdie pool counts should follow the twelve-player roster');
  assert.strictEqual(twelvePlayerTemplate.trip.competition.ryderCup.payout.totalPot, 1200, 'Twelve-player Ryder Cup templates should scale the total pot');

  const sixteenPlayerTemplate = buildTemplate(16);
  assert.strictEqual(sixteenPlayerTemplate.trip.rounds[0].teeTimes.length, 4, 'Sixteen-player Ryder Cup templates should seed four foursomes');
  assert.strictEqual(sixteenPlayerTemplate.trip.competition.ryderCup.teams[1].players.length, 8, 'Sixteen-player Ryder Cup templates should split into two eight-player teams');
  assert.strictEqual(sixteenPlayerTemplate.trip.competition.ryderCup.payout.totalPot, 1600, 'Sixteen-player Ryder Cup templates should scale the total pot');

  assert.throws(() => buildRyderCupTripTemplate({
    name: 'Invalid Ryder Cup',
    startDate: '2031-09-14',
    playerNames: [
      'Player 1',
      'Player 2',
      'Player 3',
      'Player 4',
      'Player 5',
      'Player 6',
      'Player 7',
      'Player 8',
      'Player 9',
      'Player 10',
      'Player 11',
      'Player 1',
    ],
  }), /unique player names/i, 'Duplicate seeded player names should be rejected');

  console.log('test_trip_template_service.js passed');
}

run();
