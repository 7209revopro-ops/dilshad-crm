import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM, e.g. 09:00");

const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * A partial update of the CRM's settings: send only what changed.
 * Limits are in minutes — the page converts from hours and minutes.
 */
export const updateAppSettingsSchema = z
  .object({
    inactiveLeads: z
      .object({
        autoReassign: z.boolean().optional(),
        limitMinutes: z.number().int().min(5, "At least 5 minutes").max(7 * 24 * 60, "At most 7 days").optional(),
      })
      .strict()
      .optional(),
    idleAlerts: z
      .object({
        enabled: z.boolean().optional(),
        limitMinutes: z.number().int().min(5, "At least 5 minutes").max(24 * 60, "At most 24 hours").optional(),
        notifyTeamLeaders: z.boolean().optional(),
      })
      .strict()
      .optional(),
    workingHours: z
      .object({
        timezone: z.string().refine(isTimeZone, "Unknown time zone").optional(),
        days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day").max(7).optional(),
        start: hhmm.optional(),
        end: hhmm.optional(),
      })
      .strict()
      .optional(),
    email: z
      .object({
        inactiveLeads: z.boolean().optional(),
        idleAlerts: z.boolean().optional(),
        meetings: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;
