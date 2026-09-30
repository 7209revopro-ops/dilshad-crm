import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

/**
 * Email, from the mailbox in SMTP_* (see config/env.ts).
 *
 * With SMTP_HOST unset nothing is sent: each message is written to the log
 * instead, and the caller is told it was not sent. Sending never throws — an
 * email is a courtesy on top of something that has already happened (a lead
 * moved, a meeting booked), and a mail server having a bad minute must not
 * undo it.
 */

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/** A calendar invite, sent the way mail clients show an "add to calendar" card for it. */
export interface MailCalendarInvite {
  method: "REQUEST" | "CANCEL";
  /** The .ics text (utils/ics.ts). */
  content: string;
  filename?: string;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative. Derived from the HTML when omitted. */
  text?: string;
  attachments?: MailAttachment[];
  icalEvent?: MailCalendarInvite;
}

export interface MailResult {
  sent: boolean;
  /** Why not, when it was not: "not configured", "no recipient", or the server's error. */
  reason?: string;
}

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === "true",
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h\d|\/tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const to = (Array.isArray(message.to) ? message.to : [message.to]).map((t) => t.trim()).filter(Boolean);
  if (!to.length) return { sent: false, reason: "no recipient" };

  if (!isMailConfigured()) {
    const invite = message.icalEvent ? ` (+ calendar ${message.icalEvent.method.toLowerCase()})` : "";
    console.log(`✉️  [mail dry-run] SMTP not configured — would email ${to.join(", ")}: "${message.subject}"${invite}`);
    return { sent: false, reason: "not configured" };
  }

  try {
    await getTransporter().sendMail({
      from: env.MAIL_FROM,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? htmlToText(message.html),
      attachments: message.attachments,
      icalEvent: message.icalEvent
        ? { method: message.icalEvent.method, content: message.icalEvent.content, filename: message.icalEvent.filename ?? "invite.ics" }
        : undefined,
    });
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`✉️  Email to ${to.join(", ")} failed — ${reason}`);
    return { sent: false, reason };
  }
}

// ── Template ─────────────────────────────────────────────────────────────────

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface EmailContent {
  heading: string;
  /** Plain text, one paragraph each — escaped here, so they may hold anything. */
  paragraphs: string[];
  /** A button to the right page in the CRM. `url` may be a path; it is resolved against CLIENT_URL. */
  action?: { label: string; url: string };
}

/**
 * Every Remote CRM email looks the same: the name, a heading, a few lines and
 * at most one button. Inline styles only — mail clients strip everything else.
 */
export function renderEmail({ heading, paragraphs, action }: EmailContent): string {
  const href = action
    ? /^https?:\/\//.test(action.url)
      ? action.url
      : `${env.CLIENT_URL.replace(/\/+$/, "")}/${action.url.replace(/^\/+/, "")}`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0a0a0a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:#7c3aed;padding:18px 24px;color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.01em">Remote CRM</td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#404040">${escapeHtml(p)}</p>`).join("\n      ")}
      ${action ? `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:999px">${escapeHtml(action.label)}</a></p>` : ""}
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #eeeeee;font-size:11px;color:#8a8a8a">Sent by Remote CRM. You get this because of your role in the CRM.</td></tr>
  </table>
</body></html>`;
}
