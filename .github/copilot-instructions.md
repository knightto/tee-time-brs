# Tee Time BRS — AI working notes

## Big picture
- Express server in `server.js` exposes a small REST API for golf events and subscriptions.
- Zero-build SPA in `public/` (`script.js`, `index.html`) calls the API directly via `fetch`.
- MongoDB via Mongoose models in `models/` (`Event.js`, `Subscriber.js`).
- Optional email via Resend; daily 5:00 PM `LOCAL_TZ` reminder emails for empty tee times + manual trigger.

## Where to look
- `server.js` — routes, date helpers (`asUTCDate`, `fmt`), reminder scheduler, exports `nextTeamNameForEvent` and `nextTeeTimeForEvent` used by tests.
- `models/Event.js` — schema for tee-time vs team events; `teamSizeMax` (2–4); pre-validation requires `time` for non-team events.
- `public/script.js` — dialog-driven UI (create/edit/move/edit-tee), data-* attributes, and a thin `api()` wrapper around `fetch`.

## API contracts (what exists today)
- GET `/api/events` → array of events (sorted by date asc).
- POST `/api/events` { course, date, notes, isTeamEvent, teamSizeMax, teeTime? | teeTimes? } → creates event; for non-team, tee times can be auto-generated.
- PUT `/api/events/:id` → updates `course`, `date`, `notes`, `isTeamEvent`, `teamSizeMax`.
- DELETE `/api/events/:id?code=ADMIN_DELETE_CODE` → hard delete.
- POST `/api/events/:id/tee-times` →
  - Team events: optional `{ name }`; missing name auto-assigns smallest unused “Team N”; duplicates rejected (409).
  - Tee-time events: body may be `{}`; server computes next HH:MM (+8 min from last; default `07:00`; wraps 24h).
- DELETE `/api/events/:id/tee-times/:teeId` → remove a tee/team.
- POST `/api/events/:id/tee-times/:teeId/players` { name } → add player (enforces capacity: 4 or `teamSizeMax`).
- DELETE `/api/events/:id/tee-times/:teeId/players/:playerId` → remove a player; returns updated event JSON.
- POST `/api/events/:id/move-player` { fromTeeId, toTeeId, playerId } → move with capacity checks.
- POST `/api/subscribe` { email } → upsert subscriber and send confirmation (if email configured).
- GET `/admin/run-reminders?code=ADMIN_DELETE_CODE` → send reminder emails now (same logic as daily scheduler).

## Dates, time, and IDs
- Dates are stored as noon UTC. Use `asUTCDate()` on input; client formats with `timeZone:'UTC'` for consistent display.
- Times are `HH:MM` 24h strings; server validates; AM/PM rendering only for emails (`fmt.tee`).
- For team events, slots use `name`; for tee-time events, slots use `time`.

## Dev & run
- Env vars (typical): `MONGO_URI`, `MONGO_DB`, `ADMIN_DELETE_CODE`, `SITE_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `CORS_ORIGIN` (comma-separated), `LOCAL_TZ`, `PORT`.
- Scripts: `npm run dev` (nodemon), `npm start`, `npm test`, `npm run lint`, `npm run format`.
- CORS is controlled via `CORS_ORIGIN`; rate limiting is enabled globally.

### Try it locally
1) Create `.env` (emails optional; leave blank to disable):

```
MONGO_URI=mongodb://127.0.0.1:27017/teetimes
MONGO_DB=tee-times-dev
ADMIN_DELETE_CODE=dev123
SITE_URL=http://localhost:5000/
RESEND_API_KEY=
RESEND_FROM=
CORS_ORIGIN=http://localhost:5000
LOCAL_TZ=America/New_York
PORT=5000
```

2) Install and run:

```powershell
npm install
npm run dev
```

3) Optional checks:

```powershell
npm test
npm run lint
```

## Testing
- Plain Node scripts in `tests/` (no Jest). `tests/test_server_helpers.js` imports `server.js` and calls exported helpers.
- `tests/test_add_tee.js` mirrors client add-tee logic (team naming and 8‑minute increments). `tests/test_render_order.js` checks client-side sort by date.

## Patterns & gotchas
- Auto team naming treats unnamed slots as “Team {index+1}” to avoid collisions; server also rejects duplicate names case-insensitively.
- `nextTeeTimeForEvent` scans last valid slot, adds 8 minutes, wraps to `00:xx`, defaults to `07:00` if none.
- Capacity: 4 by default; team events honor `teamSizeMax` (2–4). Moves fail if destination is full.
- README at repo root describes an older localStorage-only variant; prefer `server.js` and `package.json` for current behavior.

### Known gaps / clarifications
- Daily reminder scheduler (5:00 PM `LOCAL_TZ`) runs every minute; with email disabled, it logs and no-ops.
- Server logs to stdout with JSON-ish lines; there’s no file logger in this repo.