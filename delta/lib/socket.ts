import { io, type Socket } from "socket.io-client";

// Derive the socket server URL from the API URL (strip /api/v1)
const SOCKET_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7868/api/v1"
).replace(/\/api\/v1\/?$/, "");

/*
 * One live connection per tab, shared by everything that listens — the bell,
 * the sidebar's counts, reminders, team rooms (the user, 2026-10-05: new-lead
 * notifications stopped showing). It does not give up: after a server restart,
 * a dropped network or a sleeping laptop it keeps trying — it used to stop after
 * five quick tries, and the bell stayed quiet until the page was reloaded — and
 * every try signs in with the latest token. Listeners stay on this one instance,
 * so none is left on a connection that was replaced.
 */
let socket: Socket | null = null;
let token = "";
let signedInAs = "";
let nudging = false;

/** Whose token it is (its userId), read from the token itself; "" when it can't be read. */
function userOf(t: string): string {
  try {
    const part = t.split(".")[1] ?? "";
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.userId ?? "");
  } catch {
    return "";
  }
}

/** Back online, or the tab looked at again: try straight away rather than at the next backoff. */
function nudgeOnReturn(): void {
  if (nudging || typeof window === "undefined") return;
  nudging = true;
  const nudge = () => {
    if (socket && !socket.connected && token) socket.connect();
  };
  window.addEventListener("online", nudge);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") nudge();
  });
}

export function getSocket(accessToken: string): Socket {
  if (accessToken) token = accessToken;

  if (socket) {
    const who = userOf(token);
    if (who && who !== signedInAs) {
      // Somebody else signed in on this tab: their own connection, not the last person's.
      signedInAs = who;
      socket.disconnect().connect();
    } else if (!socket.connected) {
      // Turned away before (a token that had run out, the server closing it): again, with the latest token.
      socket.connect();
    }
    return socket;
  }

  signedInAs = userOf(token);
  socket = io(SOCKET_URL, {
    // Read on every try, so a reconnect uses the token the app holds now.
    auth: (cb) => cb({ token }),
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
  });

  socket.on("connect", () => {
    console.log("[Socket] ✅ Connected — id:", socket?.id);
  });
  socket.on("connect_error", (err) => {
    console.warn("[Socket] ❌ Connect error:", err.message);
  });
  socket.on("disconnect", (reason) => {
    console.log("[Socket] 🔌 Disconnected:", reason);
    // The server closed it, rather than the network dropping: socket.io leaves reconnecting to us.
    if (reason === "io server disconnect") setTimeout(() => socket?.connect(), 2000);
  });
  socket.on("notification", (payload) => {
    console.log("[Socket] 🔔 notification event received:", payload);
  });
  nudgeOnReturn();

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    signedInAs = "";
  }
}
