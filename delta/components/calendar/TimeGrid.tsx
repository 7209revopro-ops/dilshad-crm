"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bell, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, clockText, dayText, zonedToUtc } from "@/lib/zonedTime";
import { MENTOR_FREE_CLASS, type MentorColor } from "@/components/calendar/mentorColors";
import type { CalendarItem, MentorBlock } from "@/types/meeting";

// ── Types ──────────────────────────────────────────────────────────────────────
interface TimeGridProps {
  /** Day keys, one column each. */
  days: string[];
  timezone: string;
  items: CalendarItem[];
  mentorBlocks: MentorBlock[];
  /** Selected mentors, in lane order. */
  mentorIds: string[];
  todayKey: string;
  /** Minute of the day to scroll to first — the start of working hours. */
  scrollToMinute: number;
  onSlot: (start: Date) => void;
  onItem: (item: CalendarItem) => void;
}

interface Placed<T> {
  item: T;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const HOUR_PX = 44;
const MIN_ITEM_MINUTES = 22;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const ITEM_STYLE: Record<CalendarItem["kind"], string> = {
  meeting: "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25",
  followup: "border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300",
  reminder: "border-sky-500/40 bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:text-sky-300",
};

/** The part of [start, end) inside one day, in minutes from that day's midnight. */
function clip<T extends { start: Date; end: Date }>(things: T[], day: string, tz: string, minMinutes: number) {
  const dayStart = zonedToUtc(day, 0, tz).getTime();
  const dayEnd = zonedToUtc(addDays(day, 1), 0, tz).getTime();
  return things
    .filter((t) => t.start.getTime() < dayEnd && t.end.getTime() > dayStart)
    .map((t) => {
      const startMin = (Math.max(t.start.getTime(), dayStart) - dayStart) / 60_000;
      const endMin = (Math.min(t.end.getTime(), dayEnd) - dayStart) / 60_000;
      return { item: t, startMin, endMin: Math.max(endMin, startMin + minMinutes) };
    });
}

/** Side by side when they overlap: each group of overlapping items shares the width. */
function lanes<T>(segs: Array<{ item: T; startMin: number; endMin: number }>): Placed<T>[] {
  const sorted = [...segs].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => (g.lanes = n));
    out.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const s of sorted) {
    if (s.startMin >= groupEnd) {
      close();
      groupEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= s.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.endMin);
    } else laneEnds[lane] = s.endMin;
    group.push({ ...s, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, s.endMin);
  }
  close();
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────────
/**
 * A day or a week as columns of hours. Click an empty spot to book a meeting
 * there; click anything on it to open it. Chosen mentors get a strip at the
 * right of each day: green where the LMS says they are free, red where they
 * are already booked.
 */
