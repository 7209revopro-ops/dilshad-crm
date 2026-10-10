import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACADEMY_LABELS, academyOf } from "@/types/student";

/**
 * Which academy an enrolment was closed for (2026-10-10) — Dubai or Bangalore.
 * Shown wherever an enrolment is, since it decides the currency its money is
 * in and the finance organization it is billed in. One from before is Dubai.
 */
export function AcademyBadge({ academy, className }: { academy?: string | null; className?: string }) {
  const a = academyOf({ academy });
  return (
    <span
      title={`Closed for the ${ACADEMY_LABELS[a]} academy`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        a === "bangalore"
          ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
        className,
      )}
    >
      <MapPin className="h-2.5 w-2.5" />
      {ACADEMY_LABELS[a]}
    </span>
  );
}
