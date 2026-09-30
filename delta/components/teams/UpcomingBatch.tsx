"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Users, Zap, Phone, Mail, Calendar,
  RefreshCw, Timer, PackageOpen, ChevronDown, ChevronUp,
  ArrowRight, Inbox, Shuffle, BarChart2, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils";
import { useUpcomingBatch, type UpcomingBatchData } from "@/hooks/useTeams";
import { useAutoAssignTeamLeads } from "@/hooks/useTeams";
import { useQueryClient } from "@tanstack/react-query";
import { LEAD_STATUSES, STATUS_META } from "@/lib/statusConfig";
import type { LeadStatus } from "@/lib/statusConfig";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s, STATUS_META[s as LeadStatus].color]),
);
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s, STATUS_META[s as LeadStatus].label]),
);

function formatIST(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }) + " GST";
}

function formatTimeShort(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }) + " GST";
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    day: "2-digit", month: "short",
  });
}

// ─── Live countdown hook ──────────────────────────────────────────────────────

function useCountdown(targetISO: string | null) {
  const [diff, setDiff] = useState<number>(0);

  useEffect(() => {
    if (!targetISO) return;
    function update() {
      setDiff(Math.max(0, new Date(targetISO!).getTime() - Date.now()));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetISO]);

  const hours   = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  const fired   = diff === 0;

  return { hours, minutes, seconds, fired, diff };
}

// ─── Countdown display ────────────────────────────────────────────────────────

function Countdown({ nextSplitAt }: { nextSplitAt: string }) {
  const { hours, minutes, seconds, fired } = useCountdown(nextSplitAt);

  if (fired) {
    return (
      <span className="text-xs font-semibold text-green-400 animate-pulse">
        Splitting now…
      </span>
    );
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums">
      {hours > 0 && (
        <>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{pad(hours)}</span>
          <span className="text-muted-foreground text-xs">h</span>
        </>
      )}
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{pad(minutes)}</span>
      <span className="text-muted-foreground text-xs">m</span>
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{pad(seconds)}</span>
      <span className="text-muted-foreground text-xs">s</span>
    </div>
  );
}

// ─── Distribution bar ─────────────────────────────────────────────────────────

function DistributionBar({
  memberName, leadsToReceive, currentLoad, maxTotal,
}: { memberName: string; leadsToReceive: number; currentLoad: number; maxTotal: number }) {
  const total = currentLoad + leadsToReceive;
  const pct   = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const newPct = maxTotal > 0 ? (leadsToReceive / maxTotal) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3"
    >
      {/* Avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
        {getInitials(memberName)}
      </div>
      {/* Name */}
      <span className="w-28 truncate text-xs font-medium text-foreground shrink-0">{memberName}</span>
      {/* Bar */}
      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className="h-full flex rounded-full overflow-hidden">
          {/* existing load */}
          <motion.div
            className="bg-muted-foreground/30 h-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct - newPct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          {/* incoming leads */}
          <motion.div
            className="bg-primary h-full"
            initial={{ width: 0 }}
            animate={{ width: `${newPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          />
        </div>
      </div>
      {/* Counts */}
      <div className="flex items-center gap-1 shrink-0">
        {leadsToReceive > 0 && (
          <span className="rounded-full bg-primary/15 border border-primary/30 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            +{leadsToReceive}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums">{currentLoad} now</span>
      </div>
    </motion.div>
  );
}

// ─── Lead row card ────────────────────────────────────────────────────────────

function LeadRow({ lead, index }: { lead: UpcomingBatchData["unassignedLeads"][0]; index: number }) {
  const statusColor = STATUS_COLOR[lead.status] ?? "bg-gray-500/15 text-gray-400 border-gray-500/30";
  const statusLabel = STATUS_LABEL[lead.status] ?? lead.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: index * 0.025 }}
      className="flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3
        hover:border-primary/20 hover:bg-primary/5 transition-colors duration-150"
    >
      {/* Index */}
      <span className="w-5 text-[11px] font-bold text-muted-foreground/50 tabular-nums shrink-0">
        {index + 1}
      </span>
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
        {getInitials(lead.name)}
      </div>
      {/* Name + phone */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{lead.name}</p>
        {lead.phone && (
          <div className="flex items-center gap-1 mt-0.5">
            <Phone className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[11px] font-mono text-muted-foreground">{lead.phone}</span>
          </div>
        )}
      </div>
      {/* Source */}
      {lead.source && (
        <span className="hidden sm:inline text-[10px] text-muted-foreground capitalize bg-muted/50 rounded px-2 py-0.5 shrink-0">
          {lead.source}
        </span>
      )}
      {/* Status */}
      <span className={`hidden md:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${statusColor}`}>
        {statusLabel}
      </span>
      {/* Date */}
      <div className="hidden lg:flex items-center gap-1 shrink-0 text-muted-foreground">
        <Calendar className="h-3 w-3" />
        <span className="text-[11px]">{formatDateShort(lead.createdAt)}</span>
      </div>
    </motion.div>
  );
}

// ─── Source colours (cycles through a fixed palette) ─────────────────────────

const SOURCE_COLOURS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-green-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-yellow-500",
  "bg-red-500",
];

// ─── Estimate per-member source breakdown (proportional) ─────────────────────
// Since per-source cursor positions are unknown client-side, we distribute
// each member's leadsToReceive proportionally across sources by batch mix.

function estimateMemberSourceCounts(
  leads: UpcomingBatchData["unassignedLeads"],
  distribution: UpcomingBatchData["previewDistribution"],
  sourceExclusions?: Record<string, string[]>,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const m of distribution) result.set(m.memberId, new Map());

  const total = leads.length;
  if (total === 0 || distribution.length === 0) return result;

  const isExcluded = (memberId: string, source: string): boolean => {
    const src = source.trim().toLowerCase();
    if (!src || src === "unknown") return false;
    return !!sourceExclusions?.[memberId]?.some((s) => s.trim().toLowerCase() === src);
  };

  // Count per source
  const sourceCount = new Map<string, number>();
  for (const lead of leads) {
    const s = lead.source?.trim() || "Unknown";
    sourceCount.set(s, (sourceCount.get(s) ?? 0) + 1);
  }
  const allSources = Array.from(sourceCount.entries()).sort((a, b) => b[1] - a[1]);

  for (const m of distribution) {
    if (m.leadsToReceive === 0) continue;
    const mm = result.get(m.memberId)!;
    // Only sources this member is allowed to receive
    const sources = allSources.filter(([source]) => !isExcluded(m.memberId, source));
    if (sources.length === 0) continue;
    const allowedTotal = sources.reduce((s, [, c]) => s + c, 0);
    // Largest-remainder method: floor first, then top up from highest remainders
    const quotas = sources.map(([source, count]) => {
      const exact = m.leadsToReceive * (count / allowedTotal);
      return { source, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let allocated = quotas.reduce((s, q) => s + q.floor, 0);
    const leftover = m.leadsToReceive - allocated;
    quotas.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < leftover; i++) quotas[i % quotas.length].floor += 1;
    for (const { source, floor } of quotas) {
      if (floor > 0) mm.set(source, floor);
    }
  }

  return result;
}

// ─── Source breakdown panel ───────────────────────────────────────────────────

function SourceBreakdown({
  leads,
  totalUnassigned,
  splitMode,
  previewDistribution,
  sourceExclusions,
}: {
  leads: UpcomingBatchData["unassignedLeads"];
  totalUnassigned: number;
  splitMode: "round_robin" | "equal_load";
  previewDistribution: UpcomingBatchData["previewDistribution"];
  sourceExclusions?: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<"source" | "member">("source");

  const sourceSplit = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leads) {
      const s = lead.source?.trim() || "Unknown";
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // source colour index keyed by source name
  const sourceColourMap = useMemo(() => {
    const m = new Map<string, string>();
    sourceSplit.forEach(({ source }, idx) => {
      m.set(source, SOURCE_COLOURS[idx % SOURCE_COLOURS.length]);
    });
    return m;
  }, [sourceSplit]);

  const memberSourceCounts = useMemo(
    () => estimateMemberSourceCounts(leads, previewDistribution, sourceExclusions),
    [leads, previewDistribution, sourceExclusions],
  );

  if (sourceSplit.length === 0) return null;

  const max = sourceSplit[0].count;

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      {/* ── Header ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
            <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-foreground">Source Breakdown</span>
          <span className="text-xs text-muted-foreground">
            · {sourceSplit.length} source{sourceSplit.length !== 1 ? "s" : ""}
          </span>
          {splitMode === "round_robin" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
              <Shuffle className="h-2.5 w-2.5" />
              Source-wise RR
            </span>
          )}
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30">
              {/* ── View toggle tabs ── */}
              <div className="flex items-center gap-1 px-5 pt-3 pb-0">
                {(["source", "member"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      view === v
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {v === "source" ? "By Source" : "By Member"}
                  </button>
                ))}
              </div>

              {view === "source" ? (
                  <div className="px-5 pb-4 pt-3 space-y-3">
                    {splitMode === "round_robin" && (
                      <p className="text-[11px] text-muted-foreground bg-violet-500/5 border border-violet-500/15 rounded-lg px-3 py-2">
                        In <span className="font-semibold text-violet-400">round-robin</span> mode, leads from each source are
                        distributed to members sequentially using a per-source cursor — ensuring fair rotation across all sources.
                      </p>
                    )}

                    {/* Source proportion bar */}
                    <div className="flex h-2 rounded-full overflow-hidden gap-px">
                      {sourceSplit.map(({ source, count }, idx) => (
                        <motion.div
                          key={source}
                          className={`${SOURCE_COLOURS[idx % SOURCE_COLOURS.length]} h-full`}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          style={{ width: `${(count / totalUnassigned) * 100}%`, transformOrigin: "left" }}
                          transition={{ duration: 0.5, delay: idx * 0.05, ease: "easeOut" }}
                          title={`${source}: ${count}`}
                        />
                      ))}
                    </div>

                    {/* Per-source rows */}
                    <div className="space-y-2.5 mt-1">
                      {sourceSplit.map(({ source, count }, idx) => {
                        const pct = max > 0 ? (count / max) * 100 : 0;
                        const colour = SOURCE_COLOURS[idx % SOURCE_COLOURS.length];
                        return (
                          <motion.div
                            key={source}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="flex items-center gap-3"
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${colour}`} />
                            <span className="w-28 truncate text-xs font-medium text-foreground capitalize shrink-0">
                              {source}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${colour}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.5, ease: "easeOut", delay: idx * 0.04 }}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] font-bold text-foreground tabular-nums">{count}</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                ({Math.round((count / totalUnassigned) * 100)}%)
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="px-5 pb-4 pt-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Estimated sources each member will receive in this batch
                      {splitMode === "round_robin" && (
                        <span className="ml-1 text-violet-400">(cursor position approximated)</span>
                      )}.
                    </p>
                    {previewDistribution
                      .filter((m) => m.leadsToReceive > 0)
                      .map((m, idx) => {
                        const sourceCounts = memberSourceCounts.get(m.memberId);
                        const entries = sourceCounts
                          ? Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])
                          : [];
                        return (
                          <motion.div
                            key={m.memberId}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5"
                          >
                            {/* Avatar */}
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                              {getInitials(m.memberName)}
                            </div>
                            {/* Name */}
                            <span className="w-24 truncate text-xs font-medium text-foreground shrink-0">
                              {m.memberName}
                            </span>
                            {/* Source pills */}
                            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                              {entries.map(([source, count]) => {
                                const colour = sourceColourMap.get(source) ?? "bg-gray-500";
                                return (
                                  <motion.span
                                    key={source}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${colour}`}
                                  >
                                    {source}
                                    <span className="opacity-80">×{count}</span>
                                  </motion.span>
                                );
                              })}
                              {entries.length === 0 && (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </div>
                            {/* Total */}
                            <span className="shrink-0 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                              +{m.leadsToReceive}
                            </span>
                          </motion.div>
                        );
                      })}
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface UpcomingBatchProps {
  teamId: string;
  canEdit: boolean;
}

export function UpcomingBatch({ teamId, canEdit }: UpcomingBatchProps) {
  const { data, isLoading, refetch, isFetching } = useUpcomingBatch(teamId);
  const { mutate: splitNow, isPending: splitting } = useAutoAssignTeamLeads(teamId);
  const queryClient = useQueryClient();
  const [showLeads, setShowLeads] = useState(true);
  const [showDistribution, setShowDistribution] = useState(true);

  const handleSplitNow = useCallback(() => {
    splitNow(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["teams", teamId, "upcoming-batch"] });
      },
    });
  }, [splitNow, queryClient, teamId]);

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 rounded-2xl bg-muted/40" />
        <div className="h-40 rounded-2xl bg-muted/30" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted/20" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { totalUnassigned, splitTime, nextSplitAt, autoAssign, splitMode, splitStrategy, unassignedLeads, previewDistribution } = data;

  // ── Live mode — leads assign instantly, no daily batch queue ──
  if (autoAssign && splitStrategy === "live") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-4 py-20 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
          <Zap className="h-8 w-8 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Live split is on</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Every lead is assigned the moment it arrives — sources and lead counts stay equal across
            the participating members, so nothing queues here.
            {totalUnassigned > 0 && (
              <span className="block mt-1 text-amber-400">
                {totalUnassigned} unassigned lead{totalUnassigned === 1 ? "" : "s"} remain (e.g. all
                eligible members excluded for their source) — use Split Now in Settings if needed.
              </span>
            )}
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Empty state — no split time configured ──
  if (!splitTime || !autoAssign) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-4 py-20 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
          <Timer className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">No split schedule configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Enable auto-assign and set a split time in <span className="text-primary font-medium">Settings</span> to use this feature.
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Empty state — no unassigned leads ──
  if (totalUnassigned === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Header still shows next split time */}
        <BatchHeader
          splitTime={splitTime}
          nextSplitAt={nextSplitAt}
          totalUnassigned={0}
          splitMode={splitMode}
          canEdit={canEdit}
          splitting={splitting}
          isFetching={isFetching}
          onSplitNow={handleSplitNow}
          onRefresh={() => refetch()}
        />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
            <Inbox className="h-7 w-7 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">No unassigned leads waiting. New leads will appear here when they arrive.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Max total for bar scaling
  const maxTotal = previewDistribution.length > 0
    ? Math.max(...previewDistribution.map((m) => m.currentLoad + m.leadsToReceive))
    : 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* ── Header banner ── */}
      <BatchHeader
        splitTime={splitTime}
        nextSplitAt={nextSplitAt}
        totalUnassigned={totalUnassigned}
        splitMode={splitMode}
        canEdit={canEdit}
        splitting={splitting}
        isFetching={isFetching}
        onSplitNow={handleSplitNow}
        onRefresh={() => refetch()}
      />

      {/* ── Preview distribution ── */}
      {previewDistribution.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
          <button
            onClick={() => setShowDistribution((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
                <Users className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">Preview Distribution</span>
              <span className="text-xs text-muted-foreground">
                · {totalUnassigned} leads → {previewDistribution.length} members
              </span>
            </div>
            {showDistribution
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>

          <AnimatePresence initial={false}>
            {showDistribution && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 space-y-3 border-t border-border/30 pt-4">
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-4 rounded bg-muted-foreground/30" /> Current load
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-4 rounded bg-primary" /> Incoming leads
                    </span>
                  </div>
                  {previewDistribution.map((m) => (
                    <DistributionBar
                      key={m.memberId}
                      memberName={m.memberName}
                      leadsToReceive={m.leadsToReceive}
                      currentLoad={m.currentLoad}
                      maxTotal={maxTotal}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Source breakdown ── */}
      <SourceBreakdown
        leads={unassignedLeads}
        totalUnassigned={totalUnassigned}
        splitMode={splitMode}
        previewDistribution={previewDistribution}
        sourceExclusions={data?.sourceExclusions}
      />

      {/* ── Unassigned leads list ── */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <button
          onClick={() => setShowLeads((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10">
              <PackageOpen className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <span className="text-sm font-semibold text-foreground">Queued Leads</span>
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500/15 border border-orange-500/30 px-1.5 text-[10px] font-bold text-orange-400 tabular-nums">
              {totalUnassigned}
            </span>
          </div>
          {showLeads
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </button>

        <AnimatePresence initial={false}>
          {showLeads && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3 max-h-[480px] overflow-y-auto"
                style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--border)) transparent" }}
              >
                <AnimatePresence initial={false}>
                  {unassignedLeads.map((lead, i) => (
                    <LeadRow key={lead._id} lead={lead} index={i} />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Header banner (extracted for reuse) ─────────────────────────────────────

function SplitModeBadge({ mode }: { mode: "round_robin" | "equal_load" }) {
  if (mode === "equal_load") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-400">
        <BarChart2 className="h-2.5 w-2.5" />
        Equal Load
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
      <Shuffle className="h-2.5 w-2.5" />
      Round Robin · Source-wise
    </span>
  );
}

function BatchHeader({
  splitTime, nextSplitAt, totalUnassigned, splitMode, canEdit,
  splitting, isFetching, onSplitNow, onRefresh,
}: {
  splitTime: string;
  nextSplitAt: string | null;
  totalUnassigned: number;
  splitMode: "round_robin" | "equal_load";
  canEdit: boolean;
  splitting: boolean;
  isFetching: boolean;
  onSplitNow: () => void;
  onRefresh: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left — info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Next auto-split</p>
              <p className="text-sm font-bold text-foreground">
                {splitTime} GST
                {nextSplitAt && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    · {formatTimeShort(nextSplitAt)}
                  </span>
                )}
              </p>
            </div>
            <SplitModeBadge mode={splitMode} />
          </div>

          {/* Countdown */}
          {nextSplitAt && (
            <div className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Splits in</span>
              <Countdown nextSplitAt={nextSplitAt} />
            </div>
          )}

          {/* Lead count */}
          <div className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-orange-400 shrink-0" />
            <span className="text-xs text-muted-foreground">
              <span className="font-bold text-orange-400">{totalUnassigned}</span>
              {" "}unassigned lead{totalUnassigned !== 1 ? "s" : ""} waiting in this batch
            </span>
          </div>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="gap-2 h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canEdit && (
            <Button
              size="sm"
              onClick={onSplitNow}
              disabled={splitting || totalUnassigned === 0}
              className="gap-2 h-8 bg-primary hover:bg-primary/90"
            >
              <Zap className="h-3.5 w-3.5" />
              {splitting ? "Splitting…" : "Split Now"}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
