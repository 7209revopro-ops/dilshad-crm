# 🚀 Feature Registry — Carlton CRM Frontend

> Every feature built in this app must be documented here.
> **Before building a feature**: check if it exists or is partially built.
> **After building**: log it completely — APIs, components, hooks, related features.

---

## How to Use This File

- **Before building**: Search by feature name or module
- **After building**: Fill the template and add it
- **When extending**: Update the entry — bump version, add change note

---

## 📋 Feature Entry Template

```
### Feature Name
- **Module**: leads | teams | users | roles | courses | reports | dashboard | reminders | auth | notifications
- **Version**: 1.0.0
- **Status**: active | wip | deprecated
- **Created**: YYYY-MM-DD
- **Last Updated**: YYYY-MM-DD

**Description**:
What the feature does in 1-3 sentences.

**Pages / Routes**:
- `/app/(dashboard)/[route]/page.tsx` — what the user sees here

**Components Used**:
- `components/[path]/ComponentName.tsx` — why / what it does in this feature

**Hooks Used**:
- `hooks/useXxx.ts` — which functions from this hook

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/...` | ... |

**State**:
- React Query keys: `["..."]`
- Zustand stores: (if any)

**Permissions**:
- Module: `leads | teams | users | roles | reports | dashboard`
- Actions: `view | create | edit | delete`

**Related Features**:
- Feature Name — how they relate

**Notes / Gotchas**:
- Any special behavior, edge cases, or implementation details

**Change Log**:
- 1.0.0 — Initial build
```

---

## 🗂 Feature Registry

---

## 🔐 Authentication

### Login
- **Module**: auth
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
JWT-based login. Returns access token + refresh token. Access token stored in memory/localStorage; refresh token in HttpOnly cookie.

**Pages / Routes**:
- `app/(auth)/login/page.tsx` — Login form (email + password)

**Components Used**:
- `components/auth/LoginForm.tsx` — Form with react-hook-form + zod validation

**Hooks Used**:
- Direct axios call (no React Query — auth is not server state)

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/auth/login` | Authenticate user, get tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |

**State**:
- Zustand: auth store (user info, access token)

**Related Features**:
- All protected routes depend on this

**Notes**:
- Access token auto-attached by `lib/axios.ts` interceptor
- On 401 response, axios interceptor calls refresh endpoint automatically
- After login → redirect to `/dashboard`

**Change Log**:
- 1.0.0 — Initial build

---

## 📊 Dashboard

### Dashboard Overview
- **Module**: dashboard
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
High-level stats cards showing leads by status, team performance, and recent activity.

**Pages / Routes**:
- `app/(dashboard)/dashboard/page.tsx` — Stats cards + recent leads

**Hooks Used**:
- `hooks/useDashboard.ts` — `useDashboardStats()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/dashboard` | Aggregated stats |

**State**:
- React Query keys: `["dashboard"]`

**Permissions**:
- Module: `dashboard` / Action: `view`

**Change Log**:
- 1.0.0 — Initial build

---

## 👥 Leads

### Lead List
- **Module**: leads
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Paginated, filterable list of all leads. Supports filtering by status, assigned team, date range, and search by name/phone.

**Pages / Routes**:
- `app/(dashboard)/leads/page.tsx` — Lead table with filters + create button

**Components Used**:
- `components/leads/LeadDialog.tsx` — Create/edit lead modal
- `components/leads/DeleteLeadDialog.tsx` — Delete confirmation
- `components/leads/AssignLeadDialog.tsx` — Assign lead to team
- `components/leads/LeadsDateFilter.tsx` — Date range filter
- `components/ui/responsive-dialog.tsx` — Modal wrapper

**Hooks Used**:
- `hooks/useLeads.ts` — `useLeads(filters)`, `useCreateLead()`, `useUpdateLead()`, `useDeleteLead()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/leads` | List leads (supports query params: status, team, search, from, to, page, limit) |
| POST | `/api/v1/leads` | Create new lead |
| PATCH | `/api/v1/leads/:id` | Update lead |
| DELETE | `/api/v1/leads/:id` | Delete lead |
| PATCH | `/api/v1/leads/:id/team` | Assign to team |
| PATCH | `/api/v1/leads/:id/status` | Change lead status |

