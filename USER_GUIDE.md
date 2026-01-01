# Tee Time BRS - User Guide

## Overview
Tee Time BRS is a comprehensive golf event management system with real-time notifications, weather forecasts, course search, and player management.

---

## Core Features

### 1. **Calendar & Event Selection**
- **View Events by Date**: Interactive calendar shows all events with golf flag (⛳) indicators
- **Select Date**: Click any date to view events scheduled for that day
- **Navigate Months**: Use arrow buttons to browse previous/next months
- **Today Indicator**: Current date highlighted with special border

### 2. **Event Creation**

#### Create Tee Time Event
1. Click **"New Tee Times"** button
2. Fill in event details:
   - **Course Name**: Type to search courses dynamically (searches Golf API)
   - **Date**: Select event date
   - **First Tee Time**: Enter start time (any time, e.g., 7:12 AM)
   - **Notes**: Optional event notes
3. Click **Create Event**
4. System automatically creates 3 tee times, 9 minutes apart
5. Course information displays automatically (location, phone, holes/par)

#### Create Team Event
1. Click **"New Team Event"** button
2. Choose event type:
   - **Shotgun Start**: All teams tee off at same time
   - **Tee-Time Start**: Teams tee off at 9-minute intervals
3. Set team configuration:
   - **Team Size**: 2-4 players per team
   - **Start Time**: First team tee time
4. System automatically creates 3 teams (Team 1, Team 2, Team 3)

### 3. **Player Management**

#### Add Player to Tee Time/Team
1. Click **"+"** button on any tee time or team card
2. Enter player name
3. Player added instantly
4. Duplicate detection prevents confusion

#### Remove Player
1. Click **"×"** button next to player name
2. Confirm removal
3. Player removed from tee time/team

#### Move Player Between Tee Times
1. Click **"↔"** (move) button next to player name
2. Select destination tee time/team from list
3. System checks capacity and moves player
4. Capacity limits enforced (4 for tee times, team size max for teams)

### 4. **Tee Time/Team Management**

#### Add New Tee Time
1. Click **"Add Tee Time"** button on event card
2. For first tee time: Enter time manually
3. For additional tee times: Auto-calculates +9 minutes from last tee time
4. Time wraps at midnight if needed

#### Add New Team
1. Click **"Add Team"** button on event card
2. System auto-names as "Team N" (finds next available number)
3. Prevents duplicate team names

#### Edit Tee Time
1. Click **"✎"** (edit) button on tee time card
2. Select new time from dropdown (6 AM - 7 PM, 9-minute intervals)
3. Or edit team name for team events
4. Changes saved immediately

#### Delete Tee Time/Team
1. Click **"Delete"** button on tee time/team card
2. Confirm deletion
3. All players on that tee time/team are removed

### 5. **Event Editing**
1. Click **"Edit"** button on event card
2. Modify:
   - Course name
   - Date
   - Notes
   - Event type (tee times ↔ teams)
   - Team size (for team events)
3. Click **"Save Changes"**

### 6. **Event Deletion**
1. Click **"Delete"** button on event card
2. Enter admin delete code
3. Event deleted and cancellation emails sent to subscribers

### 7. **"Maybe" List (I'm Interested)**

#### Add Yourself to Maybe List
1. Click **"+ Interested"** button in event card
2. Enter your name
3. Name appears in compact maybe list

#### Remove from Maybe List
1. Click **"×"** button next to your name in maybe list
2. Confirm removal

### 8. **Weather Forecasts**
- Automatic weather icons display for events within 16 days
- Shows temperature and conditions
- Updates when event date changes
- Large, easy-to-read weather icons (doubled size)

### 9. **Course Information**
- **Dynamic Search**: Type course name to search Golf API in real-time
- **Auto-Display**: Selected course shows:
  - 📍 Location (city, state)
  - 📞 Phone number
  - 🔗 Website link
  - ⛳ Holes and Par
- **Caching**: Course data cached for 24 hours for faster loading
- **Local Courses**: 6 Shenandoah Valley courses prioritized in search

### 10. **Notifications & Subscriptions**

#### Subscribe to Email Notifications
1. Click **"Subscribe"** button in header
2. Enter email address
3. Receive confirmation email
4. Get notifications for:
   - New events created
   - Event changes (date, course, notes)
   - Event cancellations
   - Daily reminders (5 PM for empty tee times)

#### Manage Subscription (Admin)
- View all subscribers in admin dashboard
- Enable/disable notifications per subscriber
- Delete subscriptions

### 11. **Audit Logs**
1. Click **"📋"** (audit log) button on event card
2. View complete history:
   - Player additions/removals
   - Player moves between tee times
   - Timestamps for all actions
   - Which tee times were affected

