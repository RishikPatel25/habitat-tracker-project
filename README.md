# Ritual Habit

Ritual Habit is a browser based habit tracker built with plain HTML, CSS, and native JavaScript modules. The dashboard works in local-only mode by default; an optional Supabase provider can add accounts and cloud sync without replacing the existing storage or analytics. No build step is required. Chart.js 4.4.1 remains the dashboard chart library and is loaded from its pinned jsDelivr URL; Hanken Grotesk remains an optional Google Font.

## Start

Requires Node.js 18 or newer. From this directory run:

```powershell
npm start
```

Open the URL printed by the server (port 4173 unless it is already in use). To run the regression tests use `npm test`.

## Cloudflare Pages

This is a plain HTML/CSS/JavaScript app, not a React/Vite project or a Cloudflare Worker. Build an allowlisted static bundle with `npm run build`; Cloudflare Pages settings are **Framework preset: None**, **Root directory: /**, **Build command: `npm run build`**, **Build output directory: `dist`**, and **Production branch: `main` only after confirming that is the branch connected to the selected repository**. Use a Pages project connected to Git; do not use a Workers deployment command such as `npx wrangler deploy`. Pages Functions live in the root `functions/` directory, outside the generated static bundle.

The landing-page canonical, Open Graph, Twitter, and sitemap URLs currently contain `https://YOUR_PRODUCTION_DOMAIN/`. Replace that placeholder in `index.html`, `robots.txt`, and `sitemap.xml` with the verified production hostname before release. The sitemap lists only the public landing page. The dashboard routes and runtime config endpoint are excluded from indexing; no organization structured data is added because no verified organization details are available.

For Cloudflare Pages, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Pages project's Production and Preview **Variables and Secrets** settings. The Pages Function returns only these public client settings and rejects a service-role key. Keep any service-role key, database password, or other administrative credential out of Pages variables used by this function. Apply the existing database migration and verify cloud security separately before enabling production accounts.

## Optional accounts and cloud sync

The app remains local-only until Supabase is configured. Authentication and sync use the Supabase Auth and PostgREST HTTPS APIs directly from the browser; the static Node server only returns the two public configuration values. No service-role key or database password belongs in this app.

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `SUPABASE_URL` and the project publishable/anon key in `.env.local`. The server exposes only these names at `/runtime-config.json` and blocks direct requests for `.env*` files.
3. In the Supabase SQL editor, run [`db/migrations/0001_user_tracker_documents.sql`](db/migrations/0001_user_tracker_documents.sql). It creates one JSONB tracker document per user, enables and forces RLS, and scopes select/insert/update/delete to `auth.uid() = user_id`.
4. In Supabase Authentication settings, enable email/password, set the site URL and allowed redirect URL to the app origin (for example `http://127.0.0.1:4173/`), and configure email delivery for verification and password resets.
5. Restart `npm start`, open the printed URL, choose the profile button in the header, then sign up or sign in.

On first sign-in, existing guest data is not uploaded without confirmation. A non-overwriting `ht_precloud_migration_*` browser recovery copy is made before migration; cloud records are read back and verified before the app marks migration complete. Same-ID habit/settings conflicts use cloud values, unique local habits are added, checked completion wins a true/false conflict, mood/sleep conflicts use cloud values, and local-only log dates are retained. Same-account offline local changes are cached and merged on the next connection; saves are debounced and serialized. A database revision and compare-and-save RPC reject stale writers; the client reads the latest document, merges records, and retries once, avoiding silent last-write-wins. A failed sync never clears the local copy. Logging out clears active in-memory/dashboard data and leaves the per-account browser cache intact.

The cloud row stores source records and settings, not calculated analytics. The existing analytics and PDF/PNG/CSV export modules are not changed by sync. Date-only keys remain strings (for example `2026-10` and day `17`) and are never parsed through UTC during migration.

Live account registration, email delivery, database policies, and two-user isolation cannot be verified until a real Supabase project and credentials are configured. Apply the SQL migration before enabling cloud accounts. Use separate test accounts to verify RLS in the hosted project before sharing or production deployment; do not use a service-role key in `.env.local`.

## Monthly exports

- **Download reports** opens one format picker for PDF, PNG, CSV, and printable HTML downloads of the selected month.
- PDF is generated locally and downloaded directly as a multi-page file; it does not require a pop-up or print dialog.
- PNG is a theme-aware image of the selected month's progress summary and habit breakdown.
- CSV contains one row per scheduled habit occurrence through the report cutoff, including completion status. Archived habits are included only through their archive date. The UTF-8 file includes a BOM for spreadsheet compatibility.

## Existing data

The new server has a different browser storage origin than the old standalone HTML file. Browser storage is isolated by origin, so the data is not automatically visible on the new URL. Open `habit_tracker_v4_notes (1).html` in the same browser profile and use **Export data**, then open the new app and use **Import data** to select that JSON file. Import validates the saved records, asks before replacing data already in the new app, and stores a timestamped pre-import snapshot in browser storage. The legacy `ht_*` keys are retained; the app normalizes old habit schedules/start dates without deleting the original backup files.

The previous standalone page remains available at its original path. Two historical `.bak` snapshots and the pre-architecture backup under `backups/` are retained as separate files.

## Project layout

- `index.html`: public landing page and product metadata
- `tracker.html`: habit dashboard markup with module and stylesheet references
- `src/main.js`: app startup, UI coordination, existing controls and report download
- `src/styles.css`: extracted dashboard styles
- `src/features/analytics/`: shared calculations and chart rendering
- `src/features/habits/`: habit parsing and suggestions
- `src/features/storage/`: safe browser storage and backup import/export validation
- `src/features/cloud/`: Supabase email authentication, account caches, migration, and revision-aware cloud synchronization
- `db/migrations/`: the user-owned tracker table and row-level security policies
- `src/features/state/`: the in-memory tracker state and selected-month action
- `src/features/themes/`: theme palettes and color helpers
- `src/features/tracking/`: mood and sleep controls
- `tests/`: Node built-in regression tests
- `server.js`: dependency-free static development server
- `backups/`: timestamped copy of the pre-architecture app

Chart rendering requires access to the pinned CDN script. Habit tracking and data storage still work if the CDN is unavailable, but analytics charts are not drawn until it loads.

## Analytics rules

- Daily rate is completed scheduled active habits divided by scheduled active habits on that date. Future dates and dates with no eligible habits are omitted. A date with one eligible habit can correctly be 100% for that day; it does not make the month or other dates 100%.
- Weekly rate uses Sunday–Saturday calendar weeks clipped to the selected month. Future scheduled occurrences enter the projected denominator only when that week contains a pre-marked completion.
- The overall ring is a month projection: completed occurrences plus clearly labeled pre-marked plans divided by all scheduled occurrences in the selected month. Its goal includes future scheduled occurrences.
- Month Goal is the full count of scheduled occurrences from each habit's saved tracking start date through month end. Left is that goal minus completed and pre-marked occurrences. Backfilling a date before the current tracking start includes that date and moves the saved start back; the new occurrence is added to both the goal and completed count, so Left never increases from that completion.
- Per-habit rate is completed occurrences divided by that habit’s eligible scheduled occurrences through the current date. Archived habits stay out of active dashboard totals; their historical logs remain available in reports through their archive date.
- The plotted seven-day average is the arithmetic mean of valid daily completion rates across the trailing seven calendar dates, including dates from the prior month at a month boundary. Future dates and dates with no eligible habits are excluded. The displayed average is the latest available point on that same plotted series. No eligible observations display as N/A. Calculation values retain full precision and are rounded only for display.
- Streaks are calculated per habit from that habit’s schedule. Sleep comparisons describe logged habit rates and do not imply causation.
