"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import api from "@/lib/axios";
import type { ApiResponse, PaginationMeta } from "@/types";
import type {
  InactiveLeadFilters,
  InactiveLeadsResponse,
  LeadMoveEntry,
  LeadMoveFilters,
  ReassignRequest,
  ReassignResult,
} from "@/types/inactiveLeads";

export const INACTIVE_LEADS_KEY = ["inactive-leads"] as const;

function errMsg(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** Drops empty filters so the query string only carries what is set. */
function params<T extends object>(filters: T): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && v !== null)
  ) as Record<string, string | number>;
}

/** Leads nobody acted on in time. Refreshes every minute — the list changes as the clock runs. */
export const useInactiveLeads = (filters: InactiveLeadFilters, enabled = true) =>
  useQuery({
    queryKey: [...INACTIVE_LEADS_KEY, "list", filters],
    enabled,
    queryFn: async () => {
      const res = await api.get<ApiResponse<InactiveLeadsResponse>>("/inactive-leads", { params: params(filters) });
      return { ...res.data.data!, pagination: res.data.pagination as PaginationMeta };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

/** The log of leads moved on for inactivity, newest first. */
export const useLeadMoves = (filters: LeadMoveFilters, enabled = true) =>
  useQuery({
    queryKey: [...INACTIVE_LEADS_KEY, "moves", filters],
    enabled,
    queryFn: async () => {
      const res = await api.get<ApiResponse<LeadMoveEntry[]>>("/inactive-leads/moves", { params: params(filters) });
      return { items: res.data.data ?? [], pagination: res.data.pagination as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

export const useReassignInactiveLeads = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReassignRequest) =>
      (await api.post<ApiResponse<ReassignResult>>("/inactive-leads/reassign", body)).data.data!,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: INACTIVE_LEADS_KEY });
      qc.invalidateQueries({ queryKey: ["leads"] });
      const moved = r.moved.length;
      const skipped = r.skipped.length;
      if (moved && !skipped) {
        toast.success(moved === 1 ? `Moved to ${r.moved[0].to.name}` : `Moved ${moved} leads`);
      } else if (moved && skipped) {
        toast.warning(`Moved ${moved}, skipped ${skipped}`, { description: r.skipped[0].reason });
      } else {
        toast.error(skipped === 1 ? r.skipped[0].reason : `None moved — ${r.skipped[0]?.reason ?? "nothing to move"}`);
      }
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not move the leads")),
  });
};
