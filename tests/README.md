# Tee Time BRS Tests

This directory contains test files for various components of the tee time booking system.

## Test Files

- `test_add_tee.js` - Tests for automatic team naming and tee time increment logic from the frontend
- `test_server_helpers.js` - Tests for server-side helper functions for team/tee time management

## Running Tests

Run all tests:
```bash
npm test
```

Run a specific test:
```bash
node tests/test_add_tee.js
# or
node tests/test_server_helpers.js
```

## Test Coverage

- Team naming logic
  - Consecutive numbering
  - Handling unnamed teams
  - Collision avoidance
  
- Tee time increment logic
  - 9-minute intervals
  - 24-hour wrap handling
  - Default time handling (07:00)
  - Invalid time handling