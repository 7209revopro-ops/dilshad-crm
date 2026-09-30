"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { ApiResponse, PaginationMeta } from "@/types";
import type {
  IdleStretchEntry,
  IdleStretchFilters,
  LoginEventEntry,
  LoginEventFilters,
  PeopleFilters,
  PeopleResponse,
} from "@/types/activity";

export const ACTIVITY_KEY = ["activity"] as const;

/** Drops empty filters so the query string only carries what is set. */
function params<T extends object>(filters: T): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && v !== null)
  ) as Record<string, string | number>;
}

/** Everyone and where they are — refreshes every 30 s, like the heartbeats it reads. */
export const useActivityPeople = (filters: PeopleFilters, enabled = true) =>
  useQuery({
    queryKey: [...ACTIVITY_KEY, "people", filters],
    enabled,
    queryFn: async () =>
      (await api.get<ApiResponse<PeopleResponse>>("/activity/people", { params: params(filters) })).data.data!,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

export const useLoginEvents = (filters: LoginEventFilters, enabled = true) =>
  useQuery({
    queryKey: [...ACTIVITY_KEY, "logins", filters],
    enabled,
    queryFn: async () => {
      const res = await api.get<ApiResponse<LoginEventEntry[]>>("/activity/logins", { params: params(filters) });
      return { items: res.data.data ?? [], pagination: res.data.pagination as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

export const useIdleStretches = (filters: IdleStretchFilters, enabled = true) =>
  useQuery({
    queryKey: [...ACTIVITY_KEY, "idle", filters],
    enabled,
    queryFn: async () => {
      const res = await api.get<ApiResponse<IdleStretchEntry[]>>("/activity/idle", { params: params(filters) });
      return { items: res.data.data ?? [], pagination: res.data.pagination as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
