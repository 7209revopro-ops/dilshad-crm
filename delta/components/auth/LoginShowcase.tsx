"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { DeltaMark } from "@/components/brand/DeltaMark";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Clock {
  label: string;
  timeZone: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
/** Where the team sells from — the point of a remote CRM, told by the clock. */
const CLOCKS: Clock[] = [
  { label: "Dubai", timeZone: "Asia/Dubai" },
  { label: "India", timeZone: "Asia/Kolkata" },
];

const TICKER = ["Leads", "Calls", "Follow-ups", "Closings", "Teams", "Reports"];

const WORDS = ["Remote", "CRM"];

/** Letters rise out of a mask, one after another — the page's one big moment. */
const lineVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.15 } },
};
const letterVariants: Variants = {
  hidden: { y: "110%" },
  visible: { y: "0%", transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
};
const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] } }),
};

// ── Component ──────────────────────────────────────────────────────────────────
/**
 * The purple half of the login page.
 *
 * Editorial rather than decorative: a wordmark set big enough to be the
 * layout, the Delta "d" at a scale where it becomes texture, and a slow ticker
 * of what the CRM is for. It is all `aria-hidden` apart from the heading — a
 * screen reader gets "Remote CRM" and the form, not a performance.
 */
export function LoginShowcase() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? "visible" : "hidden";

  return (
    <aside className="relative isolate flex min-h-[46vh] flex-col justify-between overflow-hidden bg-primary p-6 text-primary-foreground sm:p-10 lg:min-h-dvh lg:p-12">
      {/* Texture: a hairline grid and a film of grain, so the purple has depth rather than flatness. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(to_right,hsl(var(--primary-foreground)/0.07)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary-foreground)/0.07)_1px,transparent_1px)] [background-size:72px_72px]"
      />
      <div aria-hidden className="login-grain pointer-events-none absolute inset-0 -z-10 opacity-40 mix-blend-soft-light" />

      {/* The Delta "d", oversized and bleeding off the corner. */}
      <motion.div
        aria-hidden
        // Its faintness is the animated value itself: an opacity class would be
        // overridden by the inline style Framer writes.
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92, rotate: -8 }}
        animate={{ opacity: 0.14, scale: 1, rotate: -8 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute -bottom-[18%] -right-[14%] -z-10 aspect-square h-[78%] lg:h-[88%]"
      >
        <DeltaMark className="h-full w-full" color="hsl(var(--primary-foreground))" />
      </motion.div>

      {/* Top rail: the mark and the clocks. */}
      <motion.div
        variants={fadeUpVariants}
        initial={initial}
        animate="visible"
        custom={0}
        className="flex items-start justify-between gap-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground shadow-lg shadow-black/10">
            <DeltaMark className="h-6 w-6" color="hsl(var(--primary))" title="Remote CRM" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Remote CRM</span>
        </div>
        <LiveClocks />
      </motion.div>

      {/* The wordmark. */}
      <div className="py-10 lg:py-0">
        <h1 className="sr-only">Remote CRM — sign in</h1>
        <div aria-hidden className="select-none text-[clamp(3.6rem,12vw,11rem)] font-extrabold leading-[0.86] tracking-[-0.065em] lg:text-[clamp(4.5rem,9.5vw,11rem)]">
          {WORDS.map((word, w) => (
            <motion.div key={word} variants={lineVariants} initial={initial} animate="visible" className="flex">
              {word.split("").map((ch, i) => (
                <span key={`${ch}-${i}`} className="inline-block overflow-hidden pb-[0.06em]">
                  <motion.span variants={letterVariants} className="inline-block">
                    {ch}
                  </motion.span>
                </span>
              ))}
              {/* "CRM" ends on the Delta dot rather than a full stop. */}
              {w === WORDS.length - 1 && (
                <span className="inline-block overflow-hidden pb-[0.06em] pl-[0.06em]">
                  <motion.span
                    variants={letterVariants}
                    className="inline-block h-[0.2em] w-[0.2em] translate-y-[-0.02em] rounded-full bg-gradient-to-tr from-[#2ed3c6] to-[#7ee7a4] align-baseline"
                  />
                </span>
              )}
            </motion.div>
          ))}
        </div>
        <motion.p
          variants={fadeUpVariants}
          initial={initial}
          animate="visible"
          custom={0.75}
          className="mt-6 max-w-md text-lg font-medium text-primary-foreground/80 sm:text-xl"
        >
          Your sales floor, wherever you are.
        </motion.p>
      </div>

      {/* Bottom rail: the ticker. Two copies side by side, moved by half, loop seamlessly. */}
      <motion.div
        aria-hidden
        variants={fadeUpVariants}
        initial={initial}
        animate="visible"
        custom={0.9}
        className="-mx-6 overflow-hidden border-t border-primary-foreground/20 pt-5 sm:-mx-10 lg:-mx-12"
      >
        <div className="login-marquee flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {TICKER.map((word, i) => (
                <span key={`${copy}-${word}`} className="flex items-center">
                  <span
                    className={
                      "px-6 text-2xl font-bold uppercase tracking-[-0.02em] sm:text-3xl " +
                      (i % 2 === 1 ? "text-transparent [-webkit-text-stroke:1.5px_hsl(var(--primary-foreground)/0.85)]" : "")
                    }
                  >
                    {word}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-primary-foreground/60" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </aside>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
/**
 * The time where the team is. Rendered empty on the server and filled in on
 * the client, so the server's clock never has to agree with the browser's.
 */
function LiveClocks() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <dl className="hidden gap-6 text-right sm:flex">
      {CLOCKS.map((c) => (
        <div key={c.label}>
          <dt className="text-[10px] font-medium uppercase tracking-[0.25em] text-primary-foreground/60">{c.label}</dt>
          <dd className="font-mono text-sm tabular-nums">
            {now
              ? new Intl.DateTimeFormat("en-GB", { timeZone: c.timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now)
              : "--:--"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
