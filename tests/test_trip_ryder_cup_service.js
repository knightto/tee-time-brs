const assert = require('assert');
const {
  buildTripRyderCupView,
  getDefaultTripRyderCupState,
  setTripRyderCupState,
} = require('../services/tripRyderCupService');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  const participants = [
    { _id: 'p1', name: 'Joe Gillette' },
    { _id: 'p2', name: 'John Quimby' },
    { _id: 'p3', name: 'Tommy Knight' },
  ];

  const defaultState = getDefaultTripRyderCupState(participants);
  const teamAJunior = defaultState.teamAPlayers.find((player) => player.name === 'Tommy Knight (Jr)');
  assert(teamAJunior, 'Default Team A should include Tommy Knight (Jr)');
  assert.strictEqual(teamAJunior.playerId, 'p3', 'Tommy Knight (Jr) should alias to the Tommy Knight participant id');

  const view = buildTripRyderCupView(defaultState, participants);
  assert.strictEqual(view.balance.teamASum, 105, 'Team A seeds should sum to 105');
  assert.strictEqual(view.balance.teamBSum, 105, 'Team B seeds should sum to 105');
  assert.strictEqual(view.balance.difference, 0, 'Default rosters should be perfectly balanced by seed sum');

  const invalidPayload = clone(defaultState);
  invalidPayload.teamAPlayers = invalidPayload.teamAPlayers.slice(0, 9);
  assert.throws(
    () => setTripRyderCupState({}, participants, invalidPayload),
    /exactly 10 players on each side/i,
    'Saving should reject rosters that do not keep 10 players on each team'
  );

  console.log('test_trip_ryder_cup_service.js passed');
}

run();
