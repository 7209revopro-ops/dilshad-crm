"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";
import type { Course, CourseFilters, LmsCourse } from "@/types/course";

const COURSES_KEY = ["courses"] as const;

function errMsg(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useCourses = (filters?: CourseFilters) => {
  return useQuery({
    queryKey: [...COURSES_KEY, filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters?.page)   params.page   = String(filters.page);
      if (filters?.limit)  params.limit  = String(filters.limit);
      if (filters?.status) params.status = filters.status;
      if (filters?.search) params.search = filters.search;
      const response = await api.get<ApiResponse<Course[]>>("/courses", { params });
      return { data: response.data.data ?? [], pagination: response.data.pagination };
    },
  });
};

/** Fetch all active courses (for dropdowns) */
export const useAllCourses = () => {
  return useQuery({
    queryKey: [...COURSES_KEY, "all"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Course[]>>("/courses/all");
      return response.data.data ?? [];
    },
  });
};

export const useCourse = (id: string) => {
  return useQuery({
    queryKey: [...COURSES_KEY, id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Course>>(`/courses/${id}`);
      return response.data.data!;
    },
    enabled: !!id,
  });
};

// ─── Mutations ────────────────────────────────────────────────────────────────

export const useCreateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; amount: number; bonusAmount?: number; status?: string }) => {
      const response = await api.post<ApiResponse<Course>>("/courses", data);
      return response.data.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSES_KEY });
      toast.success("Course created successfully");
    },
    onError: (error: unknown) => toast.error(errMsg(error, "Failed to create course")),
  });
};

export const useUpdateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ name: string; description: string; amount: number; bonusAmount: number; status: string; financeItemId: string }> }) => {
      const response = await api.put<ApiResponse<Course>>(`/courses/${id}`, data);
      return response.data.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSES_KEY });
      toast.success("Course updated successfully");
    },
    onError: (error: unknown) => toast.error(errMsg(error, "Failed to update course")),
  });
};

export const useDeleteCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/courses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSES_KEY });
      toast.success("Course deleted successfully");
    },
    onError: (error: unknown) => toast.error(errMsg(error, "Failed to delete course")),
  });
};

export interface FinanceItem {
  id: string;
  name: string;
  sku: string;
  unitPriceMinor: number;
  type: string;
}

/**
 * Delta Finance's catalogue, for mapping courses onto it.
 *
 * Fetched through our own API rather than from finance directly: the signing
 * secret belongs on a server, and a key shipped to a browser is a published key.
 *
 * Returns an empty list when the integration is switched off, so the screen can
 * say so plainly instead of showing an error.
 *
 * `academy` "bangalore" lists the Bangalore finance organization's catalogue —
 * a different one from Dubai's — empty when that organization isn't set up.
 */
export const useFinanceItems = (enabled = true, academy: "dubai" | "bangalore" = "dubai") =>
  useQuery({
    queryKey: ["finance-items", academy],
    queryFn: async () => {
      const response = await api.get<ApiResponse<FinanceItem[]>>("/courses/finance-items", {
        params: academy === "bangalore" ? { academy } : {},
      });
      return response.data.data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

/** The LMS's published courses, for mapping a course onto the one(s) it opens. */
export const useLmsCourses = (enabled = true) =>
  useQuery({
    queryKey: ["lms-courses"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<LmsCourse[]>>("/courses/lms-courses");
      return response.data.data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

/**
 * Save where a course maps: its finance product ("" to unmap) and its LMS
 * courses, in order ([] to unmap) — and how it sells at the Bangalore academy:
 * its INR price (null takes it off), Bangalore finance item and LMS courses
 * ([] = the same as Dubai's).
 */
export const useMapCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, financeItemId, lmsCourseSlugs, bangalore }: {
      id: string; financeItemId: string; lmsCourseSlugs: string[];
      bangalore?: { price: number | null; financeItemId: string; lmsCourseSlugs: string[] };
    }) => {
      const response = await api.put<ApiResponse<Course>>(`/courses/${id}`, { financeItemId, lmsCourseSlugs, ...(bangalore ? { bangalore } : {}) });
      return response.data.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSES_KEY });
      toast.success("Mapping saved");
    },
    onError: (error: unknown) => toast.error(errMsg(error, "Failed to save the mapping")),
  });
};
