/**
 * WhatsApp Cloud API service (Creatyvot proxy → Meta Cloud API)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends the "welcome" template to a lead instantly after creation.
 *
 * Rules baked in:
 *  • Template-first: first contact MUST be an approved template (Meta rule).
 *  • Fire-and-forget: sending never blocks or fails lead creation.
 *  • One send per lead: callers must check lead.whatsappWelcome before calling;
 *    sendWelcomeToLead also re-checks and stamps the result on the lead.
 *  • Disabled unless WHATSAPP_WELCOME_ENABLED=true and the key is configured.
 *
 * Env (backend/.env — server-side only):
 *  WHATSAPP_BASE_URL=https://connect.creatyvot.com/v25.0
 *  WHATSAPP_API_KEY=wc_xxxxxxxxxxxxxxxx
 *  WHATSAPP_PHONE_NUMBER_ID=387898334402613
 *  WHATSAPP_WABA_ID=317812634748701
 *  WHATSAPP_TEMPLATE_NAME=delta_enquiry_received   (hello_world for testing)
 *  WHATSAPP_TEMPLATE_LANG=en_US
 *  WHATSAPP_DEFAULT_COUNTRY_CODE=971
 *  WHATSAPP_WELCOME_ENABLED=true
 */

import { Lead } from "../models/Lead.js";

type WhatsAppResult =
  | { ok: true; messageId: string; raw: unknown }
  | { ok: false; error: string; code?: number; raw?: unknown };

function cfg() {
  return {
    baseUrl: process.env.WHATSAPP_BASE_URL ?? "",
    apiKey: process.env.WHATSAPP_API_KEY ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? "",
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG ?? "en_US",
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "971",
    enabled: process.env.WHATSAPP_WELCOME_ENABLED === "true",
  };
}

export function isWelcomeEnabled(): boolean {
  const c = cfg();
  return c.enabled && !!c.baseUrl && !!c.apiKey && !!c.phoneNumberId && !!c.templateName;
}

/**
 * Normalize a phone to E.164 digits without "+".
 * "p:+971 50 752 8009" → "971507528009"; "0501234567" → "971501234567".
 */
export function toE164(raw: string, defaultCountryCode?: string): string {
  let s = String(raw ?? "").trim();
  if (s.toLowerCase().startsWith("p:")) s = s.slice(2);
  let digits = s.replace(/\D/g, "");
  if (digits.length < 7) return "";
  const cc = defaultCountryCode ?? cfg().defaultCountryCode;
  if (cc) {
    if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
    // Heuristic: numbers without any country code are local (≤10 digits)
    if (digits.length <= 10 && !digits.startsWith(cc)) {
      digits = cc + digits;
    }
  }
  return digits;
}

async function post(body: Record<string, unknown>): Promise<WhatsAppResult> {
  const c = cfg();
  try {
    const res = await fetch(`${c.baseUrl}/${c.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
      messages?: { id?: string }[];
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message || `HTTP ${res.status}`,
        code: data?.error?.code,
        raw: data,
      };
    }
    return { ok: true, messageId: data?.messages?.[0]?.id ?? "", raw: data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Send an approved template (first contact). bodyParams fill {{1}}, {{2}}, … */
export function sendTemplate(opts: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams?: string[];
}): Promise<WhatsAppResult> {
  const components =
    opts.bodyParams && opts.bodyParams.length
      ? [
          {
            type: "body",
            parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
          },
        ]
      : [];
  return post({
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      ...(components.length ? { components } : {}),
    },
  });
}

/** Free-form text — ONLY valid inside the 24h window after the user replied. */
export function sendText(opts: { to: string; body: string }): Promise<WhatsAppResult> {
  return post({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.to,
    type: "text",
    text: { body: opts.body },
  });
}

/**
 * Send the welcome template to a freshly created lead and stamp the outcome
 * on the lead (whatsappWelcome) + activity log. Fire-and-forget safe:
 * swallows every error. Never sends twice for the same lead.
 */
export async function sendWelcomeToLead(leadId: string): Promise<void> {
  try {
    if (!isWelcomeEnabled()) return;

    const lead = await Lead.findById(leadId).select(
      "name phone whatsappWelcome reporter",
    );
    if (!lead) return;
    if ((lead as unknown as { whatsappWelcome?: { status?: string } }).whatsappWelcome?.status) {
      return; // already attempted — never re-send automatically
    }

    const c = cfg();
    const to = toE164(lead.phone ?? "");
    const firstName = String(lead.name ?? "").trim().split(/\s+/)[0] || "there";

    if (!to) {
      await Lead.updateOne(
        { _id: lead._id },
        { $set: { whatsappWelcome: { status: "skipped", error: "unparseable phone", sentAt: new Date() } } },
      );
      return;
    }

    // WHATSAPP_TEMPLATE_VARS controls body variables:
    //   "name" (default) → {{1}} = lead's first name
    //   "none"           → template has no variables (hello_world, v3, …)
    const varMode = process.env.WHATSAPP_TEMPLATE_VARS ?? "name";
    const bodyParams =
      c.templateName === "hello_world" || varMode === "none" ? [] : [firstName];

    const result = await sendTemplate({
      to,
      templateName: c.templateName,
      languageCode: c.templateLang,
      bodyParams,
    });

    const stamp = result.ok
      ? { status: "sent", messageId: result.messageId, sentAt: new Date() }
      : { status: "failed", error: result.error.slice(0, 300), sentAt: new Date() };

    await Lead.updateOne(
      { _id: lead._id },
      {
        $set: { whatsappWelcome: stamp },
        $push: {
          activityLogs: {
            action: "whatsapp_welcome",
            description: result.ok
              ? `WhatsApp welcome sent (template: ${c.templateName})`
              : `WhatsApp welcome FAILED: ${result.error.slice(0, 150)}`,
            performedBy: (lead as unknown as { reporter?: unknown }).reporter,
            createdAt: new Date(),
          },
        },
      },
    );

    if (!result.ok) {
      console.error(`[whatsapp] welcome failed for lead ${leadId}: ${result.error}`);
    }
  } catch (err) {
    console.error("[whatsapp] sendWelcomeToLead error:", err);
  }
}
