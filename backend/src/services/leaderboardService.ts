import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Lead } from "../models/Lead.js";
import { Student } from "../models/Student.js";
import { CallLog } from "../models/CallLog.js";
import { CommissionSettings } from "../models/CommissionSettings.js";

/*
 * The month's leaderboard (the owner, 2026-10-07): every active salesperson,
 * ranked by revenue, then closings, then follow-ups, then calls. Months are
 * Dubai months. Super admins and the commission plan's excluded people are left
 * out. Everyone signed in sees the whole board.
 *
 *  • Revenue   — payments dated in the month on the leads each person holds.
 *  • Closings  — enrolments in the month credited to them (not dropped ones).
 *  • Follow-ups — follow-ups they logged in the month.
 *  • Calls     — outbound calls in the month: theirs by click-to-call, or from
 *                their 3CX extension.
 */

const DUBAI_OFFSET_MS = 4 * 3_600_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isLeaderboardMonth(v: unknown): v is string {
  return typeof v === "string" && MONTH.test(v);
}

/** "2026-10" → its Dubai start and end; the current Dubai month when none is given. */
export function dubaiMonthRange(month?: string): { month: string; from: Date; to: Date } {
  const now = new Date(Date.now() + DUBAI_OFFSET_MS);
  const m = month && MONTH.test(month)
    ? month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return {
    month: m,
    from: new Date(Date.UTC(y, mo - 1, 1) - DUBAI_OFFSET_MS),
    to: new Date(Date.UTC(y, mo, 1) - DUBAI_OFFSET_MS),
  };
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  revenue: number;
  closings: number;
  followUps: number;
  calls: number;
}

type Counted = { _id: Types.ObjectId | null; n: number };
const byId = (rows: Counted[]) => new Map(rows.filter((r) => r._id).map((r) => [String(r._id), r.n]));

export class LeaderboardService {
  async getLeaderboard(month?: string): Promise<{ month: string; rows: LeaderboardRow[] }> {
    const range = dubaiMonthRange(month);
    const inMonth = { $gte: range.from, $lt: range.to };

    const [people, settings, revenue, closings, followUps, calls] = await Promise.all([
      User.find({ status: "active" })
        .select("name extension role")
        .populate("role", "roleName isSystemRole")
        .lean<{ _id: Types.ObjectId; name: string; extension?: string | null; role?: { roleName?: string; isSystemRole?: boolean } | null }[]>(),
      CommissionSettings.findOne().select("excludedUsers").lean<{ excludedUsers?: Types.ObjectId[] } | null>(),
      Lead.aggregate<Counted>([
        { $match: { "payments.paidAt": inMonth } },
        { $unwind: "$payments" },
        { $match: { "payments.paidAt": inMonth } },
        { $group: { _id: "$assignedTo", n: { $sum: "$payments.amount" } } },
      ]),
      Student.aggregate<Counted>([
        { $match: { enrollmentDate: inMonth, status: { $ne: "dropped" } } },
        { $group: { _id: "$assignedTo", n: { $sum: 1 } } },
      ]),
      this.followUpsBy(inMonth),
      CallLog.find({ callDate: inMonth, callDirection: "outbound" })
        .select("initiatedBy agentExtension")
        .lean<{ initiatedBy?: Types.ObjectId | null; agentExtension?: string | null }[]>(),
    ]);

    const excluded = new Set((settings?.excludedUsers ?? []).map(String));
    const staff = people.filter((p) => !(p.role?.isSystemRole && p.role.roleName === "Super Admin") && !excluded.has(String(p._id)));

    // A call is theirs by click-to-call, otherwise by their extension.
    const byExtension = new Map(staff.filter((p) => p.extension?.trim()).map((p) => [p.extension!.trim(), String(p._id)]));
    const callCount = new Map<string, number>();
    for (const c of calls) {
      const who = c.initiatedBy ? String(c.initiatedBy) : c.agentExtension ? byExtension.get(c.agentExtension.trim()) : undefined;
      if (who) callCount.set(who, (callCount.get(who) ?? 0) + 1);
    }

    const rev = byId(revenue), clo = byId(closings), fol = byId(followUps);
    const rows = staff
      .map((p) => {
        const id = String(p._id);
        return {
          userId: id,
          name: p.name,
          revenue: Math.round((rev.get(id) ?? 0) * 100) / 100,
          closings: clo.get(id) ?? 0,
          followUps: fol.get(id) ?? 0,
          calls: callCount.get(id) ?? 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.closings - a.closings || b.followUps - a.followUps || b.calls - a.calls || a.name.localeCompare(b.name))
      .map((r, i) => ({ rank: i + 1, ...r }));

    return { month: range.month, rows };
  }

  /** Follow-ups each person logged in the month. */
  private followUpsBy(inMonth: { $gte: Date; $lt: Date }) {
    return Lead.aggregate<Counted>([
      { $match: { "followUps.followedUpAt": inMonth } },
      { $unwind: "$followUps" },
      { $match: { "followUps.followedUpAt": inMonth } },
      { $group: { _id: "$followUps.followedUpBy", n: { $sum: 1 } } },
    ]);
  }
}
