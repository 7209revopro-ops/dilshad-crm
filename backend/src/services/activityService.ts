import { Types } from "mongoose";
import type { Request } from "express";
import { LoginEvent } from "../models/LoginEvent.js";
import { UserPresence } from "../models/UserPresence.js";
import { ActivityDay } from "../models/ActivityDay.js";
import { IdleStretch } from "../models/IdleStretch.js";
import { User } from "../models/User.js";
import { Team } from "../models/Team.js";
import { getAppSettings, isWithinWorkingHours, type AppSettingsDTO } from "./settingsService.js";
import { notify, superAdminIds } from "./notificationService.js";
import {
  formatMinutes,
  localDayKey,
  startOfLocalDay,
  workingCutoff,
  workingMinutesBetween,
} from "../utils/workingHours.js";
import { clientIp, describeDevice } from "../utils/requestMeta.js";
import { buildPagination } from "../utils/response.js";
import type { LoginEventKind, LoginFailReason, PaginationMeta } from "../types/index.js";

/*
 * Who signed in, who is here, who has gone quiet.
 *
 *  • Sign-ins, refused sign-ins and sign-outs are recorded with IP and device.
 *  • The web app sends a heartbeat every minute it is open, saying whether
 *    anyone used it in that minute. That moves "last seen" / "last active"
 *    and counts active minutes per day.
 *  • Idle alerts (Settings, off by default): in working hours, someone who
 *    used the app today, has not signed out, and has done nothing in it for
 *    the limit gets one alert per quiet stretch — so do the super admins (and
 *    their team leaders, if switched on). Super admins are not tracked.
 */

/** A heartbeat comes every 60 s; none for 2½ minutes means the app was closed. */
const ONLINE_MS = 150_000;
/** Used the app in the last 2 minutes. */
const ACTIVE_MS = 120_000;
/** A heartbeat still in flight when someone signs out must not make them look back. */
const SIGN_OUT_SLACK_MS = 90_000;

export type PresenceStatus = "active" | "idle" | "away" | "signed_out" | "offline";

interface Person {
  id: string;
  name: string;
}

export interface PersonActivityDTO {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  role: string;
  superAdmin: boolean;
  teams: string[];
  status: PresenceStatus;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  /** Minutes since they last used the app, when that was today and they are not active now. */
  quietMinutes: number | null;
  /** An idle alert has gone out for the current quiet stretch. */
  alerted: boolean;
  activeMinutesToday: number;
  firstActiveToday: string | null;
  lastLogin: { at: string; ip: string; device: string } | null;
  lastLogoutAt: string | null;
}

export interface PeopleResponse {
  items: PersonActivityDTO[];
  summary: Record<PresenceStatus, number> & { alertsToday: number; failedSignInsToday: number };
  idleRule: { enabled: boolean; limitMinutes: number; notifyTeamLeaders: boolean; inWorkingHours: boolean; timezone: string };
}

export interface LoginEventDTO {
  id: string;
  kind: LoginEventKind;
  method: "password" | "sso" | null;
  reason: LoginFailReason | null;
  email: string;
  user: Person | null;
  ip: string;
  device: string;
  deviceType: string;
  createdAt: string;
}

export interface IdleStretchDTO {
  id: string;
  user: Person | null;
  since: string;
  alertedAt: string;
  endedAt: string | null;
  /** Working minutes without activity, to when they came back (or to now). */
  minutes: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Recording ────────────────────────────────────────────────────────────────

function requestMeta(req: Request) {
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);
  const device = describeDevice(userAgent);
  return { ip: clientIp(req), userAgent, device: device.label, deviceType: device.type };
}

