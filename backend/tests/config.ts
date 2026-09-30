/**
 * Test Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * Central config for all API tests.
 *
 * These tests drive a running backend over HTTP and create real records, so
 * which server they point at matters more than anything else here. Both the
 * address and the credentials come from the environment, and the address must
 * be local unless you say otherwise in as many words — an earlier version of
 * this file hardcoded `localhost:5001`, which on a developer machine is
 * ordinarily the dev server, configured against the production database.
 *
 *   CRM_TEST_BASE_URL   default http://localhost:7868/api/v1
 *   CRM_TEST_EMAIL      required — an account that can manage users and teams
 *   CRM_TEST_PASSWORD   required
 *   CRM_TEST_ALLOW_REMOTE=1   to aim at something that is not localhost
 *
 * Everything the suite creates is prefixed [TEST] and removed afterwards.
 */

export const BASE_URL = process.env.CRM_TEST_BASE_URL ?? "http://localhost:7868/api/v1";

export const TIMEOUT_MS = 10_000;

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(BASE_URL);
if (!isLocal && process.env.CRM_TEST_ALLOW_REMOTE !== "1") {
  throw new Error(
    `Refusing to run against ${BASE_URL}: it is not localhost, and this suite creates and deletes ` +
      `teams, leads and users. Set CRM_TEST_ALLOW_REMOTE=1 if you really mean it.`,
  );
}

/**
 * The account the suite signs in as. Never defaulted: a password with a default
 * is a password in the repository, and the one that used to be here was the
 * live super admin's.
 */
export const ADMIN = {
  email: process.env.CRM_TEST_EMAIL ?? "",
  password: process.env.CRM_TEST_PASSWORD ?? "",
};

if (!ADMIN.email || !ADMIN.password) {
  throw new Error(
    "CRM_TEST_EMAIL and CRM_TEST_PASSWORD must be set. They are the account the suite signs in " +
      "as, and it needs to manage users, teams and leads.",
  );
}

/** Prefix for all test-created data — makes cleanup safe and obvious in the DB. */
export const TEST_PREFIX = "[TEST]";
