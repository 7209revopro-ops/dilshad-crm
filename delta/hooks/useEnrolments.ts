import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { toast } from "@/lib/toast";
import type { Student } from "@/types/student";

const KEY = ["enrolments"] as const;

/** What the outbox knows: whether the enrolment reached finance at all. */
export interface Handover {
  status: "pending" | "sent" | "failed";
  /** What the outbox last heard from finance — available even when finance is not. */
  approvalState: "pending" | "approved" | "returned" | "not_required" | "unknown";
  returnedReason: string;
  returnedAt: string | null;
  attempts: number;
  lastError: string;
  invoiceId: string;
  invoiceNumber: string;
  flags: string[];
  sentAt: string | null;
}

/**
 * What finance knows: whether anybody has approved it.
 *
 * Null when finance could not be reached. That is different from "nobody has
 * looked yet", and the screen says so rather than guessing.
 */
export interface InvoiceState {
  externalId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  approval: "pending" | "approved" | "returned" | "not_required";
  returnedReason: string;
  issueDate: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  balanceMinor: number;
  /** Once approved, what the Delta LMS made of the student. Null before; absent from a finance that did not say. */
  lms?: EnrolmentLms | null;
  /** …and who looks after them in Tetra Commission: their code, CS and CS team. */
  commission?: EnrolmentCommission | null;
}

/** Whether the LMS took the student — a new account or theirs — and on which courses, or why not yet. */
export interface EnrolmentLms {
  state: "created" | "existing" | "waiting" | "unmapped" | "failed";
  detail?: string;
  courses: string[];
}

/** Whether they went on to Tetra Commission, and who looks after them there (asked of it live unless `live` is false). */
export interface EnrolmentCommission {
  state: "sent" | "waiting" | "skipped" | "failed" | "not_sent";
  detail?: string;
  code?: string;
  /** Their CS; "" while they wait in Delta Open Students. */
  cs?: string;
  team?: string;
  live?: boolean;
}

export interface Enrolment extends Student {
  handover: Handover | null;
  invoice: InvoiceState | null;
}

export interface EnrolmentCounts {
  total: number;
  onThisPage: number;
  approved: number;
  pending: number;
  returned: number;
  notInvoiced: number;
  failed: number;
  flagged: number;
}

export const useMyEnrolments = (filters: { mine?: boolean; search?: string; state?: string; page?: number; limit?: number }) =>
  useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.mine === false) params.set("mine", "false");
      if (filters.search) params.set("search", filters.search);
      if (filters.state) params.set("state", filters.state);
      if (filters.page) params.set("page", String(filters.page));
      if (filters.limit) params.set("limit", String(filters.limit));
      const res = await api.get<{
        success: boolean;
        data: Enrolment[];
        counts: EnrolmentCounts;
        pagination: { page: number; limit: number; total: number; pages: number };
      }>(`/students/enrolments/mine?${params.toString()}`);
      return res.data;
    },
    // Approval happens in another system, on somebody else's schedule.
    refetchInterval: 30_000,
  });

export const useRequestInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      const res = await api.post<{ message: string }>(`/students/${studentId}/invoice`);
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(d.message ?? "Sent to finance");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Could not send this to finance";
      toast.error(msg);
    },
  });
};
