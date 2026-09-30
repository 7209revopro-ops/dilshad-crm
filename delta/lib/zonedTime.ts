/**
 * Calendar maths in one time zone — the CRM's working-hours zone — whatever
 * the browser's own zone is, so "10:00" means the same moment to everyone.
 *
 * Days are handled as keys ("2026-10-01"): plain calendar dates with no time
 * and no zone. Instants are turned into keys and minutes in the zone, and
 * back, with Intl — no library.
 */

export interface ZonedParts {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = n("year");
  const m = n("month");
  const d = n("day");
  return { y, m, d, hour: n("hour") % 24, minute: n("minute"), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-01" — the date of `date` in the zone. */
export function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

const keyToUtcMidnight = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(key: string, n: number): string {
  const t = new Date(keyToUtcMidnight(key) + n * 864e5);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday */
export const weekdayOf = (key: string) => new Date(keyToUtcMidnight(key)).getUTCDay();

/** The Monday on or before `key`. */
export const startOfWeek = (key: string) => addDays(key, -((weekdayOf(key) + 6) % 7));

/** The 42 days (six Monday-first weeks) a month view shows around `key`'s month. */
export function monthGrid(key: string): string[] {
  const first = `${key.slice(0, 7)}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** The instant a day key and minute of that day happen in the zone. */
export function zonedToUtc(key: string, minuteOfDay: number, timeZone: string): Date {
  const local = keyToUtcMidnight(key) + minuteOfDay * 60_000;
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), timeZone);
    return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Math.floor(t / 60_000) * 60_000;
  };
  const guess = local - offsetAt(local);
  return new Date(local - offsetAt(guess));
}

/** Minutes since the zone's midnight. */
export function minuteOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** "10:30" */
export const clockText = (date: Date, timeZone: string) =>
  date.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });

/** "Wed 1 Oct" */
export const dayText = (key: string, withYear = false) =>
  new Date(keyToUtcMidnight(key)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });

/** "October 2026" */
export const monthText = (key: string) =>
  new Date(keyToUtcMidnight(key)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

/** "HH:MM" → minutes */
export const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const minutesToHhmm = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;

/** "Dubai" from "Asia/Dubai" */
export const zoneName = (timeZone: string) => timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
