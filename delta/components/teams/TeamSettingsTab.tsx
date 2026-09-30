"use client";

import { useState, useEffect } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { Settings, Shuffle, Users, CheckCircle2, Loader2, RefreshCw, Info, Clock, CalendarDays, RotateCcw, Zap, GripVertical, Plus, X, Timer, Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTeamSettings, useUpdateTeamSettings, useAutoAssignTeamLeads } from "@/hooks/useTeams";
import type { Team } from "@/types/team";
import type { User } from "@/types";
import { toGstDateISO } from "@/lib/utils";

interface Props {
  teamId: string;
  team: Team;
  isLeaderOrAdmin: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

// ── Draggable member row ───────────────────────────────────────────────────────
interface DraggableMemberRowProps {
  member: User;
  index: number;
  isInactive: boolean;
  isLeaderOrAdmin: boolean;
  onRemove: (id: string) => void;
}

function DraggableMemberRow({ member, index, isInactive, isLeaderOrAdmin, onRemove }: DraggableMemberRowProps) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={member}
      dragListener={false}
      dragControls={controls}
      className="rounded-xl border border-primary/30 bg-primary/5 select-none"
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 50 }}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag handle */}
        <button
          className={[
            "touch-none shrink-0 text-muted-foreground",
            isLeaderOrAdmin ? "cursor-grab active:cursor-grabbing hover:text-foreground" : "cursor-default opacity-40",
          ].join(" ")}
          onPointerDown={(e) => isLeaderOrAdmin && controls.start(e)}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Position badge */}
        <span className="w-5 shrink-0 text-center text-xs font-bold text-primary">
          {index + 1}
        </span>

        {/* Avatar */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
          {member.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Name */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
          {isInactive && (
            <span className="text-[10px] text-amber-400">Inactive for auto-assign</span>
          )}
        </div>

        {/* Remove button */}
        {isLeaderOrAdmin && (
          <button
            onClick={() => onRemove(member._id)}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Reorder.Item>
  );
}

// ── Main settings tab ─────────────────────────────────────────────────────────
export function TeamSettingsTab({ teamId, team, isLeaderOrAdmin }: Props) {
  const { data: settings, isLoading } = useTeamSettings(teamId);
  const { mutate: save, isPending: saving } = useUpdateTeamSettings(teamId);
  const { mutate: splitNow, isPending: splitting } = useAutoAssignTeamLeads(teamId);

  const [autoAssign, setAutoAssign]         = useState(false);
  const [splitMode, setSplitMode]           = useState<"round_robin" | "equal_load">("round_robin");
  const [splitTime, setSplitTime]           = useState<string>("");
  const [splitStrategy, setSplitStrategy]   = useState<"scheduled" | "live">("scheduled");
  const [roundRobinStartDate, setStartDate] = useState<string>("");
  const [slaMinutes, setSlaMinutes]         = useState<number | null>(null);
  // userId → sources that must never be auto-assigned to them
  const [sourceExclusions, setSourceExclusions] = useState<Record<string, string[]>>({});

  // orderedPool = the ordered list of User objects currently selected for auto-split
  const [orderedPool, setOrderedPool] = useState<User[]>([]);

  // All members pool (leaders + members, deduped)
  const allMembers: User[] = [
    ...(team.leaders ?? []),
    ...(team.members ?? []).filter((m) => !(team.leaders ?? []).some((l) => l._id === m._id)),
  ];

  // Derive includedMembers (ID array) from orderedPool
  const includedMembers = orderedPool.map((m) => m._id);

  // Members not yet in the ordered pool
  const unselectedMembers = allMembers.filter((m) => !includedMembers.includes(m._id));

  useEffect(() => {
    if (!settings) return;
    setAutoAssign(settings.autoAssign ?? false);
    setSplitMode(settings.splitMode ?? "round_robin");
    setSplitTime(settings.splitTime ?? "");
    setSplitStrategy(settings.splitStrategy ?? "scheduled");
    setStartDate(
      settings.roundRobinStartDate
        ? settings.roundRobinStartDate.slice(0, 10)
        : "",
    );
    setSlaMinutes(settings.slaMinutes ?? null);
    setSourceExclusions(settings.sourceExclusions ?? {});
    // Build ordered User list from saved includedMembers order
    const savedIds = settings.includedMembers ?? [];
    if (savedIds.length > 0) {
      const ordered = savedIds
        .map((id) => allMembers.find((m) => m._id === id))
        .filter((m): m is User => Boolean(m));
      setOrderedPool(ordered);
    } else {
      setOrderedPool([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  function addMember(member: User) {
    setOrderedPool((prev) => [...prev, member]);
  }

  function removeMember(id: string) {
    setOrderedPool((prev) => prev.filter((m) => m._id !== id));
  }

  function addExclusion(userId: string, source: string) {
    setSourceExclusions((prev) => {
      const current = prev[userId] ?? [];
      if (current.includes(source)) return prev;
      return { ...prev, [userId]: [...current, source] };
    });
  }

  function removeExclusion(userId: string, source: string) {
    setSourceExclusions((prev) => {
      const next = (prev[userId] ?? []).filter((s) => s !== source);
      const copy = { ...prev };
      if (next.length === 0) delete copy[userId];
      else copy[userId] = next;
      return copy;
    });
  }

  function handleSave() {
    save({
      autoAssign,
      splitMode,
      includedMembers,
      splitTime: splitTime || null,
      splitStrategy,
      roundRobinStartDate: roundRobinStartDate || null,
      slaMinutes: slaMinutes ?? null,
      sourceExclusions,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const effectivePool = orderedPool.length > 0
    ? orderedPool.filter((m) => !team.inactiveMembers.includes(m._id))
    : allMembers.filter((m) => !team.inactiveMembers.includes(m._id));

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5 max-w-2xl">

      {/* Auto-assign toggle */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Settings className="h-4 w-4 text-primary" />
              </div>
              Lead Assignment Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Split Leads</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, new leads assigned to this team are automatically distributed to members
                </p>
              </div>
              <Switch
                checked={autoAssign}
                onCheckedChange={isLeaderOrAdmin ? setAutoAssign : undefined}
                disabled={!isLeaderOrAdmin}
              />
            </div>

            {!autoAssign && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/80">
                  Manual mode — leaders and admins assign leads to members from the unassigned pool.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Algorithm — only shown when auto is on */}
      {autoAssign && (
        <motion.div variants={itemVariants}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                  <Shuffle className="h-4 w-4 text-violet-400" />
                </div>
                Distribution Algorithm
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: "round_robin" as const,
                  label: "Round Robin",
                  description: "Members take turns in rotation. Each lead source has its own independent cursor — Google Ads, Meta, and other sources rotate separately so no source steals turns from another.",
                  color: "primary",
                },
                {
                  id: "equal_load" as const,
                  label: "Equal Load",
                  description: "New lead always goes to the member with fewest active leads",
                  color: "teal",
                },
              ].map((opt) => {
                const active = splitMode === opt.id;
                return (
                  <motion.button
                    key={opt.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => isLeaderOrAdmin && setSplitMode(opt.id)}
                    disabled={!isLeaderOrAdmin}
                    className={[
                      "text-left rounded-xl border p-4 transition-all",
                      active
                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/50 hover:border-border hover:bg-muted/20",
                      !isLeaderOrAdmin ? "cursor-default opacity-70" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                      {active && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </motion.button>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Scheduled split time */}
      {autoAssign && (
        <motion.div variants={itemVariants}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                  <Clock className="h-4 w-4 text-orange-400" />
                </div>
                Daily Auto-Split Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Scheduled / Live mode switch */}
              <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => isLeaderOrAdmin && setSplitStrategy("scheduled")}
                  disabled={!isLeaderOrAdmin}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    splitStrategy === "scheduled"
                      ? "bg-orange-500/15 text-orange-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" /> Scheduled
                </button>
                <button
                  type="button"
                  onClick={() => isLeaderOrAdmin && setSplitStrategy("live")}
                  disabled={!isLeaderOrAdmin}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    splitStrategy === "live"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" /> Live
                </button>
              </div>

              {splitStrategy === "live" ? (
                <p className="text-xs text-emerald-400/90">
                  Live mode — every lead is assigned the moment it arrives, keeping both sources and
                  lead counts equal across the participating members. Saving with queued leads splits
                  them immediately.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    At this time (GST) every day, all unassigned leads in this team will be automatically distributed. Leave blank to disable the scheduled split.
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="time"
                      value={splitTime}
                      onChange={(e) => isLeaderOrAdmin && setSplitTime(e.target.value)}
                      disabled={!isLeaderOrAdmin}
                      className="w-36"
                    />
                    {splitTime && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSplitTime("")}
                        disabled={!isLeaderOrAdmin}
                        className="text-xs text-muted-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {splitTime && (
                    <p className="text-xs text-primary/80">
                      Leads will be auto-split daily at <span className="font-semibold">{splitTime} GST</span>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Round-robin start date */}
      {autoAssign && splitMode === "round_robin" && (
        <motion.div variants={itemVariants}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
                  <CalendarDays className="h-4 w-4 text-teal-400" />
                </div>
                Round-Robin Start Date
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Count each member's leads from this date to determine who receives the next lead in round-robin mode. Set to today to reset fairness from a clean slate.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="date"
                  value={roundRobinStartDate}
                  onChange={(e) => isLeaderOrAdmin && setStartDate(e.target.value)}
                  disabled={!isLeaderOrAdmin}
                  className="w-44"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStartDate(toGstDateISO(new Date()))}
                  disabled={!isLeaderOrAdmin}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to today
                </Button>
              </div>
              {roundRobinStartDate && (
                <p className="text-xs text-teal-500/80">
                  Counting leads from <span className="font-semibold">{roundRobinStartDate}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Response Time SLA */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                <Timer className="h-4 w-4 text-orange-400" />
              </div>
              Response Time SLA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Define the target time (in minutes) for agents to make first contact after a lead is assigned. Used in the Response Time report.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {[5, 15, 30, 60, 120].map((min) => (
                <button
                  key={min}
                  type="button"
                  disabled={!isLeaderOrAdmin}
                  onClick={() => isLeaderOrAdmin && setSlaMinutes(slaMinutes === min ? null : min)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    slaMinutes === min
                      ? "border-orange-500/60 bg-orange-500/10 text-orange-500"
                      : "border-border bg-muted text-muted-foreground hover:border-orange-500/30 hover:text-orange-500"
                  }`}
                >
                  {min >= 60 ? `${min / 60}h` : `${min}m`}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={10080}
                  placeholder="Custom"
                  value={slaMinutes !== null && ![5, 15, 30, 60, 120].includes(slaMinutes) ? slaMinutes : ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setSlaMinutes(isNaN(v) ? null : v);
                  }}
                  disabled={!isLeaderOrAdmin}
                  className="w-24 text-xs"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>
            {slaMinutes && (
              <p className="text-xs text-orange-500/80">
                Agents must contact leads within{" "}
                <span className="font-semibold">
                  {slaMinutes >= 60 ? `${(slaMinutes / 60).toFixed(slaMinutes % 60 === 0 ? 0 : 1)}h` : `${slaMinutes} min`}
                </span>{" "}
                of assignment.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Member inclusion + reorder — only shown when auto is on */}
      {autoAssign && (
        <motion.div variants={itemVariants}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <Users className="h-4 w-4 text-blue-400" />
                </div>
                Participating Members
                <Badge variant="secondary" className="ml-auto text-xs font-normal">
                  {effectivePool.length} active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Drag to set the rotation order. Members at the top receive leads first. Leave all unselected to include every active member in default order.
              </p>

              {/* ── Ordered / selected members (draggable) ── */}
              {orderedPool.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                    Rotation Order
                  </p>
                  <Reorder.Group
                    axis="y"
                    values={orderedPool}
                    onReorder={isLeaderOrAdmin ? setOrderedPool : () => {}}
                    className="space-y-2"
                  >
                    {orderedPool.map((member, index) => (
                      <DraggableMemberRow
                        key={member._id}
                        member={member}
                        index={index}
                        isInactive={team.inactiveMembers.includes(member._id)}
                        isLeaderOrAdmin={isLeaderOrAdmin}
                        onRemove={removeMember}
                      />
                    ))}
                  </Reorder.Group>
                </div>
              )}

              {/* ── Unselected members (click to add) ── */}
              {unselectedMembers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                    {orderedPool.length > 0 ? "Not Included" : "All Members (default order)"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {unselectedMembers.map((member) => {
                      const isInactive = team.inactiveMembers.includes(member._id);
                      return (
                        <motion.button
                          key={member._id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => isLeaderOrAdmin && addMember(member)}
                          disabled={!isLeaderOrAdmin}
                          className={[
                            "flex items-center gap-3 rounded-xl border border-dashed border-border/50 p-3 text-left transition-all",
                            isLeaderOrAdmin
                              ? "hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                              : "cursor-default opacity-60",
                          ].join(" ")}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">
                            {member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-muted-foreground truncate">{member.name}</p>
                            {isInactive && (
                              <span className="text-[10px] text-amber-400">Inactive for auto-assign</span>
                            )}
                          </div>
                          {isLeaderOrAdmin && (
                            <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state — no one selected, everyone included */}
              {orderedPool.length === 0 && unselectedMembers.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-2">
                  No members in this team yet.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Source exclusions — per-member sources that never get auto-assigned */}
      {autoAssign && (
        <motion.div variants={itemVariants}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                  <Ban className="h-4 w-4 text-red-400" />
                </div>
                Source Exclusions
                {Object.keys(sourceExclusions).length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs font-normal">
                    {Object.values(sourceExclusions).reduce((a, b) => a + b.length, 0)} rules
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Leads from an excluded source are never auto-assigned to that member — their turn passes to the next member in rotation. Manual assignment is still allowed.
              </p>

              {(settings?.availableSources ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-2">
                  No lead sources found in this team yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {allMembers.map((member) => {
                    const excluded = sourceExclusions[member._id] ?? [];
                    const addable = (settings?.availableSources ?? []).filter((s) => !excluded.includes(s));
                    return (
                      <div
                        key={member._id}
                        className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex items-center gap-2.5 sm:w-44 shrink-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">
                            {member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                          {excluded.map((source) => (
                            <motion.span
                              key={source}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400"
                            >
                              {source}
                              {isLeaderOrAdmin && (
                                <button
                                  onClick={() => removeExclusion(member._id, source)}
                                  className="hover:text-red-300 transition-colors"
                                  aria-label={`Remove ${source} exclusion for ${member.name}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </motion.span>
                          ))}

                          {isLeaderOrAdmin && addable.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => e.target.value && addExclusion(member._id, e.target.value)}
                              className="rounded-full border border-dashed border-border/60 bg-transparent px-2 py-0.5 text-[10px] text-muted-foreground cursor-pointer hover:border-red-500/40 hover:text-red-400 transition-colors focus:outline-none"
                            >
                              <option value="">+ Exclude source…</option>
                              {addable.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          )}

                          {excluded.length === 0 && !isLeaderOrAdmin && (
                            <span className="text-[10px] text-muted-foreground">No exclusions</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Warn when a source is excluded by every eligible member */}
              {(() => {
                const eligibleIds = effectivePool.map((m) => m._id);
                const fullyExcluded = (settings?.availableSources ?? []).filter(
                  (src) => eligibleIds.length > 0 && eligibleIds.every((id) => (sourceExclusions[id] ?? []).includes(src)),
                );
                if (fullyExcluded.length === 0) return null;
                return (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300/80">
                      Every eligible member excludes <span className="font-semibold">{fullyExcluded.join(", ")}</span> — leads from {fullyExcluded.length > 1 ? "these sources" : "this source"} will stay unassigned in the batch queue.
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Current round-robin position indicator */}
      {autoAssign && splitMode === "round_robin" && settings && (
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                {roundRobinStartDate
                  ? <>Fairness baseline: leads counted from <span className="font-medium text-foreground">{roundRobinStartDate}</span></>
                  : <>
                      Next global rotation position:{" "}
                      <span className="font-medium text-foreground">
                        {effectivePool.length > 0
                          ? (effectivePool[(settings.roundRobinIndex ?? 0) % effectivePool.length]?.name ?? "—")
                          : "No eligible members"}
                      </span>
                    </>
                }
              </p>
            </div>
            {!roundRobinStartDate && (
              <p className="text-[11px] text-violet-400/80 pl-6">
                Each lead source (Google Ads, Meta, etc.) rotates independently — sources don't steal turns from each other.
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Save + Split Now */}
      {isLeaderOrAdmin && (
        <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save Settings
          </Button>

          {autoAssign && (
            <Button
              variant="outline"
              onClick={() => splitNow(undefined)}
              disabled={splitting}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              {splitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Split Now
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
