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
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roleId: string;
    role?: IRole;
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
  /** The catalogue item this course is in Delta Finance, once mapped. */
  financeItemId?: string | null;
  /** The SAC code this course is billed under, for GST invoices. */
  hsnSac?: string;
  /** Which course this is in the LMS. Blank means not mapped. */
  lmsCourseSlug?: string;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

// ─── Lead ──────────────────────────────────────────────────────────────────────
export type LeadStatus = "new" | "assigned" | "pending_response" | "followup" | "closed" | "lost" | "not_connected" | "mia" | "repeated" | "callback" | "cnc";

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
  | "followup_missed";

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
  performedBy: Types.ObjectId | IUser;
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
  createdAt: Date;
  updatedAt: Date;
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
  closed: number;
  lost: number;
  not_connected: number;
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
