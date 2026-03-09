# Tin Cup Spreadsheet Match-Tab Mapping

This maps the match tabs to an implementation-ready schema, including entered score data and how points flow.

## 1) Match tab template (applies to Day 1/2/3 match tabs)

| Range | Purpose |
|---|---|
| `A2:J2` | Hole numbers (from `Courses`) |
| `A3:K3` | Par by hole + total par |
| `A4:J4` | Handicap stroke index by hole |
| `M5:O5` | Export headers: Player / Score / Match Play |
| `P5:T5` | Side-game names (from `Results!C40:G40`) |
| `A6:A37` | Player name rows (`6,8,...,36`) and handicap rows (`7,9,...,37`) |
| `B6:J36` | Entered gross hole scores (only player rows) |
| `K6:K36` | Gross 9-hole total (`SUM(B:J)`) |
| `M6:O36` | Export stream to `Scores`/`Points` (`M=name`, `N=score`, `O=match points`) |
| `S39` | Count of side-game winner markers in column `S` (rows `6:37`) |
| `V5:Z5` | Side-game place index values `1..5` |
| `V6:AA37` | Side-game payout factor by player, normalized to `Setup!F44` |
| `A40:K142` | 8 head-to-head match calculation blocks (13 rows each) |

## 2) Head-to-head block structure (starts at rows 40,53,66,79,92,105,118,131)

| Row offset | Meaning |
|---|---|
| `+0` | Label (`Match 1` ... `Match 8`) |
| `+1` | Player 1 gross by hole (`B:J`) |
| `+2` | Player 1 handicap strokes by hole (0/1) from handicap differential and hole SI rank |
| `+3` | Player 1 extra strokes when differential > 9 |
| `+4` | Player 1 net by hole (`gross - hcp - extra`) + points (`K`: 2 win / 1 tie / 0 loss) |
| `+5` | Running match differential by hole and final result text (`Wins X & Y`, `Wins X Up`, `Loss`, `Tie`) |
| `+7` | Player 2 gross by hole |
| `+8` | Player 2 handicap strokes by hole |
| `+9` | Player 2 extra strokes by hole |
| `+10` | Player 2 net by hole + points in `K` |
| `+11` | Player 2 running match differential + final result text in `K` |

## 3) Points flow

- `Points!F:H` pull `O` from Day 1 match tabs.
- `Points!J:O` pull `O` from Day 2A/2B match tabs.
- `Points!P:R` pull `O` from Day 3 match tabs.
- Day 1 and Day 3 stroke points are assigned in `Points!F38:F53` and `Points!J38:J53` (`2` points to top half net rankings).
- Day 4 ranking points are assigned in `Points!N38:N53` using tie-splitting over the place values in `Setup!C49:C60`.

## 4) Entered match data exports

- Player-level entries: `docs/tin-cup-match-player-entries.csv`
- Full head-to-head block values (gross, handicap allocation, net, running hole deltas): `docs/tin-cup-match-head-to-head-blocks.csv`

## 5) Workbook issues found while mapping

- `Matchups!AB75` and `Matchups!AB76` contain `#REF!` and should be `=L15` and `=L16`.
- `Day 2A - Match 4!A8` is a hardcoded `5` and should be `=Matchups!D5`.
- `Points!BD34` has a broken `#REF!` and should be blank on totals row.

## 6) Formula compatibility note

- `Scores!G2:G32` use `_xlfn.IFS`. For compatibility, replace with nested `IF` formulas.