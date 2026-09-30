"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { StickyNote, Loader2, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAddLeadNote, useLead } from "@/hooks/useLeads";
import type { LeadNote } from "@/types/lead";
import type { User } from "@/types";

interface QuickNoteDialogProps {
  leadId: string;
  leadName: string;
  className?: string;
}

function noteAuthorName(note: LeadNote): string {
  return typeof note.author === "object" && note.author !== null
    ? (note.author as User).name
    : "Unknown";
}

function fmtNoteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Small note icon button for table rows — opens a dialog showing the lead's
 * existing notes plus a box to add a new one, without leaving the list.
 */
export function QuickNoteDialog({ leadId, leadName, className = "" }: QuickNoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const { mutate: addNote, isPending } = useAddLeadNote();
  // Fetch full lead detail (includes notes) only while the dialog is open
  const { data: lead, isLoading: loadingNotes } = useLead(open ? leadId : "");

  const notes: LeadNote[] = [...(lead?.notes ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) return;
    addNote(
      { leadId, content: trimmed },
      {
        // Keep the dialog open so the new note appears in the list above
        onSuccess: () => setContent(""),
      },
    );
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
              className={`${className} text-amber-400 hover:text-amber-300 hover:bg-amber-500/10`}
            >
              <motion.div whileTap={{ scale: 0.9 }}>
                <StickyNote className="h-4 w-4" />
              </motion.div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Notes</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4 text-amber-400" />
              Notes
              {notes.length > 0 && (
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-px text-[10px] font-bold text-amber-400">
                  {notes.length}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Notes for <span className="font-medium text-foreground">{leadName}</span>
            </DialogDescription>
          </DialogHeader>

          {/* ── Existing notes ── */}
          {loadingNotes ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          ) : notes.length > 0 ? (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {notes.map((note) => (
                <motion.div
                  key={note._id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2"
                >
                  <p className="text-xs text-foreground/85 whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <UserIcon className="h-2.5 w-2.5" />
                    <span className="font-medium">{noteAuthorName(note)}</span>
                    <span>·</span>
                    <span>{fmtNoteTime(note.createdAt)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border/40 px-3 py-3 text-center text-[11px] text-muted-foreground">
              No notes yet — add the first one below.
            </p>
          )}

          {/* ── Add new note ── */}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note…"
            rows={3}
            maxLength={2000}
            autoFocus
            className="resize-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
            }}
          />

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isPending || !content.trim()}
              className="gap-1.5"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default QuickNoteDialog;
