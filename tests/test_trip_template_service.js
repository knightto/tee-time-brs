const assert = require('assert');
const {
  DEFAULT_TEMPLATE_NAME,
  buildDefaultTripTemplate,
} = require('../services/tripTemplateService');

function run() {
  const payload = buildDefaultTripTemplate();
  assert.strictEqual(payload.name, DEFAULT_TEMPLATE_NAME, 'Template should use the default cool template name');
  assert(payload.arrivalDate instanceof Date, 'Template should include an arrivalDate');
  assert(payload.departureDate instanceof Date, 'Template should include a departureDate');
  assert.strictEqual(payload.rounds.length, 5, 'Template should create five default rounds');
  assert.strictEqual(payload.competition.scoringMode, 'best4', 'Template should default to best4 scoring');
  assert.strictEqual(payload.competition.handicapBuckets.length, 4, 'Template should include four handicap buckets');
  assert.strictEqual(payload.rounds[0].teeTimes.length, 4, 'Each round should start with four tee time slots');
  assert.strictEqual(payload.rounds[0].scorecard.length, 18, 'Each round should include an 18-hole scorecard');

  const custom = buildDefaultTripTemplate({
    name: 'Custom Name',
    roundCount: 3,
    scoringMode: 'all5',
    startDate: '2030-05-10',
  });
  assert.strictEqual(custom.name, 'Custom Name', 'Custom name should be applied');
  assert.strictEqual(custom.rounds.length, 3, 'Custom round count should be applied');
  assert.strictEqual(custom.competition.scoringMode, 'best4', 'Template scoring mode should remain the default trip template mode');

  console.log('test_trip_template_service.js passed');
}

run();
