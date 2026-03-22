# Trip No-Show Policy

## Goal

Handle absences in a way that is:

- fair to the team that still has active players
- explicit in the saved data
- consistent across scoring, prizes, standings, and reports
- simple enough for an admin to apply in real time

This should replace ad hoc note-only handling over time.

## Core Rule Set

### Player Statuses

Every scheduled golfer in a round should have one of these statuses:

- `active`: played and contributes normally
- `no_show`: did not tee off and contributes nothing
- `dnf`: started but did not finish
- `substitute`: replacement golfer who now counts as active
- `withdrawn`: removed from future rounds after leaving the trip

### Default Meaning Of Each Status

- `active`
  - gross score counts
  - handicap strokes count
  - eligible for points and score-based prizes

- `no_show`
  - gross score counts as nothing
  - handicap strokes count as nothing
  - not eligible for points in that match or round
  - not eligible for score-based prizes for that round

- `dnf`
  - no daily net or daily gross eligibility unless the trip explicitly uses a partial-round fallback
  - can still keep hole-specific achievements already earned and tracked, like CTP or birdies, if the trip wants that behavior
  - if team scoring requires a finished total, use the configured DNF fallback rule

- `substitute`
  - replacement golfer becomes the active contributor
  - original golfer gets no points or score credit
  - substitute handicap is used immediately

- `withdrawn`
  - player is automatically marked unavailable for future rounds
  - future rounds should not require scores from that player

## Scoring Rules By Format

### Two-Man Gross Or Net Total Matches

Default rule:

- the missing golfer contributes `0` gross and `0` strokes
- the partner's individual gross score can still be used for daily gross and net rankings
- the match itself is a forfeit loss for the side missing a scheduled player

Reason:

- combined-score formats are defined as a full-side total
- letting the short side still win the match creates a rules argument later

This should be the default for future paired total-match formats.

### Singles

Default rule:

- first option: replace with a substitute
- second option: if no replacement exists, the match is a forfeit loss for the missing side

Reason:

- there is no partner to absorb the absence
- a ghost score is harder to justify fairly in singles

Optional trip override:

- captains may agree to halve a singles point instead of forfeiting, but that should be an explicit admin override, not the default

### Team Aggregate Rounds

For team rounds where a full side score is built from many golfers:

- prefer a substitute if available
- otherwise reduce the counting pool symmetrically if the format supports it

Recommended default:

- if the round counts the best `N` scores, reduce `N` to the number of active players available to both teams
- if the round requires every golfer, use a configurable fallback:
  - `reduce_count`
  - `forfeit_missing_slot`
  - `manual_override`

This rule must be chosen per trip before play starts.

### Best-Ball Or Best-Score-Per-Hole Formats

Default rule:

- the missing golfer contributes no hole scores
- only the active partner's hole result can be used for that side
- the no-show golfer gets no individual points

This lets the active partner keep playing, but never gives credit to the absent player.

## Prize Rules

### Score-Based Daily Prizes

For `daily net`, `daily gross`, `weekly net`, and similar:

- only `active` players with valid scores count
- `no_show` and unfinished `dnf` players are excluded

### Achievement Prizes

For `birdies`, `ctp`, `longest putt`, and similar:

- if the achievement was actually tracked, it can stand even if the player later withdraws
- if nothing was tracked, the money stays in the leftover pot or gets redistributed by the trip rule

### Random Draw Prizes

For things like `over-100 draw`:

- eligibility should come only from real completed round scores
- `no_show` never qualifies

### Team Payout

This should be configurable per trip. Recommended default:

- `active_only`: only players who played at least one completed team-scoring round share the winning-team payout

Optional alternatives:

- `all_paid_players`
- `captains_discretion`

## Admin Workflow

### Before The Round Starts

If a player is known to be out before teeing off:

1. try to substitute
2. if no substitute exists, mark `no_show`
3. if the player will miss the rest of the trip, also mark `withdrawn for remaining rounds`

### During The Round

If a player starts and leaves:

1. mark `dnf`
2. apply the trip's DNF rule for that format
3. keep any manually tracked achievements only if they actually happened before withdrawal

### After Saving

Every no-show or DNF change should automatically recalculate:

- match winners
- round standings
- points per person
- net rankings
- score-based prizes
- payout report

## Data Model Plan

### Phase 1: Minimal Safe Model

Add explicit per-player status arrays on Ryder Cup matches:

- `teamAPlayerContributionStates`
- `teamBPlayerContributionStates`

Allowed values:

- `active`
- `noShow`
- `dnf`
- `substitute`

This matches the existing array-based match structure and is the fastest path.

### Phase 2: Better Long-Term Model

Move to player entry objects instead of parallel arrays:

```json
{
  "teamAEntries": [
    {
      "playerName": "Joe Gillette",
      "status": "active",
      "grossScore": 76,
      "note": ""
    }
  ]
}
```

That avoids drift between:

- player names
- scores
- statuses
- notes

## UI Plan

### Score Entry

Each player row should show:

- player name
- handicap
- status
- gross input
- net preview

If status is `no_show`:

- disable the gross input
- show `No contribution`
- show `0` strokes
- remove that player from required-score counts

If status is `dnf`:

- show the configured fallback behavior for that format

### Round Header

Show:

- active scores entered vs. required
- no-shows
- DNFs
- whether the round is still fully score-complete

### Reports

Day details, standings, and prize reports should all show the applied rule clearly, for example:

- `Jeremy Bridges: No show, no contribution`
- `Caleb Hart: DNF, proxy rule applied`

## Validation Rules

The app should reject invalid saved states:

- a `no_show` with a gross score
- a `substitute` without a replacement player name
- duplicate active players in the same match
- an active player missing from both the schedule and unassigned list

## Audit Rules

Every status change should write an audit event with:

- round
- player
- old status
- new status
- admin user
- timestamp
- optional note

## Test Plan

Add automated coverage for:

- paired team match with one no-show
- singles forfeit
- substitute flow
- DNF flow
- daily net and weekly net excluding no-shows
- points-per-person excluding no-shows
- payout report recomputation after status change
- UI round progress excluding no-show slots from required scores

## Recommended Rollout

### Step 1

Make no-show handling first-class for Myrtle Ryder Cup rounds.

### Step 2

Add singles forfeit and substitute handling.

### Step 3

Apply the same status system to other trip competition formats.

### Step 4

Replace note-driven fallback behavior with explicit saved statuses everywhere.

## Recommended Default Policy

Unless a trip overrides it, use this policy:

- paired combined-score formats: `no_show = forfeit loss`
- singles: `no_show = forfeit`
- best-ball formats: `active partner only`
- team aggregate rounds: `reduce count symmetrically if possible, otherwise manual override`
- score-based prizes: active completed scores only
- achievement prizes: keep only what was actually tracked
- team payout: active players only
