Migration Kit: Make your EXISTING Render service + EXISTING MongoDB work with the new site (v3.5.x)
===============================================================================================

What this does
--------------
- Leaves your existing MongoDB *cluster and database* in place.
- Updates existing documents in-place so they match the new schema:
  { course: String, date: 'YYYY-MM-DD', notes: String?, teeTimes: [{ time: 'HH:MM', players: [{name}] }] }
- Converts legacy shapes:
  - If a root field `eventName` (or `title`) exists and `course` is missing, moves it to `course`.
  - If you have old root `teeTime` and `players`, generates 3 teeTimes spaced by 10 minutes and puts players in the first time.
  - Coerces date from Date/ISO strings to 'YYYY-MM-DD' (string).

How to use
----------
1) Copy `scripts/migrate_existing_db.js` into your repo (next to models/, server.js).
2) Ensure your Render service Environment has a valid `MONGO_URI` (same one you already use).
3) (Optional) Add an npm script to package.json:
       "scripts": { "migrate:existing": "node scripts/migrate_existing_db.js" }
4) Deploy the new code to Render (Clear build cache & deploy).
5) Open Render → your service → Shell (if available) and run:
       node scripts/migrate_existing_db.js
   Or locally:
       MONGO_URI='mongodb+srv://...' node scripts/migrate_existing_db.js
6) Hard refresh the site (Ctrl/Cmd+Shift+R).

Notes
-----
- This is idempotent; safe to run more than once.
- It does NOT delete any documents, only transforms fields.
- If you previously had a "title" field, it's removed; the new UI shows COURSE as the main heading.