**State**:
- React Query keys: `["leads"]`, `["leads", filters]`

**Permissions**:
- Module: `leads` / Actions: `view`, `create`, `edit`, `delete`

**Lead Statuses**:
`new | assigned | followup | closed | rejected | cnc | booking | partialbooking | interested`

**Related Features**:
- Lead Detail — clicking a lead row opens detail
- Lead Upload — bulk import via CSV
- Reminders — reminder panel inside lead detail
- Payments — payment panel inside lead detail
- AI Chat — AI assistant inside lead detail

**Change Log**:
- 1.0.0 — Initial build

---

### Lead Detail
- **Module**: leads
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Full lead detail page with tabs for: basic info, notes, reminders, payments, AI chat.

**Pages / Routes**:
- `app/(dashboard)/leads/[leadId]/page.tsx` — Lead detail with panels

**Components Used**:
- `components/leads/ReminderPanel.tsx` — Reminder management (CRUD + IST display)
- `components/leads/PaymentPanel.tsx` — Payment tracking
- `components/leads/AiChatPanel.tsx` — AI assistant chat interface

**Hooks Used**:
- `hooks/useLeads.ts` — `useLead(id)`, `useUpdateLead()`
- `hooks/useReminders.ts` — `useAddReminder()`, `useUpdateReminder()`, `useDeleteReminder()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/leads/:id` | Lead detail |
| PATCH | `/api/v1/leads/:id` | Update lead info |
| POST | `/api/v1/leads/:id/reminders` | Add reminder |
| PATCH | `/api/v1/leads/:id/reminders/:rid` | Update reminder |
| DELETE | `/api/v1/leads/:id/reminders/:rid` | Delete reminder |
| POST | `/api/v1/leads/:id/payments` | Add payment |
| POST | `/api/v1/ai/chat/:leadId` | AI chat message |
| GET | `/api/v1/ai/memory/:leadId` | Load AI conversation history |
| DELETE | `/api/v1/ai/memory/:leadId` | Clear AI memory |

**State**:
- React Query keys: `["leads", leadId]`

**Notes**:
- Reminder times always displayed in IST with " IST" suffix
- Reminder input uses `toDatetimeLocal()` + `nowIST()` for IST-safe display
- All reminder saves append `:00+05:30` to datetime-local value for IST parsing

**Related Features**:
- Reminder Notifications — reminders here trigger server-side notifications
- AI Chat — powered by Anthropic Claude API via backend

**Change Log**:
- 1.0.0 — Initial build

---

### Lead CSV Upload
- **Module**: leads
- **Version**: 1.1.0
- **Status**: active
- **Created**: —
- **Last Updated**: 2026-04-01

**Description**:
Bulk import leads from a CSV file. Maps columns to lead fields, validates, and creates up to 500 leads per upload.

**Pages / Routes**:
- `app/(dashboard)/leads/upload/page.tsx` — Upload UI + column mapping + preview

**Hooks Used**:
- `hooks/useLeads.ts` — `useBulkUploadLeads()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/leads/upload` | Bulk create leads from JSON array |

**Notes / Gotchas**:
- Backend `notes` field must be an **array** `[{ content, author }]` — not a string object
- `email: "No Email"` and invalid emails must be sent as `undefined` (not the invalid string)
- Backend uses `ordered: false` in `insertMany` — partial success is possible; check `created` count in response
- Required fields: `name`, `phone` (others optional)

**Related Features**:
- Lead List — uploaded leads appear here

**Change Log**:
- 1.0.0 — Initial build
- 1.1.0 — Fixed `notes` object vs array bug; fixed `"No Email"` email validation (2026-04-01)

---

## 🔔 Reminders & Notifications

### Reminder Notifications
- **Module**: reminders
- **Version**: 1.2.0
- **Status**: active
- **Created**: —
- **Last Updated**: 2026-04-01

**Description**:
Real-time browser notifications for lead reminders. Notifies via Socket.io (browser open) and Web Push/VAPID (browser closed). Includes a 30-minute advance warning.

