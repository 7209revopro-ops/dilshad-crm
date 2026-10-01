# Carlton CRM — Backend Features

This file documents every backend feature. Read this before implementing anything to understand scope, middleware chains, and related features.

---

## Feature Template

Each feature documents:
- **Description**: What this feature does
- **Routes**: Method, path, full middleware chain
- **Service Methods**: Which service methods are called
- **Models Used**: Which Mongoose models are read/written
- **Socket Events**: Any Socket.io events emitted
- **Related Features**: Which features interact with this one
- **Change Log**: History of changes

---

## 1. Authentication

**Description**: Login with email/password, get JWT tokens, refresh access token, view own profile, change password.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/v1/auth/login` | (none — public) |
| POST | `/api/v1/auth/refresh` | (none — public) |
| GET | `/api/v1/auth/profile` | `authenticate` |
| PUT | `/api/v1/auth/change-password` | `authenticate` |

**Service Methods**: `authService.login`, `authService.refreshToken`, `authService.getProfile`, `authService.changePassword`

**Models Used**: `User` (read + write for password change), `Role` (read for auth middleware)

**Socket Events**: None

**Related Features**: All protected features (authenticate is the gateway), Role & Permission Management (role loaded fresh per request)

**Change Log**:
- Initial implementation — login + JWT tokens
- Added role loading in authenticate middleware (load fresh from DB, not from token)
- Added inactive user check in authenticate middleware

---

## 2. Lead Management

**Description**: Full CRUD for leads including status updates, field editing, single assignment to users/teams, and activity log tracking.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/leads` | `authenticate`, `checkPermission("leads","view")` |
| POST | `/api/v1/leads` | `authenticate`, `checkPermission("leads","create")` |
| GET | `/api/v1/leads/:id` | `authenticate`, `checkPermission("leads","view")` |
| PUT | `/api/v1/leads/:id` | `authenticate`, `checkPermission("leads","edit")` |
| DELETE | `/api/v1/leads/:id` | `authenticate`, `checkPermission("leads","delete")` |
| PATCH | `/api/v1/leads/:id/status` | `authenticate`, `checkPermission("leads","edit")` |
| POST | `/api/v1/leads/:id/assign` | `authenticate`, `checkPermission("leads","edit")` |
| POST | `/api/v1/leads/:id/assign-team` | `authenticate`, `checkPermission("leads","edit")` |
| POST | `/api/v1/leads/:id/transfer-team` | `authenticate`, `checkPermission("leads","edit")` |

**Service Methods**: `leadService.createLead`, `leadService.getLeads`, `leadService.getLead`, `leadService.updateLead`, `leadService.deleteLead`, `leadService.updateLeadStatus`, `leadService.assignLead`, `leadService.assignLeadToTeam`, `leadService.transferLeadToTeam`

**Models Used**: `Lead` (all), `User` (assignedTo populate), `Team` (team populate), `Course` (course populate)

