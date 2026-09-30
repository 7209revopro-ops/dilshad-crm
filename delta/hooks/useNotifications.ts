"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";
import type { NotificationList } from "@/types/notification";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

/** The signed-in user's kept notifications, newest first, with the unread count. */
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: NOTIFICATIONS_KEY,
    enabled,
    queryFn: async () => {
      const res = await api.get<ApiResponse<NotificationList>>("/notifications", { params: { limit: 50 } });
      return res.data.data ?? { items: [], unread: 0 };
    },
    staleTime: 30_000,
  });

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<ApiResponse<{ updated: number }>>("/notifications/read-all")).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
};

export const useDeleteNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<ApiResponse<{ id: string }>>(`/notifications/${id}`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
};

export const useClearNotifications = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.delete<ApiResponse<{ deleted: number }>>("/notifications")).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
};
