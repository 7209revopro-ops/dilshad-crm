/** One course's row of the commission plan: AED per approved sale, by role. */
export interface CoursePlan {
  sales: number;
  tl: number;
  sm: number;
  /** The MT5 credit (USD) the course comes with — shown beside the plan. */
  creditUsd: number;
}

export type CommissionRole = "sales" | "tl" | "sm";

export type CommissionSaleState = "counted" | "waiting" | "excluded" | "reversed";

export interface CommissionPerson {
  _id: string;
  name: string;
  email?: string;
}

export interface CommissionPlanView {
  /** A Super Admin: may change amounts, the Sales Manager and excluded logins. */
  canEdit: boolean;
  /** How this CRM pays a team's leader (see lib/commission TL_RULE). */
  tlRule?: "zero_if_sm" | "always" | "never";
  courses: {
    _id: string;
    name: string;
    amount: number;
    status: "active" | "inactive";
    commission: CoursePlan;
  }[];
  salesManager: CommissionPerson | null;
  excludedUsers: CommissionPerson[];
  teams: {
    _id: string;
    name: string;
    leaders: { _id: string; name: string }[];
    /** Why the team holds its sales: "No leader", "2 leaders"; null when it has one. */
    problem: string | null;
  }[];
  /** Sales on hold — Super Admins only. */
  waiting: {
    _id: string;
    studentName: string;
    enrollmentNumber?: string;
    courseName: string;
    closerName: string;
    teamName: string;
    saleDate: string;
    approvedAt: string;
    reason: string;
  }[];
  /** Everyone, for the pickers — Super Admins only. */
  users: (CommissionPerson & { status: "active" | "inactive" })[];
}

export interface CommissionLine {
  role: CommissionRole;
  user: string;
  userName: string;
  amount: number;
  note: string;
}

export interface CommissionSale {
  _id: string;
  studentName: string;
  enrollmentNumber: string;
  invoiceNumber: string;
  courseName: string;
  closerName: string;
  teamName: string;
  saleDate: string;
  approvedAt: string;
  state: CommissionSaleState;
  reason: string;
  /** Only the lines the viewer may see. */
  lines: CommissionLine[];
}

interface Tally {
  count: number;
  amount: number;
}

export interface CommissionEarnings {
  month: string;
  /** What the viewer sees: everything, their teams', or their own. */
  scope: "all" | "team" | "own";
  tlRule?: "zero_if_sm" | "always" | "never";
  people: { _id: string; name: string; sales: Tally; tl: Tally; sm: Tally; total: number }[];
  sales: CommissionSale[];
  totals: { amount: number; counted: number; waiting: number; excluded: number; reversed: number };
}

export interface CommissionPreview {
  courseName: string;
  plan: CoursePlan;
  state: CommissionSaleState;
  reason: string;
  teamName: string;
  closerName: string;
  /** What the closer earns on it, in all their roles. */
  closerTotal: number;
  lines: CommissionLine[];
}
