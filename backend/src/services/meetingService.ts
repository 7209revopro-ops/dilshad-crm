import { Types } from "mongoose";
import { Meeting } from "../models/Meeting.js";
import { User } from "../models/User.js";
import { Lead } from "../models/Lead.js";
import { Team } from "../models/Team.js";
import { getAppSettings } from "./settingsService.js";
import { notify } from "./notificationService.js";
import { renderEmail, sendMail, type MailCalendarInvite } from "./mailService.js";
import { mentorService, type Mentor } from "./mentorService.js";
import { buildIcs } from "../utils/ics.js";
import { localClock } from "../utils/workingHours.js";
import type { IMeetingMentor } from "../types/index.js";
import type { ConflictsInput, CreateMeetingInput, UpdateMeetingInput } from "../validations/meetingValidation.js";

/*
 * Meetings booked in the CRM.
 *
 *  • Anyone signed in books meetings with colleagues (and the super admin),
 *    optionally a client — one of their own leads — and mentors from the LMS.
 *  • The organizer (or a super admin) changes or cancels them.
 *  • Everyone involved is told: employees in the app, by push and by email
 *    with a calendar invite; the client and mentors by email with the invite.
 *    Notes are for the team — never sent outside it.
 *  • A reminder goes out before the start (meetingReminderScheduler).
 */

export interface Actor {
  userId: string;
  isSuperAdmin: boolean;
  roleName: string;
}

interface PersonRow {
  _id: Types.ObjectId;
  name: string;
  email: string;
  designation?: string;
}

interface LeadRow {
  _id: Types.ObjectId;
  name?: string;
  phone?: string;
  email?: string;
}

