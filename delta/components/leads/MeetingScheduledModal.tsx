"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { overlayVariants, modalVariants } from "@/lib/animations";

export interface MeetingDetails {
  meetingAt: string;     // ISO
  meetingNote?: string;
}

interface MeetingScheduledModalProps {
  open:      boolean;
  leadName?: string;
  onConfirm: (details: MeetingDetails) => void;
  onCancel:  () => void;
  loading?:  boolean;
}

/** Now as a datetime-local value in Dubai time (GST). */
function nowLocalGST(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Dubai" })
    .slice(0, 16)
    .replace(" ", "T");
}

/**
 * Shown whenever a lead is moved to "Meeting Scheduled": when the meeting is
 * (required) and a short note. The server turns the time into a reminder for
 * the lead's owner. Kept open if saving fails, so nothing typed is lost.
 */
export function MeetingScheduledModal({ open, leadName, onConfirm, onCancel, loading }: MeetingScheduledModalProps) {
  const [at,   setAt]   = useState("");
  const [note, setNote] = useState("");

  // A fresh form every time it opens — it is reused for one lead after another
  useEffect(() => {
    if (open) { setAt(""); setNote(""); }
  }, [open]);

  // datetime-local strings compare in time order
  const inPast = !!at && at < nowLocalGST();

  function handleConfirm() {
    if (!at || inPast) return;
    onConfirm({
      // entered in Dubai time — attach the +04:00 offset
      meetingAt: new Date(`${at}:00+04:00`).toISOString(),
      meetingNote: note.trim() || undefined,
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onCancel}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="meeting-scheduled-title"
              className="pointer-events-auto w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-5 border-b border-border/50 bg-teal-500/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10">
                  <CalendarClock className="h-5 w-5 text-teal-500" />
                </div>
                <div>
                  <h2 id="meeting-scheduled-title" className="text-sm font-semibold text-foreground">Meeting Scheduled</h2>
                  {leadName && (
                    <p className="text-xs text-muted-foreground truncate max-w-[280px]">{leadName}</p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="meeting-at" className="text-xs font-medium text-foreground">
                    Meeting date &amp; time (GST) <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="meeting-at"
                    type="datetime-local"
                    value={at}
                    min={nowLocalGST()}
                    onChange={(e) => setAt(e.target.value)}
                    autoFocus
                    aria-invalid={inPast}
                    className="text-xs"
                  />
                  {inPast ? (
                    <p className="text-[11px] text-destructive">That time has already passed.</p>
                  ) : (
                    <p className="text-[11px] text-primary/80 flex items-center gap-1">
                      <BellRing className="h-3 w-3" />
                      The lead&apos;s owner gets a reminder at this time, and a heads-up 30 minutes before.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="meeting-note" className="text-xs font-medium text-foreground">
                    Note <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    id="meeting-note"
                    placeholder="e.g. Zoom call about the weekend batch"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/50 bg-muted/20">
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!at || inPast || loading}
                  onClick={handleConfirm}
                  className="min-w-[140px]"
                >
                  {loading ? "Saving…" : "Schedule Meeting"}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
