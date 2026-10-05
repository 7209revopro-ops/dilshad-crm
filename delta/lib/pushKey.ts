/*
 * Which VAPID key a browser's push subscription was made with, written as the
 * server writes its public key (base64url, no padding) — so a device made with
 * an old key is noticed after the keys are changed, and made again with the new
 * one (hooks/usePushNotification.ts). The user, 2026-10-05.
 */

/** The key a subscription was made with, or "" when the browser doesn't say (older browsers). */
export function subscriptionKey(sub: { options?: { applicationServerKey?: ArrayBuffer | null } | null }): string {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return "";
  const bytes = new Uint8Array(raw);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Whether a subscription made with `made` still works with the server's `current` key. Unknown counts as yes. */
export function madeWithKey(made: string, current: string): boolean {
  const norm = (k: string) => k.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return !made || !current || norm(made) === norm(current);
}
