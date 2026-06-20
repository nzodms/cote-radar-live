"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "end";
  className?: string;
  contentClassName?: string;
}

/** Click-to-open popover with outside-click + Escape to close. */
export function Popover({ trigger, children, align = "end", className, contentClassName }: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex">
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "absolute z-50 mt-2 min-w-[240px] origin-top rounded-2xl border border-border bg-popover p-1.5 shadow-elevated",
                align === "end" ? "right-0" : "left-0",
                contentClassName,
              )}
            >
              {typeof children === "function" ? children(close) : children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
