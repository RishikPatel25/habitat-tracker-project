# Habit Tracker

A local, browser based habit tracker built with plain HTML, CSS, and native JavaScript modules. It has no backend and no build step. Chart.js 4.4.1 remains the dashboard chart library and is loaded from its pinned jsDelivr URL; Hanken Grotesk remains an optional Google Font.

## Start

Requires Node.js 18 or newer. From this directory run:

```powershell
npm start
```

Open <http://127.0.0.1:4173>. To run the regression tests use `npm test`.

## Existing data

The new server has a different browser storage origin than the old standalone HTML file. Browser storage is isolated by origin, so the data is not automatically visible on the new URL. Open `habit_tracker_v4_notes (1).html` in the same browser profile and use **Export data**, then open the new app and use **Import data** to select that JSON file. Import validates the saved records, asks before replacing data already in the new app, and stores a timestamped pre-import snapshot in browser storage. The legacy `ht_*` keys are retained; the app normalizes old habit schedules/start dates without deleting the original backup files.

The previous standalone page remains available at its original path. Two historical `.bak` snapshots and the pre-architecture backup under `backups/` are retained as separate files.

## Project layout

- `index.html`: existing dashboard markup with module and stylesheet references
- `src/main.js`: app startup, UI coordination, existing controls and report download
- `src/styles.css`: extracted dashboard styles
- `src/features/analytics/`: shared calculations and chart rendering
- `src/features/habits/`: habit parsing and suggestions
- `src/features/storage/`: safe browser storage and backup import/export validation
- `src/features/state/`: the in-memory tracker state and selected-month action
- `src/features/themes/`: theme palettes and color helpers
- `src/features/tracking/`: mood and sleep controls
- `tests/`: Node built-in regression tests
- `server.js`: dependency-free static development server
- `backups/`: timestamped copy of the pre-architecture app

Chart rendering requires access to the pinned CDN script. Habit tracking and data storage still work if the CDN is unavailable, but analytics charts are not drawn until it loads.

## Analytics rules

- Daily rate is completed scheduled active habits divided by scheduled active habits on that date. Future dates and dates with no eligible habits are omitted.
- Weekly rate uses Sunday–Saturday calendar weeks clipped to the selected month. Future scheduled occurrences enter the projected denominator only when that week contains a pre-marked completion.
- The overall ring is a month projection: completed occurrences plus clearly labeled pre-marked plans divided by all scheduled occurrences in the selected month. Its goal includes future scheduled occurrences.
- Per-habit rate is completed occurrences divided by that habit’s eligible scheduled occurrences through the current date. Archived habits stay out of active dashboard totals; their historical logs remain available in reports through their archive date.
- The moving average is the mean of valid daily rates in the trailing seven calendar dates; days with no eligible habits are skipped. Calculation values retain full precision and are rounded only for display.
- Streaks are calculated per habit from that habit’s schedule. Sleep comparisons describe logged habit rates and do not imply causation.
