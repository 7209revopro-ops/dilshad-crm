"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { aed, aedShort } from "@/lib/commission";
import type { SlabRow } from "@/types/commission";

/*
 * A salary slab drawn two ways: a bar filled to the month's approved sales,
 * with a tick at each level's target, and the slab as a table with the level
 * reached marked.
 */

interface LadderBarProps {
  rows: SlabRow[];
  value: number;
  /** The level reached, as an index into rows. */
  levelIndex: number;
}

export function LadderBar({ rows, value, levelIndex }: LadderBarProps) {
  const top = rows[rows.length - 1]?.target ?? 0;
  // Room past the top level, so its tick isn't at the very edge.
  const max = Math.max(top * 1.08, value, 1);
  const fill = Math.min(value / max, 1);
  const levels = rows.slice(1).map((r, i) => ({ ...r, index: i + 1, at: (r.target / max) * 100 }));

  return (
    <div className="space-y-1">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: fill }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-primary/60 to-primary"
        />
        {levels.map((l) => (
          <span
            key={l.index}
            style={{ left: `${l.at}%` }}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background/80"
            aria-hidden
          />
        ))}
      </div>
      <div className="relative h-7">
        {levels.map((l) => (
          <span
            key={l.index}
            style={{ left: `${l.at}%` }}
            title={`${l.name}: ${aed(l.target)}`}
            className={cn(
              "absolute -translate-x-1/2 text-center text-[10px] leading-tight tabular-nums",
              l.index <= levelIndex ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            <span className="block">{l.name.replace(/^Level /, "L")}</span>
            <span className="block">{aedShort(l.target)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface SlabTableProps {
  rows: SlabRow[];
  /** The level reached, highlighted; none when only the slab is shown. */
  levelIndex?: number;
  /** The next level that pays more, marked. */
  nextIndex?: number;
}

export function SlabTable({ rows, levelIndex, nextIndex }: SlabTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Level</th>
            <th className="px-4 py-2.5 text-right font-medium">Monthly sales</th>
            <th className="px-4 py-2.5 text-right font-medium">Salary</th>
            <th className="px-4 py-2.5 text-right font-medium">Commission paid</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].map((r, i) => ({ r, i })).reverse().map(({ r, i }, k) => {
            const reached = i === levelIndex;
            return (
              <motion.tr
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: k * 0.03 }}
                className={cn(
                  "border-b border-border/30 last:border-0",
                  reached && "bg-primary/10",
                )}
              >
                <td className="px-4 py-2.5">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", reached ? "text-primary" : "text-foreground")}>
                    {reached && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {r.name}
                    {i === nextIndex && (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        <ArrowUpRight className="h-2.5 w-2.5" /> Next
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {i > 0 ? `${aed(r.target)}+` : rows[1] ? `Below ${aed(rows[1].target)}` : "Any"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{aed(r.salary)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{r.percent}%</td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
