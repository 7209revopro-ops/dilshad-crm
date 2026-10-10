import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { toast } from "@/lib/toast";
import type { ApiResponse } from "@/types";
import type { Academy, Student, StudentFilters, CreateStudentInput, StoredReceipt } from "@/types/student";
import { isFinanceEmail } from "@/types/student";

const KEY = ["students"] as const;

export const useStudents = (filters?: StudentFilters) =>
  useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== "" && v !== "all") params.set(k, String(v));
        });
      }
      const res = await api.get<{ success: boolean; data: Student[]; pagination: ApiResponse<Student>["pagination"] }>(
        `/students?${params.toString()}`,
      );
      return res.data;
    },
  });

export const useStudent = (id: string) =>
  useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Student>>(`/students/${id}`);
      return res.data.data!;
    },
    enabled: !!id,
  });

export const useStudentByLeadId = (leadId: string) =>
  useQuery({
    queryKey: [...KEY, "by-lead", leadId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Student | null>>(`/students/by-lead/${leadId}`);
      return res.data.data ?? null;
    },
    enabled: !!leadId,
  });

/**
 * The academies this server can close for (2026-10-10). Bangalore is listed
 * only once the server can bill it; an older API answers nothing useful, and
 * that reads as Dubai only — so the close dialog never offers Bangalore where
 * it would be closed as Dubai with rupee figures.
 */
export const useCloseOptions = () =>
  useQuery({
    queryKey: [...KEY, "close-options"],
    queryFn: async (): Promise<{ academies: Academy[] }> => {
      try {
        const res = await api.get<ApiResponse<{ academies?: Academy[] }>>("/students/close-options");
        const listed = res.data.data?.academies;
        return { academies: Array.isArray(listed) && listed.length ? listed : ["dubai"] };
      } catch {
        return { academies: ["dubai"] };
      }
    },
    staleTime: 5 * 60_000,
  });

/**
 * What the server says of an email (one email, one client — 2026-10-10):
 * free, or already another client's here — a student or a lead that is a
 * different person — with who, and the words it refuses it in.
 */
export interface EmailCheck {
  ok: boolean;
  takenBy?: { name: string; code?: string; kind: "student" | "lead" };
  /** "This email is already used by … (STU-…), a different client — enter …'s own email." */
  message?: string;
}

/**
 * Whether an email is already another client's here, asked a moment after the
 * typing stops, for the client of this lead (the close) or of this enrolment
 * (a correction, an added email). Finance files a close under whoever its
 * email already belongs to, so the screens say so before anything is saved.
 *
 * Only a help: the server refuses a taken email whatever this says, and a
 * check that fails (the network, an older server) holds nothing up.
 */
export function useEmailCheck(email: string, who: { leadId?: string | null; studentId?: string | null }, enabled = true) {
  const key = email.trim().toLowerCase();
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), 400);
    return () => clearTimeout(t);
  }, [key]);
  const askable = (v: string) => enabled && isFinanceEmail(v) && Boolean(who.leadId || who.studentId);
  const q = useQuery({
    queryKey: [...KEY, "email-check", settled, who.leadId ?? "", who.studentId ?? ""],
    queryFn: async (): Promise<EmailCheck> => {
      const res = await api.get<ApiResponse<EmailCheck>>("/students/email-check", {
        params: { email: settled, ...(who.studentId ? { studentId: who.studentId } : { leadId: who.leadId }) },
      });
      return res.data.data ?? { ok: true };
    },
    enabled: askable(settled),
    retry: false,
    staleTime: 15_000,
  });
  const current = settled === key;
  return {
    /** Another client's, as typed now: who, and the server's words. */
    taken: askable(key) && current && q.data && !q.data.ok ? q.data : null,
    /** Still finding out for the email as typed now — a moment. */
    checking: askable(key) && (!current || q.isFetching),
  };
}

export const useCreateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateStudentInput) => {
      const res = await api.post<ApiResponse<Student>>("/students", data);
      return res.data.data!;
    },
    onSuccess: () => {
      toast.success("Student profile created");
      qc.invalidateQueries({ queryKey: KEY });
      // The email asked for at the close is kept on the lead too.
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to create student";
      toast.error(msg);
    },
  });
};

export const useUpdateStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateStudentInput> }) => {
      const res = await api.put<ApiResponse<Student>>(`/students/${id}`, data);
      return res.data.data!;
    },
    onSuccess: (_, { id }) => {
      toast.success("Student updated");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, id] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to update student";
      toast.error(msg);
    },
  });
};

export const useDeleteStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/students/${id}`);
    },
    onSuccess: () => {
      toast.success("Student deleted");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error("Failed to delete student"),
  });
};

/**
 * Put a payment receipt in storage, before the enrolment that will carry it.
 *
 * Its own request rather than part of the close: the close creates a student
 * and hands it to finance in one go, and a multipart body carrying both a file
 * and the enrolment would have to be unpicked before either could be checked.
 * This returns a stored file; the close stays the JSON it always was, naming it.
 */
export async function uploadReceipt(leadId: string, file: File): Promise<StoredReceipt> {
  const body = new FormData();
  body.append("file", file);
  const res = await api.post<{ success: boolean; data: StoredReceipt }>(
    `/students/receipts/${leadId}`,
    body,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.data;
}
