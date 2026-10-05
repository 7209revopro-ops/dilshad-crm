"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/lib/store/authStore";

/** The tab's one live connection (lib/socket.ts), signed in with the current user's token. */
export function useSocket(): Socket | null {
  const { accessToken: token } = useAuthStore();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token || typeof window === "undefined") return;
    setSocket(getSocket(token));
  }, [token]);

  return socket;
}

/** Join a specific team room */
export function useTeamSocket(teamId: string | undefined): Socket | null {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !teamId) return;

    const join = () => socket.emit("join:team", teamId);

    if (socket.connected) join();
    // On every connect, not only the first: rooms belong to a connection, and a reconnected one starts in none.
    socket.on("connect", join);

    return () => {
      socket.emit("leave:team", teamId);
      socket.off("connect", join);
    };
  }, [socket, teamId]);

  return socket;
}
