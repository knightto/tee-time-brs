# Masters Tier Pool

This feature refactors the original Masters game into a tiered-picks pool on the existing Express + Mongoose stack.

## Active format

- Pool format: `tiered_picks`
- Default entry fee: `$10`
- Payout spots: `1st`, `2nd`, `3rd`
- Active entrant flow: enter pool code, pick exactly one golfer from each tier, submit before lock
- Active scoring flow: sum golfer points across the four Masters rounds

The default field comes from the official 2026 Masters Tournament Invitees PDF published by Masters.com and qualified as of April 5, 2026.

## Main files

- `models/MastersPool.js`
- `models/MastersPoolEntry.js`
- `models/MastersPoolAuditLog.js`
- `services/masters2026Field.js`
- `services/mastersPoolService.js`
- `routes/mastersPools.js`
- `public/masters/*.html`
- `public/masters/theme.css`
- `public/masters/app.js`
- `scripts/seed_masters_pool.js`
- `tests/test_masters_pool_service.js`

## Pages

- `/masters`
  Shows current pools and links into the active pool views.
- `/masters/create`
  Creates a tiered Masters pool from the default field and tier setup.
- `/masters/join?poolId=<id>`
  Entrant page for pool code entry and one-golfer-per-tier picks.
- `/masters/live?poolId=<id>`
  Live leaderboard, tier boards, round totals, and payout positions.
- `/masters/admin?poolId=<id>`
  Admin scoring controls, payouts, access code, tier edits, and audit log.
- `/masters/results?poolId=<id>`
  Final standings and payout summary.

## Data model notes

The repo does not use a migration framework. Mongo collections and indexes are created by Mongoose when the app starts, so the schema changes are deployed by shipping the updated model code.

Current core concepts:

- `MastersPool`
  Stores pool settings, tier definitions, golfers, scoring rules, payout rules, and round results.
- `MastersPoolEntry`
  Stores each entrant, one pick per tier, tiebreak prediction, and submission time.
- `MastersPoolAuditLog`
  Stores admin/public actions for pool operations and scoring changes.

## Business rules and where to edit them

- Scoring tables: `services/mastersPoolService.js`
  `DEFAULT_SCORING_RULES`
- Tier defaults: `services/masters2026Field.js`
  `buildDefaultTiers()`
- Pool-wide tier constraints: `services/mastersPoolService.js`
  `DEFAULT_TIER_RULES`
- Optional lineup counting rule:
  `services/mastersPoolService.js`
  `DEFAULT_LINEUP_RULES`
- Tiebreak order:
  `services/mastersPoolService.js`
  `rankEntries()`
- Default payout setup:
  `models/MastersPool.js`
  `payouts`

## Seed data

Run:

```bash
npm run seed:masters
```

The seed script creates:

- one sample Masters pool
- six sample tiers
- the official 2026 field assigned to tiers
- three sample entrant submissions
- mock round results for all four rounds
- computed leaderboard and payout output in the console

## Testing

Run:

```bash
npm test
```

Coverage in `tests/test_masters_pool_service.js` includes:

- one-pick-per-tier validation
- pool access code validation
- round scoring aggregation
- payout calculation
- tiebreak ordering