**Pages / Routes**:
- `app/(dashboard)/reminders/page.tsx` — Manage all reminders across leads
- `app/(dashboard)/leads/[leadId]/page.tsx` → `ReminderPanel` — Per-lead reminders

**Components Used**:
- `components/leads/ReminderPanel.tsx` — CRUD for reminders on a lead
- `components/notifications/NotificationBell.tsx` — Header bell icon with badge

**Hooks Used**:
- `hooks/useReminderNotifications.ts` — Socket listeners + localStorage dedup + browser notification firing
- `hooks/useReminders.ts` — `useMyReminders()` for polling fallback

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/leads/reminders/mine` | Get current user's upcoming reminders |
| POST | `/api/v1/leads/:id/reminders` | Create reminder |
| PATCH | `/api/v1/leads/:id/reminders/:rid` | Update reminder |
| DELETE | `/api/v1/leads/:id/reminders/:rid` | Delete reminder |

**Socket Events**:
| Event | Direction | Payload |
|---|---|---|
| `reminder:due` | Server → Client | `{ leadId, leadName, remindAt, note }` |
| `reminder:warning` | Server → Client | `{ leadId, leadName, remindAt, minutesLeft, note }` |

**State**:
- React Query keys: `["reminders"]`
- localStorage: `crm_notified_reminders` (JSON map, 25h TTL)

**Architecture**:
- Backend scheduler: `setInterval(tick, 30_000)` in `reminderScheduler.ts`
- Tick Pass 1: on-time (`remindAt ≤ now`, `notifiedAt: null`) → fire + stamp `notifiedAt`
- Tick Pass 2: 30-min warning (`remindAt` in 1–31 min) → fire + stamp `warnedAt`
- Max notification latency: **≤30 seconds** from `remindAt`

**Notes / Gotchas**:
- `new Notification()` crashes on Android Chrome — always use ServiceWorker (see `mistakes.md`)
- All times displayed in IST with " IST" suffix
- Reminder input `min={nowIST()}` prevents past-time selection

**Related Features**:
- Lead Detail — reminders created here
- Socket.io — real-time delivery path

**Change Log**:
- 1.0.0 — Initial reminder CRUD
- 1.1.0 — Added Web Push (VAPID) for background notifications
- 1.2.0 — Fixed Android crash; fixed IST timezone display; added frontend future-time validation (2026-04-01)

---

## 👨‍👩‍👦 Teams

### Team Management
- **Module**: teams
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Create and manage sales teams. Each team has a leader and members. Leads can be assigned to teams. Supports active/inactive member status.

**Pages / Routes**:
- `app/(dashboard)/teams/page.tsx` — Team list
- `app/(dashboard)/teams/[teamId]/page.tsx` — Team detail + member management
- `app/(dashboard)/teams/[teamId]/members/[memberId]/page.tsx` — Member detail

**Components Used**:
- `components/teams/TeamDialog.tsx` — Create/edit team modal
- `components/teams/DeleteTeamDialog.tsx` — Delete confirmation

**Hooks Used**:
- `hooks/useTeams.ts` — `useTeams()`, `useTeam(id)`, `useCreateTeam()`, `useUpdateTeam()`, `useDeleteTeam()`, `useAutoAssign()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/teams` | List all teams |
| POST | `/api/v1/teams` | Create team |
| GET | `/api/v1/teams/:id` | Team detail |
| PATCH | `/api/v1/teams/:id` | Update team |
| DELETE | `/api/v1/teams/:id` | Delete team |
| POST | `/api/v1/teams/:id/auto-assign` | Auto-assign leads round-robin |

**State**:
- React Query keys: `["teams"]`, `["teams", teamId]`

**Permissions**:
- Module: `teams` / Actions: `view`, `create`, `edit`, `delete`

**Notes / Gotchas**:
- `inactiveMembers` returned as `[{ _id: ObjectId }]` (populated), not raw ObjectIds
- Auto-assign excludes team leader + inactive members
- Round-robin distribution based on current lead count per member

**Related Features**:
- Lead List — leads assigned to teams
- Auto-assign — distributes leads automatically

**Change Log**:
- 1.0.0 — Initial build

---

## 👤 Users

### User Management
- **Module**: users
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Create and manage CRM users. Each user has a role with specific permissions.

**Pages / Routes**:
- `app/(dashboard)/users/page.tsx` — User list
- `app/(dashboard)/users/[userId]/page.tsx` — User detail + edit

**Components Used**:
- `components/users/UserDialog.tsx` — Create/edit user modal
- `components/users/DeleteUserDialog.tsx` — Delete confirmation

**Hooks Used**:
- `hooks/useUsers.ts` — `useUsers()`, `useUser(id)`, `useCreateUser()`, `useUpdateUser()`, `useDeleteUser()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/users` | List users |
| POST | `/api/v1/users` | Create user |
| GET | `/api/v1/users/:id` | User detail |
| PATCH | `/api/v1/users/:id` | Update user |
| DELETE | `/api/v1/users/:id` | Delete user |

**State**:
- React Query keys: `["users"]`, `["users", userId]`

**Permissions**:
- Module: `users` / Actions: `view`, `create`, `edit`, `delete`

**Change Log**:
- 1.0.0 — Initial build

---

## 🔑 Roles & Permissions

### Role Management
- **Module**: roles
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Define roles with granular permissions across modules (leads, teams, users, roles, reports, dashboard).

**Pages / Routes**:
- `app/(dashboard)/roles/page.tsx` — Role list + permission matrix

**Components Used**:
- `components/roles/RoleDialog.tsx` — Create/edit role
- `components/roles/PermissionMatrix.tsx` — Visual grid of module × action permissions
- `components/roles/DeleteRoleDialog.tsx` — Delete confirmation

**Hooks Used**:
- `hooks/useRoles.ts` — `useRoles()`, `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/roles` | List roles |
| POST | `/api/v1/roles` | Create role |
| PATCH | `/api/v1/roles/:id` | Update role + permissions |
| DELETE | `/api/v1/roles/:id` | Delete role |

**State**:
- React Query keys: `["roles"]`

**Permissions**:
- Module: `roles` / Actions: `view`, `create`, `edit`, `delete`

**Permission Modules**: `dashboard | leads | teams | users | roles | reports`
**Permission Actions**: `view | create | edit | delete`

**Change Log**:
- 1.0.0 — Initial build

---

## 📚 Courses

### Course Management
- **Module**: courses
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Manage courses that leads can be assigned/interested in.

**Pages / Routes**:
- `app/(dashboard)/courses/page.tsx` — Course list

**Components Used**:
- `components/courses/CourseDialog.tsx` — Create/edit course
- `components/courses/DeleteCourseDialog.tsx` — Delete confirmation

**Hooks Used**:
- `hooks/useCourses.ts` — `useCourses()`, `useCreateCourse()`, `useUpdateCourse()`, `useDeleteCourse()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/courses` | List courses |
| POST | `/api/v1/courses` | Create course |
| PATCH | `/api/v1/courses/:id` | Update course |
| DELETE | `/api/v1/courses/:id` | Delete course |

**State**:
- React Query keys: `["courses"]`

**Change Log**:
- 1.0.0 — Initial build

---

## 📈 Reports

### Reports & Export
- **Module**: reports
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Date-range based reports on lead conversion, team performance. Supports PDF export.

**Pages / Routes**:
- `app/(dashboard)/reports/page.tsx` — Report charts + filters

**Components Used**:
- `components/reports/ExportPdfDialog.tsx` — PDF export options

**Hooks Used**:
- `hooks/useReports.ts` — `useReports(dateRange)`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/reports` | Aggregated report data |

