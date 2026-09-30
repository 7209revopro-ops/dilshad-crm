# PLAN — Remote CRM

Status key: ⬜ Not started · 🚧 In progress · ✅ Done

Agreed 2026-09-30. One phase at a time; each feature is tested (4 cases) and confirmed before the next.
Defaults chosen where the owner left it open: automatic reassignment behind an on/off switch that ships **off**; only real
action counts (status change, note, follow-up, call, reminder); clocks run in working hours only (Mon–Sat 09:00–18:00
GST, editable); idle limit 30 min; emails are logged, not sent, until a mailbox is configured; mentors are invited by email.

---

## Phase 1 — Foundations ✅
- ✅ 1.1 Email — `mailService` (nodemailer, `SMTP_*`), branded template; logs instead of sending until SMTP is set
- ✅ 1.2 Kept notifications — `Notification` model, `/notifications` API, bell loads/persists them
- ✅ 1.3 `notify()` — in-app + socket + push + email (per-event email switch) in one call
- ✅ 1.4 App settings — `AppSetting` document, `/settings/app` API, Settings → "Automation & alerts"
- ✅ 1.5 4-case test (36/36) + docs

## Phase 2 — Inactive leads ✅
- ✅ 2.1 Rule: assigned longer than the limit (working hours) with no status change / note / follow-up / call / reminder by the owner
- ✅ 2.2 Scheduler (every minute, `RUN_SCHEDULERS`): move to the next team member by the team's split rule, never back to the same person; logged on the lead
- ✅ 2.3 Notify the person who lost it, the new owner and the super admins (in-app, push, email)
- ✅ 2.4 Super-admin "Inactive leads" page: list, single/bulk reassign, log of automatic moves
- ✅ 2.5 4-case test (75/75) + UI check + docs
- Decided while building: automatic moves only apply to leads assigned after the switch goes on (`enabledAt`) — older ones are moved by hand; a lead nobody is left to take is flagged to the super admins once.

## Phase 3 — Login & activity tracking ✅
- ✅ 3.1 Login history: sign-ins (and failures), sign-outs, time, IP, device
- ✅ 3.2 Activity heartbeat from the web app; last-seen and daily active time
- ✅ 3.3 Idle alerts in working hours to the employee + super admins (+ team leaders if switched on), once per idle stretch
- ✅ 3.4 "Activity" page: online now, last seen, idle alerts, active time
- ✅ 3.5 4-case test (73/73) + Phase 2 regression (75/75) + UI check + docs
- Decided while building: idle alerts only for people who used the app today and haven't signed out; super admins aren't tracked; sign-in history, daily activity and idle alerts are kept a year.

## Phase 4 — Meetings & calendars ✅
- ✅ 4.1 Meeting model: organizer, employees, optional client (lead) and mentors (LMS email), link, notes, status
- ✅ 4.2 Calendar page (day / week / month) per person, with follow-ups and mentors' LMS availability/classes; super admin sees anyone's
- ✅ 4.3 Scheduling between employees and the super admin, with a busy warning
- ✅ 4.4 Notices on schedule / change / cancel (+ reminder before start): employees in-app + push + email; client and mentors email with a calendar invite (.ics)
- ✅ 4.5 4-case test (69/69) + Phase 2 (75/75) and Phase 3 (73/73) re-runs + UI check + docs
- Decided while building: a client only from leads the organizer can see; team notes never leave the team; the client and mentors always get their invite (the email switch is for staff); mentors are invited by email, their LMS diary isn't booked (that stays on the Mentors page); times shown in the working-hours zone.

**All four phases done.**
