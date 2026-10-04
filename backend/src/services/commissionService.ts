import { Types } from "mongoose";
import { CommissionSale } from "../models/CommissionSale.js";
import { CommissionSettings } from "../models/CommissionSettings.js";
import { FinanceHandover } from "../models/FinanceHandover.js";
import { Student } from "../models/Student.js";
import { Course } from "../models/Course.js";
import { Team } from "../models/Team.js";
import { User } from "../models/User.js";
import { fetchEnrolmentStatuses } from "./financeClient.js";
import { env } from "../config/env.js";
import type {
  CommissionRole,
  CommissionSaleState,
  ICommissionLine,
  IRole,
} from "../types/index.js";

/*
 * Sales commission: a plan per course (Sales Staff / TL / SM, in AED), and
 * what each approved sale earns under it.
 *
 * The rules, as the business set them (2026-10-04):
 *   - every sale finance approves pays three people: whoever closed it (Sales
 *     Staff), the leader of its team (TL) and the Sales Manager (SM);
 *   - one Sales Manager for the whole CRM. A team he leads himself gets no TL
 *     amount — he is paid as SM, not twice;
 *   - a TL or SM who closes a sale is paid the Sales Staff amount as well;
 *   - one leader per team: a sale in a team with none, or two, waits until the
 *     team is fixed, and is listed so somebody fixes it;
 *   - sales closed under a shared login (root user, superadmin, developer)
 *     earn nobody anything.
 *
 * Recorded when this CRM sees finance approve the enrolment, with the amounts
 * of that day, and counted in the month the sale was made (UAE time). A sale
 * whose invoice finance later voids is reversed.
 */

/**
 * How this CRM pays a team's leader — the one line that differs between the
 * three sales CRMs, which otherwise run this same code:
 *   "zero_if_sm"  the leader is paid the TL amount, except on a team the Sales
 *                 Manager leads himself, where it is 0 (Sales CRM)
 *   "always"      the leader is paid the TL amount — the Sales Manager too when
 *                 he leads the team, so one person earns both (Remote CRM)
 *   "never"       no TL amount at all, so a sale needs no team leader (Draw)
 */
export type TlRule = "zero_if_sm" | "always" | "never";
export const TL_RULE: TlRule = "always";

/** UAE has no daylight saving: a month there starts at 20:00 UTC the day before. */
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;

export function uaeMonthOf(d: Date): string {
  return new Date(d.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 7);
}

export function isSuperAdmin(role?: IRole | null): boolean {
  return Boolean(role?.isSystemRole && role.roleName === "Super Admin");
}

export type Plan = { sales: number; tl: number; sm: number; creditUsd: number };

const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** A course's plan row; zeros for a course nobody has set one on. */
export function planOf(course?: { commission?: Partial<Plan> | null } | null): Plan {
  const c = course?.commission;
  return { sales: amount(c?.sales), tl: amount(c?.tl), sm: amount(c?.sm), creditUsd: amount(c?.creditUsd) };
}

