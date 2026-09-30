"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CalendarPlus, Check, GraduationCap, Loader2, Search, UserRound, Users, X } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/authStore";
import { addDays, clockText, dayKey, hhmmToMinutes, minuteOfDay, minutesToHhmm, zoneName, zonedToUtc } from "@/lib/zonedTime";
import {
  useColleagues,
  useCreateMeeting,
  useLeadSearch,
  useMeetingConflicts,
  useMentorSchedule,
  useUpdateMeeting,
} from "@/hooks/useMeetings";
import type { ConflictsInput, Meeting, MeetingInput } from "@/types/meeting";

// ── Types ──────────────────────────────────────────────────────────────────────
interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  /** Editing this one; otherwise a new meeting. */
  meeting?: Meeting | null;
  /** Where a new meeting starts — a slot clicked on the calendar. */
  defaultStart?: Date | null;
  /** People already on a new meeting — e.g. whoever's calendar is being looked at. */
  defaultAttendeeIds?: string[];
}

interface FormState {
  title: string;
  date: string;
  start: string;
  end: string;
  attendeeIds: string[];
  lead: { id: string; name: string } | null;
  mentorIds: string[];
  link: string;
  notes: string;
  reminderMinutes: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const REMINDERS = [
  { value: 0, label: "No reminder" },
  { value: 5, label: "5 min before" },
  { value: 10, label: "10 min before" },
  { value: 15, label: "15 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

const sectionVariants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

function initialState(meeting: Meeting | null | undefined, defaultStart: Date | null | undefined, tz: string, attendeeIds: string[] = []): FormState {
  if (meeting) {
    const s = new Date(meeting.startAt);
    const e = new Date(meeting.endAt);
    return {
      title: meeting.title,
      date: dayKey(s, tz),
      start: minutesToHhmm(minuteOfDay(s, tz)),
      end: minutesToHhmm(minuteOfDay(e, tz)),
      attendeeIds: meeting.attendees.map((a) => a.id),
      lead: meeting.lead ? { id: meeting.lead.id, name: meeting.lead.name } : null,
      mentorIds: meeting.mentors.map((m) => m.lmsId),
      link: meeting.link,
      notes: meeting.notes,
      reminderMinutes: meeting.reminderMinutes,
    };
  }
  // The next half hour, or the slot that was clicked.
  const base = defaultStart ?? new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000);
  const startMin = minuteOfDay(base, tz);
  return {
    title: "",
    date: dayKey(base, tz),
    start: minutesToHhmm(startMin),
    end: minutesToHhmm(Math.min(startMin + 30, 23 * 60 + 59)),
    attendeeIds,
    lead: null,
    mentorIds: [],
    link: "",
    notes: "",
    reminderMinutes: 15,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
/**
 * Book or change a meeting: when, who from the team, optionally a client (one
 * of the leads you can see) and mentors from the LMS. Warns — never blocks —
 * when someone is already busy then.
 */
export function MeetingDialog({ open, onOpenChange, timezone, meeting, defaultStart, defaultAttendeeIds }: MeetingDialogProps) {
  const me = useAuthStore((s) => s.user);
  const canSeeLeads = useAuthStore((s) => s.hasPermission("leads", "view"));
  const [form, setForm] = useState<FormState>(() => initialState(meeting, defaultStart, timezone, defaultAttendeeIds));
  const [peopleSearch, setPeopleSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [mentorsOpen, setMentorsOpen] = useState(false);
  const [debounced, setDebounced] = useState<ConflictsInput | null>(null);
  const create = useCreateMeeting();
  const update = useUpdateMeeting();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    const s = initialState(meeting, defaultStart, timezone, (defaultAttendeeIds ?? []).filter((id) => id !== me?._id));
    setForm(s);
    setPeopleSearch("");
    setLeadSearch("");
    setMentorsOpen(s.mentorIds.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meeting, defaultStart, timezone]);

  const organizerId = meeting?.organizer?.id ?? me?._id ?? "";
  const { data: colleagues = [], isLoading: loadingPeople } = useColleagues(open);
  const { data: leadResults = [], isFetching: searchingLeads } = useLeadSearch(leadSearch, open && canSeeLeads && !form.lead);
  const mentorWindow = useMemo(
    () => ({ from: zonedToUtc(addDays(form.date, -1), 0, timezone).toISOString(), to: zonedToUtc(addDays(form.date, 2), 0, timezone).toISOString() }),
    [form.date, timezone]
  );
  const mentorSchedule = useMentorSchedule(mentorWindow.from, mentorWindow.to, open && mentorsOpen);
  const mentors = mentorSchedule.data?.mentors ?? [];

  const startAt = useMemo(() => zonedToUtc(form.date, hhmmToMinutes(form.start || "00:00"), timezone), [form.date, form.start, timezone]);
  const endAt = useMemo(() => zonedToUtc(form.date, hhmmToMinutes(form.end || "00:00"), timezone), [form.date, form.end, timezone]);
  const timeChanged = !meeting || startAt.toISOString() !== new Date(meeting.startAt).toISOString() || endAt.toISOString() !== new Date(meeting.endAt).toISOString();

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!form.title.trim()) p.push("Give the meeting a title.");
    if (!form.date || !form.start || !form.end) p.push("Pick a date, a start and an end.");
    else if (endAt <= startAt) p.push("The meeting must end after it starts.");
    else if (timeChanged && startAt.getTime() < Date.now() - 5 * 60_000) p.push("That time has already passed.");
    return p;
  }, [form, startAt, endAt, timeChanged]);

  // Who is busy then — asked half a second after the form stops changing.
  const conflictsInput = useMemo<ConflictsInput | null>(() => {
    if (!open || endAt <= startAt) return null;
    return {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      userIds: [organizerId, ...form.attendeeIds].filter(Boolean),
      mentorIds: form.mentorIds,
      ...(meeting ? { excludeId: meeting.id } : {}),
    };
  }, [open, startAt, endAt, organizerId, form.attendeeIds, form.mentorIds, meeting]);
  const conflictsKey = JSON.stringify(conflictsInput);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(conflictsInput), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictsKey]);
  const conflicts = useMeetingConflicts(debounced);
  const warnings = useMemo(() => {
    const w: string[] = [];
    for (const p of conflicts.data?.people ?? []) {
      const who = p.id === organizerId ? "You have" : `${p.name} has`;
      for (const m of p.meetings) w.push(`${who} "${m.title}" ${clockText(new Date(m.startAt), timezone)}–${clockText(new Date(m.endAt), timezone)}`);
    }
    for (const m of conflicts.data?.mentors ?? []) {
      if (!m.available) w.push(`${m.name} isn't available then in the LMS`);
      for (const b of m.busy) w.push(`${m.name} has a ${b.kind} "${b.title}" ${clockText(new Date(b.startAt), timezone)}–${clockText(new Date(b.endAt), timezone)}`);
    }
    if (conflicts.data?.mentorsUnavailable) w.push(`Mentors could not be checked: ${conflicts.data.mentorsUnavailable}`);
    return w;
  }, [conflicts.data, organizerId, timezone]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "attendeeIds" | "mentorIds", id: string) =>
    setForm((f) => ({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] }));

  const pickable = colleagues.filter((c) => c.id !== organizerId);
  const shownPeople = pickable.filter((c) => {
    const q = peopleSearch.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });
  const nameOf = (id: string) => colleagues.find((c) => c.id === id)?.name ?? meeting?.attendees.find((a) => a.id === id)?.name ?? "…";

  const submit = () => {
    const body: MeetingInput = {
      title: form.title.trim(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      attendeeIds: form.attendeeIds,
      leadId: form.lead?.id ?? null,
      mentorIds: form.mentorIds,
      link: form.link.trim(),
      notes: form.notes.trim(),
      reminderMinutes: form.reminderMinutes,
    };
    const done = { onSuccess: () => onOpenChange(false) };
    if (meeting) update.mutate({ id: meeting.id, body }, done);
    else create.mutate(body, done);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent desktopClassName="max-w-xl">
        <ResponsiveDialogHeader>
          <div className="flex items-center gap-3 px-4 sm:px-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <CalendarPlus className="h-5 w-5 text-primary" />
            </div>
            <ResponsiveDialogTitle>{meeting ? "Change meeting" : "New meeting"}</ResponsiveDialogTitle>
          </div>
          <ResponsiveDialogDescription className="px-4 pt-1 sm:px-0">
            Times are in {zoneName(timezone)} time. Everyone you add is told, with a calendar invite by email.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-2 sm:px-1">
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input id="meeting-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Course walkthrough with Ahmed" maxLength={200} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Date</Label>
              <Input id="meeting-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-start">Start</Label>
              <Input
                id="meeting-start"
                type="time"
                value={form.start}
                onChange={(e) => {
                  const v = e.target.value;
                  // Keep the length when the start moves.
                  const len = hhmmToMinutes(form.end || "00:00") - hhmmToMinutes(form.start || "00:00");
                  setForm((f) => ({ ...f, start: v, end: v && len > 0 ? minutesToHhmm(Math.min(hhmmToMinutes(v) + len, 23 * 60 + 59)) : f.end }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-end">End</Label>
              <Input id="meeting-end" type="time" value={form.end} onChange={(e) => set("end", e.target.value)} />
            </div>
          </div>

          {/* People */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> People from the team
            </Label>
            {form.attendeeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.attendeeIds.map((id) => (
                  <motion.span key={id} initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {nameOf(id)}
                    <button type="button" onClick={() => toggle("attendeeIds", id)} aria-label={`Remove ${nameOf(id)}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </motion.span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} placeholder="Search colleagues" className="pl-8" aria-label="Search colleagues" />
            </div>
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1" role="listbox" aria-label="Colleagues">
              {loadingPeople ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : shownPeople.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nobody matches.</p>
              ) : (
                shownPeople.map((p) => {
                  const on = form.attendeeIds.includes(p.id);
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggle("attendeeIds", p.id)}
                      className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors", on ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{p.designation || p.email}</span>
                      </span>
                      {on && <Check className="h-4 w-4 shrink-0" />}
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>

          {/* Client */}
          {canSeeLeads && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" /> Client (optional)
              </Label>
              {form.lead ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span className="truncate">{form.lead.name || "Unnamed lead"}</span>
                  <button type="button" onClick={() => set("lead", null)} className="text-muted-foreground hover:text-destructive" aria-label="Remove the client">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Search your leads by name or phone" className="pl-8" aria-label="Search leads" />
                  </div>
                  <AnimatePresence>
                    {leadSearch.trim().length >= 2 && (
                      <motion.div variants={sectionVariants} initial="hidden" animate="visible" exit="exit" className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1">
                        {searchingLeads ? (
                          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                          </div>
                        ) : leadResults.length === 0 ? (
                          <p className="py-3 text-center text-xs text-muted-foreground">No lead of yours matches.</p>
                        ) : (
                          leadResults.map((l) => (
                            <motion.button
                              key={l._id}
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => { set("lead", { id: l._id, name: l.name }); setLeadSearch(""); }}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted/60"
                            >
                              <span className="truncate">{l.name || "Unnamed lead"}</span>
                              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{l.phone}</span>
                            </motion.button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <p className="text-[11px] text-muted-foreground">The client gets an email invite if their lead has an email address.</p>
                </>
              )}
            </div>
          )}

          {/* Mentors */}
          <div className="space-y-1.5">
            <button type="button" onClick={() => setMentorsOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium" aria-expanded={mentorsOpen}>
              <GraduationCap className="h-3.5 w-3.5" /> Mentors from the LMS {form.mentorIds.length ? `(${form.mentorIds.length})` : "(optional)"}
            </button>
            <AnimatePresence initial={false}>
              {mentorsOpen && (
                <motion.div variants={sectionVariants} initial="hidden" animate="visible" exit="exit" className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1">
                  {mentorSchedule.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking the LMS…
                    </div>
                  ) : mentorSchedule.error ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">The mentor calendar isn&apos;t available right now.</p>
                  ) : mentors.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">No mentors in the LMS.</p>
                  ) : (
                    mentors.map((m) => {
                      const on = form.mentorIds.includes(m.id);
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggle("mentorIds", m.id)}
                          className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm", on ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}
                        >
                          <span className="truncate">{m.name}</span>
                          {on && <Check className="h-4 w-4 shrink-0" />}
                        </motion.button>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-link">Link or place</Label>
              <Input id="meeting-link" value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="https://meet.google.com/… or Office, 3rd floor" maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label>Reminder</Label>
              <Select value={String(form.reminderMinutes)} onValueChange={(v) => set("reminderMinutes", Number(v))}>
                <SelectTrigger aria-label="Reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDERS.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-notes">Notes for the team</Label>
            <Textarea id="meeting-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={2000} placeholder="Never sent to the client or mentors" />
          </div>

          <AnimatePresence>
            {warnings.length > 0 && (
              <motion.div variants={sectionVariants} initial="hidden" animate="visible" exit="exit" className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" /> Busy then — you can still book it
                </p>
                {warnings.slice(0, 6).map((w) => (
                  <p key={w}>• {w}</p>
                ))}
                {warnings.length > 6 && <p>… and {warnings.length - 6} more</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ResponsiveDialogFooter>
          <AnimatePresence>
            {problems.length > 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mr-auto self-center text-xs text-destructive" role="alert">
                {problems[0]}
              </motion.p>
            )}
          </AnimatePresence>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button onClick={submit} disabled={saving || problems.length > 0} className="w-full gap-1.5 sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {meeting ? "Save changes" : "Book meeting"}
            </Button>
          </motion.div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
