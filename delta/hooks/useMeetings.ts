"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";
import type { Lead } from "@/types/lead";
import type { CalendarData, Conflicts, ConflictsInput, Meeting, MeetingInput, MeetingPerson, MentorSchedule } from "@/types/meeting";

export const MEETINGS_KEY = ["meetings"] as const;

function errMsg(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** One person's meetings, follow-ups and reminders between two instants. */
export const useCalendar = (q: { from: string; to: string; userId?: string }) =>
  useQuery({
    queryKey: [...MEETINGS_KEY, "calendar", q],
    queryFn: async () =>
      (await api.get<ApiResponse<CalendarData>>("/meetings/calendar", { params: { from: q.from, to: q.to, ...(q.userId ? { userId: q.userId } : {}) } }))
        .data.data!,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

export const useMeeting = (id: string | null) =>
  useQuery({
    queryKey: [...MEETINGS_KEY, "one", id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async () => (await api.get<ApiResponse<Meeting>>(`/meetings/${id}`)).data.data!,
  });

/** Colleagues anyone may invite. */
export const useColleagues = (enabled = true) =>
  useQuery({
    queryKey: [...MEETINGS_KEY, "people"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<ApiResponse<MeetingPerson[]>>("/meetings/people")).data.data ?? [],
  });

/** Leads the signed-in person can see, for choosing the client. */
export const useLeadSearch = (search: string, enabled = true) =>
  useQuery({
    queryKey: ["leads", "meeting-search", search],
    enabled: enabled && search.trim().length >= 2,
    queryFn: async () => (await api.get<ApiResponse<Lead[]>>("/leads", { params: { search: search.trim(), limit: 8 } })).data.data ?? [],
  });

/** The mentors' LMS calendar for a window (at most 62 days). */
export const useMentorSchedule = (from: string, to: string, enabled: boolean) =>
  useQuery({
    queryKey: ["mentors", "schedule", from, to],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => (await api.get<ApiResponse<MentorSchedule>>("/mentors/schedule", { params: { from, to } })).data.data!,
  });

/** Who is already busy then — asked as the form changes; never blocks saving. */
export const useMeetingConflicts = (input: ConflictsInput | null) =>
  useQuery({
    queryKey: [...MEETINGS_KEY, "conflicts", input],
    enabled: Boolean(input),
    retry: false,
    queryFn: async () => (await api.post<ApiResponse<Conflicts>>("/meetings/conflicts", input)).data.data!,
  });

export const useCreateMeeting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MeetingInput) => (await api.post<ApiResponse<Meeting>>("/meetings", body)).data.data!,
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: MEETINGS_KEY });
      toast.success("Meeting booked", { description: m.attendees.length || m.lead || m.mentors.length ? "Everyone on it has been told." : undefined });
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not book the meeting")),
  });
};

export const useUpdateMeeting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<MeetingInput> }) =>
      (await api.put<ApiResponse<Meeting>>(`/meetings/${id}`, body)).data.data!,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEETINGS_KEY });
      toast.success("Meeting updated");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not change the meeting")),
  });
};

export const useCancelMeeting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (await api.post<ApiResponse<Meeting>>(`/meetings/${id}/cancel`, reason ? { reason } : {})).data.data!,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEETINGS_KEY });
      toast.success("Meeting cancelled", { description: "Everyone on it has been told." });
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not cancel the meeting")),
  });
};
