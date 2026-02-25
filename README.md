# Tee Time Manager — v4.0

A zero-backend tee-time organizer. Single-page app. Uses `localStorage`.

## Features
- Create, edit, delete events with Title, Course, Date.
- Title edits update everywhere immediately.
- Tee time grid with add/remove/move players.
- Radio-button modal to move players across tee times or to Unassigned.
- Unassigned player bucket.
- Configurable number of tee times and players per tee.
- Golf-themed gray/blue UI.

## Run
Open `index.html` in a browser. No build step.

## Notes
All data stays in your browser. To reset, clear localStorage key `ttm.db.v4`.

## Blue Ridge Outings (Secondary DB)

This repo now includes a production-style annual outings feature for Blue Ridge Shadows:

- Public page: `/blue-ridge-outings.html`
- Admin page: `/blue-ridge-outings-admin.html`
- API base: `/api/outings`

### Secondary DB env vars used

- `MONGO_URI_SECONDARY` (required)
- `MONGO_DB_SECONDARY` (optional)
- `ADMIN_DELETE_CODE` (required for admin outing routes)

The feature reuses the existing secondary Mongo connection helper (`secondary-conn.js`) and stores all outing data in that secondary database.

### Data model (secondary DB)

- `BlueRidgeOuting` (event settings/rules)
- `BlueRidgeRegistration` (signup records)
  - includes `paymentStatus` placeholder (`unpaid|pending|paid|refunded`)
- `BlueRidgeTeam` (team shells)
- `BlueRidgeTeamMember` (players)
- `BlueRidgeWaitlist` (waitlist entries)

### Migrations

No SQL migration step is required (Mongoose creates collections/indexes on first use).

### Assumptions

- No user auth/session exists in this repo for outings, so registration identity is email-based.
- \"Check Status\" uses event + email to show active registration/waitlist state.
- Admin outing create/edit APIs use the existing `ADMIN_DELETE_CODE` pattern.

### Seed the 2026 flyer events

```bash
npm run seed:outings
```

This script upserts the 2026 annual outings list in the secondary DB.