const idOf = (v: unknown): string => {
  if (!v) return "";
  if (v instanceof Types.ObjectId) return v.toHexString();
  if (typeof v === "object" && "_id" in (v as object)) return String((v as { _id: unknown })._id);
  return String(v);
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface CommissionConfig {
  salesManager: Types.ObjectId | null;
  excluded: Set<string>;
}

export async function loadConfig(): Promise<CommissionConfig> {
  const s = await CommissionSettings.findOne({ key: "default" }).lean();
  return {
    salesManager: s?.salesManager ?? null,
    excluded: new Set((s?.excludedUsers ?? []).map(idOf)),
  };
}

/** Names looked up once per pass, not once per line. */
class Names {
  private cache = new Map<string, string>();
  async of(id: unknown): Promise<string> {
    const key = idOf(id);
    if (!key) return "";
    if (!this.cache.has(key)) {
      const u = Types.ObjectId.isValid(key) ? await User.findById(key).select("name").lean() : null;
      this.cache.set(key, u?.name ?? "Unknown user");
    }
    return this.cache.get(key)!;
  }
}

// ─── Who earns it ─────────────────────────────────────────────────────────────

type TeamLite = { _id: Types.ObjectId; name: string; leaders: unknown[] };

export interface Resolved {
  state: CommissionSaleState;
  reason: string;
  team: Types.ObjectId | null;
  teamName: string;
  lines: ICommissionLine[];
}

/**
 * The team a sale counts under: its own, or — for a sale made with none — the
 * one team its closer is in.
 */
async function teamFor(
  saleTeam: unknown,
  closer: unknown,
  closerName: string,
): Promise<{ team?: TeamLite; reason?: string }> {
  const own = idOf(saleTeam);
  if (own && Types.ObjectId.isValid(own)) {
    const t = await Team.findById(own).select("name leaders").lean();
    if (t) return { team: t as unknown as TeamLite };
  }
  const theirs = await Team.find({ status: "active", $or: [{ members: closer }, { leaders: closer }] })
    .select("name leaders")
    .lean();
  if (theirs.length === 1) return { team: theirs[0] as unknown as TeamLite };
  return {
    reason: theirs.length
      ? `${closerName} is in ${theirs.length} teams — the sale has none, so it can't tell whose leader to pay`
      : `${closerName} isn't in a team`,
  };
}

/**
 * Who earns what on a sale, under the rules above. Nothing is written: the
 * caller stores it, or — for the closing dialog — only shows it.
 */
export async function resolveSale(
  input: { closer: unknown; saleTeam: unknown; plan: Plan },
  config: CommissionConfig,
  names: Names = new Names(),
): Promise<Resolved> {
  const none = { team: null, teamName: "", lines: [] as ICommissionLine[] };
  const closer = idOf(input.closer);
  if (!closer || !Types.ObjectId.isValid(closer)) {
    return { ...none, state: "waiting", reason: "Nobody is set as the closer" };
  }
  const closerName = await names.of(closer);
  if (config.excluded.has(closer)) {
    return { ...none, state: "excluded", reason: `Closed under ${closerName}, a login that earns no commission` };
  }

  const { team, reason } = await teamFor(input.saleTeam, closer, closerName);
  const line = async (role: CommissionRole, user: string, amt: number, note?: string): Promise<ICommissionLine> => ({
    role,
    user: new Types.ObjectId(user),
    userName: await names.of(user),
    amount: amt,
    ...(note ? { note } : {}),
  });

  // No TL paid here: the team is only shown, and a sale without one still counts.
  if (TL_RULE === "never") {
    const shown = { team: team?._id ?? null, teamName: team?.name ?? "", lines: [] as ICommissionLine[] };
    if (!config.salesManager) {
      return { ...shown, state: "waiting", reason: "No Sales Manager is set on the commission plan" };
    }
    return {
      ...shown,
      state: "counted",
      reason: "",
      lines: [
        await line("sales", closer, input.plan.sales),
        await line("sm", idOf(config.salesManager), input.plan.sm),
      ],
    };
  }

  if (!team) return { ...none, state: "waiting", reason: reason ?? "No team" };

  const onTeam = { team: team._id, teamName: team.name, lines: [] as ICommissionLine[] };
  const leaders = [...new Set((team.leaders ?? []).map(idOf).filter(Boolean))];
  if (leaders.length !== 1) {
    return {
      ...onTeam,
      state: "waiting",
      reason: leaders.length
        ? `${team.name} has ${leaders.length} leaders — a team needs exactly one`
        : `${team.name} has no leader`,
    };
  }
  if (!config.salesManager) {
    return { ...onTeam, state: "waiting", reason: "No Sales Manager is set on the commission plan" };
  }

  const tl = leaders[0]!;
  const sm = idOf(config.salesManager);
  const tlIsSm = tl === sm && TL_RULE === "zero_if_sm";

  return {
    ...onTeam,
    state: "counted",
    reason: "",
    lines: [
      await line("sales", closer, input.plan.sales),
      await line("tl", tl, tlIsSm ? 0 : input.plan.tl, tlIsSm ? "Leads this team as Sales Manager — paid as SM" : undefined),
      await line("sm", sm, input.plan.sm),
    ],
  };
}

// ─── The sweep ────────────────────────────────────────────────────────────────

const BATCH = 50;
const VOID_CHECK_MS = 10 * 60_000;
/** How far back a voided invoice still takes a sale's commission back. */
const VOID_WINDOW_MS = 120 * 24 * 60 * 60_000;

type StudentLite = {
  _id: Types.ObjectId;
  name?: string;
  enrollmentNumber?: string;
  course?: unknown;
  team?: unknown;
  assignedTo?: unknown;
  enrollmentDate?: Date;
  createdAt?: Date;
  financeInvoiceNumber?: string | null;
};

/** Every approval not yet recorded becomes a sale, once. */
export async function recordApprovedSales(config: CommissionConfig, names: Names): Promise<number> {
  const due = await FinanceHandover.find({ approvedAt: { $ne: null }, commissionAt: null })
    .sort({ approvedAt: 1 })
    .limit(BATCH);
  let recorded = 0;

  for (const row of due) {
    try {
      const student = (await Student.findById(row.get("studentId"))
        .select("name enrollmentNumber course team assignedTo enrollmentDate createdAt financeInvoiceNumber")
        .lean()) as StudentLite | null;

      // A student deleted before finance approved them has nobody left to pay.
      if (student) {
        const courseId = idOf(student.course);
        const course = courseId ? await Course.findById(courseId).select("name commission").lean() : null;
        const plan = planOf(course);
        const approvedAt = row.get("approvedAt") as Date;
        const saleDate = student.enrollmentDate ?? student.createdAt ?? approvedAt;
        const resolved = await resolveSale({ closer: student.assignedTo, saleTeam: student.team, plan }, config, names);
        const closer = idOf(student.assignedTo);

        // Insert-only: a sale recorded by an earlier pass is left exactly as it was.
        const result = await CommissionSale.updateOne(
          { student: student._id },
          {
            $setOnInsert: {
              student: student._id,
              studentName: student.name ?? "",
              enrollmentNumber: student.enrollmentNumber,
              invoiceNumber: (row.get("invoiceNumber") as string) || student.financeInvoiceNumber || "",
              course: course?._id ?? null,
              courseName: course?.name ?? "",
              closer: closer && Types.ObjectId.isValid(closer) ? new Types.ObjectId(closer) : null,
              closerName: closer ? await names.of(closer) : "",
              saleDate,
              month: uaeMonthOf(saleDate),
              approvedAt,
              plan,
              ...resolved,
              ...(resolved.state === "counted" ? { countedAt: new Date() } : {}),
            },
          },
          { upsert: true },
        );
        if (result.upsertedCount) recorded++;
      }

      row.set("commissionAt", new Date());
      await row.save();
    } catch (err) {
      console.error(`[commission] could not record the sale for student ${String(row.get("studentId"))}`, err);
    }
  }
  return recorded;
}

/**
 * Sales on hold, looked at again: a team given one leader, a closer put in a
 * team, a student given to their real closer, a Sales Manager set. The plan
 * amounts stay the ones of the approval; only who earns them is redone.
 */
export async function settlePendingSales(config: CommissionConfig, names: Names): Promise<number> {
  const pending = await CommissionSale.find({ state: { $in: ["waiting", "excluded"] } })
    .sort({ approvedAt: 1 })
    .limit(200);
  let changed = 0;

  for (const sale of pending) {
    try {
      const student = (await Student.findById(sale.student).select("team assignedTo").lean()) as StudentLite | null;
      // A student deleted since is decided on what the sale recorded.
      const closer = student ? student.assignedTo : sale.closer;
      const saleTeam = student ? student.team : sale.team;
      const plan = planOf({ commission: sale.plan as Partial<Plan> });
      const resolved = await resolveSale({ closer, saleTeam, plan }, config, names);

      const closerId = idOf(closer);
      const sameCloser = closerId === idOf(sale.closer);
      if (resolved.state === sale.state && resolved.reason === sale.reason && sameCloser) continue;

      sale.set({
        ...resolved,
        closer: closerId && Types.ObjectId.isValid(closerId) ? new Types.ObjectId(closerId) : null,
        closerName: closerId ? await names.of(closerId) : "",
        ...(resolved.state === "counted" ? { countedAt: new Date() } : {}),
      });
      await sale.save();
      changed++;
    } catch (err) {
      console.error(`[commission] could not settle the sale ${String(sale._id)}`, err);
    }
  }
  return changed;
}

/**
 * Sales whose invoice finance has voided since, taken back. Asked of finance
 * for the last few months' sales only — a void long after is somebody's
 * correction to make by hand, not a reason to ask about every sale forever.
 */
export async function reverseVoidedSales(): Promise<number> {
  const live = await CommissionSale.find({
    state: { $ne: "reversed" },
    approvedAt: { $gte: new Date(Date.now() - VOID_WINDOW_MS) },
  })
    .select("student")
    .lean();
  let reversed = 0;

  for (let i = 0; i < live.length; i += 200) {
    const ids = live.slice(i, i + 200).map((s) => String(s.student));
    const statuses = await fetchEnrolmentStatuses(ids);
    for (const st of statuses) {
      if (st.status !== "void" || !Types.ObjectId.isValid(st.externalId)) continue;
      const r = await CommissionSale.updateOne(
        { student: new Types.ObjectId(st.externalId), state: { $ne: "reversed" } },
        {
          $set: {
            state: "reversed",
            reversedAt: new Date(),
            reason: st.invoiceNumber
              ? `Invoice ${st.invoiceNumber} was voided in finance`
              : "Its invoice was voided in finance",
          },
        },
      );
      reversed += r.modifiedCount;
    }
  }
  return reversed;
}

let sweeping = false;
let lastVoidCheck = 0;

/**
 * One pass: record new approvals, settle what waits, and — every ten minutes —
 * take back voided sales. Run by the finance worker every minute. Never throws:
 * it runs in a timer, where an unhandled rejection kills the process.
 */
export async function sweepCommission(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const config = await loadConfig();
    const names = new Names();
    await recordApprovedSales(config, names);
    await settlePendingSales(config, names);
    if (Date.now() - lastVoidCheck >= VOID_CHECK_MS) {
      lastVoidCheck = Date.now();
      await reverseVoidedSales();
    }
  } catch (err) {
    console.error("[commission] sweep failed", err);
  } finally {
    sweeping = false;
  }
}