interface MeetingRow {
  _id: Types.ObjectId;
  title: string;
  notes: string;
  link: string;
  startAt: Date;
  endAt: Date;
  organizer: Types.ObjectId;
  attendees: Types.ObjectId[];
  lead: Types.ObjectId | null;
  mentors: IMeetingMentor[];
  status: "scheduled" | "cancelled";
  cancelledAt: Date | null;
  cancelReason: string;
  reminderMinutes: number;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonDTO {
  id: string;
  name: string;
  email: string;
  designation: string | null;
}

export interface MeetingDTO {
  id: string;
  title: string;
  notes: string;
  link: string;
  startAt: string;
  endAt: string;
  status: "scheduled" | "cancelled";
  cancelReason: string;
  cancelledAt: string | null;
  organizer: PersonDTO | null;
  attendees: PersonDTO[];
  lead: { id: string; name: string; phone: string; email: string | null } | null;
  mentors: IMeetingMentor[];
  reminderMinutes: number;
  /** The viewer may change or cancel it. */
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

const MINUTE = 60_000;
const DAY = 864e5;
/** A little slack for "now" when booking: a form filled in at 10:00 for 10:00 is not in the past. */
const PAST_SLACK_MS = 5 * MINUTE;

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const unique = <T>(xs: T[]) => Array.from(new Set(xs));
const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const canSee = (m: Pick<MeetingRow, "organizer" | "attendees">, a: Actor) =>
  a.isSuperAdmin || String(m.organizer) === a.userId || m.attendees.some((x) => String(x) === a.userId);
const canEdit = (m: Pick<MeetingRow, "organizer">, a: Actor) => a.isSuperAdmin || String(m.organizer) === a.userId;

const personDTO = (p: PersonRow): PersonDTO => ({ id: String(p._id), name: p.name, email: p.email, designation: p.designation ?? null });

async function toDTOs(rows: MeetingRow[], actor: Actor): Promise<MeetingDTO[]> {
  const userIds = unique(rows.flatMap((r) => [r.organizer, ...r.attendees]).map(String));
  const leadIds = unique(rows.filter((r) => r.lead).map((r) => String(r.lead)));
  const [users, leads] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("name email designation").lean<PersonRow[]>(),
    leadIds.length ? Lead.find({ _id: { $in: leadIds } }).select("name phone email").lean<LeadRow[]>() : Promise.resolve([] as LeadRow[]),
  ]);
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  const leadOf = new Map(leads.map((l) => [String(l._id), l]));
  return rows.map((r) => {
    const organizer = userOf.get(String(r.organizer));
    const lead = r.lead ? leadOf.get(String(r.lead)) : undefined;
    return {
      id: String(r._id),
      title: r.title,
      notes: r.notes ?? "",
      link: r.link ?? "",
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      status: r.status,
      cancelReason: r.cancelReason ?? "",
      cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
      organizer: organizer ? personDTO(organizer) : null,
      attendees: r.attendees.map((a) => userOf.get(String(a))).filter((p): p is PersonRow => Boolean(p)).map(personDTO),
      lead: lead ? { id: String(lead._id), name: lead.name ?? "", phone: lead.phone ?? "", email: lead.email ?? null } : null,
      mentors: r.mentors ?? [],
      reminderMinutes: r.reminderMinutes,
      canEdit: canEdit(r, actor),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

// ─── Checks ───────────────────────────────────────────────────────────────────

/** Colleagues to invite: they must exist and be active; the organizer is not their own attendee. */
async function activePeople(ids: string[], organizerId: string): Promise<PersonRow[]> {
  const wanted = unique(ids).filter((id) => id !== organizerId);
  if (!wanted.length) return [];
  const people = await User.find({ _id: { $in: wanted }, status: { $ne: "inactive" } })
    .select("name email designation")
    .lean<PersonRow[]>();
  if (people.length !== wanted.length) throw httpError("Someone on the list doesn't exist or is deactivated", 400);
  const order = new Map(wanted.map((id, i) => [id, i]));
  return people.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
}

/**
 * A client may only be invited by someone who can see that lead — the same
 * rule as the leads list: super admins and reporters all of them, team
 * leaders their team's, everyone else their own.
 */
async function visibleLead(leadId: string, actor: Actor): Promise<LeadRow> {
  const lead = await Lead.findById(leadId)
    .select("name phone email team assignedTo")
    .lean<(LeadRow & { team?: Types.ObjectId | null; assignedTo?: Types.ObjectId | null }) | null>();
  if (!lead) throw httpError("That client (lead) doesn't exist", 400);
  if (actor.isSuperAdmin || actor.roleName === "Reporter") return lead;
  if (lead.assignedTo && String(lead.assignedTo) === actor.userId) return lead;
  if (lead.team && (await Team.exists({ _id: lead.team, leaders: new Types.ObjectId(actor.userId) }))) return lead;
  throw httpError("You can only invite a client whose lead you can see", 403);
}

async function mentorsAround(startAt: Date, endAt: Date): Promise<{ mentors: Mentor[]; timezone: string }> {
  const s = await mentorService.schedule({
    from: new Date(startAt.getTime() - DAY).toISOString(),
    to: new Date(endAt.getTime() + DAY).toISOString(),
  });
  return { mentors: s.mentors, timezone: s.timezone };
}

/** Mentors by their LMS id — names and addresses come from the LMS, never from the form. */
async function resolveMentors(ids: string[], startAt: Date, endAt: Date): Promise<IMeetingMentor[]> {
  const wanted = unique(ids);
  if (!wanted.length) return [];
  const { mentors } = await mentorsAround(startAt, endAt);
  const byId = new Map(mentors.map((m) => [m.id, m]));
  if (wanted.some((id) => !byId.has(id))) throw httpError("A mentor on the list isn't in the LMS", 400);
  return wanted.map((id) => ({ lmsId: id, name: byId.get(id)!.name, email: byId.get(id)!.email.trim().toLowerCase() }));
}

function assertFuture(startAt: Date) {
  if (startAt.getTime() < Date.now() - PAST_SLACK_MS) throw httpError("That time has already passed", 400);
}

// ─── Telling people ───────────────────────────────────────────────────────────

type Change = "scheduled" | "updated" | "cancelled";

interface MailPerson {
  name: string;
  email: string;
}

interface Audience {
  employees: PersonRow[];
  client: MailPerson | null;
  mentors: MailPerson[];
}

interface Story {
  meeting: MeetingRow;
  organizer: MailPerson;
  /** Everyone on it, by name — for the employees' email. */
  withNames: string[];
  /** What changed, in words (updates only). */
  employeeChanges?: string[];
  reason?: string;
}

function whenText(start: Date, end: Date, timeZone: string): string {
  const day = start.toLocaleDateString("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" });
  const t = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
  const zone = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return `${day}, ${t(start)}–${t(end)} (${zone} time)`;
}

function invite(story: Story, method: "REQUEST" | "CANCEL", includeNotes: boolean) {
  const m = story.meeting;
  return (person: MailPerson): MailCalendarInvite => ({
    method,
    content: buildIcs({
      uid: `meeting-${String(m._id)}@remote-crm`,
      sequence: m.sequence,
      method,
      start: m.startAt,
      end: m.endAt,
      title: m.title,
      description: [includeNotes && m.notes ? m.notes : "", m.link ? `Link: ${m.link}` : ""].filter(Boolean).join("\n\n") || undefined,
      location: m.link && !isUrl(m.link) ? m.link : undefined,
      url: m.link && isUrl(m.link) ? m.link : undefined,
      organizer: story.organizer,
      attendee: person,
      alarmMinutes: m.reminderMinutes,
    }),
  });
}

/** In-app + push + email (with the invite) for employees; email with the invite for the client and mentors. */
async function tell(story: Story, change: Change, audience: Audience): Promise<void> {
  const m = story.meeting;
  const settings = await getAppSettings();
  const when = whenText(m.startAt, m.endAt, settings.workingHours.timezone);
  const method = change === "cancelled" ? "CANCEL" : "REQUEST";
  const titles: Record<Change, string> = {
    scheduled: `New meeting: ${m.title}`,
    updated: `Meeting changed: ${m.title}`,
    cancelled: `Meeting cancelled: ${m.title}`,
  };
  const tasks: Array<Promise<unknown>> = [];

  if (audience.employees.length) {
    const body =
      change === "scheduled"
        ? `${story.organizer.name} invited you — ${when}`
        : change === "updated"
          ? `${when}${story.employeeChanges?.length ? ` · ${story.employeeChanges.join(" · ")}` : ""}`
          : `${when}${story.reason ? ` — ${story.reason}` : ""}`;
    tasks.push(
      notify({
        userIds: audience.employees.map((e) => e._id),
        type: `meeting_${change}`,
        title: titles[change],
        body,
        url: `/calendar?meeting=${String(m._id)}`,
        tag: `meeting-${String(m._id)}`,
        email: {
          setting: "meetings",
          subject: `${titles[change]} — ${when}`,
          heading: titles[change],
          paragraphs: [
            change === "cancelled" ? `This meeting has been cancelled${story.reason ? `: ${story.reason}` : "."}` : `When: ${when}`,
            ...(change === "updated" && story.employeeChanges?.length ? [`What changed: ${story.employeeChanges.join("; ")}`] : []),
            `Organizer: ${story.organizer.name}`,
            ...(story.withNames.length ? [`With: ${story.withNames.join(", ")}`] : []),
            ...(m.link && change !== "cancelled" ? [`Link: ${m.link}`] : []),
            ...(m.notes && change !== "cancelled" ? [`Notes: ${m.notes}`] : []),
          ],
          actionLabel: "Open in Remote CRM",
          invite: invite(story, method, true),
        },
      })
    );
  }

  const outside = [...(audience.client ? [audience.client] : []), ...audience.mentors].filter((p) => p.email);
  for (const person of outside) {
    const heading =
      change === "scheduled" ? `You're invited: ${m.title}` : change === "updated" ? `Updated: ${m.title}` : `Cancelled: ${m.title}`;
    tasks.push(
      sendMail({
        to: person.email,
        subject: `${heading} — ${when}`,
        html: renderEmail({
          heading,
          paragraphs: [
            `Hi ${person.name || "there"},`,
            change === "cancelled" ? `The meeting on ${when} has been cancelled.` : `When: ${when}`,
            `With: ${story.organizer.name}`,
            ...(m.link && change !== "cancelled" && !isUrl(m.link) ? [`Where: ${m.link}`] : []),
            ...(change !== "cancelled" ? ["The attached invite adds it to your calendar."] : []),
          ],
          action: m.link && isUrl(m.link) && change !== "cancelled" ? { label: "Join the meeting", url: m.link } : undefined,
        }),
        icalEvent: invite(story, method, false)(person),
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function storyOf(m: MeetingRow, extra: Partial<Story> = {}): Promise<Story> {
  const people = await User.find({ _id: { $in: [m.organizer, ...m.attendees] } }).select("name email").lean<PersonRow[]>();
  const nameOf = new Map(people.map((p) => [String(p._id), p]));
  const organizer = nameOf.get(String(m.organizer));
  const lead = m.lead ? await Lead.findById(m.lead).select("name").lean<LeadRow | null>() : null;
  return {
    meeting: m,
    organizer: { name: organizer?.name ?? "Remote CRM", email: organizer?.email ?? "" },
    withNames: [
      ...m.attendees.map((a) => nameOf.get(String(a))?.name).filter((n): n is string => Boolean(n)),
      ...(lead?.name ? [`${lead.name} (client)`] : []),
      ...m.mentors.map((x) => `${x.name} (mentor)`),
    ],
    ...extra,
  };
}

const clientOf = async (leadId: Types.ObjectId | null): Promise<MailPerson | null> => {
  if (!leadId) return null;
  const lead = await Lead.findById(leadId).select("name email").lean<LeadRow | null>();
  return lead?.email ? { name: lead.name ?? "", email: lead.email } : null;
};

// ─── Booking, changing, cancelling ────────────────────────────────────────────

export async function createMeeting(input: CreateMeetingInput, actor: Actor): Promise<MeetingDTO> {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  assertFuture(startAt);

  const attendees = await activePeople(input.attendeeIds, actor.userId);
  const lead = input.leadId ? await visibleLead(input.leadId, actor) : null;
  const mentors = await resolveMentors(input.mentorIds, startAt, endAt);

  const doc = await Meeting.create({
    title: input.title,
    notes: input.notes ?? "",
    link: input.link ?? "",
    startAt,
    endAt,
    organizer: new Types.ObjectId(actor.userId),
    attendees: attendees.map((a) => a._id),
    lead: lead?._id ?? null,
    mentors,
    reminderMinutes: input.reminderMinutes,
  });
  const row = doc.toObject() as unknown as MeetingRow;

  await tell(await storyOf(row), "scheduled", {
    employees: attendees,
    client: lead?.email ? { name: lead.name ?? "", email: lead.email } : null,
    mentors: mentors.map((x) => ({ name: x.name, email: x.email })),
  });
  return (await toDTOs([row], actor))[0];
}

export async function getMeeting(id: string, actor: Actor): Promise<MeetingDTO> {
  if (!Types.ObjectId.isValid(id)) throw httpError("Invalid meeting id", 400);
  const m = await Meeting.findById(id).lean<MeetingRow | null>();
  // Someone else's meeting answers exactly like one that doesn't exist.
  if (!m || !canSee(m, actor)) throw httpError("Meeting not found", 404);
  return (await toDTOs([m], actor))[0];
}

export async function updateMeeting(id: string, input: UpdateMeetingInput, actor: Actor): Promise<MeetingDTO> {
  if (!Types.ObjectId.isValid(id)) throw httpError("Invalid meeting id", 400);
  const doc = await Meeting.findById(id);
  if (!doc || !canSee(doc, actor)) throw httpError("Meeting not found", 404);
  if (!canEdit(doc, actor)) throw httpError("Only the organizer or a super admin can change this meeting", 403);
  if (doc.status === "cancelled") throw httpError("This meeting was cancelled — book a new one", 400);

  const organizerId = String(doc.organizer);
  const before = {
    title: doc.title,
    notes: doc.notes,
    link: doc.link,
    startAt: doc.startAt,
    endAt: doc.endAt,
    attendees: doc.attendees.map(String),
    lead: doc.lead ? String(doc.lead) : null,
    mentors: doc.mentors.map((x) => ({ name: x.name, email: x.email })),
  };

  const startAt = input.startAt ? new Date(input.startAt) : doc.startAt;
  const endAt = input.endAt ? new Date(input.endAt) : doc.endAt;
  if (endAt <= startAt) throw httpError("The meeting must end after it starts", 400);
  if (endAt.getTime() - startAt.getTime() > 12 * 60 * MINUTE) throw httpError("A meeting can be at most 12 hours", 400);
  const timeChanged = startAt.getTime() !== before.startAt.getTime() || endAt.getTime() !== before.endAt.getTime();
  if (timeChanged) assertFuture(startAt);

  const attendees = input.attendeeIds ? await activePeople(input.attendeeIds, organizerId) : null;
  let leadId: Types.ObjectId | null = doc.lead;
  if (input.leadId !== undefined && input.leadId !== before.lead) {
    leadId = input.leadId ? (await visibleLead(input.leadId, actor))._id : null;
  }
  let mentors: IMeetingMentor[] | null = null;
  if (input.mentorIds) {
    const current = doc.mentors.map((x) => x.lmsId).sort().join();
    if (unique(input.mentorIds).sort().join() !== current) mentors = await resolveMentors(input.mentorIds, startAt, endAt);
  }

  if (input.title !== undefined) doc.title = input.title;
  if (input.notes !== undefined) doc.notes = input.notes;
  if (input.link !== undefined) doc.link = input.link;
  if (input.reminderMinutes !== undefined) doc.reminderMinutes = input.reminderMinutes;
  doc.startAt = startAt;
  doc.endAt = endAt;
  if (attendees) doc.attendees = attendees.map((a) => a._id);
  doc.lead = leadId;
  if (mentors) doc.mentors = mentors;
  if (timeChanged) doc.reminderSentAt = null;
  doc.sequence += 1;
  await doc.save();
  const row = doc.toObject() as unknown as MeetingRow;

  // What changed, in words — for the people who stay on it.
  const settings = await getAppSettings();
  const changes: string[] = [];
  if (timeChanged) changes.push(`now ${whenText(startAt, endAt, settings.workingHours.timezone)}`);
  if (doc.title !== before.title) changes.push(`title: ${doc.title}`);
  if (doc.link !== before.link) changes.push(doc.link ? `link: ${doc.link}` : "link removed");
  const outsideCares = changes.length > 0;
  if (doc.notes !== before.notes) changes.push("notes updated");
  if ((doc.lead ? String(doc.lead) : null) !== before.lead) changes.push(doc.lead ? "client changed" : "client removed");
  if (mentors) changes.push("mentors changed");

  const nowIds = row.attendees.map(String);
  const added = nowIds.filter((x) => !before.attendees.includes(x));
  const removed = before.attendees.filter((x) => !nowIds.includes(x));
  const kept = nowIds.filter((x) => before.attendees.includes(x));
  // A super admin changing someone else's meeting: the organizer hears about it too.
  if (actor.userId !== organizerId) kept.push(organizerId);
  const peopleRows = await User.find({ _id: { $in: unique([...added, ...removed, ...kept]) } })
    .select("name email designation")
    .lean<PersonRow[]>();
  const pick = (ids: string[]) => peopleRows.filter((p) => ids.includes(String(p._id)));

  const story = await storyOf(row, { employeeChanges: changes });
  const beforeClient = before.lead ? await clientOf(new Types.ObjectId(before.lead)) : null;
  const nowClient = await clientOf(row.lead);
  const sameClient = beforeClient && nowClient && beforeClient.email === nowClient.email;
  const beforeEmails = before.mentors.map((x) => x.email);
  const nowMentors = row.mentors.map((x) => ({ name: x.name, email: x.email }));

  await Promise.all([
    tell(story, "scheduled", {
      employees: pick(added),
      client: nowClient && !sameClient ? nowClient : null,
      mentors: nowMentors.filter((x) => !beforeEmails.includes(x.email)),
    }),
    tell({ ...story, reason: "you are no longer on this meeting" }, "cancelled", {
      employees: pick(removed),
      client: beforeClient && !sameClient ? beforeClient : null,
      mentors: before.mentors.filter((b) => !nowMentors.some((x) => x.email === b.email)),
    }),
    changes.length
      ? tell(story, "updated", {
          employees: pick(kept),
          client: sameClient && outsideCares ? nowClient : null,
          mentors: outsideCares ? nowMentors.filter((x) => beforeEmails.includes(x.email)) : [],
        })
      : Promise.resolve(),
  ]);

  return (await toDTOs([row], actor))[0];
}

export async function cancelMeeting(id: string, reason: string | undefined, actor: Actor): Promise<MeetingDTO> {
  if (!Types.ObjectId.isValid(id)) throw httpError("Invalid meeting id", 400);
  const doc = await Meeting.findById(id);
  if (!doc || !canSee(doc, actor)) throw httpError("Meeting not found", 404);
  if (!canEdit(doc, actor)) throw httpError("Only the organizer or a super admin can cancel this meeting", 403);
  if (doc.status === "cancelled") throw httpError("This meeting is already cancelled", 400);

  doc.status = "cancelled";
  doc.cancelledAt = new Date();
  doc.cancelledBy = new Types.ObjectId(actor.userId);
  doc.cancelReason = reason ?? "";
  doc.sequence += 1;
  await doc.save();
  const row = doc.toObject() as unknown as MeetingRow;

  const organizerId = String(row.organizer);
  const told = row.attendees.map(String).concat(actor.userId !== organizerId ? [organizerId] : []);
  const employees = await User.find({ _id: { $in: told } }).select("name email designation").lean<PersonRow[]>();
  await tell(await storyOf(row, { reason: reason || undefined }), "cancelled", {
    employees,
    client: await clientOf(row.lead),
    mentors: row.mentors.map((x) => ({ name: x.name, email: x.email })),
  });
  return (await toDTOs([row], actor))[0];
}

// ─── The calendar ─────────────────────────────────────────────────────────────

export interface CalendarResponse {
  timezone: string;
  workingHours: { timezone: string; days: number[]; start: string; end: string };
  person: { id: string; name: string };
  meetings: MeetingDTO[];
  followUps: Array<{ id: string; leadId: string; leadName: string; phone: string; at: string }>;
  reminders: Array<{ id: string; leadId: string; leadName: string; title: string; note: string; at: string }>;
}

/** One person's meetings, follow-ups due and reminders between two dates. Only their own — or anyone's, for a super admin. */
export async function calendarFor(q: { from: Date; to: Date; userId?: string }, actor: Actor): Promise<CalendarResponse> {
  const who = q.userId ?? actor.userId;
  if (who !== actor.userId && !actor.isSuperAdmin) throw httpError("You can only see your own calendar", 403);
  const person = await User.findById(who).select("name").lean<{ _id: Types.ObjectId; name: string } | null>();
  if (!person) throw httpError("That person doesn't exist", 404);

  const settings = await getAppSettings();
  const whoId = new Types.ObjectId(who);
  const range = { $gte: q.from, $lt: q.to };
  const [meetings, followUpLeads, reminderRows] = await Promise.all([
    Meeting.find({ startAt: { $lt: q.to }, endAt: { $gt: q.from }, $or: [{ organizer: whoId }, { attendees: whoId }] })
      .sort({ startAt: 1 })
      .lean<MeetingRow[]>(),
    Lead.find({ assignedTo: whoId, nextFollowUpAt: range, status: { $nin: ["closed", "lost"] } })
      .select("name phone nextFollowUpAt")
      .lean<Array<LeadRow & { nextFollowUpAt: Date }>>(),
    Lead.aggregate<{ _id: Types.ObjectId; name?: string; reminder: { _id: Types.ObjectId; title?: string; note?: string; remindAt: Date } }>([
      { $match: { reminders: { $elemMatch: { createdBy: whoId, remindAt: range, isDone: false } } } },
      { $unwind: "$reminders" },
      { $match: { "reminders.createdBy": whoId, "reminders.remindAt": range, "reminders.isDone": false } },
      { $project: { name: 1, reminder: "$reminders" } },
    ]),
  ]);

  const followUps = followUpLeads.map((l) => ({
    id: `followup-${String(l._id)}`,
    leadId: String(l._id),
    leadName: l.name ?? "",
    phone: l.phone ?? "",
    at: new Date(l.nextFollowUpAt).toISOString(),
  }));
  // A follow-up already makes a "Follow-up due" reminder at the same time — show it once.
  const reminders = reminderRows
    .filter((r) => !followUps.some((f) => f.leadId === String(r._id) && Math.abs(Date.parse(f.at) - new Date(r.reminder.remindAt).getTime()) < MINUTE))
    .map((r) => ({
      id: String(r.reminder._id),
      leadId: String(r._id),
      leadName: r.name ?? "",
      title: r.reminder.title || "Reminder",
      note: r.reminder.note ?? "",
      at: new Date(r.reminder.remindAt).toISOString(),
    }));

  return {
    timezone: settings.workingHours.timezone,
    workingHours: settings.workingHours,
    person: { id: String(person._id), name: person.name },
    meetings: await toDTOs(meetings, actor),
    followUps,
    reminders,
  };
}

/** Colleagues anyone may invite — active people, name order. */
export async function listColleagues(search?: string): Promise<PersonDTO[]> {
  const filter: Record<string, unknown> = { status: { $ne: "inactive" } };
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const people = await User.find(filter).select("name email designation").sort({ name: 1 }).limit(200).lean<PersonRow[]>();
  return people.map(personDTO);
}

// ─── Who is busy ──────────────────────────────────────────────────────────────

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Whether [start, end) sits inside one of the mentor's weekly slots, read in the LMS's time zone. */
function withinSlots(slots: Mentor["slots"], start: Date, end: Date, timeZone: string): boolean {
  if (!timeZone) return true; // no zone, no honest answer — no warning either
  const a = localClock(timeZone, start);
  const b = localClock(timeZone, new Date(end.getTime() - 1));
  if (a.dayKey !== b.dayKey) return false;
  return slots.some((s) => s.dayOfWeek === a.weekday && minutesOf(s.startTime) <= a.minutes && minutesOf(s.endTime) > b.minutes);
}

export interface ConflictsResponse {
  people: Array<{ id: string; name: string; meetings: Array<{ id: string; title: string; startAt: string; endAt: string }> }>;
  mentors: Array<{ id: string; name: string; available: boolean; busy: Array<{ kind: "class" | "meeting"; title: string; startAt: string; endAt: string }> }>;
  /** Why the mentors could not be checked, when they could not. */
  mentorsUnavailable: string | null;
}

/** Who already has something at that time — a warning for the form, never a refusal. */
export async function findConflicts(input: ConflictsInput): Promise<ConflictsResponse> {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const ids = unique(input.userIds).map((id) => new Types.ObjectId(id));

  let people: ConflictsResponse["people"] = [];
  if (ids.length) {
    const [users, busy] = await Promise.all([
      User.find({ _id: { $in: ids } }).select("name").lean<Array<{ _id: Types.ObjectId; name: string }>>(),
      Meeting.find({
        status: "scheduled",
        ...(input.excludeId ? { _id: { $ne: new Types.ObjectId(input.excludeId) } } : {}),
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
        $or: [{ organizer: { $in: ids } }, { attendees: { $in: ids } }],
      })
        .select("title startAt endAt organizer attendees")
        .lean<Array<Pick<MeetingRow, "_id" | "title" | "startAt" | "endAt" | "organizer" | "attendees">>>(),
    ]);
    people = users
      .map((u) => ({
        id: String(u._id),
        name: u.name,
        meetings: busy
          .filter((b) => String(b.organizer) === String(u._id) || b.attendees.some((a) => String(a) === String(u._id)))
          .map((b) => ({ id: String(b._id), title: b.title, startAt: b.startAt.toISOString(), endAt: b.endAt.toISOString() })),
      }))
      .filter((p) => p.meetings.length > 0);
  }

  const mentors: ConflictsResponse["mentors"] = [];
  let mentorsUnavailable: string | null = null;
  if (input.mentorIds.length) {
    try {
      const { mentors: all, timezone } = await mentorsAround(startAt, endAt);
      for (const id of unique(input.mentorIds)) {
        const m = all.find((x) => x.id === id);
        if (!m) continue;
        const busy = [
          ...m.classes.map((c) => ({ kind: "class" as const, title: c.title ?? "Class", start: new Date(c.startsAt), minutes: c.durationMins })),
          ...m.meetings.map((x) => ({ kind: "meeting" as const, title: x.title, start: new Date(x.startsAt), minutes: x.durationMins })),
        ]
          .map((x) => ({ ...x, end: new Date(x.start.getTime() + x.minutes * MINUTE) }))
          .filter((x) => x.start < endAt && x.end > startAt)
          .map((x) => ({ kind: x.kind, title: x.title, startAt: x.start.toISOString(), endAt: x.end.toISOString() }));
        mentors.push({ id, name: m.name, available: withinSlots(m.slots, startAt, endAt, timezone), busy });
      }
    } catch (err) {
      mentorsUnavailable = err instanceof Error ? err.message : "The LMS could not be reached";
    }
  }
  return { people, mentors, mentorsUnavailable };
}

// ─── Reminders ────────────────────────────────────────────────────────────────

/** One pass: everyone on a meeting whose reminder time has come is told, once. */
export async function sweepMeetingReminders(now: Date = new Date()): Promise<{ reminded: number }> {
  const soon = await Meeting.find({
    status: "scheduled",
    reminderSentAt: null,
    reminderMinutes: { $gt: 0 },
    startAt: { $gt: now, $lte: new Date(now.getTime() + DAY) },
  }).lean<MeetingRow[]>();
  if (!soon.length) return { reminded: 0 };

  const settings = await getAppSettings();
  const tz = settings.workingHours.timezone;
  let reminded = 0;
  for (const m of soon) {
    if (m.startAt.getTime() - m.reminderMinutes * MINUTE > now.getTime()) continue;
    const res = await Meeting.updateOne({ _id: m._id, reminderSentAt: null, startAt: m.startAt }, { $set: { reminderSentAt: now } });
    if (!res.modifiedCount) continue;
    const mins = Math.max(1, Math.round((m.startAt.getTime() - now.getTime()) / MINUTE));
    const when = whenText(m.startAt, m.endAt, tz);
    await notify({
      userIds: [m.organizer, ...m.attendees],
      type: "meeting_reminder",
      title: `In ${mins} min: ${m.title}`,
      body: `${when}${m.link ? ` · ${m.link}` : ""}`,
      url: `/calendar?meeting=${String(m._id)}`,
      tag: `meeting-reminder-${String(m._id)}`,
      email: {
        setting: "meetings",
        subject: `Starting in ${mins} min: ${m.title}`,
        heading: `Starting in ${mins} min`,
        paragraphs: [`${m.title} — ${when}`, ...(m.link ? [`Link: ${m.link}`] : [])],
        actionLabel: "Open the meeting",
      },
    });
    reminded++;
  }
  return { reminded };
}
