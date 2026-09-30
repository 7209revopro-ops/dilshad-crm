"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";

const KEY = ["sheet-sources"] as const;

export interface SheetSource {
  _id: string;
  name: string;
  sources: string[];
  link?: string;           // only present for leaders / super admins
  platform: "google" | "facebook" | "instagram" | "meta" | "whatsapp" | "other";
  description?: string;
  isActive: boolean;
  totalLeads: number;
  createdAt: string;
  updatedAt: string;
}

export type SheetSourcePayload = Omit<SheetSource, "_id" | "totalLeads" | "createdAt" | "updatedAt">;

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export const useSheetSources = () =>
  useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.get<ApiResponse<SheetSource[]>>("/sheet-sources");
      return res.data.data as SheetSource[];
    },
    staleTime: 30_000,
  });

export const useCreateSheetSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SheetSourcePayload) =>
      api.post<ApiResponse<SheetSource>>("/sheet-sources", payload),
    onSuccess: () => {
      toast.success("Sheet source created");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(errMsg(err, "Failed to create sheet source")),
  });
};

export const useUpdateSheetSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SheetSourcePayload> }) =>
      api.put<ApiResponse<SheetSource>>(`/sheet-sources/${id}`, payload),
    onSuccess: () => {
      toast.success("Sheet source updated");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(errMsg(err, "Failed to update sheet source")),
  });
};

export const useDeleteSheetSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sheet-sources/${id}`),
    onSuccess: () => {
      toast.success("Sheet source deleted");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(errMsg(err, "Failed to delete sheet source")),
  });
};