### 12. **Handicap Management** (Admin)
1. Access admin dashboard
2. Navigate to Handicaps section
3. Add/edit player handicaps
4. View all handicaps in sortable list

### 13. **Handicap Import (CSV)** (Admin)
1. Open `/handicap-import.html` and enter admin code.
2. CSV headers required: `club_id, club_name, ghin, first_name, last_name, handicap_index_raw, handicap_index, as_of_date, notes`.
3. `handicap_index` is preferred; if blank, `handicap_index_raw` is parsed (e.g., “+1.2” becomes `-1.2`). Valid range: -15.0 to 54.0.
4. Use **Preview** (dry-run) to see errors with row numbers; **Import** to save.
5. Imports upsert golfers (unique per club + GHIN) and create snapshots; current handicap comes from the latest snapshot (as_of_date/imported_at).

---

## Weekend Game Rules

### Entry Fee: $15 per player
- $5 – 3-Putt Poker
- $5 – Skins Game  
- $5 – Closest to the Pin (all 4 par 3s)

### 3-Putt Poker
- Start with 2 cards
- **3-putt**: Add $1 to pot
- **1-putt**: Gain 1 card
- **0-putt** (chip-in): Gain 2 cards
- Best 5-card poker hand wins

### Skins Game
- Each hole worth 1 skin
- Lowest score wins skin
- **Handicap Strokes**:
  - 12-15 handicap: Strokes on holes 4, 7, 15, 16
  - 17+ handicap: Strokes on holes 1, 4, 7, 11, 15, 16

### Closest to the Pin (CTP)
- All 4 par 3 holes
- Closest on green wins
- If CTP player 3-putts, loses CTP (reverts to previous)
- If no one hits green, split among hole winners

---

## Admin Features

### Access Admin Dashboard
- Navigate to `/admin.html`
- Enter admin code

### Admin Capabilities
1. **View All Subscribers**: Email list with notification preferences
2. **Manage Subscribers**: Enable/disable, delete subscriptions
3. **Golf API Health Check**: Monitor API status and version
4. **Send Manual Reminders**: Trigger reminder emails on demand
5. **View Statistics**: Total subscribers, active notifications
6. **Handicap Management**: Add/edit/view player handicaps
7. **Event Management**: Full control over all events

---

## Keyboard Shortcuts

- **Enter Key**: Submit forms in modals (course search, create event, edit event)
- Works in: Add player prompts, move player dialog, all form inputs

---

## Browser Features

### Cache Management
- Course data cached for 24 hours
- Clear cache: Open browser console, run: `clearCourseCache()`

### Debug Console
- Click **"Show Errors"** button (bottom right, red)
- View API requests, errors, and debug information
- Helpful for troubleshooting

---

## Mobile Responsive Design

All features work on mobile devices:
- Touch-friendly buttons
- Responsive calendar layout
- Scrollable event cards
- Compact player lists (2-column grid on mobile)
- Optimized font sizes and spacing

---

## Tips & Best Practices

1. **Use Course Search**: Type partial names to find courses quickly
2. **Check Weather**: Weather updates automatically for upcoming events
3. **Subscribe**: Get daily reminders for events with empty spots
4. **Audit Logs**: Track who joined/left and when
5. **Maybe List**: Express interest without committing to a tee time
6. **Team Events**: Use for tournaments or group outings
7. **Custom Times**: Not restricted to standard times - use any time you need

---

## Troubleshooting

### Event Not Creating
- Check internet connection
- Verify course name is selected from dropdown
- Ensure date is valid
- Check browser console (Show Errors button)

### Course Search Not Working
- Wait for 300ms after typing (debounced)
- Try typing more characters (minimum 2 chars)
- Check Golf API status in admin dashboard
- Clear course cache if stale data

### Players Not Adding
- Check capacity limits (4 for tee times, team max for teams)
- Avoid duplicate names on same event
- Use nicknames if needed (John S, John 2)

### Weather Not Showing
- Only shows for events within 16 days
- Requires valid date
- Check internet connection for weather API

---

## Technical Details

- **Database**: MongoDB (hosted)
- **Email**: Resend API
- **Weather**: OpenWeather API
- **Golf Courses**: Golf Course API with backup key
- **Deployment**: Render.com with auto-deploy from GitHub
- **Timezone**: America/New_York (configurable)

---

## Support & Contact

For issues or questions:
1. Check "Show Errors" console for diagnostic info
2. Review audit logs for event history
3. Contact system administrator with error details

---

**Version**: 4.0 - Golf Green Theme Edition
**Last Updated**: November 2025
