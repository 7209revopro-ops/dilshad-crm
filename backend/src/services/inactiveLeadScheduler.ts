/**
 * Inactive-lead Scheduler
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 60 seconds. When Settings → Automation & alerts → "Move leads
 * nobody acted on" is on, moves every lead assigned since then that has had no
 * action from its owner for the set working time to the next person in its
 * team (see inactiveLeadService.sweepInactiveLeads). Off, it does nothing.
 */

import { sweepInactiveLeads } from "./inactiveLeadService.js";

const INTERVAL_MS = 60_000;
let running = false;

async function tick() {
  // A slow pass is never overlapped by the next one.
  if (running) return;
  running = true;
  try {
    await sweepInactiveLeads();
  } catch (err) {
    console.error("[inactiveLeads] tick error:", err);
  } finally {
    running = false;
  }
}

export function startInactiveLeadScheduler() {
  console.log("⏰ Inactive-lead scheduler started (checks every 60 s)");
  setInterval(tick, INTERVAL_MS);
}
