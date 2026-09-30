/**
 * Meeting-reminder Scheduler
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 60 seconds: everyone on a scheduled meeting whose reminder time
 * (reminderMinutes before the start) has come is told — in the app, by push
 * and by email when meeting emails are on. Once per meeting; moving the
 * meeting re-arms it (see meetingService.sweepMeetingReminders).
 */

import { sweepMeetingReminders } from "./meetingService.js";

const INTERVAL_MS = 60_000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await sweepMeetingReminders();
  } catch (err) {
    console.error("[meetingReminders] tick error:", err);
  } finally {
    running = false;
  }
}

export function startMeetingReminderScheduler() {
  console.log("⏰ Meeting-reminder scheduler started (checks every 60 s)");
  setInterval(tick, INTERVAL_MS);
}