**State**:
- React Query keys: `["reports", { from, to }]`

**Permissions**:
- Module: `reports` / Actions: `view`

**Change Log**:
- 1.0.0 — Initial build

---

## 🤖 AI Chat (per Lead)

### AI Lead Assistant
- **Module**: leads
- **Version**: 1.0.0
- **Status**: active
- **Created**: —
- **Last Updated**: —

**Description**:
Per-lead AI chat assistant powered by Anthropic Claude. Stores conversation memory in MongoDB per lead + user. Useful for quick summaries, follow-up suggestions, and lead analysis.

**Pages / Routes**:
- `app/(dashboard)/leads/[leadId]/page.tsx` → AI Chat tab

**Components Used**:
- `components/leads/AiChatPanel.tsx` — Chat interface with message history

**Hooks Used**:
- `hooks/useAiChat.ts` — `useAiMemory(leadId)`, `useSendMessage()`, `useClearMemory()`

**API Routes**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/ai/chat/:leadId` | Send message, get AI response |
| GET | `/api/v1/ai/memory/:leadId` | Load conversation history |
| DELETE | `/api/v1/ai/memory/:leadId` | Clear conversation memory |

**State**:
- React Query keys: `["ai", "memory", leadId]`

**Notes**:
- Conversations are scoped to `leadId + userId` — different users see different conversations for the same lead
- Model: Anthropic Claude (configured in backend `.env`)

**Change Log**:
- 1.0.0 — Initial build

---

## ➕ Adding a New Feature

Copy the template at the top and place it in the correct module section.

**Feature count**: 17
*(Increment every time you add a feature)*


---

## Notifications that survive a reload & Automation settings (2026-09-30)

**Pages / components**: `NotificationBell` (header), Settings → `AutomationSettingsCard`

**What it does**:
- The bell loads the signed-in user's kept notifications (`GET /notifications`), merges live socket ones, and "Mark all read", dismiss and "Clear all" now persist.
- Settings → **Automation & alerts** (edit needs `settings.edit`, i.e. the super admin): inactive-lead limit in hours + minutes and the auto-reassign switch, idle-alert limit and switch, team-leader alerts, working days/hours/time zone, which events also email, mailbox status and "Send me a test email". Inactive leads and idle alerts show "Coming next" until their phases ship.

**API**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/notifications` | Kept notifications + unread count |
| POST | `/api/v1/notifications/read-all` | Mark all read |
| DELETE | `/api/v1/notifications/:id` · `/api/v1/notifications` | Dismiss one · clear all |
| GET / PUT | `/api/v1/settings/app` | Read / save automation settings |
| POST | `/api/v1/settings/app/test-email` | Test the mailbox |

