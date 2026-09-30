"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Pencil, Trash2, Table2, ToggleLeft, ToggleRight,
  Chrome, Facebook, Instagram, MessageCircle, Globe, BarChart2,
  Sheet, CheckCircle2, XCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSheetSources, useDeleteSheetSource, useUpdateSheetSource } from "@/hooks/useSheetSources";
import type { SheetSource } from "@/hooks/useSheetSources";
import { SheetSourceDialog } from "@/components/leads/SheetSourceDialog";

// ── Animation variants ────────────────────────────────────────────────────────
const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};
const listContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const listItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
};

// ── Platform helpers ──────────────────────────────────────────────────────────
const PLATFORM_META: Record<SheetSource["platform"], {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  google:    { label: "Google Ads",  icon: Chrome,        color: "text-blue-400",        bg: "bg-blue-500/10 border-blue-500/20" },
  facebook:  { label: "Facebook",    icon: Facebook,      color: "text-blue-500",        bg: "bg-blue-600/10 border-blue-600/20" },
  instagram: { label: "Instagram",   icon: Instagram,     color: "text-pink-400",        bg: "bg-pink-500/10 border-pink-500/20" },
  meta:      { label: "Meta",        icon: Globe,         color: "text-violet-400",      bg: "bg-violet-500/10 border-violet-500/20" },
  whatsapp:  { label: "WhatsApp",    icon: MessageCircle, color: "text-green-400",       bg: "bg-green-500/10 border-green-500/20" },
  other:     { label: "Other",       icon: BarChart2,     color: "text-muted-foreground", bg: "bg-muted/40 border-border/40" },
};

function PlatformBadge({ platform }: { platform: SheetSource["platform"] }) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.other;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.color} ${meta.bg}`}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

// ── Source card ───────────────────────────────────────────────────────────────
function SourceCard({
  source,
  onEdit,
  onDelete,
  onToggle,
}: {
  source: SheetSource;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <motion.div
      variants={listItem}
      whileHover={{ y: -1 }}
      className={[
        "rounded-2xl border bg-card p-5 flex flex-col gap-3 transition-colors duration-150",
        source.isActive ? "border-border/50" : "border-border/20 opacity-60",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{source.name}</p>
            {source.isActive
              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              : <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
          </div>
          {source.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{source.description}</p>
          )}
        </div>
        <PlatformBadge platform={source.platform} />
      </div>

      {/* Source keys chips */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Source Keys</p>
        <div className="flex flex-wrap gap-1.5">
          {source.sources.map((s) => (
            <span
              key={s}
              className="inline-block rounded-full border border-primary/25 bg-primary/8 px-2.5 py-0.5 font-mono text-[11px] text-primary"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Google Sheets link — only rendered when backend sends it (leaders/admin) */}
      {source.link && (
        <a
          href={source.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/15 transition-colors w-fit"
        >
          <ExternalLink className="h-3 w-3" />
          Open Google Sheet
        </a>
      )}

      {/* Footer — stats + actions */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/20">
        <div className="flex items-center gap-1.5">
          <BarChart2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{source.totalLeads.toLocaleString()}</span>{" "}
            lead{source.totalLeads !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            title={source.isActive ? "Deactivate" : "Activate"}
          >
            {source.isActive
              ? <ToggleRight className="h-4 w-4 text-primary" />
              : <ToggleLeft className="h-4 w-4" />
            }
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SheetsPage() {
  const { data: sources = [], isLoading } = useSheetSources();
  const { mutate: deleteSrc } = useDeleteSheetSource();
  const { mutate: update }    = useUpdateSheetSource();

  const [search, setSearch]             = useState("");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editing, setEditing]           = useState<SheetSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SheetSource | null>(null);

  const filtered = sources.filter((s) =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.sources.some((k) => k.toLowerCase().includes(search.toLowerCase())),
  );

  const totalLeads = sources.reduce((acc, s) => acc + s.totalLeads, 0);

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(s: SheetSource) { setEditing(s); setDialogOpen(true); }
  function toggleActive(s: SheetSource) {
    update({ id: s._id, payload: { isActive: !s.isActive } });
  }

  // Platform stats — count distinct platforms
  const platformStats = (["google", "facebook", "meta", "other"] as SheetSource["platform"][]).map((p) => {
    const matched = sources.filter((s) =>
      p === "other"
        ? !["google", "facebook", "instagram", "meta", "whatsapp"].includes(s.platform)
        : s.platform === p,
    );
    return { platform: p, sheets: matched.length, leads: matched.reduce((a, s) => a + s.totalLeads, 0) };
  }).filter((s) => s.sheets > 0);

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Google Sheets & Sources</h1>
            <p className="text-xs text-muted-foreground">
              {sources.length} integration{sources.length !== 1 ? "s" : ""} · {totalLeads.toLocaleString()} total leads
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0" size="sm">
          <Plus className="h-4 w-4" />
          Add Sheet
        </Button>
      </div>

      {/* Platform stats strip */}
      {platformStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {platformStats.map(({ platform, sheets, leads }) => {
            const meta = PLATFORM_META[platform];
            const Icon = meta.icon;
            return (
              <motion.div
                key={platform}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-border/40 bg-card px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                  <span className="text-[11px] text-muted-foreground">{meta.label}</span>
                </div>
                <p className="text-lg font-bold text-foreground">{leads.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{sheets} sheet{sheets !== 1 ? "s" : ""}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Search */}
      {sources.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sheets or source keys…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-2xl bg-muted/30 animate-pulse" />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sources.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center gap-4 py-24 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
            <Table2 className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No sheet sources yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Add a source for each Google Sheet integration — Abhin Google Ads, Meta Leads, Dilshad, etc.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2" size="sm">
            <Plus className="h-4 w-4" /> Add First Sheet
          </Button>
        </motion.div>
      )}

      {/* Cards grid */}
      {!isLoading && filtered.length > 0 && (
        <motion.div
          variants={listContainer} initial="hidden" animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {filtered.map((s) => (
              <SourceCard
                key={s._id}
                source={s}
                onEdit={() => openEdit(s)}
                onDelete={() => setDeleteTarget(s)}
                onToggle={() => toggleActive(s)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* No search results */}
      {!isLoading && sources.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          No sources match &quot;{search}&quot;
        </p>
      )}

      {/* Add/Edit dialog */}
      <SheetSourceDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editing} />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the sheet configuration. Existing leads with these source keys are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteSrc(deleteTarget._id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
