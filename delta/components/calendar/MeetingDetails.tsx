"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarClock, ExternalLink, GraduationCap, Loader2, MapPin, Pencil, StickyNote, UserRound, Users, XCircle } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { clockText, dayKey, dayText, zoneName } from "@/lib/zonedTime";
import { useCancelMeeting, useMeeting } from "@/hooks/useMeetings";
import type { Meeting } from "@/types/meeting";

// ── Types ──────────────────────────────────────────────────────────────────────
interface MeetingDetailsProps {
  meetingId: string | null;
  /** Already in hand from the calendar — shown while the full one loads. */
  meeting?: Meeting | null;
  timezone: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (meeting: Meeting) => void;
}

const REMINDER_TEXT: Record<number, string> = {
  0: "No reminder",
  5: "5 min before",
  10: "10 min before",
  15: "15 min before",
  30: "30 min before",
  60: "1 hour before",
  120: "2 hours before",
  1440: "1 day before",
};

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

// ── Component ──────────────────────────────────────────────────────────────────
/** One meeting: when, who, where — and, for its organizer or a super admin, change or cancel. */
export function MeetingDetails({ meetingId, meeting: initial, timezone, onOpenChange, onEdit }: MeetingDetailsProps) {
  const { data, isLoading, error } = useMeeting(meetingId);
  const cancel = useCancelMeeting();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const m = data ?? initial ?? null;

  useEffect(() => {
    setConfirming(false);
    setReason("");
  }, [meetingId]);

  const start = m ? new Date(m.startAt) : null;
  const end = m ? new Date(m.endAt) : null;
  const cancelled = m?.status === "cancelled";

  return (
    <ResponsiveDialog open={Boolean(meetingId)} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent desktopClassName="max-w-lg">
        <ResponsiveDialogHeader>
          <div className="flex items-start gap-3 px-4 sm:px-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <ResponsiveDialogTitle className={cancelled ? "line-through decoration-2" : undefined}>
                {m?.title ?? (isLoading ? "Loading…" : "Meeting")}
              </ResponsiveDialogTitle>
              {m && start && end && (
                <ResponsiveDialogDescription className="pt-0.5">
                  {dayText(dayKey(start, timezone), true)} · {clockText(start, timezone)}–{clockText(end, timezone)} ({zoneName(timezone)} time)
                </ResponsiveDialogDescription>
              )}
            </div>
          </div>
        </ResponsiveDialogHeader>

        <div className="space-y-3 px-4 py-2 text-sm sm:px-0">
          {!m && error && <p className="text-muted-foreground">This meeting doesn&apos;t exist, or it isn&apos;t yours to see.</p>}
          {m && (
            <>
              {cancelled && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> Cancelled{m.cancelReason ? ` — ${m.cancelReason}` : ""}
                  </Badge>
                </motion.div>
              )}
              <Row icon={UserRound} label="Organizer">{m.organizer?.name ?? "—"}</Row>
              <Row icon={Users} label="People">
                {m.attendees.length ? m.attendees.map((a) => a.name).join(", ") : "Just the organizer"}
              </Row>
              {m.lead && (
                <Row icon={UserRound} label="Client">
                  <Link href={`/leads/${m.lead.id}`} className="font-medium text-primary hover:underline">
                    {m.lead.name || "Unnamed lead"}
                  </Link>
                  {!m.lead.email && <span className="ml-1 text-xs text-muted-foreground">(no email — not invited)</span>}
                </Row>
              )}
              {m.mentors.length > 0 && <Row icon={GraduationCap} label="Mentors">{m.mentors.map((x) => x.name).join(", ")}</Row>}
              {m.link && (
                <Row icon={MapPin} label="Where">
                  {isUrl(m.link) ? (
                    <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-medium text-primary hover:underline">
                      {m.link} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    m.link
                  )}
                </Row>
              )}
              <Row icon={Bell} label="Reminder">{REMINDER_TEXT[m.reminderMinutes] ?? `${m.reminderMinutes} min before`}</Row>
              {m.notes && (
                <Row icon={StickyNote} label="Team notes">
                  <span className="whitespace-pre-wrap">{m.notes}</span>
                </Row>
              )}

              <AnimatePresence>
                {confirming && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium">Cancel this meeting?</p>
                    <p className="text-xs text-muted-foreground">Everyone on it is told — the client and mentors by email.</p>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Why (optional — shared with the team)" aria-label="Reason" />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {m?.canEdit && !cancelled && (
          <ResponsiveDialogFooter>
            {confirming ? (
              <>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" onClick={() => setConfirming(false)} className="w-full sm:w-auto">Keep it</Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button
                    variant="destructive"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate({ id: m.id, reason: reason.trim() || undefined }, { onSuccess: () => onOpenChange(false) })}
                    className="w-full gap-1.5 sm:w-auto"
                  >
                    {cancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Cancel meeting
                  </Button>
                </motion.div>
              </>
            ) : (
              <>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" onClick={() => setConfirming(true)} className="w-full gap-1.5 text-destructive hover:text-destructive sm:w-auto">
                    <XCircle className="h-4 w-4" /> Cancel meeting
                  </Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button onClick={() => onEdit(m)} className="w-full gap-1.5 sm:w-auto">
                    <Pencil className="h-4 w-4" /> Change
                  </Button>
                </motion.div>
              </>
            )}
          </ResponsiveDialogFooter>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
