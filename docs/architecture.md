# Architecture Overview

## Runtime
- `server.js`: Express app entry point and scheduler.
- Primary DB: MongoDB (`MONGO_URI`).
- Secondary DB: MongoDB (`MONGO_URI_SECONDARY`) via `secondary-conn.js`.

## API Domains
- `routes/trips.js`: Myrtle trip tracking (secondary DB optional mode).
- `routes/outings.js`: Blue Ridge outings/registrations/teams/waitlist (secondary DB).
- `routes/valley.js`: Valley Sip & Smoke attendance/reserve flows (secondary DB).
- `server.js`: Core tee-time events, admin utilities, notifications, handicap import routes.

## Frontend
- Main tee-time app: `public/index.html`, `public/script.js`, `public/style.css`.
- Additional pages: Blue Ridge outings, Valley Sip & Smoke, Myrtle trip, rules, handicaps.
- Service worker: `public/service-worker.js` with generated cache asset list (`public/sw-assets.js`).

## Middleware and Services
- `middleware/requestContext.js`: per-request ID + structured request log line.
- `middleware/responseCache.js`: lightweight in-memory JSON cache for GET endpoints.
- `middleware/validate.js`: request-body validation helpers.
- `services/logger.js`: JSON structured logger.

## Data Models
- Core events: `models/Event.js`, `models/Subscriber.js`, `models/TeeTimeLog.js`, audit/settings models.
- Outings: `models/BlueRidge*`.
- Valley: `models/Valley*`.
- Trips: `models/Trip.js`, `models/TripParticipant.js`.

## Build and Maintenance Scripts
- `npm run build:frontend`: minifies frontend assets into `public/dist`.
- `npm run gen:sw-assets`: regenerates service-worker cache list.
- `npm run db:index:review`: prints primary/secondary index definitions.
- `npm run db:index:sync`: syncs model indexes to DB.
- `npm run test:reset`: removes E2E-generated test records.
- `npm run test:e2e`: full scripted end-to-end smoke run.
