import type { Request } from "express";
import type { Document, Types } from "mongoose";

// ─── Permission Actions ────────────────────────────────────────────────────────
export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "export";

export interface ModulePermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  export: boolean;
}

// All available modules in the CRM
export const CRM_MODULES = [
  "dashboard",
  "users",
  "roles",
  "leads",
  "teams",
  "courses",
  "reminders",
  "reports",
  "settings",
  "students",
  "tracker",
  /*
   * Split out of "students" rather than sharing it.
   *
   * All three routes — the student list, My Enrolments, Daily Closings —
   * checked the same "students" permission, which nobody could actually see
   * or grant: the permission-matrix screen never listed it, so every role
   * but Super Admin was refused all three with no way to fix it from there.
   * Splitting them means a role can be given its own sales without being
   * given the whole student list, which "students" alone could never do.
   */
  "enrolments",
  "closings",
] as const;

export type CrmModule = (typeof CRM_MODULES)[number];

export type PermissionsMap = {
  [K in CrmModule]?: ModulePermissions;
};

// ─── Role ─────────────────────────────────────────────────────────────────────
export interface IRole extends Document {
  _id: Types.ObjectId;
  roleName: string;
  description?: string;
  permissions: PermissionsMap;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: Types.ObjectId | IRole;
  designation?: string;
  extension?: string;        // 3CX phone extension number e.g. "101"
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface JwtPayload {
  userId: string;
  email: string;
  roleId: string;
  /** Only on a super admin's "View as" pass: the session it belongs to and who started it. */
  impersonation?: { id: string; by: string };
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roleId: string;
    role?: IRole;
    /** Set while a super admin is viewing the CRM as this user (view only). */
    impersonatedBy?: { id: string; name: string; email: string; sessionId: string };
  };
}

// ─── API Response ─────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string;
  role?: string;
  isSystemRole?: string;
  team?: string;
}

// ─── Team ─────────────────────────────────────────────────────────────────────
export interface ITeamSettings {
  autoAssign: boolean;
  splitMode: "round_robin" | "equal_load";
  roundRobinIndex: number;
  includedMembers: Types.Array<Types.ObjectId | IUser>;
  splitTime?: string | null;           // "HH:mm" AED/GST, e.g. "09:00"
  splitStrategy?: "scheduled" | "live"; // scheduled = daily batch at splitTime; live = assign instantly
  roundRobinStartDate?: Date | null;   // count leads from this date for fair round-robin
  lastSplitAt?: Date | null;           // cron dedup — last time scheduled split ran
  sourceRoundRobinIndices?: Map<string, number>;  // per-source round-robin cursor
  slaMinutes?: number | null;                     // response SLA threshold in minutes
  sourceExclusions?: Map<string, string[]>;       // userId → sources never auto-assigned to them
}

export interface IAbsentToday {
  userId: Types.ObjectId | IUser;
  date: Date;  // midnight UTC of the AED calendar day
}

export interface ITeam extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  leaders: Types.Array<Types.ObjectId | IUser>;
  members: Types.Array<Types.ObjectId | IUser>;
  status: "active" | "inactive";
  inactiveMembers: Types.Array<Types.ObjectId | IUser>;
  absentToday: Types.Array<IAbsentToday>;
  settings: ITeamSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamFilters {
  search?: string;
  status?: string;
  page?: string;
  limit?: string;
}

// ─── Course ───────────────────────────────────────────────────────────────────
export interface ICourse extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  amount: number;
  /** The bonus a client gets with it, in the amount's currency; 0 for none. A new close starts from it. */
  bonusAmount?: number;
  /** The catalogue item this course is in Delta Finance, once mapped. */
  financeItemId?: string | null;
  /** The SAC code this course is billed under, for GST invoices. */
  hsnSac?: string;
  /** Which course this is in the LMS — the first of `lmsCourseSlugs`. Blank means not mapped. */
  lmsCourseSlug?: string;
  /** Every LMS course it opens, in order (a bundle opens more than one). */
  lmsCourseSlugs?: string[];
  /** What selling it earns (AED per approved sale) — set on the Commission plan. */
  commission?: ICourseCommission;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

