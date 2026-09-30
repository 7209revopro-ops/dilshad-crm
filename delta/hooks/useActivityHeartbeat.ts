"use client";
import { useEffect } from "react";
import api from "@/lib/axios";
import { useAuthStore } from "@/lib/store/authStore";

const BEAT_MS = 60_000;
/** "Used the app": any of these in the last minute. A tab left open counts for nothing. */
const ACTIVE_WINDOW_MS = 60_000;
const USE_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll", "focus"] as const;

/**
 * Tells the server, every minute the app is open, whether anyone used it in
 * that minute — the Activity page's "last seen", active time and idle alerts.
 * Mounted once, in the dashboard layout.
 */
export function useActivityHeartbeat() {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken || typeof window === "undefined") return;
    let lastUse = Date.now(); // opening the app is using it
    let lastSent = 0;

    const send = () => {
      lastSent = Date.now();
      api.post("/activity/heartbeat", { active: Date.now() - lastUse < ACTIVE_WINDOW_MS }).catch(() => undefined);
    };
    const onUse = () => {
      const now = Date.now();
      const wasQuiet = now - lastUse >= ACTIVE_WINDOW_MS;
      lastUse = now;
      // Back after a quiet spell: say so now rather than at the next beat.
      if (wasQuiet && now - lastSent > 15_000) send();
    };

    USE_EVENTS.forEach((e) => window.addEventListener(e, onUse, { passive: true, capture: true }));
    send();
    const timer = setInterval(send, BEAT_MS);
    return () => {
      clearInterval(timer);
      USE_EVENTS.forEach((e) => window.removeEventListener(e, onUse, { capture: true }));
    };
  }, [accessToken]);
}
