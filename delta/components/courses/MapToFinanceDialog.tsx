"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Sparkles } from "lucide-react";
import type { Course } from "@/types/course";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFinanceItems, useUpdateCourse, type FinanceItem } from "@/hooks/useCourses";

/** Radix reads "" as unset, so "not mapped" needs a value of its own. */
const NONE = "__none__";

/**
 * A name match, offered as a suggestion and never applied on its own.
 *
 * Good enough to save the typing on the common case, and deliberately not
 * trusted: "Digital Marketing" and "Digital Marketing (Evening)" are one course
 * to a comparison like this and two to anybody reading them. Somebody confirms.
 */
function suggest(course: Course, items: FinanceItem[]): FinanceItem | undefined {
  const normalise = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = normalise(course.name);
  return items.find((i) => normalise(i.name) === target);
}

/**
 * Saying which catalogue item a course is in Delta Finance.
 *
 * The mapping is what puts an enrolment on the right line of an invoice. A
 * course without one still sells — the invoice carries its name and price as
 * typed — so this is worth doing and never worth blocking a sale for.
 */
export function MapToFinanceDialog({
  course,
  open,
  onClose,
}: {
  course: Course | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: items, isLoading } = useFinanceItems();
  const update = useUpdateCourse();
  const [selected, setSelected] = useState<string>(NONE);

  const suggestion = useMemo(
    () => (course && items?.length ? suggest(course, items) : undefined),
    [course, items],
  );

  useEffect(() => {
    if (!open || !course) return;
    setSelected(course.financeItemId || NONE);
  }, [open, course]);

  if (!course) return null;

  const integrationOff = !isLoading && (items?.length ?? 0) === 0;

  async function save() {
    await update.mutateAsync({
      id: course!._id,
      data: { financeItemId: selected === NONE ? "" : selected },
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" /> Map to finance
          </DialogTitle>
          <DialogDescription>
            Which catalogue item <span className="font-medium text-foreground">{course.name}</span> is
            in Delta Finance. Enrolments then land on that item instead of a typed line.
          </DialogDescription>
        </DialogHeader>

        {integrationOff ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            The finance integration is not switched on for this server, so there is no catalogue to
            choose from yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Catalogue item</Label>
              <Select value={selected} onValueChange={setSelected} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? "Loading…" : "Not mapped"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not mapped</SelectItem>
                  {(items ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                      {i.sku ? ` · ${i.sku}` : ""} · {(i.unitPriceMinor / 100).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Offered, not applied. One click if it is right, ignored if not. */}
            {suggestion && selected !== suggestion.id && (
              <button
                type="button"
                onClick={() => setSelected(suggestion.id)}
                className="flex w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-left text-sm hover:bg-primary/10"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Same name in finance: <span className="font-medium">{suggestion.name}</span>
                  {suggestion.sku ? ` (${suggestion.sku})` : ""} — use it?
                </span>
              </button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending || integrationOff}>
            {update.isPending ? "Saving…" : "Save mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
