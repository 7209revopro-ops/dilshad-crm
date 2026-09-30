export interface MeetingPerson {
  id: string;
  name: string;
  email: string;
  designation: string | null;
}

export interface MeetingMentor {
  lmsId: string;
  name: string;
  email: string;
}

/** A meeting booked in the CRM (GET /meetings/:id, and the calendar). */
export interface Meeting {
  id: string;
  title: string;
  /** For the team only — never sent to the client or mentors. */
  notes: string;
  /** A joining link or a place. */
  link: string;
  startAt: string;
  endAt: string;
  status: "scheduled" | "cancelled";
  cancelReason: string;
  cancelledAt: string | null;
  organizer: MeetingPerson | null;
  attendees: MeetingPerson[];
  lead: { id: string; name: string; phone: string; email: string | null } | null;
  mentors: MeetingMentor[];
  reminderMinutes: number;
  /** The viewer may change or cancel it. */
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarFollowUp {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  at: string;
}

export interface CalendarReminder {
  id: string;
  leadId: string;
  leadName: string;
  title: string;
  note: string;
  at: string;
}

/** GET /meetings/calendar */
export interface CalendarData {
  timezone: string;
  workingHours: { timezone: string; days: number[]; start: string; end: string };
  person: { id: string; name: string };
  meetings: Meeting[];
  followUps: CalendarFollowUp[];
  reminders: CalendarReminder[];
}

/** POST /meetings and PUT /meetings/:id (partial) */
export interface MeetingInput {
  title: string;
  startAt: string;
  endAt: string;
  attendeeIds: string[];
  leadId: string | null;
  mentorIds: string[];
  link: string;
  notes: string;
  reminderMinutes: number;
}

/** POST /meetings/conflicts */
export interface ConflictsInput {
  startAt: string;
  endAt: string;
  userIds: string[];
  mentorIds: string[];
  excludeId?: string;
}

export interface Conflicts {
  people: Array<{ id: string; name: string; meetings: Array<{ id: string; title: string; startAt: string; endAt: string }> }>;
  mentors: Array<{ id: string; name: string; available: boolean; busy: Array<{ kind: "class" | "meeting"; title: string; startAt: string; endAt: string }> }>;
  mentorsUnavailable: string | null;
}

/** The LMS's mentor calendar (GET /mentors/schedule) — only what the calendar page reads. */
export interface MentorSchedule {
  timezone: string;
  from: string;
  to: string;
  mentors: Array<{
    id: string;
    name: string;
    email: string;
    shared: boolean;
    slots: { dayOfWeek: number; startTime: string; endTime: string }[];
    classes: { id: string; title: string | null; startsAt: string; durationMins: number; status: string }[];
    meetings: { id: string; title: string; startsAt: string; durationMins: number }[];
  }>;
}

/** One thing on the calendar grid. */
export type CalendarItem =
  | { kind: "meeting"; id: string; title: string; start: Date; end: Date; cancelled: boolean; meeting: Meeting }
  | { kind: "followup"; id: string; title: string; start: Date; end: Date; leadId: string }
  | { kind: "reminder"; id: string; title: string; start: Date; end: Date; leadId: string };

/** A mentor's time shown behind the calendar: free (their LMS slots) or busy (classes, meetings). */
export interface MentorBlock {
  mentorId: string;
  mentorName: string;
  /** Tailwind colour stem, e.g. "emerald" */
  color: string;
  kind: "free" | "busy";
  title: string;
  start: Date;
  end: Date;
}