export function TimeGrid({ days, timezone, items, mentorBlocks, mentorIds, todayKey, scrollToMinute, onSlot, onItem }: TimeGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, ((scrollToMinute - 60) / 60) * HOUR_PX);
  }, [scrollToMinute]);

  const columns = useMemo(
    () =>
      days.map((day) => ({
        day,
        placed: lanes(clip(items, day, timezone, MIN_ITEM_MINUTES)),
        mentors: clip(mentorBlocks, day, timezone, 0),
      })),
    [days, items, mentorBlocks, timezone]
  );

  const mentorShare = mentorIds.length ? 0.28 : 0;
  const nowMin = (now.getTime() - zonedToUtc(todayKey, 0, timezone).getTime()) / 60_000;

  const slotClick = (day: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minute = Math.max(0, Math.min(23 * 60 + 30, Math.floor(((y / HOUR_PX) * 60) / 30) * 30));
    onSlot(zonedToUtc(day, minute, timezone));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
      {/* Day headings */}
      <div className="flex border-b border-border/50 bg-muted/30">
        <div className="w-12 shrink-0" />
        {days.map((day) => (
          <div key={day} className={cn("flex-1 border-l border-border/40 px-2 py-2 text-center text-xs font-medium", day === todayKey ? "text-primary" : "text-muted-foreground")}>
            {dayText(day)}
          </div>
        ))}
      </div>

      <div ref={scroller} className="relative h-[calc(100dvh-320px)] min-h-[420px] overflow-y-auto">
        <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
          {/* Hours */}
          <div className="w-12 shrink-0">
            {HOURS.map((h) => (
              <div key={h} className="relative text-right" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground">{h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</span>
              </div>
            ))}
          </div>

          {columns.map(({ day, placed, mentors }) => (
            <div
              key={day}
              className={cn("relative flex-1 cursor-pointer border-l border-border/40", day === todayKey && "bg-primary/[0.03]")}
              onClick={(e) => slotClick(day, e)}
              role="presentation"
            >
              {HOURS.map((h) => (
                <div key={h} className="pointer-events-none border-t border-border/30" style={{ height: HOUR_PX }} />
              ))}

              {/* Mentors' strip */}
              {mentors.map(({ item: b, startMin, endMin }, i) => {
                const lane = Math.max(0, mentorIds.indexOf(b.mentorId));
                const width = mentorShare / Math.max(1, mentorIds.length);
                return (
                  <div
                    key={`${b.mentorId}-${b.kind}-${i}`}
                    title={`${b.mentorName}: ${b.kind === "free" ? "free" : b.title} ${clockText(b.start, timezone)}–${clockText(b.end, timezone)}`}
                    className={cn(
                      "pointer-events-auto absolute rounded-sm border text-[9px] leading-tight",
                      b.kind === "free" ? MENTOR_FREE_CLASS[b.color as MentorColor] : "z-[5] border-rose-500/40 bg-rose-500/25 text-rose-700 dark:text-rose-300"
                    )}
                    style={{
                      top: (startMin / 60) * HOUR_PX,
                      height: Math.max(4, ((endMin - startMin) / 60) * HOUR_PX),
                      left: `${(1 - mentorShare + lane * width) * 100}%`,
                      width: `calc(${width * 100}% - 2px)`,
                    }}
                  >
                    {b.kind === "busy" && ((endMin - startMin) / 60) * HOUR_PX > 18 && <span className="block truncate px-0.5">{b.title}</span>}
                  </div>
                );
              })}

              {/* The person's own */}
              {placed.map(({ item, startMin, endMin, lane, lanes: n }) => {
                const height = ((endMin - startMin) / 60) * HOUR_PX;
                const cancelled = item.kind === "meeting" && item.cancelled;
                const Icon = item.kind === "followup" ? RefreshCw : item.kind === "reminder" ? Bell : null;
                return (
                  <motion.button
                    key={`${item.kind}-${item.id}-${day}`}
                    type="button"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onItem(item)}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-colors",
                      ITEM_STYLE[item.kind],
                      cancelled && "border-border bg-muted text-muted-foreground line-through opacity-70"
                    )}
                    style={{
                      top: (startMin / 60) * HOUR_PX,
                      height: Math.max(18, height - 2),
                      left: `calc(${((lane / n) * (1 - mentorShare)) * 100}% + 2px)`,
                      width: `calc(${((1 - mentorShare) / n) * 100}% - 4px)`,
                    }}
                  >
                    <span className="flex items-center gap-1 font-semibold">
                      {Icon && <Icon className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{item.title}</span>
                    </span>
                    {height > 34 && (
                      <span className="block truncate opacity-80">
                        {clockText(item.start, timezone)}
                        {item.kind === "meeting" ? `–${clockText(item.end, timezone)}` : ""}
                      </span>
                    )}
                  </motion.button>
                );
              })}

              {/* Now */}
              {day === todayKey && nowMin >= 0 && nowMin < 24 * 60 && (
                <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" style={{ top: (nowMin / 60) * HOUR_PX }}>
                  <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
                  <span className="h-px flex-1 bg-red-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
