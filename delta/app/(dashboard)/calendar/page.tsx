"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, GraduationCap, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/shared/ListStates";
import { TimeGrid } from "@/components/calendar/TimeGrid";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MeetingDialog } from "@/components/calendar/MeetingDialog";
import { MeetingDetails } from "@/components/calendar/MeetingDetails";
import { MENTOR_DOT_CLASS, mentorColor } from "@/components/calendar/mentorColors";
import { cn } from "@/lib/utils";
import { pageVariants } from "@/lib/animations";
import { useAuthStore } from "@/lib/store/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCalendar, useColleagues, useMentorSchedule } from "@/hooks/useMeetings";
import {
  addDays,
  dayKey,
  dayText,
  hhmmToMinutes,
  monthGrid,
  monthText,
  startOfWeek,
  weekdayOf,
  zoneName,
  zonedToUtc,
} from "@/lib/zonedTime";
import type { CalendarItem, Meeting, MentorBlock } from "@/types/meeting";

// ── Types ──────────────────────────────────────────────────────────────────────
type View = "day" | "week" | "month";

// ── Constants ──────────────────────────────────────────────────────────────────
const VIEWS: { key: View; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];
const ME = "me";
const FALLBACK_TZ = "Asia/Dubai";

function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// ── Page ───────────────────────────────────────────────────────────────────────
/**
 * Everyone's own calendar: their meetings, and the follow-ups and reminders on
 * their leads — with the mentors' LMS time alongside when they want it. The
 * super admin can open anyone's. Times are the CRM's working-hours zone.
 */
