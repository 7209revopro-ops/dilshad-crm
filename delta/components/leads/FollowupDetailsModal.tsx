"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhoneForwarded, AlertTriangle, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export interface FollowupDetails {
  followUpNote: string;
  followUpAt: string;       // ISO
  nextFollowUpAt?: string;  // ISO — optional; creates a reminder when set
}

interface FollowupDetailsModalProps {
  open:      boolean;
  leadName?: string;
  onConfirm: (details: FollowupDetails) => void;
  onCancel:  () => void;
  loading?:  boolean;
}

// Current time as a datetime-local value in GST
function nowLocalGST(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Dubai" })
    .slice(0, 16)
    .replace(" ", "T");
}

/**
 * Mandatory form shown whenever a lead's status is changed to "followup".
 * Captures what happened + when; optional next follow-up doubles as a reminder.
 */
export function FollowupDetailsModal({ open, leadName, onConfirm, onCancel, loading }: FollowupDetailsModalProps) {
  const [note,   setNote]   = useState("");
  const [at,     setAt]     = useState<string>(nowLocalGST());
  const [nextAt, setNextAt] = useState<string>("");

  function reset() {
    setNote("");
    setAt(nowLocalGST());
    setNextAt("");
  }

  function handleConfirm() {
    if (!note.trim() || !at) return;
    onConfirm({
      // datetime-local values are entered in GST — attach the +04:00 offset
      followUpNote: note.trim(),
      followUpAt: new Date(`${at}:00+04:00`).toISOString(),
      nextFollowUpAt: nextAt ? new Date(`${nextAt}:00+04:00`).toISOString() : undefined,
    });
    reset();
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
          />

          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1,    y: 0  }}
              exit={{    scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-5 border-b border-border/50 bg-blue-500/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <PhoneForwarded className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Follow-up Details</h2>
                  {leadName && (
                    <p className="text-xs text-muted-foreground truncate max-w-[280px]">{leadName}</p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Follow-up details and time are required to move this lead to Follow Up.</span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">
                    What happened in this follow-up? <span className="text-red-500">*</span>
                  </p>
                  <Textarea
                    placeholder="e.g. Spoke on call — interested in the weekend batch, asked about fees…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    rows={3}
                    autoFocus
                    className="text-xs resize-none"
                  />
                  {note.length > 0 && (
                    <p className="text-xs text-muted-foreground text-right">{note.length}/2000</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">
                    Follow-up date &amp; time (GST) <span className="text-red-500">*</span>
                  </p>
                  <Input
                    type="datetime-local"
                    value={at}
                    onChange={(e) => setAt(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <BellRing className="h-3 w-3 text-primary" />
                    Next follow-up <span className="text-muted-foreground">(optional — sets a reminder)</span>
                  </p>
                  <Input
                    type="datetime-local"
                    value={nextAt}
                    min={nowLocalGST()}
                    onChange={(e) => setNextAt(e.target.value)}
                    className="text-xs"
                  />
                  {nextAt && (
                    <p className="text-[11px] text-primary/80">
                      You&apos;ll be reminded at this time (GST) to follow up again.
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/50 bg-muted/20">
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={loading}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!note.trim() || !at || loading}
                  onClick={handleConfirm}
                  className="min-w-[130px]"
                >
                  {loading ? "Saving…" : "Move to Follow Up"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
