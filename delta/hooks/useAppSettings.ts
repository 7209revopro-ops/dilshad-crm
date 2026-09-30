"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";
import type { AppSettingsResponse, AppSettingsUpdate, TestEmailResult } from "@/types/settings";

export const APP_SETTINGS_KEY = ["settings", "app"] as const;

function errMsg(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export const useAppSettings = (enabled = true) =>
  useQuery({
    queryKey: APP_SETTINGS_KEY,
    enabled,
    queryFn: async () => {
      const res = await api.get<ApiResponse<AppSettingsResponse>>("/settings/app");
      return res.data.data!;
    },
  });

export const useUpdateAppSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: AppSettingsUpdate) =>
      (await api.put<ApiResponse<AppSettingsResponse>>("/settings/app", update)).data.data!,
    onSuccess: (data) => {
      qc.setQueryData(APP_SETTINGS_KEY, data);
      toast.success("Settings saved");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not save the settings")),
  });
};

export const useSendTestEmail = () =>
  useMutation({
    mutationFn: async () => (await api.post<ApiResponse<TestEmailResult>>("/settings/app/test-email")).data.data!,
    onSuccess: (r) =>
      r.sent
        ? toast.success(`Test email sent to ${r.to}`)
        : toast.error(
            r.reason === "not configured"
              ? "No mailbox is set up yet — emails are only logged. Add the SMTP settings to the backend .env."
              : `Not sent: ${r.reason ?? "unknown error"}`
          ),
    onError: (e: unknown) => toast.error(errMsg(e, "Could not send the test email")),
  });
