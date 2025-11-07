# AI Development Guide - Tee Time Booking System

## Architecture Overview
This is a golf tee time booking and team organization system with:
- Express.js backend (`server.js`) handling REST API endpoints and email notifications
- Zero-build frontend SPA (`public/script.js` + `public/index.html`)
- MongoDB storage with Mongoose models (`models/`)
- Optional email notifications via Resend API

## Key Components

### Data Models
- `Event`: Core model for golf events
  - Regular tee-time events: Sequential time slots with players
  - Team events: Named teams with variable size (2-4 players)
- `Subscriber`: Email subscribers for notifications
- See `models/Event.js` and `models/Subscriber.js` for schema details

### Frontend Architecture
- Pure JavaScript SPA without build tools
- Dialog-based UI for event/team management
- Key files:
  - `public/script.js`: Core UI logic and API integration
  - `public/style.css`: Golf-themed UI with blue/gray palette
  - `public/index.html`: Base layout and dialogs

### Backend Architecture
- REST API in `server.js`
- File-based logging to `./logs/`
- Email notifications for event changes
- Environment config via `.env`

## Development Patterns

### API Conventions
- GET `/api/events`: List all events
- POST `/api/events`: Create event 
- PUT `/api/events/:id`: Update event details
- DELETE `/api/events/:id`: Delete event (requires admin code)
- POST `/api/events/:id/tee-times`: Add tee time/team
- DELETE `/api/events/:id/tee-times/:teeId`: Remove tee time/team
- POST `/api/events/:id/tee-times/:teeId/players`: Add player
- POST `/api/events/:id/move-player`: Move player between tee times/teams

### Date/Time Handling
- Store dates as noon UTC to avoid timezone issues
- Display times in AM/PM format (e.g. "8:00 AM")
- See time parsing utilities in `server.js`

### Security
- Admin delete operations require `ADMIN_DELETE_CODE`
- Rate limiting on all endpoints
- CORS configuration via env vars

## Key Files
- `server.js`: Main Express application and API routes
- `models/Event.js`: Core event schema and validation
- `public/script.js`: Frontend SPA implementation
- `public/style.css`: UI theme and components
- `public/index.html`: Page structure and dialogs

## Development Workflow

### Required Environment Variables
```
MONGO_URI=mongodb://...
MONGO_DB=dbname
ADMIN_DELETE_CODE=secretcode
SITE_URL=https://...
RESEND_API_KEY=re_... 
RESEND_FROM=email@domain.com
```

### Local Development
1. Copy `.env.sample` to `.env` and configure
2. `npm install` for dependencies
3. `npm run dev` for development with auto-reload

### Database Migrations
See `/scripts` folder for migration utilities:
- `migrate_v1_to_v2.js`: Convert legacy format
- `migrate_existing_db.js`: Normalize data structure
- `normalize.js`: Fix date formats
- `backfill_titles.js`: Populate missing titles

## Error Handling
- Frontend displays user-friendly alerts 
- Backend logs to `./logs/{YYYY-MM-DD}.log`
- Email errors are logged but non-blocking
- See error handling patterns in `server.js`