// ─── Reading it ───────────────────────────────────────────────────────────────

type Viewer = { userId: string; role?: IRole };

export class CommissionService {
  /** The plan: every course's row, the Sales Manager, the excluded logins, and what needs fixing. */
  async getPlan(viewer: Viewer) {
    const canEdit = isSuperAdmin(viewer.role);
    const [courses, settings, teams] = await Promise.all([
      Course.find({}).select("name amount status commission").sort({ status: 1, name: 1 }).lean(),
      CommissionSettings.findOne({ key: "default" })
        .populate("salesManager", "name email")
        .populate("excludedUsers", "name email")
        .lean(),
      Team.find({ status: "active" }).select("name leaders").populate("leaders", "name").sort({ name: 1 }).lean(),
    ]);

    const person = (u: unknown) =>
      u && typeof u === "object" && "_id" in (u as object)
        ? { _id: idOf(u), name: (u as { name?: string }).name ?? "", email: (u as { email?: string }).email ?? "" }
        : null;

    const [waiting, users] = canEdit
      ? await Promise.all([
          CommissionSale.find({ state: "waiting" })
            .select("studentName enrollmentNumber courseName closerName teamName saleDate approvedAt reason")
            .sort({ approvedAt: -1 })
            .limit(100)
            .lean(),
          User.find({}).select("name email status").sort({ name: 1 }).lean(),
        ])
      : [[], []];

    return {
      canEdit,
      tlRule: TL_RULE,
      courses: courses.map((c) => ({
        _id: String(c._id),
        name: c.name,
        amount: c.amount,
        status: c.status,
        commission: planOf(c),
      })),
      salesManager: person(settings?.salesManager),
      excludedUsers: ((settings?.excludedUsers ?? []) as unknown[]).map(person).filter(Boolean),
      teams: teams.map((t) => {
        const leaders = ((t.leaders ?? []) as unknown[]).map((l) => ({ _id: idOf(l), name: (l as { name?: string }).name ?? "" }));
        return {
          _id: String(t._id),
          name: t.name,
          leaders,
          problem: leaders.length === 1 ? null : leaders.length ? `${leaders.length} leaders` : "No leader",
        };
      }),
      waiting,
      users: users.map((u) => ({ _id: String(u._id), name: u.name, email: u.email, status: u.status })),
    };
  }

