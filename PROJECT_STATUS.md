# PROJECT STATUS — Remote CRM

_Last updated: 2026-10-01_

## Project summary
Remote CRM (repo `7209revopro-ops/dilshad-crm`) is a copy of the Delta sales CRM, renamed, with a purple theme, the Delta "d"
mark and a redesigned login. Backend: Bun + Express + Mongoose on **port 7868** (`npm start` / `npm run dev`).
Frontend: Next.js 14 in `delta/` (dev 3001, start 3007). Database: MongoDB `dilshad_crm` (connection in `backend/.env`).

## Last working item
2026-10-01: new statuses **Wrong Number** and **Meeting Scheduled** — the latter asks for the meeting time and gives the
lead's owner a reminder then; 33/33 API checks, the reminder firing end to end, and UI checks on a scratch database;
pushed 2026-10-01. Until the API is deployed, the new statuses fail to save on the live web app.

Before that: 2026-10-01: new leads need a source (form + `POST /leads`; email optional; edits, uploads and the sheet sync unchanged); a
super admin can reassign any lead from the Leads list ("Assign to" next to Call and Note). 21/21 API checks + UI checks on a
scratch database; pushed 2026-10-01 (the server check needs the backend deployed).

Before that: 2026-10-01: the team Report tab and team PDF count every current lead status (they were on an older list, so rows didn't add
up), with an Other column for anything else, and read periods as Dubai days; "Redistribute today" covers the newer statuses.
36/36 API checks + period dates in 4 time zones on a scratch database; pushed as 5297408.

Before that: all four phases of `PLAN.md` are done (Phase 4 — meetings & calendars — 69/69 on a scratch database with a stand-in LMS;
Phases 2 and 3 re-run 75/75 and 73/73; UI checked). Committed and pushed 2026-10-01. Also written, not in the repo: the Apps Script for
the Delta Trading Hub sheet — every row shows its Remote CRM sync status (33/33 against a scratch copy; not installed).

## Pending issues
- **P0 — Security fixes pending.** The details are kept off this public repo — ask the owner. In short: make the repo private,
  rotate the credentials the owner knows about, and give Remote CRM its own database user and its own `SHEETS_API_KEY`
  (`openssl rand -hex 32`).
- **P0 — Deploy the backend.** Besides the four phases, it now carries an access fix (2026-10-01) that only takes effect once the
  API server runs it.
- **P1 — Backend not deployed with the four phases.** The web app (Vercel, auto-deploys from `main`) has the new pages; the API
  server still runs the older code, so they can't load until it is updated (pull, `bun install`, restart).
- **P1 — Timed split loses its log and notice (pre-existing).** `splitScheduler` passes `"system"` as the performer; the daily split
  assigns the lead, then the `lead_assigned` entry and the new owner's notification fail (`CastError`). Not fixed — owner's call.
- **P1 — Meeting invites need the mailbox.** Until `SMTP_*` is set, clients and mentors get nothing (employees still get the
  in-app notice and push).
- **P1 — First super-admin password.** Change the password the first super admin was set up with.
- **P1 — No mailbox yet.** Emails are only logged until `SMTP_*` is set in `backend/.env`.
- **P2 — Old status list in other exports.** The Reports page's Excel/PDF export, the user PDF, the Sales Funnel's
  "qualified" step and the AI insights still use statuses that no longer exist (Interested, Booking, RNR…); their dates are
  read as UTC days, and the PDF dialog's period buttons use the browser's calendar. The team Report and team PDF are fixed.
- **P2 — Team dashboard, Members tab and team bulk status on the old status list (pre-existing).** `teamService`
  counts Booking, RNR, WhatsApp… for the team dashboard, member stats and rankings, and the team page's bulk "Change Status"
  offers them; Pending Response, Not Connected, Lost, MIA, Repeated and the two new statuses show 0 there.
- **P2 — PDF exports (pre-existing).** Every PDF comes out with two extra pages (the footer is written below the page margin,
  which starts a new page), and "₹" and "→" don't render in the built-in font.
- **P2 — Committed build junk.** 956 `CallRecorder/app/build` files, a root `.DS_Store` and `delta/public/swe-worker-*.js` are
  tracked; `3cxExample` is an empty gitlink.
- **P2 — Mentors page redirects everyone but the super admin (pre-existing).** Its menu item shows for all, but the dashboard
  layout sends anyone without a "mentors" permission away — no such module exists. `/calendar` was let through the same check;
  `/mentors` could be too (one line).
- **P2 — Sign-out doesn't revoke tokens.** Recorded, and the app drops its copy, but an access token stays valid until it expires
  (15 min) and a refresh token for 7 days. Server-side revocation would need a token blocklist.
- **P2 — IPs behind a proxy.** The sign-in history reads the first `X-Forwarded-For` hop; make sure the production proxy sets it
  (and strips any the client sends), or every sign-in shows the proxy's address.
- **P2 — Connection string in the start-up log (pre-existing).** `connectDB` prints the database URI when it connects; remove that line.
- **P2 — Pre-existing:** React hydration error from `DesktopSidebar` on every dashboard page; the dashboard "Unassigned Leads"
  count gets 400 (`assignedTo=unassigned`); 3 TypeScript errors in `User.ts`, `authService.ts`, `reportService.ts`.

## Critical warnings
- `backend/.env` holds live settings (database, Telegram backups, 3CX, finance, LMS). Never start a local copy against it with the
  schedulers on — set `RUN_SCHEDULERS=false`, or run with `bun --no-env-file` and `DOTENV_CONFIG_PATH=<missing file>` on a scratch DB.
- The backend's `bun test` suite calls the running API — don't point it at a live one.

## Health check (2026-10-01)
- Backend `tsc`: only the 3 pre-existing errors. Frontend `tsc`: clean.

## Change log
- 2026-09-30 — Renamed to Remote CRM; purple theme; Delta "d" mark; Awwwards-style login; backend on 7868; `.gitignore` rules;
  login no longer reloads on a wrong password; Phase 1 (notifications, email, app settings).
- 2026-09-30 — Phase 2: Inactive leads page (super admin), automatic moves (off by default), move log; `Lead.inactivity`,
  `LeadMove`, `inactiveLeads.enabledAt`; the split rule's member-picking shared by new and moved leads.
- 2026-09-30 — Phase 3: sign-in history (incl. refusals, sign-out endpoint), web-app heartbeat, daily active minutes, idle alerts
  (off by default), Activity page (super admin); shared list components and `lib/animations.ts`.
- 2026-10-01 — Phase 4: meetings (colleagues, client, LMS mentors), calendar invites (.ics) by email, busy check, reminders,
  Calendar page (day / week / month, mentors' LMS time alongside); the Delta Trading Hub sheet script shows sync status per row.
- 2026-10-01 — Leads page "My leads" toggle for super admins and team leaders; lead lists and per-user lead endpoints keep to
  each role's view.
- 2026-10-01 — Team Report and team PDF count the current lead statuses (+ Other), periods in Dubai days; "Redistribute
  today" also moves Pending Response, Not Connected, MIA and Repeated leads. Needs the backend deployed for the new counts.
- 2026-10-01 — New leads need a source (form + server); super admin "Assign to" button on the Leads list.
- 2026-10-01 — Statuses Wrong Number and Meeting Scheduled (meeting time → reminder for the lead's owner); Tailwind scans `lib/`.
