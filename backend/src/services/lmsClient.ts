import { env } from "../config/env.js";

/**
 * Calling the Delta LMS's service door.
 *
 * The same door the Root portal already uses to read mentor schedules and
 * book time with one — the LMS was given a second secret precisely so this
 * CRM could reach it too, without sharing the portal's and without either
 * side being able to revoke the other's access by accident.
 *
 * Static header, not a signed request: this is what the LMS's own gate
 * expects (`x-portal-secret`, despite the name — it now checks it against
 * more than one caller). Kept in one place so the mentor service does not
 * grow its own copy of "is this configured, and what does a refusal mean".
 */

const TIMEOUT_MS = 15_000;

export function lmsConfigured(): boolean {
  return Boolean(env.LMS_API_URL && env.LMS_SERVICE_SECRET);
}

/** Trailing slashes and a trailing /api/v1 both stripped: the base carries it. */
function baseUrl(): string {
  return env.LMS_API_URL.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: { message?: string };
}

export function lmsNotConfiguredError(): Error {
  return Object.assign(
    new Error("The mentor calendar is not configured on this server — set LMS_API_URL and LMS_SERVICE_SECRET"),
    { statusCode: 503 },
  );
}

/**
 * One call to the LMS's service API, with its own refusal preserved.
 *
 * When the LMS says no it usually knows exactly why — an unmapped course, a
 * clash it has just found, a meeting that does not belong to this caller.
 * That sentence is carried through with "The LMS" in front of it rather than
 * replaced with a generic failure.
 */
export async function callLms<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; query?: Record<string, string | undefined>; verb?: string } = {},
): Promise<T> {
  if (!lmsConfigured()) throw lmsNotConfiguredError();

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) params.set(k, v);
  if (env.LMS_REMOTE_ORG_ID) params.set("remoteOrgId", env.LMS_REMOTE_ORG_ID);
  const qs = params.toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const verb = init.verb ?? "answer";
  const method = init.method ?? "GET";

  try {
    const res = await fetch(`${baseUrl()}/api/v1/service${path}${qs ? `?${qs}` : ""}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-portal-secret": env.LMS_SERVICE_SECRET,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => ({}))) as Envelope<T>;

    if (!res.ok) {
      const why = body.error?.message ?? body.message ?? `refused with ${res.status}`;
      // A bad secret here is this CRM's own misconfiguration, not the person
      // asking's — reported as a bad gateway rather than as though they had
      // typed something invalid.
      throw Object.assign(new Error(`The LMS would not ${verb}: ${why}`), {
        statusCode: res.status === 401 ? 502 : 409,
      });
    }
    if (body.data === undefined) throw Object.assign(new Error("The LMS returned nothing"), { statusCode: 502 });
    return body.data;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err;
    throw Object.assign(new Error("The LMS could not be reached"), { statusCode: 502 });
  } finally {
    clearTimeout(timer);
  }
}
