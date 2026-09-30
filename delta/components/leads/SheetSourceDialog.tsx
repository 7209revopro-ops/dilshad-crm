"use client";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X, Plus, Link as LinkIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCreateSheetSource, useUpdateSheetSource } from "@/hooks/useSheetSources";
import type { SheetSource } from "@/hooks/useSheetSources";

const PLATFORMS = [
  { value: "google",    label: "Google Ads" },
  { value: "facebook",  label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "meta",      label: "Meta" },
  { value: "whatsapp",  label: "WhatsApp" },
  { value: "other",     label: "Other" },
] as const;

const schema = z.object({
  name:        z.string().min(1, "Name is required").max(100),
  sources:     z.array(z.string().min(1).max(100)).min(1, "Add at least one source key"),
  link:        z.string().url("Must be a valid URL").max(500).optional().or(z.literal("")),
  platform:    z.enum(["google", "facebook", "instagram", "meta", "whatsapp", "other"]),
  description: z.string().max(300).optional(),
  isActive:    z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: SheetSource | null;
}

// ── Tag input for source keys ──────────────────────────────────────────────────
function SourceTagInput({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  error?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag() {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || value.includes(trimmed)) { setInput(""); return; }
    onChange([...value, trimmed]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
    if (e.key === "Backspace" && !input && value.length) removeTag(value[value.length - 1]);
  }

  return (
    <div className="space-y-2">
      {/* Tag chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {value.map((tag) => (
              <motion.span
                key={tag}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addTag}
          placeholder="Type a source key and press Enter…"
          className="font-mono text-sm h-8"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} className="h-8 px-2 shrink-0">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Must match exactly what the App Script sends as <code className="bg-muted px-1 rounded">source</code>. Press Enter or comma to add multiple.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────────
export function SheetSourceDialog({ open, onOpenChange, existing }: Props) {
  const isEditing = !!existing;
  const { mutate: create, isPending: creating } = useCreateSheetSource();
  const { mutate: update, isPending: updating } = useUpdateSheetSource();
  const isPending = creating || updating;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { name: "", sources: [], link: "", platform: "other", description: "", isActive: true },
    });

  useEffect(() => {
    if (open) {
      reset(existing
        ? {
            name:        existing.name,
            sources:     existing.sources,
            link:        existing.link ?? "",
            platform:    existing.platform,
            description: existing.description ?? "",
            isActive:    existing.isActive,
          }
        : { name: "", sources: [], link: "", platform: "other", description: "", isActive: true });
    }
  }, [open, existing, reset]);

  function onSubmit(values: FormValues) {
    const payload = { ...values, link: values.link || undefined };
    if (isEditing) {
      update({ id: existing!._id, payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create(payload, { onSuccess: () => onOpenChange(false) });
    }
  }

  const isActive = watch("isActive");
  const sources  = watch("sources");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {isEditing ? "Edit Sheet Source" : "Add Sheet Source"}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-4 pb-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Sheet Name</Label>
            <Input {...register("name")} placeholder="e.g. Abhin Google Ads" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Sources — multi-tag */}
          <div className="space-y-1.5">
            <Label>Source Keys</Label>
            <SourceTagInput
              value={sources}
              onChange={(v) => setValue("sources", v, { shouldValidate: true })}
              error={errors.sources?.message as string | undefined}
            />
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select
              value={watch("platform")}
              onValueChange={(v) => setValue("platform", v as FormValues["platform"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Google Sheets link */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Google Sheets Link
              <span className="text-muted-foreground font-normal">(visible to leaders & admin only)</span>
            </Label>
            <Input
              {...register("link")}
              placeholder="https://docs.google.com/spreadsheets/…"
              type="url"
            />
            {errors.link && <p className="text-xs text-destructive">{errors.link.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
            <Input {...register("description")} placeholder="e.g. June 2026 onwards" />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">Shows source keys in the lead creation dropdown</p>
            </div>
            <Switch checked={isActive} onCheckedChange={(v) => setValue("isActive", v)} />
          </div>

          <ResponsiveDialogFooter className="pt-2 px-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Add Source"}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
