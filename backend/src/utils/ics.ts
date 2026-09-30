/**
 * A calendar invite (iCalendar, RFC 5545) for one meeting and one recipient —
 * what Gmail, Outlook and Apple Calendar turn into "add to calendar".
 *
 * One file per person: each lists only its recipient as the attendee, so a
 * client's address is never shown to a mentor or the other way round. The UID
 * stays the same for the life of the meeting and SEQUENCE goes up with every
 * change, which is how a calendar knows an update or a cancellation replaces
 * the invite it already has.
 */

export interface IcsPerson {
  name: string;
  email: string;
}

export interface IcsEvent {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: Date;
  end: Date;
  title: string;
  description?: string;
  /** A place, or the joining link when it is not a web address. */
  location?: string;
  url?: string;
  organizer: IcsPerson;
  attendee?: IcsPerson;
  /** Minutes before the start for the calendar's own reminder; 0 or absent for none. */
  alarmMinutes?: number;
  stamp?: Date;
}

/** 20261001T060000Z */
const utc = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** TEXT values: backslash, semicolon and comma escaped, newlines as \n. */
const text = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A parameter value (CN=…): quoted, with the characters a quoted value may not hold removed. */
const param = (s: string): string => `"${s.replace(/["\r\n]/g, "").trim()}"`;

/** Lines are at most 75 octets; longer ones continue on the next line after a space. UTF-8 safe. */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch, "utf8");
    const limit = out.length ? 74 : 75; // a continuation line starts with one space
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(e: IcsEvent): string {
  const cancelled = e.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Remote CRM//Meetings//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${utc(e.stamp ?? new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${text(cancelled ? `Cancelled: ${e.title}` : e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${text(e.description)}`);
  if (e.location) lines.push(`LOCATION:${text(e.location)}`);
  if (e.url) lines.push(`URL:${e.url.replace(/[\r\n]/g, "")}`);
  lines.push(`ORGANIZER;CN=${param(e.organizer.name)}:mailto:${e.organizer.email}`);
  if (e.attendee) {
    lines.push(
      `ATTENDEE;CN=${param(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${e.attendee.email}`
    );
  }
  lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`);
  if (!cancelled && e.alarmMinutes && e.alarmMinutes > 0) {
    lines.push("BEGIN:VALARM", `TRIGGER:-PT${Math.round(e.alarmMinutes)}M`, "ACTION:DISPLAY", `DESCRIPTION:${text(e.title)}`, "END:VALARM");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
