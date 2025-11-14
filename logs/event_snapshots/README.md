# Event Data Snapshot Instructions

To protect against accidental data loss, run the snapshot script each morning to back up all event data:

## Manual Usage

1. Open a terminal in the project root.
2. Run:

    npm run snapshot-events

Or directly:

    node scripts/snapshot_events.js

A dated JSON file will be saved in `logs/event_snapshots/`.

## Automated (Windows Task Scheduler)
- Schedule a daily task to run:

    node U:\knightto\workspace\tee-time-brs\scripts\snapshot_events.js

- Ensure Node.js and environment variables are available in the task context.

## Restore
- To restore, import the desired JSON file into MongoDB or use it to manually recreate events.

---

**Tip:** Keep several days of snapshots for extra safety.
