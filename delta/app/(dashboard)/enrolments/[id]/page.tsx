"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Coins, GraduationCap, ListChecks } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtFull } from "@/lib/currency";
import { aed, ROLE_LABEL, STATE_LABEL, monthLabel } from "@/lib/commission";
import { useEnrolment, type EnrolmentDetail } from "@/hooks/useEnrolments";
import { EnrolmentStepsList } from "@/components/students/EnrolmentSteps";
import type { Course } from "@/types/course";

/**
 * One enrolment: the five steps after the close — finance approved, LMS
 * account, CS assigned, onboarded, MT5 bonus — with who did each and when, and
 * what it earns in commission (counted once every step is done). Opened from a
 * My Enrolments card. The closer sees their own; anyone who may view students,
 * any.
 */
export default function EnrolmentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: e, isLoading, isError, error } = useEnrolment(id);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex max-w-3xl flex-col gap-5 pb-6">
      <Link href="/enrolments" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My Enrolments
      </Link>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : isError || !e ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Couldn't load this enrolment."}
        </div>
      ) : (
        <>
          <Header e={e} />
          <section className="rounded-xl border border-border/50 bg-card p-5">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><ListChecks className="h-4 w-4" /></span>
              After the close
            </p>
            <EnrolmentStepsList steps={e.steps} />
          </section>
          <CommissionCard e={e} />
        </>
      )}
    </motion.div>
  );
}

function Header({ e }: { e: EnrolmentDetail }) {
  const course = e.course && typeof e.course === "object" ? (e.course as Course) : null;
  const closer = e.assignedTo && typeof e.assignedTo === "object" ? (e.assignedTo as { name?: string }).name : null;
  const invoice = e.invoice?.invoiceNumber || e.handover?.invoiceNumber;
  return (
    <section className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <GraduationCap className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">{e.name}</h1>
          <p className="text-xs text-muted-foreground">
            {[e.enrollmentNumber, course?.name ?? "No course", fmtFull(e.totalFee), invoice ? `Invoice ${invoice}` : "", closer ? `Closed by ${closer}` : "",
              e.enrollmentDate ? `Enrolled ${new Date(e.enrollmentDate).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" })}` : ""]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </section>
  );
}

const COMMISSION_TONE = {
  progress: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  waiting: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  counted: "border-green-500/20 bg-green-500/5 text-green-700 dark:text-green-400",
  excluded: "border-border/60 bg-muted/30 text-muted-foreground",
  reversed: "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400",
} as const;

function CommissionCard({ e }: { e: EnrolmentDetail }) {
  const c = e.commission;
  return (
    <section className="rounded-xl border border-border/50 bg-card p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Coins className="h-4 w-4" /></span>
        Commission
      </p>
      {!c ? (
        <p className="text-xs text-muted-foreground">
          Counted once every step above is done — for sales closed from 1 October 2026.
        </p>
      ) : (
        <div className={cn("rounded-lg border p-3 text-xs", COMMISSION_TONE[c.state])}>
          <p className="font-semibold">
            {STATE_LABEL[c.state]}{c.state === "counted" && c.month ? ` in ${monthLabel(c.month)}` : ""}
          </p>
          {c.reason && <p className="mt-0.5">{c.reason}</p>}
          {c.lines.length > 0 && (
            <ul className="mt-2 space-y-1 text-foreground">
              {c.lines.map((l) => (
                <li key={`${l.role}-${l.userName}`} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{ROLE_LABEL[l.role]} · {l.userName}{l.note ? ` — ${l.note}` : ""}</span>
                  <span className="font-semibold tabular-nums">{aed(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
