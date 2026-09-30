"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const LOST_REASONS: { value: string; label: string; description: string }[] = [
  { value: "price_too_high",  label: "Price Too High",   description: "Budget doesn't fit our pricing"         },
  { value: "not_interested",  label: "Not Interested",   description: "Lead has no interest in the offering"   },
  { value: "competitor",      label: "Chose Competitor", description: "Went with another provider"             },
  { value: "unresponsive",    label: "Unresponsive",     description: "No reply after multiple follow-ups"     },
  { value: "budget_issue",    label: "Budget Issue",     description: "Cannot afford at this time"             },
  { value: "wrong_timing",    label: "Wrong Timing",     description: "Interested but not now"                 },
  { value: "other",           label: "Other",            description: "A different reason not listed above"    },
];

interface LostReasonModalProps {
  open:       boolean;
  leadName?:  string;
  onConfirm:  (reason: string, notes: string) => void;
  onCancel:   () => void;
  loading?:   boolean;
}

export function LostReasonModal({ open, leadName, onConfirm, onCancel, loading }: LostReasonModalProps) {
  const [selected, setSelected] = useState<string>("");
  const [notes,    setNotes]    = useState<string>("");

  // Notes are mandatory for every reason; for "Other" they ARE the reason
  const notesMissing = selected !== "" && notes.trim().length === 0;

  function handleConfirm() {
    if (!selected || notesMissing) return;
    onConfirm(selected, notes.trim());
    setSelected("");
    setNotes("");
  }

  function handleCancel() {
    setSelected("");
    setNotes("");
    onCancel();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
          />

          {/* Modal */}
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
              <div className="flex items-center gap-3 p-5 border-b border-border/50 bg-red-500/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Mark as Lost</h2>
                  {leadName && (
                    <p className="text-xs text-muted-foreground truncate max-w-[280px]">{leadName}</p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Please select a reason before marking this lead as lost.</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Reason <span className="text-red-500">*</span></p>
                  <div className="grid gap-2">
                    {LOST_REASONS.map((r) => (
                      <motion.button
                        key={r.value}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelected(r.value)}
                        className={cn(
                          "flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all",
                          selected === r.value
                            ? "border-red-500/50 bg-red-500/10 text-foreground"
                            : "border-border/50 hover:border-border hover:bg-muted/40 text-foreground",
                        )}
                      >
                        {/* Radio dot */}
                        <span className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 flex items-center justify-center",
                          selected === r.value ? "border-red-500" : "border-muted-foreground/40",
                        )}>
                          {selected === r.value && (
                            <motion.span
                              className="h-1.5 w-1.5 rounded-full bg-red-500"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            />
                          )}
                        </span>
                        <span>
                          <span className="font-medium">{r.label}</span>
                          <span className="block text-muted-foreground mt-0.5">{r.description}</span>
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {selected === "other" ? (
                    <p className="text-xs font-medium text-foreground">Reason <span className="text-red-500">(required)</span></p>
                  ) : (
                    <p className="text-xs font-medium text-foreground">Additional notes <span className="text-red-500">(required)</span></p>
                  )}
                  <Textarea
                    placeholder={selected === "other" ? "Type the reason this lead was lost…" : "Any additional context about why this lead was lost…"}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className={cn("text-xs resize-none", notesMissing && "border-amber-500/50 focus-visible:ring-amber-500/30")}
                  />
                  {notesMissing && (
                    <p className="flex items-center gap-1 text-xs text-amber-500">
                      <AlertTriangle className="h-3 w-3" /> {selected === "other" ? "Please type the reason when selecting Other." : "Please add notes about why this lead was lost."}
                    </p>
                  )}
                  {notes.length > 0 && (
                    <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
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
                  variant="destructive"
                  disabled={!selected || notesMissing || loading}
                  onClick={handleConfirm}
                  className="min-w-[100px]"
                >
                  {loading ? "Saving…" : "Mark as Lost"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
