"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtFull } from "@/lib/currency";
import { useAuthStore } from "@/lib/store/authStore";
import { useLeaderboard } from "@/hooks/useLeaderboard";

/**
 * Leaderboard (the owner, 2026-10-07).
 *
 * Every salesperson's month, ranked by revenue, then closings, then follow-ups,
 * then calls — counted on the server, in Dubai months. Open to everyone; your
 * own row is marked.
 */

const MEDALS = ["🥇", "🥈", "🥉"];

/** "2026-10" for the current Dubai month. */
function thisDubaiMonth(): string {
  const d = new Date(Date.now() + 4 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function LeaderboardPage() {
  const [month, setMonth] = useState(thisDubaiMonth);
  const me = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useLeaderboard(month);
  const rows = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Leaderboard</h1>
            <p className="text-sm text-muted-foreground">
              {monthLabel(month)} — ranked by revenue, then closings, follow-ups and calls
            </p>
          </div>
        </div>
        <input
          type="month"
          value={month}
          max={thisDubaiMonth()}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          aria-label="Month"
        />
      </motion.div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-400">Couldn&apos;t load the leaderboard. Try again in a moment.</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nobody on the board yet for {monthLabel(month)}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 w-16">#</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Closings</th>
                  <th className="px-4 py-3 text-right">Follow-ups</th>
                  <th className="px-4 py-3 text-right">Calls</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const mine = r.userId === me?._id;
                  return (
                    <motion.tr
                      key={r.userId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 20) * 0.02 }}
                      className={cn("border-b border-border/40 last:border-0", mine && "bg-primary/10")}
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">{MEDALS[r.rank - 1] ?? r.rank}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.name}
                        {mine && <span className="ml-2 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">You</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">{fmtFull(r.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.closings}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.followUps}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.calls}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
