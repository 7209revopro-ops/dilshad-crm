"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}

/** "Page 2 of 5 · 93 total" with previous / next. */
export function Pager({ page, totalPages, total, onPage }: PagerProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        Page {page} of {Math.max(totalPages, 1)} · {total} total
      </span>
      <motion.div whileTap={{ scale: 0.97 }}>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </motion.div>
      <motion.div whileTap={{ scale: 0.97 }}>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </motion.div>
    </div>
  );
}
