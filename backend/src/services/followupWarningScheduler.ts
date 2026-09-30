/**
 * Missed Follow-up Warning Scheduler
 * ─────────────────────────────────────────────────────────────────────────────
 * Every 10 minutes: finds leads whose nextFollowUpAt passed more than
 * GRACE_MS ago with NO follow-up recorded since, and warns the assigned
 * agent (socket + push) plus the team leaders. One warning per scheduled
 * follow-up — rescheduling to a new time re-arms it.
 */

import { Lead } from "../models/Lead.js";
import { Team } from "../models/Team.js";
import { emitToUser } from "../socket.js";
import { sendPushToUser, sendPushToUsers } from "./pushService.js";

const INTERVAL_MS = 10 * 60_000; // every 10 minutes
const GRACE_MS = 60 * 60_000;    // warn 1 hour after the scheduled time

function fmtGST(d: Date): string {
  return d.toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function tick() {
  try {
    const cutoff = new Date(Date.now() - GRACE_MS);

    const candidates = await Lead.find({
      nextFollowUpAt: { $ne: null, $lte: cutoff },
      assignedTo: { $ne: null },
      status: { $nin: ["closed", "lost"] },
    })
      .select("name nextFollowUpAt assignedTo team followUps.followedUpAt missedFollowUpWarnedAt")
      .limit(200)
      .lean();

    for (const lead of candidates) {
      const due = lead.nextFollowUpAt as Date;

      // Already warned for THIS scheduled follow-up?
      const warnedAt = (lead as unknown as { missedFollowUpWarnedAt?: Date | null }).missedFollowUpWarnedAt;
      if (warnedAt && warnedAt >= due) continue;

      // A follow-up recorded at/after the due time means it wasn't missed
      const followedUp = (lead.followUps ?? []).some(
        (f) => f.followedUpAt && new Date(f.followedUpAt) >= due,
      );
      if (followedUp) continue;

      const agentId = String(lead.assignedTo);
      const now = new Date();

      await Lead.updateOne(
        { _id: lead._id },
        {
          $set: { missedFollowUpWarnedAt: now },
          $push: {
            activityLogs: {
              action: "followup_missed",
              description: `Follow-up missed — was due ${fmtGST(due)} GST, warning sent`,
              performedBy: lead.assignedTo,
              createdAt: now,
            },
          },
        },
      );

      const payload = {
        title: "⚠️ Missed follow-up",
        body: `${lead.name}: follow-up was due ${fmtGST(due)} GST and hasn't been done yet`,
        tag: `followup-missed-${String(lead._id)}`,
        url: `/leads/${String(lead._id)}`,
        data: { type: "followup_missed", leadId: String(lead._id) },
      };

      // Warn the assigned agent
      emitToUser(agentId, "notification", { ...payload, createdAt: now.toISOString() });
      sendPushToUser(agentId, payload).catch(() => null);

      // Warn the team leaders too
      if (lead.team) {
        const teamDoc = await Team.findById(lead.team).select("leaders").lean();
        const leaderIds = ((teamDoc?.leaders ?? []) as unknown as { toString(): string }[])
          .map((l) => l.toString())
          .filter((id) => id !== agentId);
        for (const lid of leaderIds) {
          emitToUser(lid, "notification", { ...payload, createdAt: now.toISOString() });
        }
        sendPushToUsers(leaderIds, payload).catch(() => null);
      }

      console.log(`[followupWarning] warned agent ${agentId} for lead ${lead.name} (due ${due.toISOString()})`);
    }
  } catch (err) {
    console.error("[followupWarning] tick error:", err);
  }
}

export function startFollowupWarningScheduler() {
  console.log("⏰ Missed-followup warning scheduler started (checks every 10 min)");
  setInterval(tick, INTERVAL_MS);
  // Also run shortly after boot so restarts don't delay warnings
  setTimeout(tick, 15_000);
}
