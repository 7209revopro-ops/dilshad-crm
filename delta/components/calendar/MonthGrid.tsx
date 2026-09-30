"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { clockText, dayKey } from "@/lib/zonedTime";
import { listContainerVariants, listItemVariants } from "@/lib/animations";
import type { CalendarItem } from "@/types/meeting";

// ── Types ──────────────────────────────────────────────────────────────────────
interface MonthGridProps {
  /** 42 day keys, Monday first. */
  days: string[];
  /** "2026-10" — days outside it are dimmed. */
  monthKey: string;
  timezone: string;
  items: CalendarItem[];
  todayKey: string;
  onDay: (day: string) => void;
  onAdd: (day: string) => void;
  onItem: (item: CalendarItem) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHOWN = 3;
const CHIP: Record<CalendarItem["kind"], string> = {
  meeting: "bg-primary/15 text-primary",
  followup: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  reminder: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

// ── Component ──────────────────────────────────────────────────────────────────
/** Six weeks at a glance: up to three things a day, the rest behind "+N more" (opens the day). */
export function MonthGrid({ days, monthKey, timezone, items, todayKey, onDay, onAdd, onItem }: MonthGridProps) {
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of [...items].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const k = dayKey(item.start, timezone);
      const list = map.get(k) ?? [];
      list.push(item);
      map.set(k, list);
    }
    return map;
  }, [items, timezone]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <motion.div variants={listContainerVariants} initial="hidden" animate="visible" className="grid grid-cols-7">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const inMonth = day.startsWith(monthKey);
          return (
            <motion.div
              key={day}
              variants={listItemVariants}
              className={cn("group min-h-[104px] border-b border-l border-border/40 p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0", !inMonth && "bg-muted/20")}
            >
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDay(day)}
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium hover:bg-muted",
                    day === todayKey ? "bg-primary text-primary-foreground hover:bg-primary" : inMonth ? "text-foreground" : "text-muted-foreground/60"
                  )}
                  aria-label={`Open ${day}`}
                >
                  {Number(day.slice(8))}
                </button>
                <button
                  type="button"
                  onClick={() => onAdd(day)}
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Book a meeting on ${day}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-0.5">
                {list.slice(0, SHOWN).map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => onItem(item)}
                    className={cn(
                      "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium",
                      CHIP[item.kind],
                      item.kind === "meeting" && item.cancelled && "bg-muted text-muted-foreground line-through"
                    )}
                    title={item.title}
                  >
                    {clockText(item.start, timezone)} {item.title}
                  </button>
                ))}
                {list.length > SHOWN && (
                  <button type="button" onClick={() => onDay(day)} className="px-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary">
                    +{list.length - SHOWN} more
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
