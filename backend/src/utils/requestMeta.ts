import type { Request } from "express";

/**
 * Who is on the other end of a request, as far as the request says — for the
 * sign-in history on the Activity page. Display only: never a security check,
 * since a client not behind our proxy can send any X-Forwarded-For it likes.
 */

/** The caller's IP: the first X-Forwarded-For hop when behind a proxy, else the socket's. */
export function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const forwarded = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  const realIp = req.headers["x-real-ip"];
  const ip = forwarded || (Array.isArray(realIp) ? realIp[0] : realIp) || req.socket?.remoteAddress || req.ip || "";
  return ip.replace(/^::ffff:/, "").slice(0, 64);
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "app" | "unknown";

/** "Chrome on Windows", "Safari on iOS", "Android app" — from the User-Agent. */
export function describeDevice(userAgent: string | undefined): { label: string; type: DeviceType } {
  const ua = userAgent ?? "";
  if (!ua) return { label: "Unknown device", type: "unknown" };
  if (/okhttp|Dalvik/i.test(ua)) return { label: "Android app", type: "app" };
  if (/Expo|ReactNative|CFNetwork/i.test(ua)) return { label: "Mobile app", type: "app" };

  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : /curl\//i.test(ua)
                ? "curl"
                : "";
  const type: DeviceType =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
      ? "tablet"
      : /Mobi|iPhone|Android/.test(ua)
        ? "mobile"
        : browser === "curl"
          ? "unknown"
          : "desktop";
  const label = browser && os ? `${browser} on ${os}` : browser || os || "Unknown device";
  return { label, type };
}
