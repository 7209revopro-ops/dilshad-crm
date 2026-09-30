"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, Users, AlertTriangle, TrendingUp, Clock, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFollowUpReport } from "@/hooks/useReports";
import { useTeams } from "@/hooks/useTeams";
import type { FollowUpAgentRank, FollowUpOverdueLead, FollowUpLeadBreakdown } from "@/hooks/useReports";
import { toGstDateISO } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const pageVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const listItemVariants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const listContainerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.05 } },
};

function formatIST(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }) + " IST";
}

function fmtOverdue(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60)  return `${Math.round(mins)}m overdue`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m overdue` : `${h}h overdue`;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    new:              "bg-blue-500/10 text-blue-400",
    assigned:         "bg-violet-500/10 text-violet-400",
    followup:         "bg-amber-500/10 text-amber-400",
    pending_response: "bg-yellow-500/10 text-yellow-400",
    closed:           "bg-green-500/10 text-green-400",
    lost:             "bg-red-500/10 text-red-400",
    callback:         "bg-teal-500/10 text-teal-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", colorMap[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <motion.div variants={listItemVariants}>
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FollowUpReportPage() {
  const today        = toGstDateISO(new Date());
  const thirtyAgo    = toGstDateISO(new Date(Date.now() - 30 * 864e5));

  const [teamId,    setTeamId]    = useState("");
  const [dateFrom,  setDateFrom]  = useState(thirtyAgo);
  const [dateTo,    setDateTo]    = useState(today);

  const { data: teamsData } = useTeams({ status: "active", limit: 100 });
  const teams = teamsData?.data ?? [];

  const { data, isLoading, error } = useFollowUpReport({
    teamId:   teamId || undefined,
    dateFrom,
    dateTo,
  });

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-4 sm:p-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-green-400" />
          Follow-Up Tracking
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track follow-up attempts, overdue leads, and agent activity
        </p>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5 min-w-[140px]">
              <Label className="text-xs">Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className="h-8 text-xs w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/40 border-border/50" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4 text-sm text-destructive">
            Failed to load report. Please try again.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary */}
          <motion.div
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            <StatCard icon={CalendarCheck} label="Total Follow-Ups"      value={data.summary.totalFollowUps}      color="text-green-400" />
            <StatCard icon={FileText}      label="Leads Followed Up"      value={data.summary.leadsWithFollowUps}  color="text-primary" />
            <StatCard icon={Users}         label="Active Agents"          value={data.summary.totalAgentsTracked}  color="text-violet-400" />
            <StatCard
              icon={AlertTriangle}
              label="Overdue Follow-Ups"
              value={data.summary.overdueCount}
              color={data.summary.overdueCount > 0 ? "text-red-400" : "text-muted-foreground"}
            />
          </motion.div>

          {/* Agent Ranking */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-400" />
                Agent Follow-Up Ranking
                <Badge variant="secondary" className="ml-auto text-xs font-normal">
                  sorted by total follow-ups
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.agentRanking.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 pb-4">No follow-up data for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">#</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Agent</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Follow-Ups</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Unique Leads</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Last Follow-Up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agentRanking.map((agent: FollowUpAgentRank, idx: number) => (
                        <motion.tr
                          key={agent.agentId}
                          variants={listItemVariants}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{agent.agentName}</div>
                            {agent.agentEmail && <div className="text-xs text-muted-foreground">{agent.agentEmail}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-400">{agent.totalFollowUps}</td>
                          <td className="px-4 py-2.5 text-right">{agent.uniqueLeads}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatIST(agent.lastFollowUp)}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overdue Follow-Ups */}
          {data.overdueLeads.length > 0 && (
            <Card className="border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Overdue Follow-Ups
                  <Badge variant="destructive" className="ml-auto text-xs font-normal">
                    {data.overdueLeads.length} leads
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Lead</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Assigned To</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Due Date</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Overdue</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Total Follow-Ups</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdueLeads.map((lead: FollowUpOverdueLead) => (
                        <motion.tr
                          key={lead._id}
                          variants={listItemVariants}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{lead.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{lead.phone}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {(lead.assignedTo as { name: string } | undefined)?.name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {formatIST(lead.nextFollowUpAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-red-400 font-semibold text-xs">
                              {fmtOverdue(lead.overdueByMinutes)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{lead.totalFollowUps}</td>
                          <td className="px-4 py-2.5"><StatusBadge status={lead.status} /></td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lead Breakdown */}
          {data.leadBreakdown.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Lead Follow-Up Breakdown
                  <Badge variant="secondary" className="ml-auto text-xs font-normal">
                    {data.leadBreakdown.length} leads
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Lead</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Agent</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">In Period</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">All Time</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Last Follow-Up</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Next Due</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leadBreakdown.map((lead: FollowUpLeadBreakdown) => (
                        <motion.tr
                          key={lead._id}
                          variants={listItemVariants}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{lead.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{lead.phone}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs">{lead.agentName}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-primary">{lead.followUpCount}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{lead.totalFollowUpsAllTime}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatIST(lead.lastFollowUpAt)}</td>
                          <td className="px-4 py-2.5 text-xs">
                            {lead.nextFollowUpAt ? (
                              <span className={cn(
                                new Date(lead.nextFollowUpAt).getTime() < Date.now()
                                  ? "text-red-400"
                                  : "text-blue-400",
                              )}>
                                {formatIST(lead.nextFollowUpAt)}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2.5"><StatusBadge status={lead.status} /></td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </motion.div>
  );
}
