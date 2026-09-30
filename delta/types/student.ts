import type { User } from "@/types";
import type { Course } from "@/types/course";
import type { Team } from "@/types/team";
import type { InitialLeadResponse, PrimaryConcern, FollowupStrategyType } from "@/types/lead";

export type StudentStatus  = "active" | "inactive" | "graduated" | "dropped";
export type FeeStatus      = "paid" | "partial" | "pending";

export interface Student {
  _id: string;
  enrollmentNumber: string;
  name: string;
  phone?: string;
  email?: string;
  course?: Course | string | null;
  team?:   Team   | string | null;
  assignedTo?: User | string | null;
  leadId?: { _id: string; name: string; phone?: string; status: string } | string | null;

  initialLeadResponse?:  InitialLeadResponse  | null;
  primaryConcern?:       PrimaryConcern        | null;
  followupStrategyType?: FollowupStrategyType  | null;
  demoScheduled: boolean;
  demoAttended:  boolean;
  firstContactTime?: string | null;
  lastFollowupDate?: string | null;

  enrollmentDate: string;
  feeStatus:      FeeStatus;
  totalFee:       number;
  paidAmount:     number;
  pendingAmount:  number;
  status:         StudentStatus;
  notes?: string;
  /** Taken at the close, and required there. Absent on older enrolments. */
  language?: string;
  paymentMethod?: string;
  paymentReceipt?: { name: string; url: string; key: string; size?: number; mimeType?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentFilters {
  search?: string;
  status?: string;
  feeStatus?: string;
  course?: string;
  team?: string;
  assignedTo?: string;
  initialLeadResponse?: string;
  primaryConcern?: string;
  followupStrategyType?: string;
  demoScheduled?: string;
  demoAttended?: string;
  enrollmentFrom?: string;
  enrollmentTo?: string;
  page?: number;
  limit?: number;
}

export interface CreateStudentInput {
  leadId: string;
  name: string;
  phone?: string;
  email?: string;
  course?: string | null;
  team?: string | null;
  assignedTo?: string | null;
  initialLeadResponse?: string | null;
  primaryConcern?: string | null;
  followupStrategyType?: string | null;
  demoScheduled?: boolean;
  demoAttended?: boolean;
  firstContactTime?: string | null;
  lastFollowupDate?: string | null;
  enrollmentDate?: string;
  status?: StudentStatus;
  feeStatus?: FeeStatus;
  totalFee?: number;
  paidAmount?: number;
  notes?: string;
  language?: string;
  paymentMethod?: string;
  paymentReceipt?: { name: string; url: string; key: string; size?: number; mimeType?: string } | null;
}

/**
 * What a course is taught in, and how the money came in.
 *
 * Fixed lists, not typed boxes. Finance already holds enrolments whose language
 * reads "MALAYALAM", "Malayalam" and "malayalam" — three answers to one
 * question, which nothing can count across. The payment methods are spelled the
 * way finance spells them, because the value is sent straight into its
 * `declaredPaymentMethod` and a mismatch is refused at the far end.
 */
export const ENROLMENT_LANGUAGES = ["English", "Malayalam", "Hindi/Urdu", "Tamil"] as const;
export type EnrolmentLanguage = (typeof ENROLMENT_LANGUAGES)[number];

export const ENROLMENT_PAYMENT_METHODS = [
  "cash", "bank_transfer", "cheque", "card",
  "easebuzz_emi", "tabby", "tamara", "billexpro",
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

/** A receipt, once it is in storage. */
export interface StoredReceipt {
  name: string;
  url: string;
  key: string;
  size?: number;
  mimeType?: string;
}