// ─── Commission ───────────────────────────────────────────────────────────────
/** One course's row of the commission plan: AED per approved sale, by role. */
export interface ICourseCommission {
  sales: number;
  tl: number;
  sm: number;
  /** The MT5 credit (USD) the course comes with — shown beside the plan, earns nobody anything. */
  creditUsd: number;
  updatedAt?: Date;
  updatedBy?: Types.ObjectId;
}

export type CommissionRole = "sales" | "tl" | "sm";

/**
 * Where a sale's commission stands.
 *  counted   its lines are final: who earns what, as approved
 *  waiting   approved, but who earns it is not settled yet (a team with no
 *            leader or two, a closer in no team, no Sales Manager set) —
 *            settled by itself once that is fixed
 *  excluded  closed under a login excluded from commission; nobody earns it
 *  reversed  finance voided the invoice; it no longer counts
 */
export type CommissionSaleState = "counted" | "waiting" | "excluded" | "reversed";

export interface ICommissionLine {
  role: CommissionRole;
  user: Types.ObjectId;
  userName: string;
  amount: number;
  note?: string;
}

export interface ICommissionSale extends Document {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  studentName: string;
  enrollmentNumber?: string;
  invoiceNumber?: string;
  course: Types.ObjectId | null;
  courseName: string;
  closer: Types.ObjectId | null;
  closerName: string;
  team: Types.ObjectId | null;
  teamName: string;
  /** When it was sold — the enrolment date; `month` is its month in UAE time. */
  saleDate: Date;
  month: string;
  approvedAt: Date;
  /** The plan row as it was at approval — what the lines are paid from. */
  plan: { sales: number; tl: number; sm: number; creditUsd: number };
  state: CommissionSaleState;
  /** Why it is waiting, excluded or reversed. */
  reason: string;
  lines: ICommissionLine[];
  countedAt?: Date;
  reversedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICommissionSettings extends Document {
  key: string;
  /** The one Sales Manager: earns the SM amount on every sale. */
  salesManager: Types.ObjectId | null;
  /** Shared logins whose sales earn nobody commission. */
  excludedUsers: Types.ObjectId[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Lead ──────────────────────────────────────────────────────────────────────
export type LeadStatus = "new" | "assigned" | "pending_response" | "followup" | "meeting_scheduled" | "meeting_done" | "closed" | "lost" | "not_connected" | "wrong_number" | "mia" | "repeated" | "callback" | "cnc";

export type InitialLeadResponse = "very_interested" | "not_interested" | "let_me_think";
export type PrimaryConcern      = "risk" | "price" | "time" | "trust" | "exact_concern";
export type FollowupStrategyType = "risk_based" | "price_based" | "time_based" | "trust_based";

export type ActivityAction =
  | "lead_created"
  | "lead_updated"
  | "status_changed"
  | "lead_assigned"
  | "team_assigned"
  | "note_added"
  | "note_updated"
  | "note_deleted"
  | "whatsapp_welcome"
  | "followup_missed"
  | "inactive_reassigned";

export interface ILeadNote {
  _id: Types.ObjectId;
  content: string;
  author: Types.ObjectId | IUser;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPayment {
  _id: Types.ObjectId;
  amount: number;
  note?: string;
  paidAt: Date;
  addedBy: Types.ObjectId | IUser;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReminder {
  _id: Types.ObjectId;
  title?: string;
  note?: string;
  remindAt: Date;
  createdBy: Types.ObjectId | IUser;
  isDone: boolean;
  /** Set when the server sends the on-time push/socket notification */
  notifiedAt?: Date;
  /** Set when the server sends the 30-min advance-warning notification */
  warnedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFollowUp {
  _id: Types.ObjectId;
  note?: string;
  followedUpAt: Date;
  followedUpBy: Types.ObjectId | IUser;
  nextFollowUpAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IActivityLog {
  _id: Types.ObjectId;
  action: ActivityAction;
  description: string;
  /** Absent when the CRM did it on its own. */
  performedBy?: Types.ObjectId | IUser;
  changes?: Record<string, { from: unknown; to: unknown }>;
  createdAt: Date;
}

export interface ILead extends Document {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone: string;
  hasWhatsapp?: boolean;
  source?: string;
  status: LeadStatus;
  course?: Types.ObjectId | ICourse;
  assignedTo?: Types.ObjectId | IUser;
  assignedAt?: Date | null;
  team?: Types.ObjectId | ITeam;
  reporter: Types.ObjectId | IUser;
  notes: Types.DocumentArray<ILeadNote & Document>;
  reminders: Types.DocumentArray<IReminder & Document>;
  payments: Types.DocumentArray<IPayment & Document>;
  activityLogs: Types.DocumentArray<IActivityLog & Document>;
  followUps: Types.DocumentArray<IFollowUp & Document>;
  nextFollowUpAt?: Date | null;
  platform?: string;
  campaign?: string;
  callNotConnected: number;
  callCount: number;
  firstContactTime?: Date | null;
  initialLeadResponse?: InitialLeadResponse | null;
  primaryConcern?: PrimaryConcern | null;
  followupStrategyType?: FollowupStrategyType | null;
  sellingAmount?: number | null;
  lostReason?: "price_too_high" | "not_interested" | "competitor" | "unresponsive" | "budget_issue" | "wrong_timing" | "other" | null;
  lostNotes?: string | null;
  // Legacy import fields
  leadReceivedTime?: string | null;
  exactConcern?: string | null;
  demoScheduled?: boolean | null;
  demoAttended?: boolean | null;
  lastFollowupDate?: Date | null;
  lastContactedAt?: Date | null;
  missedFollowUpWarnedAt?: Date | null;
  referralType?: "employee" | "external" | "student" | null;
  referredBy?: string | null;
  whatsappWelcome?: {
    status: "sent" | "failed" | "skipped";
    messageId?: string | null;
    error?: string | null;
    sentAt?: Date | null;
  } | null;
  comments?: string | null;
  /** Moves for inactivity — absent until the first one. */
  inactivity?: ILeadInactivity;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeadInactivity {
  /** Everyone who lost this lead for not acting on it. */
  lostBy: Types.ObjectId[];
  moves: number;
  lastMovedAt: Date | null;
  /** Nobody left in the team to move it to, for the current assignment. */
  stuckAt: Date | null;
}

export interface LeadFilters {
  status?: LeadStatus;
  assignedTo?: string;
  team?: string;
  reporter?: string;
  course?: string;
  source?: string;
  search?: string;
  /** ISO date string – filter leads created on or after this date (inclusive) */
  dateFrom?: string;
  /** ISO date string – filter leads created on or before this date (inclusive, end of day) */
  dateTo?: string;
  /** One of LOST_REASONS. Only meaningful alongside status="lost". */
  lostReason?: string;
  campaignId?: string;
  /** "true" | "false" as a query string; anything else means no filter. */
  demoScheduled?: string;
  demoAttended?: string;
  /** ISO date — leads whose last follow-up falls on or after this day */
  followupFrom?: string;
  /** ISO date — leads whose last follow-up falls on or before this day */
  followupTo?: string;
  /** ISO date — leads SPLIT (assignedAt) on or after this day */
  splitFrom?: string;
  /** ISO date — leads SPLIT (assignedAt) on or before this day */
  splitTo?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface LeadStats {
  total: number;
  new: number;
  assigned: number;
  pending_response: number;
  followup: number;
  meeting_scheduled: number;
  meeting_done: number;
  closed: number;
  lost: number;
  not_connected: number;
  wrong_number: number;
  mia: number;
  repeated: number;
  callback: number;
  cnc: number;
}

// ─── Student ───────────────────────────────────────────────────────────────────
/**
 * What a course is taught in.
 *
 * A fixed list rather than a typed box. Finance already holds enrolments whose
 * language reads "MALAYALAM", "Malayalam" and "malayalam" — three answers to
 * one question, and nothing can count enrolments by language across them. The
 * spelling has to be decided once, here, or the field is only decoration.
 */
export const ENROLMENT_LANGUAGES = ["English", "Malayalam", "Hindi/Urdu", "Tamil"] as const;
export type EnrolmentLanguage = (typeof ENROLMENT_LANGUAGES)[number];

/**
 * How the money was taken at the close.
 *
 * The same eight finance accepts, spelled the way finance spells them, because
 * this value is sent straight into its `declaredPaymentMethod` and a mismatch
 * would be refused at the far end rather than here.
 */
export const ENROLMENT_PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "cheque",
  "card",
  "easebuzz_emi",
  "tabby",
  "tamara",
  "billexpro",
] as const;
export type EnrolmentPaymentMethod = (typeof ENROLMENT_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<EnrolmentPaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  card: "Card",
  easebuzz_emi: "Easebuzz EMI",
  tabby: "Tabby",
  tamara: "Tamara",
  billexpro: "BillExPro",
};

/** A file kept in object storage, as the enrolment records it. */
export interface StoredFile {
  name: string;
  url: string;
  key: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: Date;
}

export interface IStudent extends Document {
  _id: Types.ObjectId;
  enrollmentNumber: string;
  name: string;
  phone?: string;
  email?: string;
  course?: Types.ObjectId | ICourse;
  team?: Types.ObjectId | ITeam;
  assignedTo?: Types.ObjectId | IUser;
  leadId: Types.ObjectId | ILead;
  initialLeadResponse?: InitialLeadResponse | null;
  primaryConcern?: PrimaryConcern | null;
  followupStrategyType?: FollowupStrategyType | null;
  demoScheduled: boolean;
  demoAttended: boolean;
  firstContactTime?: Date | null;
  lastFollowupDate?: Date | null;
  enrollmentDate: Date;
  feeStatus: "paid" | "partial" | "pending";
  totalFee: number;
  paidAmount: number;
  pendingAmount: number;
  status: "active" | "inactive" | "graduated" | "dropped";
  /** What the course is taught in, taken at the close. */
  language?: EnrolmentLanguage;
  /** How the money was taken at the close. */
  paymentMethod?: EnrolmentPaymentMethod;
  /** Proof the money was taken, handed on to finance with the enrolment. */
  paymentReceipt?: StoredFile | null;
  notes?: string;
  /** Whether a bonus was given at the close — unset on enrolments from before it was asked. */
  hasBonus?: boolean | null;
  /** The bonus, in the same currency as the fee; 0 when none. Never part of the balance. */
  bonusAmount?: number;
  /** Where this enrolment ended up in Delta Finance, once handed over. */
  financeInvoiceId?: string | null;
  financeInvoiceNumber?: string | null;
  financeSyncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParsedLead {
  name: string;
  email?: string;
  phone: string;
  source?: string;
  notes?: string;
  referralType?: "employee" | "external" | "student";
  referredBy?: string;
}

export interface ExcelParseResult {
  valid: ParsedLead[];
  invalid: { row: number; data: Record<string, unknown>; errors: string[] }[];
}

export interface AutoAssignResult {
  assigned: number;
  results: { leadId: string; assignedTo: string }[];
}

// ─── Notifications ────────────────────────────────────────────────────────────
/**
 * A notice kept for one person, so the bell still has it after a reload.
 * The live copy goes out on the socket as before; this is the record.
 */
export interface INotification {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  url: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
}

// ─── App settings ─────────────────────────────────────────────────────────────
/** Which events also go by email. The in-app notice and the push always go. */
export type EmailEventKey = "inactiveLeads" | "idleAlerts" | "meetings";

/**
 * The one settings document for the whole CRM (key "app").
 *
 * Limits are stored in minutes; the Settings page shows hours and minutes.
 * The automatic behaviours ship switched off — they act on real leads and
 * real people, so turning them on is a decision, not a default.
 */
export interface IAppSettings {
  key: "app";
  inactiveLeads: {
    /** Move a lead nobody acted on to the next team member. */
    autoReassign: boolean;
    /** How long after assignment, in minutes, a lead with no action counts as inactive. */
    limitMinutes: number;
    /**
     * When automatic moves were last switched on. Only leads assigned since then
     * move on their own — switching it on never sweeps up the whole backlog.
     */
    enabledAt: Date | null;
  };
  idleAlerts: {
    enabled: boolean;
    /** Minutes without activity in the app, while logged in during working hours. */
    limitMinutes: number;
    notifyTeamLeaders: boolean;
  };
  workingHours: {
    /** IANA zone the times below are in, e.g. "Asia/Dubai". */
    timezone: string;
    /** 0 = Sunday … 6 = Saturday. */
    days: number[];
    /** "HH:MM", 24-hour. */
    start: string;
    end: string;
  };
  email: Record<EmailEventKey, boolean>;
  updatedBy: Types.ObjectId | null;
  updatedAt?: Date;
}

// ─── Inactive leads ───────────────────────────────────────────────────────────
/** One lead moved on because its owner did not act on it — automatically, or by hand from the Inactive leads page. */
export interface ILeadMove {
  _id: Types.ObjectId;
  lead: Types.ObjectId;
  leadName: string;
  team: Types.ObjectId | null;
  from: Types.ObjectId;
  to: Types.ObjectId;
  kind: "automatic" | "manual";
  /** Who moved it by hand; null when the CRM did. */
  by: Types.ObjectId | null;
  /** Working minutes the lead had waited without action when it moved. */
  inactiveMinutes: number;
  createdAt: Date;
}

// ─── Activity (sign-ins, presence, idle) ──────────────────────────────────────
export type LoginEventKind = "login" | "login_failed" | "logout";
export type LoginFailReason = "wrong_password" | "unknown_email" | "deactivated" | "no_account";

/** One sign-in, failed sign-in or sign-out — the Activity page's sign-in history. */
export interface ILoginEvent {
  _id: Types.ObjectId;
  user: Types.ObjectId | null;
  email: string;
  kind: LoginEventKind;
  method: "password" | "sso" | null;
  reason: LoginFailReason | null;
  ip: string;
  userAgent: string;
  device: string;
  deviceType: "desktop" | "mobile" | "tablet" | "app" | "unknown";
  createdAt: Date;
}

/** A super admin viewing the CRM as someone else ("View as"): 30 minutes, view only. */
export interface IImpersonation {
  _id: Types.ObjectId;
  admin: Types.ObjectId;
  adminEmail: string;
  target: Types.ObjectId;
  targetEmail: string;
  startedAt: Date;
  expiresAt: Date;
  /** "Back to my account" (or signing out while viewing); null if it ran out instead. */
  endedAt: Date | null;
  ip: string;
  userAgent: string;
  device: string;
  createdAt: Date;
}

/** Where each person is, one document per user — refreshed by the web app's heartbeat. */
export interface IUserPresence {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** Any heartbeat: the app was open. */
  lastSeenAt: Date | null;
  /** A heartbeat after someone used the app. */
  lastActiveAt: Date | null;
  lastLoginAt: Date | null;
  lastLogoutAt: Date | null;
  lastIp: string;
  lastDevice: string;
  /** An idle alert was sent for the quiet stretch that began at lastActiveAt. */
  idleAlertedAt: Date | null;
}

/** Active minutes per person per day (in the working hours' time zone). */
export interface IActivityDay {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  day: string;
  activeMinutes: number;
  firstActiveAt: Date | null;
  lastActiveAt: Date | null;
  /** Epoch minute last counted: one active minute per minute, however many tabs are open. */
  lastMinute: number;
  createdAt: Date;
}

/** A stretch of no activity that raised an idle alert; ends when the person is back. */
export interface IIdleStretch {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  since: Date;
  alertedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}

// ─── Meetings ─────────────────────────────────────────────────────────────────
/** A mentor invited by email — looked up in the LMS by id when the meeting is saved. */
export interface IMeetingMentor {
  lmsId: string;
  name: string;
  email: string;
}

export interface IMeeting {
  _id: Types.ObjectId;
  title: string;
  /** For the team only — never sent to the client or mentors. */
  notes: string;
  /** A joining link or a place. */
  link: string;
  startAt: Date;
  endAt: Date;
  organizer: Types.ObjectId;
  /** Employees invited, not counting the organizer. */
  attendees: Types.ObjectId[];
  /** The client — a lead, invited by email when it has one. */
  lead: Types.ObjectId | null;
  mentors: IMeetingMentor[];
  status: "scheduled" | "cancelled";
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancelReason: string;
  /** Minutes before the start to remind everyone; 0 = no reminder. */
  reminderMinutes: number;
  reminderSentAt: Date | null;
  /** iCalendar SEQUENCE — one up on every change, so calendars replace the invite they have. */
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}
