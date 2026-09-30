"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Timer, Users, AlertTriangle, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResponseTimeReport } from "@/hooks/useReports";
import { useTeams } from "@/hooks/useTeams";
import type { ResponseTimeAgent, ResponseTimeBreachedLead } from "@/hooks/useReports";
import { toGstDateISO } from "@/lib/utils";

const pageVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};
const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const listItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

function fmtMins(mins: number | null | undefined): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function slaColor(rate: number) {
  if (rate >= 80) return "text-green-500";
  if (rate >= 50) return "text-yellow-500";
  return "text-red-500";
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
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0`}>
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

const SLA_PRESETS = [5, 15, 30, 60, 120];

export default function ResponseTimePage() {
  const today = toGstDateISO(new Date());
  const thirtyDaysAgo = toGstDateISO(new Date(Date.now() - 30 * 864e5));

  const [teamId, setTeamId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [slaMinutes, setSlaMinutes] = useState<number>(60);
  const [customSla, setCustomSla] = useState<string>("");

  const { data: teamsData } = useTeams({ status: "active", limit: 100 });
  const teams = teamsData?.data ?? [];

  const { data, isLoading, error } = useResponseTimeReport({
    teamId: teamId || undefined,
    dateFrom,
    dateTo,
    slaMinutes,
  });

  const effectiveSla = data?.summary.slaMinutes ?? slaMinutes;

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-4 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Timer className="h-5 w-5 text-orange-400" />
            Response Time SLA
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track how quickly agents first contact assigned leads
          </p>
        </div>
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
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">SLA threshold</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {SLA_PRESETS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => { setSlaMinutes(min); setCustomSla(""); }}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                      slaMinutes === min && !customSla
                        ? "border-orange-500/60 bg-orange-500/10 text-orange-500"
                        : "border-border bg-muted text-muted-foreground hover:border-orange-500/30"
                    }`}
                  >
                    {min >= 60 ? `${min / 60}h` : `${min}m`}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    placeholder="custom"
                    value={customSla}
                    onChange={(e) => {
                      setCustomSla(e.target.value);
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v > 0) setSlaMinutes(v);
                    }}
                    className="h-8 w-20 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
          {/* Summary cards */}
          <motion.div
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          >
            <StatCard
              icon={Users}
              label="Total Assigned"
              value={data.summary.totalAssigned}
              color="text-primary"
            />
            <StatCard
              icon={CheckCircle2}
              label="Contacted"
              value={data.summary.totalContacted}
              sub={`${data.summary.totalAssigned > 0 ? Math.round((data.summary.totalContacted / data.summary.totalAssigned) * 100) : 0}% of assigned`}
              color="text-green-500"
            />
            <StatCard
              icon={AlertTriangle}
              label="Not Contacted"
              value={data.summary.notContacted}
              color="text-red-500"
            />
            <StatCard
              icon={Timer}
              label="Within SLA"
              value={`${data.summary.overallSlaRate}%`}
              sub={`SLA = ${fmtMins(effectiveSla)}`}
              color={slaColor(data.summary.overallSlaRate)}
            />
            <StatCard
              icon={Clock}
              label="Avg Response"
              value={fmtMins(data.summary.overallAvgResponseMinutes)}
              color="text-blue-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Agents Tracked"
              value={data.agentRanking.length}
              color="text-violet-400"
            />
          </motion.div>

          {/* Agent Ranking */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-400" />
                Agent Performance Ranking
                <Badge variant="secondary" className="ml-auto text-xs font-normal">
                  sorted by avg response time
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.agentRanking.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 pb-4">No data for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">#</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Agent</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Assigned</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Contacted</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Not Contacted</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Within SLA</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">SLA Rate</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Avg Response</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Fastest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agentRanking.map((agent: ResponseTimeAgent, idx: number) => (
                        <motion.tr
                          key={agent.agentId}
                          variants={listItemVariants}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-foreground">{agent.agentName}</div>
                            {agent.agentEmail && (
                              <div className="text-xs text-muted-foreground">{agent.agentEmail}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">{agent.totalAssigned}</td>
                          <td className="px-4 py-2.5 text-right text-green-500">{agent.totalContacted}</td>
                          <td className="px-4 py-2.5 text-right">
                            {agent.notContactedCount > 0 ? (
                              <span className="text-red-500">{agent.notContactedCount}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">{agent.totalWithinSla}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-semibold ${slaColor(agent.slaComplianceRate)}`}>
                              {agent.slaComplianceRate}%
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {fmtMins(agent.avgResponseMinutes)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-green-500">
                            {fmtMins(agent.minResponseMinutes)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Breached Leads */}
          {data.breachedLeads.length > 0 && (
            <Card className="border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Leads Not Yet Contacted
                  <Badge variant="destructive" className="ml-auto text-xs font-normal">
                    {data.breachedLeads.length} leads
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Lead</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Source</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Assigned To</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Assigned At</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Waiting</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.breachedLeads.map((lead: ResponseTimeBreachedLead) => (
                        <motion.tr
                          key={lead._id}
                          variants={listItemVariants}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{lead.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{lead.phone}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{lead.source || "—"}</td>
                          <td className="px-4 py-2.5 text-xs">
                            {(lead.assignedTo as { name: string } | undefined)?.name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {lead.assignedAt
                              ? new Date(lead.assignedAt).toLocaleString("en-IN", {
                                  timeZone: "Asia/Kolkata",
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {lead.minutesSinceAssign != null ? (
                              <span className={lead.minutesSinceAssign > effectiveSla ? "text-red-500 font-semibold" : "text-yellow-500"}>
                                {fmtMins(lead.minutesSinceAssign)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="secondary" className="text-xs font-normal capitalize">
                              {lead.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
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
