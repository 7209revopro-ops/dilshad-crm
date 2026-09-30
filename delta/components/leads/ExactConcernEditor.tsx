"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useUpdateLead } from "@/hooks/useLeads";

interface ExactConcernEditorProps {
  leadId: string;
  leadName: string;
  value?: string | null;
  className?: string;
}

/**
 * Click-to-edit exact concern cell — used in the leads table and the team
 * leads table. Opens a popover with a textarea and saves via the lead update
 * mutation (invalidates both leads and teams queries).
 */
export function ExactConcernEditor({ leadId, leadName, value, className = "" }: ExactConcernEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const { mutate: updateLead } = useUpdateLead();

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? "")) {
      updateLead({ id: leadId, data: { exactConcern: trimmed || null } as never });
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) setDraft(value ?? "");
        setOpen(v);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={`group/ec flex items-center gap-1 text-left max-w-[220px] ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {value ? (
            <span className="block truncate text-xs text-foreground/80" title={value}>
              {value}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/40 group-hover/ec:text-muted-foreground transition-colors">
              + Add
            </span>
          )}
          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover/ec:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Exact Concern — {leadName}
        </p>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What exactly is the lead's concern…"
          rows={3}
          maxLength={1000}
          autoFocus
          className="resize-none text-xs"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ExactConcernEditor;