  /** One course's row of the plan. Only for future approvals: a recorded sale keeps its amounts. */
  async updateCoursePlan(courseId: string, plan: Plan, userId: string) {
    const course = await Course.findById(courseId);
    if (!course) throw Object.assign(new Error("Course not found"), { statusCode: 404 });
    course.set("commission", {
      sales: plan.sales,
      tl: plan.tl,
      sm: plan.sm,
      creditUsd: plan.creditUsd,
      updatedAt: new Date(),
      updatedBy: new Types.ObjectId(userId),
    });
    await course.save();
    return { _id: String(course._id), name: course.name, commission: planOf(course) };
  }

  async updateSettings(input: { salesManager?: string | null; excludedUsers?: string[] }, viewer: Viewer) {
    const ids = [
      ...(input.salesManager ? [input.salesManager] : []),
      ...(input.excludedUsers ?? []),
    ];
    const found = await User.countDocuments({ _id: { $in: [...new Set(ids)] } });
    if (found !== new Set(ids).size) throw Object.assign(new Error("Unknown user"), { statusCode: 400 });

    const set: Record<string, unknown> = { updatedBy: new Types.ObjectId(viewer.userId) };
    if (input.salesManager !== undefined) set.salesManager = input.salesManager ? new Types.ObjectId(input.salesManager) : null;
    if (input.excludedUsers !== undefined) set.excludedUsers = [...new Set(input.excludedUsers)].map((id) => new Types.ObjectId(id));
    await CommissionSettings.updateOne({ key: "default" }, { $set: set, $setOnInsert: { key: "default" } }, { upsert: true });
    // What waits on a Sales Manager, or on a login no longer excluded, settles
    // now rather than in a minute — where this process runs the timed jobs.
    if (env.RUN_SCHEDULERS) void sweepCommission();
    return this.getPlan(viewer);
  }

