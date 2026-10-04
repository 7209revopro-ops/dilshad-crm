"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, ListChecks, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { EarningsTab } from "@/components/commission/EarningsTab";
import { PlanTab } from "@/components/commission/PlanTab";

/**
 * Commission.
 *
 * Two questions, one page: what did each sale earn (Earnings), and what does
 * each course pay (Plan). Open to everyone — what a person sees is narrowed on
 * the server to their own, their team's, or everyone's — and only a Super
 * Admin changes the plan.
 */
const TABS = [
  { key: "earnings", label: "Earnings", icon: Wallet },
  { key: "plan", label: "Plan", icon: ListChecks },
] as const;

export default function CommissionPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("earnings");

  return (
    <div className="flex flex-col gap-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Coins className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Commission</h1>
            <p className="text-sm text-muted-foreground">
              What each approved sale earns, and the plan it&apos;s paid on
            </p>
          </div>
        </div>

        <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1 self-start sm:self-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <motion.button
              key={key}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {tab === "earnings" ? <EarningsTab /> : <PlanTab />}
    </div>
  );
}
