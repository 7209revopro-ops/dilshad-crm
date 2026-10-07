"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/** One salesperson's month, as GET /leaderboard ranks it. */
export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  revenue: number;
  closings: number;
  followUps: number;
  calls: number;
}

export interface Leaderboard {
  month: string;
  rows: LeaderboardRow[];
}

/** The month's leaderboard (YYYY-MM, Dubai months); this month when none is given. */
export const useLeaderboard = (month?: string) =>
  useQuery({
    queryKey: ["leaderboard", month ?? "current"],
    queryFn: async () => {
      const res = await api.get<{ data: Leaderboard }>("/leaderboard", { params: month ? { month } : {} });
      return res.data.data;
    },
  });
