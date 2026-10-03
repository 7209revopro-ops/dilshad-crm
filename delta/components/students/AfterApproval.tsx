"use client";

import { GraduationCap, Headset } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnrolmentCommission, EnrolmentLms } from "@/hooks/useEnrolments";

/* ─────────────────────────────────────────────────────────────────────────────
   What became of the student once finance approved the enrolment, as finance
   answers it with the enrolment's status: whether the Delta LMS made their
   account and on which courses — and who looks after them in Tetra
   Commission, their CS and CS team, asked of it live. Nothing before approval:
   nobody has asked the LMS anything yet.
───────────────────────────────────────────────────────────────────────────── */

// Readable on the light theme's white cards as well as the dark one's.
const TONE = {
  good: "text-green-700 dark:text-green-400",
  wait: "text-amber-700 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-300",
  quiet: "text-muted-foreground",
} as const;

type Line = { text: string; tone: keyof typeof TONE; title?: string };

function lmsLine(l: EnrolmentLms): Line {
  const on = l.courses.length ? ` · ${l.courses.join(", ")}` : "";
  switch (l.state) {
    case "created":  return { text: `LMS account created${on}`, tone: "good" };
    case "existing": return { text: `Added to their LMS account${on}`, tone: "good", title: l.detail };
    case "unmapped": return { text: "Not in the LMS — its course is not linked to an LMS course", tone: "bad", title: l.detail };
    case "failed":   return { text: `The LMS refused it${l.detail ? ` — ${l.detail}` : ""}`, tone: "bad" };
    default:         return { text: "Waiting for the LMS", tone: "wait", title: l.detail };
  }
}

function csLine(c: EnrolmentCommission): Line {
  switch (c.state) {
    case "sent": {
      const code = c.code ? ` · ${c.code}` : "";
      const asOf = c.live === false ? "As finance last heard — Tetra Commission did not answer just now" : undefined;
      if (c.cs) return { text: `CS: ${c.cs}${c.team ? ` · ${c.team}` : ""}${code}`, tone: "good", title: asOf };
      return { text: `${c.detail || "No CS yet — in Delta Open Students"}${code}`, tone: "wait", title: asOf };
    }
    case "skipped":  return { text: `Not sent to Tetra Commission${c.detail ? ` — ${c.detail}` : ""}`, tone: "quiet" };
    case "failed":   return { text: `Tetra Commission refused it${c.detail ? ` — ${c.detail}` : ""}`, tone: "bad" };
    case "not_sent": return { text: "Not sent to Tetra Commission", tone: "quiet" };
    default:         return { text: c.detail === "After the LMS" ? "Tetra Commission: after the LMS" : "Waiting for Tetra Commission", tone: "wait", title: c.detail };
  }
}

export function AfterApproval({ lms, commission }: { lms?: EnrolmentLms | null; commission?: EnrolmentCommission | null }) {
  if (!lms && !commission) return null;
  const lines = [lms ? { icon: GraduationCap, ...lmsLine(lms) } : null, commission ? { icon: Headset, ...csLine(commission) } : null]
    .filter((l): l is NonNullable<typeof l> => l !== null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      {lines.map(({ icon: Icon, text, tone, title }) => (
        <span key={text} className={cn("inline-flex items-center gap-1.5", TONE[tone])} title={title}>
          <Icon className="h-3 w-3 shrink-0" />
          {text}
        </span>
      ))}
    </div>
  );
}
