"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, X, CalendarClock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toGstDateISO } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type QuickPeriod = "today" | "week" | "month" | "year" | "custom" | "";

export interface LeadsDateFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  /** Called when the user picks a quick period; parent receives resolved from/to */
  onQuickPeriod?: (from: string, to: string, period: QuickPeriod) => void;
  /** Optional split-date (assignedAt) window — rendered as a second section when provided */
  splitFrom?: string;
  splitTo?: string;
  onSplitFromChange?: (v: string) => void;
  onSplitToChange?: (v: string) => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toISO(d: Date) { return toGstDateISO(d); }

function resolveRange(period: QuickPeriod): { from: string; to: string } {
  const now   = new Date();
  const today = toISO(now);
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { from: toISO(mon), to: today };
    }
    case "month":
      return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "year":
      return { from: toISO(new Date(now.getFullYear(), 0, 1)), to: today };
    default:
      return { from: "", to: "" };
  }
}

const QUICK_BTNS: { id: QuickPeriod; label: string }[] = [
  { id: "today",  label: "Today"      },
  { id: "week",   label: "This Week"  },
  { id: "month",  label: "This Month" },
  { id: "year",   label: "This Year"  },
  { id: "custom", label: "Custom"     },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function LeadsDateFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onQuickPeriod,
  splitFrom,
  splitTo,
  onSplitFromChange,
  onSplitToChange,
  className,
}: LeadsDateFilterProps) {
  const [activePeriod, setActivePeriod] = useState<QuickPeriod>("");

  function handlePeriod(period: QuickPeriod) {
    setActivePeriod(period);
    if (period === "custom") return; // let user pick dates manually
    const { from, to } = resolveRange(period);
    onDateFromChange(from);
    onDateToChange(to);
    onQuickPeriod?.(from, to, period);
  }

  function handleClear() {
    setActivePeriod("");
    onDateFromChange("");
    onDateToChange("");
    onQuickPeriod?.("", "", "");
  }

  const hasFilter = !!dateFrom || !!dateTo;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Quick period buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground shrink-0">Period:</span>
        {QUICK_BTNS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => handlePeriod(b.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
              activePeriod === b.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
        {hasFilter && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Custom date pickers (shown when Custom selected OR when dates are manually set but no quick period) */}
      <AnimatePresence>
        {(activePeriod === "custom" || (hasFilter && activePeriod === "")) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 pt-0.5">
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => { onDateFromChange(e.target.value); setActivePeriod("custom"); }}
                className="h-8 text-xs px-2 flex-1 [color-scheme:dark]"
                placeholder="From"
              />
              <span className="text-xs text-muted-foreground shrink-0">→</span>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => { onDateToChange(e.target.value); setActivePeriod("custom"); }}
                className="h-8 text-xs px-2 flex-1 [color-scheme:dark]"
                placeholder="To"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Split-date (assigned) window — only when the parent wires the props */}
      {onSplitFromChange && onSplitToChange && (
        <div className="space-y-1.5 pt-1 border-t border-border/40">
          <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground shrink-0">Split date:</span>
            {(() => {
              const t = toISO(new Date());
              const isActive = splitFrom === t && splitTo === t;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (isActive) { onSplitFromChange(""); onSplitToChange(""); }
                    else { onSplitFromChange(t); onSplitToChange(t); }
                  }}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  Split Today
                </button>
              );
            })()}
            {(splitFrom || splitTo) && (
              <button
                type="button"
                onClick={() => { onSplitFromChange(""); onSplitToChange(""); }}
                className="ml-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={splitFrom ?? ""}
              max={splitTo || undefined}
              onChange={(e) => onSplitFromChange(e.target.value)}
              className="h-8 text-xs px-2 flex-1 [color-scheme:dark]"
            />
            <span className="text-xs text-muted-foreground shrink-0">→</span>
            <Input
              type="date"
              value={splitTo ?? ""}
              min={splitFrom || undefined}
              onChange={(e) => onSplitToChange(e.target.value)}
              className="h-8 text-xs px-2 flex-1 [color-scheme:dark]"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/70">Shows leads split in this range, even if created earlier.</p>
        </div>
      )}
    </div>
  );
}

// ── Standalone "Today's Leads" button ──────────────────────────────────────────

export function TodayLeadsButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn(
        "gap-1.5 h-8",
        active && "bg-primary text-primary-foreground",
      )}
      onClick={onClick}
    >
      <CalendarClock className="h-3.5 w-3.5" />
      Today&apos;s Leads
    </Button>
  );
}

// ── Standalone "Split Today" button (assignedAt = today) ──────────────────────

export function SplitTodayButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn(
        "gap-1.5 h-8",
        active && "bg-primary text-primary-foreground",
      )}
      onClick={onClick}
    >
      <Zap className="h-3.5 w-3.5" />
      Split Today
    </Button>
  );
}