**Socket Events**: `lead:assigned` — emitted when a lead is assigned to a user (emitted to assignee's private room)

**Related Features**: Lead Upload (#3), Lead Auto-Assignment (#4), Reminder System (#5), Payment Tracking (#6), Team Management (#7)

**Change Log**:
- Initial CRUD implementation
- Added activityLogs tracking on every mutation
- Added `lead:assigned` socket event on assignment
- Added push notification on assignment via pushService

---

## 3. Lead Upload (CSV/Excel Bulk Import)

**Description**: Upload an xlsx/csv file of leads; parse, validate, and bulk-insert. Returns count of created vs failed rows.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/v1/leads/upload` | `authenticate`, `checkPermission("leads","create")`, `multer.single("file")` |

**Note**: `/upload` route MUST be declared before `/:id` in the router — see mistakes.md #6.

**Service Methods**: `leadService.bulkCreateLeads`, `excelService.parseExcelBuffer`

**Models Used**: `Lead`

**Socket Events**: None

**Related Features**: Lead Management (#2), Lead Auto-Assignment (#4)

**Change Log**:
- Initial implementation with xlsx parsing
- Fixed notes field — must be array, not string (see mistakes.md #2)
- Fixed email validation — "No Email" now stored as undefined (see mistakes.md #2)
- Added `ordered: false` for partial success on insertMany
- Added result.length check to count actual failures

---

## 4. Lead Auto-Assignment (Global)

**Description**: Automatically distribute unassigned leads to team members using round-robin algorithm. Global version (not team-scoped).

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/v1/leads/auto-assign` | `authenticate`, `checkPermission("leads","edit")` |

**Note**: `/auto-assign` route MUST be declared before `/:id` in the router.

**Service Methods**: `leadService.autoAssignLeads`

**Models Used**: `Lead`, `Team`, `User`

**Socket Events**: `lead:assigned` — emitted per assignment to each assignee

**Related Features**: Team Auto-Assign (#8), Team Management (#7)

**Change Log**:
- Initial round-robin implementation
- Fixed populated ObjectId toString() bug (see mistakes.md #1)

---

## 5. Reminder System

**Description**: Leads can have multiple time-based reminders. Background scheduler fires socket + push notifications when reminders are due or upcoming.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/leads/reminders/mine` | `authenticate` |
| GET | `/api/v1/leads/reminders/count` | `authenticate` |
| POST | `/api/v1/leads/:id/reminders` | `authenticate`, `checkPermission("reminders","create")` |
| PUT | `/api/v1/leads/:id/reminders/:reminderId` | `authenticate`, `checkPermission("reminders","edit")` |
| DELETE | `/api/v1/leads/:id/reminders/:reminderId` | `authenticate`, `checkPermission("reminders","edit")` |

**Note**: `/reminders/mine` and `/reminders/count` MUST be declared before `/:id` — static before parameterized.

**Service Methods**: `leadService.getMyReminders`, `leadService.getMyReminderCount`, `leadService.addReminder`, `leadService.updateReminder`, `leadService.deleteReminder`

**Background**: `reminderScheduler.ts` — runs every 30s via `setInterval`

**Models Used**: `Lead` (reminders embedded array)

**Socket Events**:
- `reminder:due` — emitted by scheduler when reminder passes due time
- `reminder:warning` — emitted by scheduler when reminder is 1-31 minutes away

**Related Features**: Lead Management (#2) — reminders are embedded in leads; Push Notifications (#15)

**Change Log**:
- Initial reminder CRUD
- Added scheduler with two-pass notification system
- Fixed arrayFilters bug — must include `_id` match (see mistakes.md #5)
- Added push notification alongside socket event

---

## 6. Payment Tracking

**Description**: Per-lead payment recording. Each lead can have multiple payment records (amount, mode, date, note).

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/v1/leads/:id/payments` | `authenticate`, `checkPermission("leads","edit")` |
| PUT | `/api/v1/leads/:id/payments/:paymentId` | `authenticate`, `checkPermission("leads","edit")` |
| DELETE | `/api/v1/leads/:id/payments/:paymentId` | `authenticate`, `checkPermission("leads","delete")` |

**Service Methods**: `leadService.addPayment`, `leadService.updatePayment`, `leadService.deletePayment`

**Models Used**: `Lead` (payments embedded array)

**Socket Events**: None

**Related Features**: Reports & Analytics (#13) — revenue reports aggregate from payment records; Team Management (#7) — team revenue uses these records

**Change Log**:
- Initial payment CRUD implementation

---

## 7. Team Management

**Description**: Full CRUD for teams, member management, team lead lists, team dashboard, activity logs.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/teams` | `authenticate`, `checkPermission("teams","view")` |
| POST | `/api/v1/teams` | `authenticate`, `checkPermission("teams","create")` |
| GET | `/api/v1/teams/mine` | `authenticate` |
| GET | `/api/v1/teams/:id` | `authenticate`, `checkPermission("teams","view")` |
| PUT | `/api/v1/teams/:id` | `authenticate`, `checkPermission("teams","edit")` |
| DELETE | `/api/v1/teams/:id` | `authenticate`, `checkPermission("teams","delete")` |
| GET | `/api/v1/teams/:id/leads` | `authenticate`, `checkPermission("teams","view")` |
| GET | `/api/v1/teams/:id/stats` | `authenticate`, `checkPermission("teams","view")` |
| GET | `/api/v1/teams/:id/dashboard` | `authenticate`, `checkPermission("teams","view")` |
| GET | `/api/v1/teams/:id/logs` | `authenticate`, `checkPermission("teams","view")` |
| GET | `/api/v1/teams/:id/revenue` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/teams/:id/revenue/timeline` | `authenticate`, `checkPermission("reports","view")` |

**Note**: `/mine` MUST be declared before `/:id` — static before parameterized (see mistakes.md #6).

**Service Methods**: `teamService.createTeam`, `teamService.getTeams`, `teamService.getTeamByMember`, `teamService.getTeamById`, `teamService.updateTeam`, `teamService.deleteTeam`, `teamService.getTeamLeads`, `teamService.getTeamMemberStats`, `teamService.getTeamDashboard`, `teamService.getTeamLogs`, `teamService.getTeamRevenue`, `teamService.getTeamRevenueTimeline`

**Models Used**: `Team`, `Lead`, `User`

**Socket Events**: None for basic CRUD

**Related Features**: Team Auto-Assign (#8), Team Activity Feed + Chat (#9), Reports (#13)

**Change Log**:
- Initial team CRUD
- Added `/mine` route for team leaders to see their own team
- Added revenue endpoints
- Added dashboard endpoint

---

## 8. Team Auto-Assign

**Description**: Distribute unassigned team leads to active (non-leader, non-inactive) members using round-robin algorithm.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/v1/teams/:id/auto-assign` | `authenticate`, `checkPermission("teams","edit")` |
| POST | `/api/v1/teams/:id/members/:memberId/assign` | `authenticate`, `checkPermission("teams","edit")` |
| PATCH | `/api/v1/teams/:id/members/:memberId/toggle-active` | `authenticate`, `checkPermission("teams","edit")` |

**Service Methods**: `teamService.autoAssignTeamLeads`, `teamService.assignLeadToMember`, `teamService.toggleMemberActive`

**Models Used**: `Team`, `Lead`

**Socket Events**: `lead:assigned` — emitted per assignment

**Related Features**: Lead Management (#2), Team Management (#7)

**Change Log**:
- Initial round-robin implementation
- Fixed populated ObjectId toString() bug on inactiveMembers (see mistakes.md #1)
- Added toggleMemberActive with `$addToSet`/`$pull`

---

## 9. Team Activity Feed + Chat

**Description**: Team-scoped activity feed showing recent lead changes, plus a real-time team chat.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/teams/:id/updates` | `authenticate`, `checkPermission("teams","view")` |
| POST | `/api/v1/teams/:id/messages` | `authenticate` |
| GET | `/api/v1/teams/:id/messages` | `authenticate` |

**Service Methods**: `teamService.getTeamUpdates`, `teamService.postTeamMessage`

**Models Used**: `Team`, `TeamMessage`, `Lead` (for activity feed)

**Socket Events**: `team:update` — emitted to `team:{teamId}` room when new message or activity occurs

**Related Features**: Team Management (#7)

**Change Log**:
- Initial team messages implementation
- Added socket emission on new message

---

## 10. User Management

**Description**: Admin CRUD for users. Any authenticated user can view their own profile via selfOrPermission.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/users` | `authenticate`, `checkPermission("users","view")` |
| POST | `/api/v1/users` | `authenticate`, `checkPermission("users","create")` |
| GET | `/api/v1/users/:id` | `authenticate`, `selfOrPermission` |
| PUT | `/api/v1/users/:id` | `authenticate`, `checkPermission("users","edit")` |
| DELETE | `/api/v1/users/:id` | `authenticate`, `checkPermission("users","delete")` |

**Service Methods**: `userService.createUser`, `userService.getUsers`, `userService.getUserById`, `userService.updateUser`, `userService.deleteUser`

**Models Used**: `User`, `Role`

**Socket Events**: None

**Related Features**: Authentication (#1) — same User model; Role & Permission Management (#11)

**Change Log**:
- Initial implementation
- Added selfOrPermission for own-profile access without users:view
- Fixed `/mine` route shadowing — selfOrPermission handles own profile

---

## 11. Role & Permission Management

**Description**: Admin management of roles and their permission sets.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/roles` | `authenticate`, `checkPermission("roles","view")` |
| GET | `/api/v1/roles/simple` | `authenticate` |
| POST | `/api/v1/roles` | `authenticate`, `checkPermission("roles","create")` |
| GET | `/api/v1/roles/:id` | `authenticate`, `checkPermission("roles","view")` |
| PUT | `/api/v1/roles/:id` | `authenticate`, `checkPermission("roles","edit")` |
| DELETE | `/api/v1/roles/:id` | `authenticate`, `checkPermission("roles","delete")` |

**Note**: `/simple` MUST be declared before `/:id`.

**Service Methods**: `roleService.createRole`, `roleService.getRoles`, `roleService.getRolesSimple`, `roleService.getRoleById`, `roleService.updateRole`, `roleService.deleteRole`

**Models Used**: `Role`, `User` (check before delete)

**Socket Events**: None

**Related Features**: Authentication (#1) — roles are loaded fresh on every request; User Management (#10) — users are assigned roles

**Change Log**:
- Initial implementation
- Added guard: cannot delete role if users assigned to it
- Added guard: cannot delete or modify system roles

---

## 12. Course Management

**Description**: CRUD for the course catalog. Courses are referenced by leads.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/courses` | `authenticate`, `checkPermission("courses","view")` |
| GET | `/api/v1/courses/all` | `authenticate` |
| POST | `/api/v1/courses` | `authenticate`, `checkPermission("courses","create")` |
| GET | `/api/v1/courses/:id` | `authenticate`, `checkPermission("courses","view")` |
| PUT | `/api/v1/courses/:id` | `authenticate`, `checkPermission("courses","edit")` |
| DELETE | `/api/v1/courses/:id` | `authenticate`, `checkPermission("courses","delete")` |

**Note**: `/all` MUST be declared before `/:id`.

**Service Methods**: `courseService.createCourse`, `courseService.getCourses`, `courseService.getAllCourses`, `courseService.getCourseById`, `courseService.updateCourse`, `courseService.deleteCourse`

**Models Used**: `Course`

**Socket Events**: None

**Related Features**: Lead Management (#2) — leads reference courses

**Change Log**:
- Initial implementation

---

## 13. Reports & Analytics

**Description**: Aggregated analytics — lead overview, timeline charts, user/team rankings, revenue breakdown.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/reports/overview` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/timeline` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/user-rankings` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/team-rankings` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/team-split` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/revenue` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/revenue/timeline` | `authenticate`, `checkPermission("reports","view")` |
| GET | `/api/v1/reports/revenue/teams` | `authenticate`, `checkPermission("reports","view")` |

**Service Methods**: `reportService.getOverview`, `reportService.getTimeline`, `reportService.getUserRankings`, `reportService.getTeamRankings`, `reportService.getTeamSplit`, `reportService.getRevenueOverview`, `reportService.getRevenueTimeline`, `reportService.getRevenueTeams`

**Models Used**: `Lead`, `Team`, `User` (via aggregation pipelines)

**Socket Events**: None

**Related Features**: Payment Tracking (#6) — revenue reports read payment data; Team Management (#7)

**Change Log**:
- Initial overview + timeline implementation
- Added user and team rankings
- Added revenue endpoints
- Added team split chart endpoint

---

## 14. AI Chat Assistant

**Description**: Claude AI assistant with context-aware conversations (lead, team, report contexts). Conversation memory persisted per user+context.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/v1/ai/chat/lead/:leadId` | `authenticate` |
| POST | `/api/v1/ai/chat/team/:teamId` | `authenticate` |
| POST | `/api/v1/ai/chat/report` | `authenticate` |
| GET | `/api/v1/ai/memory/:leadId` | `authenticate` |
| DELETE | `/api/v1/ai/memory/:leadId` | `authenticate` |

**Service Methods**: AI logic in `aiController.ts` (or dedicated aiService)

**Models Used**: `AiMemory`, `Lead`, `Team`

**Socket Events**: None (streaming not implemented — request/response)

**Related Features**: Lead Management (#2) — lead context reads lead data; Team Management (#7)

**Change Log**:
- Initial implementation with lead context
- Added team context
- Added report context
- Added memory CRUD (view + delete conversation)

---

## 15. Push Notifications

**Description**: Web Push (VAPID) notification delivery. Users subscribe their browser and receive push notifications for lead assignments and reminders.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/push/vapid-public-key` | `authenticate` |
| POST | `/api/v1/push/subscribe` | `authenticate` |
| DELETE | `/api/v1/push/unsubscribe` | `authenticate` |

**Service Methods**: `pushService.getVapidPublicKey`, `pushService.subscribePush`, `pushService.unsubscribePush`

**Models Used**: `PushSubscription`

**Socket Events**: None (Push is separate transport from Socket.io)

**Related Features**: Reminder System (#5) — scheduler calls pushService for reminder notifications; Lead Management (#2) — assignment calls pushService

**Change Log**:
- Initial VAPID implementation
- Added auto-cleanup of expired subscriptions (delete on 410 response)

---

## 16. Google Sheets Sync

**Description**: API key authenticated endpoint for Google Apps Script to push lead data from Google Sheets into the CRM. Supports single and batch upsert.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| POST | `/api/sheets/sync` | `authenticateApiKey` |
| POST | `/api/sheets/sync/batch` | `authenticateApiKey` |

**Note**: These routes are under `/api/sheets/` (NOT `/api/v1/`) to keep them simple for Apps Script integration.

**Service Methods**: Implemented inline in `sheetsController.ts` or a dedicated `sheetsService.ts`

**Models Used**: `Lead`, `Course` (name lookup)

**Socket Events**: None

**Related Features**: Lead Management (#2) — creates/updates the same Lead documents

**Change Log**:
- Initial single row sync
- Added batch endpoint
- Added authenticateApiKey middleware

---

## 17. PDF Export

**Description**: Export team or user lead data as a PDF document.

**Routes**:
| Method | Path | Middleware Chain |
|--------|------|-----------------|
| GET | `/api/v1/teams/:id/export/pdf` | `authenticate`, `checkPermission("reports","export")` |
| GET | `/api/v1/users/:id/export/pdf` | `authenticate`, `checkPermission("reports","export")` |

**Service Methods**: PDF generation logic (uses a PDF library such as `pdfkit` or `puppeteer`)

**Models Used**: `Lead`, `Team`, `User`

**Socket Events**: None

**Related Features**: Team Management (#7), User Management (#10), Reports (#13)

**Change Log**:
- Initial PDF export for teams
- Added user-scoped PDF export
- 2026-10-01 — team PDF: the lead model's current statuses (+ Other when one is stored that the model doesn't list),
  landscape, the period as Dubai days, 400 on a malformed date. The user PDF is unchanged.
- 2026-10-01 — team PDF: Meeting Scheduled and Wrong Number columns; its member table's headers are 6.5pt so thirteen
  status columns stay on one line.


---

## 18. Notifications, email & app settings (Phase 1 foundations, 2026-09-30)

**Description**: The groundwork for inactive leads, idle alerts and meetings — a kept notification per person, one `notify()` that sends in-app + push + email, an SMTP mailer that logs instead of sending until configured, and one app-wide settings document.

**Routes**: see middlewareHistory.md → "Routes added 2026-09-30".

**Service Methods**: `mailService.sendMail/renderEmail/isMailConfigured`, `notificationService.notify/toNotificationDTO`, `settingsService.getAppSettings/updateAppSettings/isWithinWorkingHours`

**Models Used**: `Notification` (60-day TTL), `AppSetting` (single document, `key: "app"`), `User`

**Socket Events**: `notification` — unchanged name; stored notices now include `id`.

**Change Log**:
- 1.0.0 — Initial build (dependency: `nodemailer`)

---

## 19. Inactive leads (Phase 2, 2026-09-30)

**Description**: A lead is *inactive* when its status is still new/assigned and its owner has not changed the status, added a note, logged a follow-up or a call, or set a reminder within the limit set in Settings (default 45 min), counting working time only. The super admin sees them on the **Inactive leads** page and moves them on by hand; with Settings → Automation & alerts → "Move leads nobody acted on" switched on, a scheduler moves them every minute in working hours — to the next person by the team's split rule, never back to anyone who lost that lead before.

**Routes**: see middlewareHistory.md → "Routes added 2026-09-30 — inactive leads".

**Service Methods**: `inactiveLeadService.listInactiveLeads / listLeadMoves / reassignInactiveLeads / sweepInactiveLeads`; `leadService.pickSplitAssignee / runInTeamQueue` (split rule shared with new leads); `utils/workingHours.workingMinutesBetween / workingCutoff / startOfLocalDay`

**Models Used**: `Lead` (new `inactivity` sub-document, `inactive_reassigned` activity), `LeadMove` (the move log), `AppSetting` (`inactiveLeads.enabledAt`), `Team`, `User`, `Role`, `CallLog`, `Notification`

**Scheduler**: `inactiveLeadScheduler` — every 60 s, only when `RUN_SCHEDULERS` is on and the switch is on.

**Socket Events**: `notification` (types `inactive_lead_moved`, `lead_assigned`, `inactive_leads_moved`, `inactive_leads_stuck`); `team:update` activity item `inactive_reassigned`.

**Change Log**:
- 1.0.0 — Initial build. Automatic moves only for leads assigned after the switch went on (`enabledAt`).

---

## 20. Sign-ins, activity & idle alerts (Phase 3, 2026-09-30)

**Description**: Every sign-in, refused sign-in (with the reason) and sign-out is recorded with IP and device. The web app sends a heartbeat every minute it is open, saying whether anyone used it — which gives last seen, last active and active minutes per day. With Settings → Automation & alerts → "Send idle alerts" on, anyone who used the app today, hasn't signed out and has done nothing in it for the limit (working time) gets one alert per quiet stretch, as do the super admins (and their team leaders, if switched on). Super admins are not tracked. The super admin's **Activity** page shows it all.

**Routes**: see middlewareHistory.md → "Routes added 2026-09-30 — activity".

**Service Methods**: `activityService.recordLogin / recordLoginFailure / recordLogout / recordHeartbeat / listPeople / listLoginEvents / listIdleStretches / sweepIdleUsers`; `notificationService.superAdminIds`; `utils/requestMeta.clientIp / describeDevice`; `utils/workingHours.localDayKey / formatMinutes`

**Models Used**: `LoginEvent`, `UserPresence` (one per user), `ActivityDay` (per user per day), `IdleStretch` — the last three kept a year (TTL); plus `User`, `Team`, `AppSetting`, `Notification`

**Scheduler**: `idleAlertScheduler` — every 60 s, only when `RUN_SCHEDULERS` is on and idle alerts are switched on.

**Socket Events**: `notification` types `idle_self`, `idle_alert` (see socketHistory.md).

**Change Log**:
- 1.0.0 — Initial build. Tokens are still not revoked on sign-out (stateless JWT); the sign-out is recorded and the app drops its copy.

---

## 21. Meetings & calendars (Phase 4, 2026-10-01)

**Description**: Anyone signed in books meetings with colleagues (and the super admin), optionally a client — a lead they can see — and mentors from the LMS. The organizer (or a super admin) changes or cancels them; a busy check warns (never blocks) when a colleague has another meeting then, or a mentor has an LMS class/meeting or no free slot. Everyone involved is told: employees in the app, by push and by email; the client and mentors by email — all with a calendar invite (.ics), updated or cancelled as the meeting changes. A reminder goes out before the start. Each person's calendar shows their meetings, follow-ups and reminders; the super admin can open anyone's.

**Routes**: see middlewareHistory.md → "Routes added 2026-10-01 — meetings".

**Service Methods**: `meetingService.createMeeting / updateMeeting / cancelMeeting / getMeeting / calendarFor / findConflicts / listColleagues / sweepMeetingReminders`; `utils/ics.buildIcs`; `mailService.sendMail({ icalEvent })`; `notify({ email: { invite } })`

**Models Used**: `Meeting`; `User`, `Lead`, `Team`, `Notification`; the LMS via `mentorService.schedule`

**Scheduler**: `meetingReminderScheduler` — every 60 s (`RUN_SCHEDULERS`).

**Change Log**:
- 1.0.0 — Initial build. Mentors are invited by email; their LMS diary is not booked (that stays on the Mentors page).
