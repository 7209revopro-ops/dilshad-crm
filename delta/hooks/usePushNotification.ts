"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import { toast } from "@/lib/toast";
import { getViewAs } from "@/lib/impersonation";
import { madeWithKey, subscriptionKey } from "@/lib/pushKey";

/**
 * This browser's push subscription belongs to whoever signed in on it — while
 * a super admin views as someone, changing it would hand the admin's
 * notifications to that person (or cut them off), so it is left alone.
 */
function pushLockedWhileViewingAs(): boolean {
  if (!getViewAs()) return false;
  toast.info("Push notifications can't be changed while viewing as someone");
  return true;
}

// urlBase64ToUint8Array — converts VAPID public key to the format required by the browser
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

// Get (or create) this device's push subscription and save it on the server.
// The server upserts by endpoint, so calling this on every visit is safe — it
// re-registers devices whose subscription the browser rotated or the server
// dropped after a 404/410/403.
async function syncSubscription(reg: ServiceWorkerRegistration): Promise<void> {
  const { data: vapidData } = await api.get<{ data: { publicKey: string } }>(
    "/push/vapid-public-key"
  );
  const publicKey = vapidData.data.publicKey;
  let subscription = await reg.pushManager.getSubscription();
  // Made with another VAPID key (the server's keys were changed): it can never
  // be delivered to — make it again with this key, and have the server forget the old one.
  if (subscription && !madeWithKey(subscriptionKey(subscription), publicKey)) {
    const old = subscription.endpoint;
    await subscription.unsubscribe().catch(() => false);
    await api.delete("/push/unsubscribe", { data: { endpoint: old } }).catch(() => null);
    subscription = null;
  }
  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });
  }
  const sub = subscription.toJSON();
  await api.post("/push/subscribe", { endpoint: sub.endpoint, keys: sub.keys });
}

export type NotificationPermission = "default" | "granted" | "denied";

export interface UsePushNotificationReturn {
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  requestPermission: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotification(): UsePushNotificationReturn {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  // ── Init: register SW and check existing subscription ─────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    setPermission(Notification.permission as NotificationPermission);

    navigator.serviceWorker
      .register("/push-sw.js")
      .then(async (reg) => {
        swRef.current = reg;
        if (Notification.permission === "granted") {
          // Self-heal: already allowed → make sure the server has this device
          await syncSubscription(reg);
          setIsSubscribed(true);
        } else {
          const existing = await reg.pushManager.getSubscription();
          setIsSubscribed(!!existing);
        }
      })
      .catch(() => null);
  }, []);

  // ── Request permission + subscribe ────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (pushLockedWhileViewingAs()) return;

    setIsLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermission);
      if (result !== "granted") return;

      // Get SW registration
      let reg = swRef.current;
      if (!reg) {
        reg = await navigator.serviceWorker.register("/push-sw.js");
        swRef.current = reg;
      }

      await syncSubscription(reg);
      setIsSubscribed(true);
    } catch (err) {
      console.error("Push subscription failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (pushLockedWhileViewingAs()) return;
    setIsLoading(true);
    try {
      const reg = swRef.current;
      if (!reg) return;

      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const subJson = sub.toJSON();
      await sub.unsubscribe();

      await api.delete("/push/unsubscribe", {
        data: { endpoint: subJson.endpoint },
      });

      setIsSubscribed(false);
    } catch (err) {
      console.error("Unsubscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { permission, isSubscribed, isLoading, requestPermission, unsubscribe };
}

/**
 * "Send a test to my devices": the server pushes a test notification to every
 * device this person enabled — the installed phone app as much as this
 * browser, open or closed. Resolves to what the server said ("Sent to 2 of 2
 * devices"); rejects with its reason (nothing enabled yet, too soon after the
 * last test).
 */
export async function sendTestPush(): Promise<string> {
  try {
    const res = await api.post<{ message?: string }>("/push/test");
    return res.data.message ?? "Test sent";
  } catch (err) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    throw new Error(msg ?? "Could not send the test");
  }
}

/** A test notification shown by this browser itself, through the same service worker the real ones use. */
export async function showLocalTestNotification(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) throw new Error("This browser can't show notifications");
  if (Notification.permission !== "granted") throw new Error("Allow notifications on this device first");
  const reg = (await navigator.serviceWorker.getRegistration("/push-sw.js")) ?? (await navigator.serviceWorker.ready);
  await reg.showNotification("Test notification", {
    body: "Browser notifications work on this device.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "crm-test-local",
    data: { url: "/dashboard", type: "test" },
  });
}