/** A successful sign-in. Never throws: failing to write it down must not stop anyone signing in. */
export async function recordLogin(req: Request, user: { _id: unknown; email?: string }, method: "password" | "sso"): Promise<void> {
  try {
    const meta = requestMeta(req);
    await LoginEvent.create({ user: user._id, email: user.email ?? "", kind: "login", method, ...meta });
    await UserPresence.updateOne(
      { user: user._id },
      { $set: { lastLoginAt: new Date(), lastIp: meta.ip, lastDevice: meta.device } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[activity] could not record a sign-in:", err instanceof Error ? err.message : err);
  }
}

/** A refused sign-in — and whose account it was, when the email matched one. Server errors are not recorded. */
export async function recordLoginFailure(req: Request, email: string, error: unknown, method: "password" | "sso"): Promise<void> {
  try {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status !== 401 && status !== 403) return;
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("_id").lean<{ _id: Types.ObjectId } | null>();
    const reason: LoginFailReason =
      status === 403 ? "deactivated" : method === "sso" ? "no_account" : user ? "wrong_password" : "unknown_email";
    await LoginEvent.create({ user: user?._id ?? null, email, kind: "login_failed", method, reason, ...requestMeta(req) });
  } catch (err) {
    console.error("[activity] could not record a refused sign-in:", err instanceof Error ? err.message : err);
  }
}

export async function recordLogout(req: Request, userId: string): Promise<void> {
  const user = await User.findById(userId).select("email").lean<{ email?: string } | null>();
  await LoginEvent.create({ user: userId, email: user?.email ?? "", kind: "logout", method: null, ...requestMeta(req) });
  await UserPresence.updateOne({ user: userId }, { $set: { lastLogoutAt: new Date() } }, { upsert: true });
}

/**
 * The web app's minute-by-minute heartbeat. `active`: someone used the app in
 * the last minute. Counts one active minute per clock minute, however many
 * tabs are open, and ends an alerted idle stretch.
 */
export async function recordHeartbeat(userId: string, active: boolean, now: Date = new Date()): Promise<void> {
  const user = new Types.ObjectId(userId);
  // $max: these only move forward, even if two servers' clocks disagree by a second.
  await UserPresence.updateOne(
    { user },
    { $max: active ? { lastSeenAt: now, lastActiveAt: now } : { lastSeenAt: now } },
    { upsert: true }
  );
  if (!active) return;

  const settings = await getAppSettings();
  const day = localDayKey(settings.workingHours.timezone, now);
  const minute = Math.floor(now.getTime() / 60_000);
  const counted = await ActivityDay.updateOne(
    { user, day, lastMinute: { $lt: minute } },
    { $inc: { activeMinutes: 1 }, $set: { lastMinute: minute, lastActiveAt: now } }
  );
  if (!counted.matchedCount) {
    // The day's first active minute — or another tab already counted this one.
    try {
      await ActivityDay.create({ user, day, activeMinutes: 1, firstActiveAt: now, lastActiveAt: now, lastMinute: minute });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  await IdleStretch.updateMany({ user, endedAt: null }, { $set: { endedAt: now } });
}

// ─── Reading ──────────────────────────────────────────────────────────────────

interface PresenceRow {
  user: Types.ObjectId;
  lastSeenAt: Date | null;
  lastActiveAt: Date | null;
  lastLoginAt: Date | null;
  lastLogoutAt: Date | null;
  lastIp: string;
  lastDevice: string;
  idleAlertedAt: Date | null;
}

function statusOf(p: PresenceRow | undefined, now: Date, dayStart: Date): PresenceStatus {
  if (!p) return "offline";
  const t = now.getTime();
  const seen = p.lastSeenAt?.getTime() ?? 0;
  const active = p.lastActiveAt?.getTime() ?? 0;
  const login = p.lastLoginAt?.getTime() ?? 0;
  const logout = p.lastLogoutAt?.getTime() ?? 0;
  if (logout && logout >= login && logout >= seen - SIGN_OUT_SLACK_MS) {
    return logout >= dayStart.getTime() ? "signed_out" : "offline";
  }
  if (active >= t - ACTIVE_MS) return "active";
  if (seen >= t - ONLINE_MS) return "idle";
  if (seen >= dayStart.getTime()) return "away";
  return "offline";
}

const STATUS_ORDER: PresenceStatus[] = ["active", "idle", "away", "signed_out", "offline"];

/** Everyone active in the CRM with where they are now and how their day has gone. */
export async function listPeople(q: { search?: string; teamId?: string }, now: Date = new Date()): Promise<PeopleResponse> {
  const settings = await getAppSettings();
  const tz = settings.workingHours.timezone;
  const dayStart = startOfLocalDay(tz, now);
  const day = localDayKey(tz, now);

  const filter: Record<string, unknown> = { status: { $ne: "inactive" } };
  if (q.teamId) {
    const team = await Team.findById(q.teamId).select("leaders members").lean();
    filter._id = { $in: team ? [...team.leaders, ...team.members] : [] };
  }
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const users = await User.find(filter)
    .select("name email designation role")
    .populate("role", "roleName isSystemRole")
    .lean<Array<{ _id: Types.ObjectId; name: string; email: string; designation?: string; role?: { roleName?: string; isSystemRole?: boolean } | null }>>();
  const ids = users.map((u) => u._id);

  const [presence, days, teams, alertsToday, failedSignInsToday] = await Promise.all([
    UserPresence.find({ user: { $in: ids } }).lean<PresenceRow[]>(),
    ActivityDay.find({ user: { $in: ids }, day }).lean<Array<{ user: Types.ObjectId; activeMinutes: number; firstActiveAt: Date | null }>>(),
    Team.find({ $or: [{ members: { $in: ids } }, { leaders: { $in: ids } }] })
      .select("name members leaders")
      .lean<Array<{ name: string; members: Types.ObjectId[]; leaders: Types.ObjectId[] }>>(),
    IdleStretch.countDocuments({ alertedAt: { $gte: dayStart } }),
    LoginEvent.countDocuments({ kind: "login_failed", createdAt: { $gte: dayStart } }),
  ]);
  const presenceOf = new Map(presence.map((p) => [String(p.user), p]));
  const dayOf = new Map(days.map((d) => [String(d.user), d]));
  const teamsOf = new Map<string, string[]>();
  for (const t of teams) {
    for (const m of [...t.leaders, ...t.members].map(String)) {
      const list = teamsOf.get(m) ?? [];
      if (!list.includes(t.name)) list.push(t.name);
      teamsOf.set(m, list);
    }
  }

  const items: PersonActivityDTO[] = users.map((u) => {
    const id = String(u._id);
    const p = presenceOf.get(id);
    const d = dayOf.get(id);
    const status = statusOf(p, now, dayStart);
    const activeToday = p?.lastActiveAt && p.lastActiveAt >= dayStart;
    return {
      id,
      name: u.name,
      email: u.email,
      designation: u.designation ?? null,
      role: u.role?.roleName ?? "",
      superAdmin: Boolean(u.role?.isSystemRole && u.role.roleName === "Super Admin"),
      teams: teamsOf.get(id) ?? [],
      status,
      lastSeenAt: p?.lastSeenAt ? p.lastSeenAt.toISOString() : null,
      lastActiveAt: p?.lastActiveAt ? p.lastActiveAt.toISOString() : null,
      quietMinutes:
        status !== "active" && activeToday && p?.lastActiveAt
          ? Math.floor((now.getTime() - p.lastActiveAt.getTime()) / 60_000)
          : null,
      alerted: Boolean(p?.idleAlertedAt && p.lastActiveAt && p.idleAlertedAt >= p.lastActiveAt),
      activeMinutesToday: d?.activeMinutes ?? 0,
      firstActiveToday: d?.firstActiveAt ? new Date(d.firstActiveAt).toISOString() : null,
      lastLogin: p?.lastLoginAt ? { at: p.lastLoginAt.toISOString(), ip: p.lastIp, device: p.lastDevice } : null,
      lastLogoutAt: p?.lastLogoutAt ? p.lastLogoutAt.toISOString() : null,
    };
  });
  items.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));

  const summary = { active: 0, idle: 0, away: 0, signed_out: 0, offline: 0, alertsToday, failedSignInsToday };
  for (const i of items) summary[i.status]++;

  return {
    items,
    summary,
    idleRule: {
      enabled: settings.idleAlerts.enabled,
      limitMinutes: settings.idleAlerts.limitMinutes,
      notifyTeamLeaders: settings.idleAlerts.notifyTeamLeaders,
      inWorkingHours: isWithinWorkingHours(settings, now),
      timezone: tz,
    },
  };
}

type Ref = { _id: Types.ObjectId; name: string } | null;
const person = (r: Ref): Person | null => (r ? { id: String(r._id), name: r.name } : null);

/** Sign-ins, refused sign-ins and sign-outs, newest first. */
export async function listLoginEvents(q: {
  page: number;
  limit: number;
  userId?: string;
  kind?: LoginEventKind;
  from?: Date;
  to?: Date;
}): Promise<{ items: LoginEventDTO[]; pagination: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (q.userId) filter.user = new Types.ObjectId(q.userId);
  if (q.kind) filter.kind = q.kind;
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) range.$lte = q.to;
    filter.createdAt = range;
  }
  const [rows, total] = await Promise.all([
    LoginEvent.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate("user", "name")
      .lean<
        Array<{
          _id: Types.ObjectId;
          kind: LoginEventKind;
          method: "password" | "sso" | null;
          reason: LoginFailReason | null;
          email: string;
          user: Ref;
          ip: string;
          device: string;
          deviceType: string;
          createdAt: Date;
        }>
      >(),
    LoginEvent.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      kind: r.kind,
      method: r.method,
      reason: r.reason,
      email: r.email,
      user: person(r.user),
      ip: r.ip,
      device: r.device,
      deviceType: r.deviceType,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    pagination: buildPagination(total, q.page, q.limit),
  };
}

