import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const isoDate = z.string().datetime({ offset: true, message: "Use an ISO date-time, e.g. 2026-10-01T10:00:00Z" });
/** Query strings arrive as "" when a filter is cleared — that means "no filter". */
const optionalQuery = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? undefined : v), schema.optional());

export const REMINDER_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
const MAX_MINUTES = 12 * 60;

const fields = {
  title: z.string().trim().min(1, "Give the meeting a title").max(200),
  startAt: isoDate,
  endAt: isoDate,
  attendeeIds: z.array(objectId).max(50, "At most 50 people"),
  leadId: objectId.nullable(),
  mentorIds: z.array(z.string().trim().min(1).max(100)).max(10, "At most 10 mentors"),
  link: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
  reminderMinutes: z.number().int().refine((n) => (REMINDER_CHOICES as readonly number[]).includes(n), "Pick one of the reminder choices"),
};

/** End after start, and no longer than 12 hours — checked whenever both are known. */
function checkTimes(v: { startAt?: string; endAt?: string }, ctx: z.RefinementCtx) {
  if (!v.startAt || !v.endAt) return;
  const start = Date.parse(v.startAt);
  const end = Date.parse(v.endAt);
  if (end <= start) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The meeting must end after it starts", path: ["endAt"] });
  else if (end - start > MAX_MINUTES * 60_000) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A meeting can be at most 12 hours", path: ["endAt"] });
}

// POST /meetings
export const createMeetingSchema = z
  .object({
    ...fields,
    attendeeIds: fields.attendeeIds.default([]),
    leadId: fields.leadId.optional(),
    mentorIds: fields.mentorIds.default([]),
    link: fields.link.optional(),
    notes: fields.notes.optional(),
    reminderMinutes: fields.reminderMinutes.default(15),
  })
  .strict()
  .superRefine(checkTimes);

// PUT /meetings/:id — send only what changed; leadId: null takes the client off.
export const updateMeetingSchema = z
  .object({
    title: fields.title.optional(),
    startAt: fields.startAt.optional(),
    endAt: fields.endAt.optional(),
    attendeeIds: fields.attendeeIds.optional(),
    leadId: fields.leadId.optional(),
    mentorIds: fields.mentorIds.optional(),
    link: fields.link.optional(),
    notes: fields.notes.optional(),
    reminderMinutes: fields.reminderMinutes.optional(),
  })
  .strict()
  .superRefine(checkTimes);

// POST /meetings/:id/cancel
export const cancelMeetingSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

// POST /meetings/conflicts — who is already busy then
export const conflictsSchema = z
  .object({
    startAt: isoDate,
    endAt: isoDate,
    userIds: z.array(objectId).max(51).default([]),
    mentorIds: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    excludeId: objectId.optional(),
  })
  .strict()
  .superRefine(checkTimes);

// GET /meetings/calendar
export const calendarQuery = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    userId: optionalQuery(objectId),
  })
  .refine((q) => q.to > q.from, { message: "'to' must be after 'from'", path: ["to"] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= 62 * 864e5, { message: "At most 62 days at a time", path: ["to"] });

// GET /meetings/people
export const peopleQuery = z.object({ search: optionalQuery(z.string().trim().max(100)) });

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type ConflictsInput = z.infer<typeof conflictsSchema>;
