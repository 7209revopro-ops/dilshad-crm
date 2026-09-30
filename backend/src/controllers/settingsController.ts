import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/index.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { getAppSettings, updateAppSettings } from "../services/settingsService.js";
import { isMailConfigured, renderEmail, sendMail } from "../services/mailService.js";
import { updateAppSettingsSchema } from "../validations/settingsValidation.js";
import { sendSuccess, sendError } from "../utils/response.js";

/** What the page shows about the mailbox — never the credentials, only whether there is one. */
const mailStatus = () => ({ configured: isMailConfigured(), from: env.MAIL_FROM });

// GET /api/v1/settings/app
export async function getAppSettingsHandler(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, "Settings", { settings: await getAppSettings(), mail: mailStatus() });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/settings/app
export async function updateAppSettingsHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateAppSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    const settings = await updateAppSettings(parsed.data, req.user!.userId);
    sendSuccess(res, "Settings saved", { settings, mail: mailStatus() });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/settings/app/test-email — to the signed-in user, to prove the mailbox works.
export async function sendTestEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const me = await User.findById(req.user!.userId).select("name email").lean<{ name?: string; email?: string } | null>();
    if (!me?.email) {
      sendError(res, "Your account has no email address to send to", 400);
      return;
    }
    const result = await sendMail({
      to: me.email,
      subject: "Remote CRM test email",
      html: renderEmail({
        heading: "Your mailbox is working",
        paragraphs: [
          `Hi ${me.name ?? "there"},`,
          "This is a test from Remote CRM's Settings page. Lead, idle and meeting emails will come from this mailbox.",
        ],
        action: { label: "Open Remote CRM", url: "/dashboard" },
      }),
    });
    sendSuccess(res, result.sent ? "Test email sent" : "Test email not sent", { ...result, to: me.email });
  } catch (err) {
    next(err);
  }
}
