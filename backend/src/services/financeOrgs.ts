import { FinanceHandover } from "../models/FinanceHandover.js";
import { Student } from "../models/Student.js";
import { fetchEnrolmentStatuses, financeOrgOf, type EnrolmentStatus } from "./financeClient.js";

/*
 * Which finance organization each enrolment belongs to (2026-10-10).
 *
 * A close is for the Dubai or the Bangalore academy, and each is billed in its
 * own organization in finance. That is decided once, at the close, and kept —
 * on the student (`academy`) and on its outbox row (`academy`, `financeOrgId`)
 * — so a resend, a correction, the decision poll, My Enrolments and the
 * commission lookups all ask the organization the enrolment went to, never
 * whichever one is the default now. Finance answers only for its own
 * organization, so a status call is made per organization.
 */

type HandoverOrg = { financeOrgId?: string | null; academy?: string | null } | null | undefined;

/**
 * The organization an enrolment went to: the one written on its outbox row at
 * the close; else by its academy (the row's, or the student's); Dubai's for
 * one from before academies — which is where every one of those went.
 */
export function orgOfHandover(h: HandoverOrg, studentAcademy?: string | null): string {
  return h?.financeOrgId || financeOrgOf(h?.academy ?? studentAcademy ?? null);
}

/** For each of these students, the organization its enrolment belongs to ("" when that one isn't configured). */
export async function orgsOf(studentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!studentIds.length) return out;
  const rows = await FinanceHandover.find({ studentId: { $in: studentIds } }).select("studentId academy financeOrgId").lean();
  const byStudent = new Map(rows.map((r) => [String(r.studentId), r]));
  // A student whose outbox row says nothing of its academy (one from before, or
  // none queued yet) is read for its own.
  const unsure = studentIds.filter((id) => !byStudent.get(id)?.financeOrgId && !byStudent.get(id)?.academy);
  const students = unsure.length ? await Student.find({ _id: { $in: unsure } }).select("academy").lean() : [];
  const academyOf = new Map(students.map((s) => [String(s._id), s.academy ?? null]));
  for (const id of studentIds) out.set(id, orgOfHandover(byStudent.get(id), academyOf.get(id)));
  return out;
}

/**
 * What finance made of these enrolments, each asked of the organization it
 * was billed in — one call per organization, in parallel. Never throws: an
 * organization that can't be reached, or isn't configured, simply answers for
 * none of its own, as fetchEnrolmentStatuses does.
 *
 * `known` passes organizations already looked up (a row in hand), to save the
 * reads.
 */
export async function fetchStatusesByOrg(studentIds: string[], known?: Map<string, string>): Promise<EnrolmentStatus[]> {
  if (!studentIds.length) return [];
  const orgs = known ?? (await orgsOf(studentIds));
  const groups = new Map<string, string[]>();
  for (const id of studentIds) {
    const org = orgs.get(id) ?? financeOrgOf("dubai");
    if (!org) continue;                                 // its organization isn't configured: nobody to ask
    groups.set(org, [...(groups.get(org) ?? []), id]);
  }
  const answers = await Promise.all([...groups].map(([org, ids]) => fetchEnrolmentStatuses(ids, org)));
  return answers.flat();
}