**State**: React Query keys `["notifications"]`, `["settings", "app"]`

**Change Log**:
- 1.0.0 — Initial build

---

## Inactive leads page (2026-09-30)

**Pages / components**: `app/(dashboard)/inactive-leads/page.tsx` (sidebar "Inactive Leads", super admin only), `components/inactive-leads/MoveLeadsDialog.tsx`; also Settings → `AutomationSettingsCard`, lead page activity log, `Sidebar`

**What it does**:
- Lists leads whose owner hasn't acted within the Settings limit (working time): owner (click to filter), team, working time waited, what the automatic mover will do, who lost it before. Search, team filter, paging, refreshes every minute and on inactive-lead notifications.
- Move one or many: "Next in their team" (the team's split rule, never back to someone who lost it) or "A person I choose". Skips say why.
- **Moves log** tab: every lead moved for inactivity — when, from → to, team, time waited, automatic or by whom.
- Settings: the Inactive leads section is live (no longer "Coming next"), says since when automatic moves apply, links to the page.
- Lead page: automatic moves show in the activity log "by System".

**API**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/inactive-leads` | Inactive leads + summary + the rule |
| GET | `/api/v1/inactive-leads/moves` | The move log |
| POST | `/api/v1/inactive-leads/reassign` | Move leads (`{ leadIds, to? }`) |

**State**: React Query key `["inactive-leads", …]`

**Change Log**:
- 1.0.0 — Initial build

---

## Activity page, heartbeat & idle alerts (2026-09-30)

**Pages / components**: `app/(dashboard)/activity/page.tsx` (sidebar "Activity", super admin only); `hooks/useActivityHeartbeat.ts` (mounted in the dashboard layout); also `useLogout`, Settings → `AutomationSettingsCard`, `NotificationBell`, `Sidebar`

**What it does**:
- **People**: everyone's status right now (Active / No activity · N min / App closed · N min / Signed out HH:MM / Not seen today), an "Alerted" flag for the current quiet stretch, active time today and since when, last seen, last sign-in (time, device, IP). Search and team filter; refreshes every 30 s. Click a name for their sign-ins.
- **Sign-ins**: every sign-in (password or Root portal), refused sign-in with the reason, and sign-out — device and IP. Filter by kind or person; paged.
- **Idle alerts**: every alert that went out — quiet since, alerted at, back at (or "Not back yet"), working time. Paged.
- The web app sends a heartbeat every minute it is open (used or not); "Logout" now records the sign-out.
- Settings: Idle alerts are live (no "Coming next"), with a link to the page. The bell has icons for inactive-lead and idle notices.

**API**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/activity/heartbeat` | `{ active }` every minute — everyone |
| GET | `/api/v1/activity/people` | Everyone's status + today |
| GET | `/api/v1/activity/logins` | Sign-in history |
| GET | `/api/v1/activity/idle` | Idle alerts |
| POST | `/api/v1/auth/logout` | Record the sign-out |

**State**: React Query key `["activity", …]`

**Change Log**:
- 1.0.0 — Initial build

---

## Calendar & meetings (2026-10-01)

**Pages / components**: `app/(dashboard)/calendar/page.tsx` (sidebar "Calendar", everyone); `components/calendar/` — `TimeGrid` (day/week), `MonthGrid`, `MeetingDialog` (book/change), `MeetingDetails` (view/cancel), `mentorColors`

**What it does**:
- Day / week / month calendar of the signed-in person's meetings, follow-ups and reminders (toggle), in the CRM's working-hours zone (labelled). The super admin picks anyone's calendar. A phone opens on the day view.
- **Mentors** layer (day/week): up to five LMS mentors beside your own time — green where their LMS slots say they're free, red where they have a class or meeting.
- Click an empty time (or "+" in month view) to book there; "New meeting" for the next half hour. Title, date and times, colleagues, a client (your leads only), mentors, link or place, team notes (never sent outside), reminder. A busy warning lists clashes — you can still book.
- Click a meeting: details; organizer or super admin can change or cancel it (with a reason). `/calendar?meeting=<id>` opens one (from notifications).

**API**:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/meetings/calendar` | One person's meetings, follow-ups, reminders |
| GET | `/api/v1/meetings/people` | Colleagues to invite |
| POST | `/api/v1/meetings/conflicts` | Busy check |
| POST | `/api/v1/meetings` | Book |
| GET / PUT | `/api/v1/meetings/:id` | Read / change |
| POST | `/api/v1/meetings/:id/cancel` | Cancel |
| GET | `/api/v1/mentors/schedule` | (existing) the mentors' LMS diary |

**State**: React Query key `["meetings", …]`; mentors `["mentors","schedule",from,to]`

**Change Log**:
- 1.0.0 — Initial build

---

## Leads page — "My leads" toggle (2026-10-01)

**Page**: `app/(dashboard)/leads/page.tsx`

**What it does**: super admins (**All leads | My leads**) and team leaders (**My team | My leads**) can switch the list — and the board — to just the leads assigned to them. It is a shortcut for "Assigned To = you", so paging, the URL and the filter pill ("Assigned: You") follow it. The choice is remembered per browser (`crm_leads_scope`); a link that sets Assigned To itself wins and does not change it. BDEs see only their own leads already and get no toggle.

**Also**: team leaders are now recognised from their own team (`GET /teams/mine`) when their role can't list teams, so their "Assigned To" filter lists their team (and "You") — before, it stayed empty for them.

**API**: existing `GET /leads?assignedTo=<id>`, `GET /teams/mine` — no backend change.

**Change Log**:
- 1.0.0 — Initial build

## Team Report — every status counted (2026-10-01)

**Page**: `app/(dashboard)/teams/[teamId]/page.tsx` → Report tab · **API**: `GET /teams/:id/member-split`, `GET /teams/:id/export-pdf`

**What it does**: the Member Lead Split lists one column per lead status — New, Assigned, Pending Response, Follow Up, Closed, Lost, Not Connected, MIA, Repeated, Call Back, CNC — so each row adds up to its Total. An **Other** column shows any lead whose status has no column (only when there is one). The period (Today / This Week / This Month / This Year / Custom) is in Dubai days for everyone, wherever their browser is. The team PDF has the same columns.

**Change Log**:
- 1.0.0 — replaces the old 13 columns (Interested, Booking, Part.Book, RNR, Rejected, WhatsApp, Student no longer exist as statuses).
