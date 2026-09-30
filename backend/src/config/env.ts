import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("7868"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  /* The shared secret the Root portal presents when it asks this CRM about
     its roles or its people. Unset means those endpoints are off, rather
     than open — a deployment that has not been told about the portal must
     not expose its whole user list by default. Must match the portal's
     DELTA_SSO_SECRET. */
  ROOT_ERP_SECRET: z.string().default(""),
  SUPER_ADMIN_NAME: z.string().default("Super Admin"),
  SUPER_ADMIN_EMAIL: z.string().email().default("superadmin@crm.com"),
  SUPER_ADMIN_PASSWORD: z.string().default("SuperAdmin@123"),
  CLIENT_URL: z.string().default("http://localhost:3000"),

  /**
   * Whether this process runs the timed jobs.
   *
   * They act on real records: the split scheduler assigns unassigned leads to
   * people, the follow-up warner and reminder scheduler notify them, the backup
   * scheduler ships an archive. A second process against the same database does
   * all of it a second time — which is what happens the moment somebody points
   * a local copy at production to look at real data. Set false there; the API
   * still serves every request, it simply is not the one on the clock.
   *
   * The finance handover worker is deliberately outside this. It is what a
   * local copy is usually pointed at production to test, and finance is
   * idempotent on the CRM's own id, so a second one cannot double-bill.
   */
  RUN_SCHEDULERS: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  VAPID_PUBLIC_KEY:    z.string().default(""),
  VAPID_PRIVATE_KEY:   z.string().default(""),
  VAPID_SUBJECT:       z.string().default("mailto:admin@carltoncrm.com"),
  GEMINI_API_KEY:      z.string().default(""),
  TELEGRAM_BOT_TOKEN:  z.string().default(""),
  TELEGRAM_CHAT_ID:    z.string().default(""),

  /*
   * Delta Finance, where a closed lead becomes an invoice.
   *
   * All four empty means the handover is off: the CRM works exactly as it did,
   * students are created, and nothing is queued. A half-configured integration
   * is the dangerous state — it would queue enrolments nobody is delivering —
   * so it is on only when every field is set.
   */
  FINANCE_API_URL:            z.string().default(""),
  FINANCE_CLIENT_ID:          z.string().default(""),
  FINANCE_INTEGRATION_SECRET: z.string().default(""),
  /** Which organization in finance these enrolments belong to. */
  FINANCE_ORG_ID:             z.string().default(""),

  /*
   * The Delta LMS, where mentors keep their availability and their classes.
   *
   * Unset means the mentor calendar is simply not offered — no tab, no route
   * that answers — rather than a screen that is there and fails. The secret
   * is the CRM's own; it is not the Root portal's SALES_CRM secret reused
   * anywhere, and the LMS was built to accept both without either being able
   * to impersonate the other.
   */
  LMS_API_URL:      z.string().default(""),
  LMS_SERVICE_SECRET: z.string().default(""),
  /** Which academy's mentors this CRM should see. Required once the URL and
      secret are set — the LMS refuses to guess among more than one. */
  LMS_REMOTE_ORG_ID: z.string().default(""),

  /**
   * Object storage for payment receipts.
   *
   * Deliberately the same bucket finance uses, with the same variable names.
   * A receipt taken at the close has to end up attached to the invoice an
   * approver is looking at, and one bucket means one object: the CRM writes
   * it, the handover passes the key, and finance points at the same file
   * rather than being sent a second copy of it.
   *
   * Unset, a receipt cannot be taken and closing says so rather than losing
   * the file quietly.
   */
  R2_ACCOUNT_ID:        z.string().default(""),
  R2_ACCESS_KEY_ID:     z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET_NAME:       z.string().default(""),
  R2_PUBLIC_URL:        z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
