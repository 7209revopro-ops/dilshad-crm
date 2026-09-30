"use client";

import { motion } from "framer-motion";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  text: string;
  /** The way forward — a button or link. */
  action: React.ReactNode;
}

/** Nothing to show: an icon, why, and what to do next. */
export function EmptyState({ icon: Icon, title, text, action }: EmptyStateProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{text}</p>
      <motion.div whileTap={{ scale: 0.97 }} className="mt-2">
        {action}
      </motion.div>
    </motion.div>
  );
}

/** A list that failed to load, with a retry. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <CircleAlert className="h-6 w-6 text-destructive" />
      <p className="text-sm">Could not load this list.</p>
      <motion.div whileTap={{ scale: 0.97 }}>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      </motion.div>
    </div>
  );
}

/** Rows of placeholders shaped like a table while it loads. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