  /**
   * A month's commission as the viewer may see it: Super Admins and the Sales
   * Manager everything; a team leader their teams' sales (without the SM's
   * line) and their own lines anywhere; everyone else their own.
   */
  async getEarnings(viewer: Viewer, month: string) {
    const me = viewer.userId;
    const meId = new Types.ObjectId(me);
    const config = await loadConfig();
    const everything = isSuperAdmin(viewer.role) || idOf(config.salesManager) === me;
    const ledTeams = everything ? [] : await Team.find({ leaders: meId }).select("_id").lean();
    const myTeams = new Set(ledTeams.map((t) => String(t._id)));
    const scope: "all" | "team" | "own" = everything ? "all" : myTeams.size ? "team" : "own";

    const filter: Record<string, unknown> = { month };
    if (scope === "team") {
      filter.$or = [{ team: { $in: ledTeams.map((t) => t._id) } }, { "lines.user": meId }, { closer: meId }];
    } else if (scope === "own") {
      filter.$or = [{ "lines.user": meId }, { closer: meId }];
    }
    const sales = await CommissionSale.find(filter).sort({ saleDate: -1, approvedAt: -1 }).lean();

    const visible = (sale: (typeof sales)[number]) =>
      scope === "all"
        ? sale.lines
        : sale.lines.filter(
            (l) =>
              String(l.user) === me ||
              (scope === "team" && myTeams.has(String(sale.team)) && l.role !== "sm"),
          );

    type Tally = { count: number; amount: number };
    const people = new Map<string, { _id: string; name: string; sales: Tally; tl: Tally; sm: Tally; total: number }>();
    for (const sale of sales) {
      if (sale.state !== "counted") continue;
      for (const l of visible(sale)) {
        const key = String(l.user);
        const p = people.get(key) ?? {
          _id: key,
          name: l.userName,
          sales: { count: 0, amount: 0 },
          tl: { count: 0, amount: 0 },
          sm: { count: 0, amount: 0 },
          total: 0,
        };
        p[l.role].count++;
        p[l.role].amount += l.amount;
        p.total += l.amount;
        people.set(key, p);
      }
    }

    const count = (state: CommissionSaleState) => sales.filter((s) => s.state === state).length;
    const list = sales.map((s) => ({
      _id: String(s._id),
      studentName: s.studentName,
      enrollmentNumber: s.enrollmentNumber ?? "",
      invoiceNumber: s.invoiceNumber ?? "",
      courseName: s.courseName,
      closerName: s.closerName,
      teamName: s.teamName,
      saleDate: s.saleDate,
      approvedAt: s.approvedAt,
      state: s.state,
      reason: s.reason,
      lines: visible(s).map((l) => ({ role: l.role, user: String(l.user), userName: l.userName, amount: l.amount, note: l.note ?? "" })),
    }));

    return {
      month,
      scope,
      tlRule: TL_RULE,
      people: [...people.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
      sales: list,
      totals: {
        amount: [...people.values()].reduce((s, p) => s + p.total, 0),
        counted: count("counted"),
        waiting: count("waiting"),
        excluded: count("excluded"),
        reversed: count("reversed"),
      },
    };
  }

  /**
   * What a sale would earn if it were approved now — for the closing dialog,
   * before anything is saved. The same rules as a real sale, written nowhere.
   */
  async preview(input: { course: string; team?: string; closer?: string }) {
    const course = await Course.findById(input.course).select("name commission").lean();
    if (!course) throw Object.assign(new Error("Course not found"), { statusCode: 404 });
    const plan = planOf(course);
    const config = await loadConfig();
    const names = new Names();
    const resolved = await resolveSale({ closer: input.closer, saleTeam: input.team, plan }, config, names);
    const closer = input.closer ?? "";

    // On hold, the closer's own share is still worth showing — it is what they
    // earn once the hold is fixed.
    const closerLines =
      resolved.state === "counted"
        ? resolved.lines.filter((l) => String(l.user) === closer)
        : resolved.state === "waiting" && Types.ObjectId.isValid(closer)
          ? [{ role: "sales" as const, user: new Types.ObjectId(closer), userName: await names.of(closer), amount: plan.sales }]
          : [];

    return {
      courseName: course.name,
      plan,
      state: resolved.state,
      reason: resolved.reason,
      teamName: resolved.teamName,
      closerName: closer ? await names.of(closer) : "",
      closerTotal: closerLines.reduce((s, l) => s + l.amount, 0),
      lines: (resolved.state === "counted" ? resolved.lines : closerLines).map((l) => ({
        role: l.role,
        user: String(l.user),
        userName: l.userName,
        amount: l.amount,
        note: l.note ?? "",
      })),
    };
  }
}