export default function CalendarPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  // The signed-in user comes from localStorage: decide only once in the browser, so the server's HTML matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isSuperAdmin = mounted && Boolean(me?.role?.isSystemRole && me.role.roleName === "Super Admin");

  const [tz, setTz] = useState(FALLBACK_TZ);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => dayKey(new Date(), FALLBACK_TZ));
  const [person, setPerson] = useState<string>(ME);
  const [showFollowUps, setShowFollowUps] = useState(true);
  const [mentorIds, setMentorIds] = useState<string[]>([]);
  const [mentorPicker, setMentorPicker] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null);
  const [editor, setEditor] = useState<{ meeting?: Meeting | null; start?: Date | null } | null>(null);

  // A phone shows one day at a time — seven columns don't fit.
  useEffect(() => {
    if (isMobile) setView("day");
  }, [isMobile]);

  // Opened from a notification: /calendar?meeting=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("meeting");
    if (id) setOpenId(id);
  }, []);

  const todayKey = dayKey(new Date(), tz);
  const { rangeStart, rangeEnd, days } = useMemo(() => {
    if (view === "day") return { rangeStart: anchor, rangeEnd: addDays(anchor, 1), days: [anchor] };
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { rangeStart: s, rangeEnd: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    const grid = monthGrid(anchor);
    return { rangeStart: grid[0], rangeEnd: addDays(grid[41], 1), days: grid };
  }, [view, anchor]);
  const from = zonedToUtc(rangeStart, 0, tz).toISOString();
  const to = zonedToUtc(rangeEnd, 0, tz).toISOString();

  const cal = useCalendar({ from, to, userId: person === ME ? undefined : person });
  const mentors = useMentorSchedule(from, to, mentorIds.length > 0 || mentorPicker);
  const colleagues = useColleagues(isSuperAdmin);

  // The zone comes from the server — the CRM's working hours — not from this browser.
  useEffect(() => {
    if (cal.data?.timezone && cal.data.timezone !== tz) {
      setTz(cal.data.timezone);
      setAnchor(dayKey(new Date(), cal.data.timezone));
    }
  }, [cal.data?.timezone, tz]);

  const items = useMemo<CalendarItem[]>(() => {
    const d = cal.data;
    if (!d) return [];
    const out: CalendarItem[] = d.meetings.map((m) => ({
      kind: "meeting",
      id: m.id,
      title: m.title,
      start: new Date(m.startAt),
      end: new Date(m.endAt),
      cancelled: m.status === "cancelled",
      meeting: m,
    }));
    if (showFollowUps) {
      for (const f of d.followUps) {
        const start = new Date(f.at);
        out.push({ kind: "followup", id: f.id, title: `Follow-up: ${f.leadName || "lead"}`, start, end: new Date(start.getTime() + 30 * 60_000), leadId: f.leadId });
      }
      for (const r of d.reminders) {
        const start = new Date(r.at);
        out.push({ kind: "reminder", id: r.id, title: `${r.title}: ${r.leadName || "lead"}`, start, end: new Date(start.getTime() + 30 * 60_000), leadId: r.leadId });
      }
    }
    return out;
  }, [cal.data, showFollowUps]);

  const mentorBlocks = useMemo<MentorBlock[]>(() => {
    const s = mentors.data;
    if (!s || !mentorIds.length || view === "month") return [];
    const mtz = s.timezone || tz;
    const out: MentorBlock[] = [];
    mentorIds.forEach((id, index) => {
      const m = s.mentors.find((x) => x.id === id);
      if (!m) return;
      const color = mentorColor(index);
      // Their weekly slots are "HH:MM" in the LMS's zone — placed day by day, with a day's slack either side.
      for (let k = addDays(rangeStart, -1); k !== addDays(rangeEnd, 1); k = addDays(k, 1)) {
        for (const sl of m.slots.filter((x) => x.dayOfWeek === weekdayOf(k))) {
          out.push({ mentorId: id, mentorName: m.name, color, kind: "free", title: "Free", start: zonedToUtc(k, hhmmToMinutes(sl.startTime), mtz), end: zonedToUtc(k, hhmmToMinutes(sl.endTime), mtz) });
        }
      }
      for (const c of m.classes) {
        const start = new Date(c.startsAt);
        out.push({ mentorId: id, mentorName: m.name, color, kind: "busy", title: c.title ?? "Class", start, end: new Date(start.getTime() + c.durationMins * 60_000) });
      }
      for (const x of m.meetings) {
        const start = new Date(x.startsAt);
        out.push({ mentorId: id, mentorName: m.name, color, kind: "busy", title: x.title, start, end: new Date(start.getTime() + x.durationMins * 60_000) });
      }
    });
    return out;
  }, [mentors.data, mentorIds, rangeStart, rangeEnd, tz, view]);

  const title =
    view === "day" ? dayText(anchor, true) : view === "week" ? `${dayText(days[0])} – ${dayText(days[6], true)}` : monthText(anchor);
  const step = (n: number) =>
    setAnchor((a) => (view === "day" ? addDays(a, n) : view === "week" ? addDays(a, 7 * n) : shiftMonth(a, n)));
  const scrollTo = hhmmToMinutes(cal.data?.workingHours.start ?? "09:00");
  const viewingOther = person !== ME;

  const openItem = (item: CalendarItem) => {
    if (item.kind === "meeting") {
      setOpenMeeting(item.meeting);
      setOpenId(item.id);
    } else router.push(`/leads/${item.leadId}`);
  };
  const closeDetails = () => {
    setOpenId(null);
    setOpenMeeting(null);
    if (window.location.search.includes("meeting=")) window.history.replaceState(null, "", "/calendar");
  };

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible" className="space-y-4 p-4 sm:p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <CalendarClock className="h-5 w-5 text-primary" />
            </span>
            Calendar
            {viewingOther && cal.data && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                <Badge variant="secondary" className="ml-1 gap-1 font-normal">
                  {cal.data.person.name}
                  <button type="button" onClick={() => setPerson(ME)} aria-label="Back to my calendar">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </motion.span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Meetings, follow-ups and reminders. Times in {zoneName(tz)} time. Click an empty time to book a meeting there.
          </p>
        </div>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button className="gap-1.5" onClick={() => setEditor({ start: null })}>
            <CalendarPlus className="h-4 w-4" /> New meeting
          </Button>
        </motion.div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button variant="outline" size="sm" onClick={() => setAnchor(todayKey)}>Today</Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
          <span className="ml-1 text-sm font-semibold">{title}</span>
          {cal.isFetching && <RefreshCw className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label="Whose calendar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ME}>My calendar</SelectItem>
                {(colleagues.data ?? []).filter((c) => c.id !== me?._id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1">
            <Switch id="show-followups" checked={showFollowUps} onCheckedChange={setShowFollowUps} />
            <Label htmlFor="show-followups" className="text-xs">Follow-ups</Label>
          </div>

          {view !== "month" && (
            <Popover open={mentorPicker} onOpenChange={setMentorPicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <GraduationCap className="h-3.5 w-3.5" /> Mentors{mentorIds.length ? ` (${mentorIds.length})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="px-1 pb-1.5 text-xs text-muted-foreground">Show mentors&apos; LMS time beside yours (up to 5).</p>
                {mentors.isLoading ? (
                  <div className="space-y-1.5 p-1">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : mentors.error ? (
                  <p className="p-2 text-xs text-muted-foreground">The mentor calendar isn&apos;t available right now.</p>
                ) : (
                  <div className="max-h-64 space-y-0.5 overflow-y-auto">
                    {(mentors.data?.mentors ?? []).map((m) => {
                      const i = mentorIds.indexOf(m.id);
                      const on = i !== -1;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={!on && mentorIds.length >= 5}
                          onClick={() => setMentorIds((ids) => (on ? ids.filter((x) => x !== m.id) : [...ids, m.id]))}
                          className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-40", on ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}
                        >
                          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", on ? MENTOR_DOT_CLASS[mentorColor(i)] : "bg-muted-foreground/30")} />
                          <span className="truncate">{m.name}</span>
                        </button>
                      );
                    })}
                    {mentorIds.length > 0 && (
                      <button type="button" onClick={() => setMentorIds([])} className="w-full px-2 py-1 text-left text-xs text-muted-foreground hover:text-destructive">
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}

          <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
            {VIEWS.map((v) => (
              <motion.button
                key={v.key}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setView(v.key)}
                aria-pressed={view === v.key}
                className={cn("relative rounded-md px-2.5 py-1 text-xs font-medium", view === v.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {view === v.key && (
                  <motion.span layoutId="calendar-view-pill" className="absolute inset-0 rounded-md bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                )}
                <span className="relative z-10">{v.label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/60" /> Meeting</span>
        {showFollowUps && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500/60" /> Follow-up</span>}
        {showFollowUps && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500/60" /> Reminder</span>}
        {mentorIds.length > 0 && view !== "month" && (
          <>
            {mentorIds.map((id, i) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", MENTOR_DOT_CLASS[mentorColor(i)])} />
                {mentors.data?.mentors.find((m) => m.id === id)?.name ?? "Mentor"} free
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500/60" /> Mentor booked</span>
          </>
        )}
      </div>

      {/* ── Grid ── */}
      {cal.error ? (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <ErrorState onRetry={() => cal.refetch()} />
          </CardContent>
        </Card>
      ) : !cal.data ? (
        <Skeleton className="h-[480px] w-full rounded-xl" />
      ) : view === "month" ? (
        <MonthGrid
          days={days}
          monthKey={anchor.slice(0, 7)}
          timezone={tz}
          items={items}
          todayKey={todayKey}
          onDay={(d) => {
            setAnchor(d);
            setView("day");
          }}
          onAdd={(d) => setEditor({ start: zonedToUtc(d, hhmmToMinutes(cal.data?.workingHours.start ?? "09:00") + 60, tz) })}
          onItem={openItem}
        />
      ) : (
        <TimeGrid
          days={days}
          timezone={tz}
          items={items}
          mentorBlocks={mentorBlocks}
          mentorIds={mentorIds}
          todayKey={todayKey}
          scrollToMinute={scrollTo}
          onSlot={(start) => setEditor({ start })}
          onItem={openItem}
        />
      )}

      <MeetingDialog
        open={editor !== null}
        onOpenChange={(o) => !o && setEditor(null)}
        timezone={tz}
        meeting={editor?.meeting ?? null}
        defaultStart={editor?.start ?? null}
        defaultAttendeeIds={viewingOther ? [person] : []}
      />
      <MeetingDetails
        meetingId={openId}
        meeting={openMeeting}
        timezone={tz}
        onOpenChange={(o) => !o && closeDetails()}
        onEdit={(m) => {
          closeDetails();
          setEditor({ meeting: m });
        }}
      />
    </motion.div>
  );
}