/** Idle alerts that went out, newest first — with how long each person stayed away. */
export async function listIdleStretches(
  q: { page: number; limit: number; userId?: string },
  now: Date = new Date()
): Promise<{ items: IdleStretchDTO[]; pagination: PaginationMeta }> {
  const settings = await getAppSettings();
  const filter: Record<string, unknown> = {};
  if (q.userId) filter.user = new Types.ObjectId(q.userId);
  const [rows, total] = await Promise.all([
    IdleStretch.find(filter)
      .sort({ alertedAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate("user", "name")
      .lean<Array<{ _id: Types.ObjectId; user: Ref; since: Date; alertedAt: Date; endedAt: Date | null }>>(),
    IdleStretch.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => ({
      id: String(r._id),
      user: person(r.user),
      since: new Date(r.since).toISOString(),
      alertedAt: new Date(r.alertedAt).toISOString(),
      endedAt: r.endedAt ? new Date(r.endedAt).toISOString() : null,
      minutes: Math.floor(workingMinutesBetween(settings.workingHours, new Date(r.since), r.endedAt ? new Date(r.endedAt) : now)),
    })),
    pagination: buildPagination(total, q.page, q.limit),
  };
}

// ─── Idle alerts ──────────────────────────────────────────────────────────────

interface IdlePerson extends Person {
  since: Date;
  minutes: number;
}

async function notifyIdle(people: IdlePerson[], admins: string[], toTeamLeaders: boolean, settings: AppSettingsDTO): Promise<void> {
  if (!people.length) return;
  const tz = settings.workingHours.timezone;
  const at = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const line = (p: IdlePerson) => `${p.name} — no activity since ${at(p.since)} (${formatMinutes(p.minutes)})`;
  const tasks: Array<Promise<void>> = [];

  for (const p of people) {
    tasks.push(
      notify({
        userIds: [p.id],
        type: "idle_self",
        title: "Still there?",
        body: `No activity from you in Remote CRM since ${at(p.since)} — ${formatMinutes(p.minutes)} of working time. Your super admin has been told.`,
        url: "/dashboard",
        tag: `idle-self-${p.id}`,
        email: {
          setting: "idleAlerts",
          subject: "No activity in Remote CRM",
          heading: "Are you still there?",
          paragraphs: [
            `There has been no activity from you in Remote CRM since ${at(p.since)} — ${formatMinutes(p.minutes)} of working time.`,
            "Your super admin has been told. If you are working on something outside the CRM, let them know.",
          ],
          actionLabel: "Open Remote CRM",
        },
      })
    );
  }

  const summary = (list: IdlePerson[]) =>
    list.length <= 3 ? list.map(line).join(" · ") : `${list.slice(0, 3).map(line).join(" · ")} and ${list.length - 3} more`;
  const titleFor = (list: IdlePerson[]) => (list.length === 1 ? `${list[0].name} is idle` : `${list.length} people are idle`);

  if (admins.length) {
    tasks.push(
      notify({
        userIds: admins,
        type: "idle_alert",
        title: titleFor(people),
        body: summary(people),
        url: "/activity",
        tag: "idle-alert",
        email: {
          setting: "idleAlerts",
          subject: titleFor(people),
          paragraphs: ["No activity in Remote CRM during working hours:", ...people.map((p) => `• ${line(p)}`)],
          actionLabel: "Open Activity",
        },
      })
    );
  }

  if (toTeamLeaders) {
    // Each leader hears about their own team members only — and a super admin already heard.
    const teams = await Team.find({ members: { $in: people.map((p) => new Types.ObjectId(p.id)) } })
      .select("leaders members")
      .lean<Array<{ leaders: Types.ObjectId[]; members: Types.ObjectId[] }>>();
    const byLeader = new Map<string, IdlePerson[]>();
    for (const t of teams) {
      const members = new Set(t.members.map(String));
      for (const leader of t.leaders.map(String)) {
        if (admins.includes(leader)) continue;
        const list = byLeader.get(leader) ?? [];
        for (const p of people) {
          if (p.id !== leader && members.has(p.id) && !list.includes(p)) list.push(p);
        }
        if (list.length) byLeader.set(leader, list);
      }
    }
    for (const [leader, list] of byLeader) {
      tasks.push(
        notify({
          userIds: [leader],
          type: "idle_alert",
          title: titleFor(list),
          body: summary(list),
          url: "/teams",
          tag: `idle-alert-team-${leader}`,
          email: {
            setting: "idleAlerts",
            subject: titleFor(list),
            paragraphs: ["No activity in Remote CRM during working hours from your team:", ...list.map((p) => `• ${line(p)}`)],
          },
        })
      );
    }
  }

  await Promise.allSettled(tasks);
}

/**
 * One pass of the idle alerts (every minute): in working hours, with the
 * switch on, everyone who used the app today, has not signed out since and
 * has done nothing in it for the limit (working time) — once per quiet stretch.
 */
export async function sweepIdleUsers(now: Date = new Date()): Promise<{ alerted: number; idle?: "off" | "outside working hours" }> {
  const settings = await getAppSettings();
  const { enabled, limitMinutes, notifyTeamLeaders } = settings.idleAlerts;
  if (!enabled) return { alerted: 0, idle: "off" };
  if (!isWithinWorkingHours(settings, now)) return { alerted: 0, idle: "outside working hours" };

  const cutoff = workingCutoff(settings.workingHours, now, limitMinutes);
  const dayStart = startOfLocalDay(settings.workingHours.timezone, now);
  if (cutoff < dayStart) return { alerted: 0 };

  const candidates = await UserPresence.find({
    lastActiveAt: { $gte: dayStart, $lte: cutoff },
    $expr: {
      $and: [
        { $not: [{ $gte: ["$idleAlertedAt", "$lastActiveAt"] }] },
        { $not: [{ $gte: ["$lastLogoutAt", "$lastActiveAt"] }] },
      ],
    },
  })
    .limit(500)
    .lean<Array<{ _id: Types.ObjectId; user: Types.ObjectId; lastActiveAt: Date }>>();
  if (!candidates.length) return { alerted: 0 };

  const admins = await superAdminIds();
  const users = await User.find({ _id: { $in: candidates.map((c) => c.user) }, status: { $ne: "inactive" } })
    .select("name")
    .lean<Array<{ _id: Types.ObjectId; name: string }>>();
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));

  const alerted: IdlePerson[] = [];
  for (const c of candidates) {
    const id = String(c.user);
    if (!nameOf.has(id) || admins.includes(id)) continue;
    // Only if they have not come back meanwhile.
    const res = await UserPresence.updateOne({ _id: c._id, lastActiveAt: c.lastActiveAt }, { $set: { idleAlertedAt: now } });
    if (!res.modifiedCount) continue;
    await IdleStretch.create({ user: c.user, since: c.lastActiveAt, alertedAt: now });
    alerted.push({ id, name: nameOf.get(id)!, since: c.lastActiveAt, minutes: workingMinutesBetween(settings.workingHours, c.lastActiveAt, now) });
  }

  await notifyIdle(alerted, admins, notifyTeamLeaders, settings);
  if (alerted.length) console.log(`[idleAlerts] alerted ${alerted.length}`);
  return { alerted: alerted.length };
}
