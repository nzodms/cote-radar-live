"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./portal";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}

const SIZES = { md: "max-w-md", lg: "max-w-xl", xl: "max-w-2xl" };

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  headerExtra,
  size = "lg",
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className={cn(
                "absolute right-0 top-0 flex h-full w-full flex-col bg-background shadow-elevated",
                SIZES[size],
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border bg-white/60 px-6 py-5 backdrop-blur-xl">
                <div className="min-w-0">
                  {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
                  {description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {headerExtra}
                  <button
                    onClick={() => onOpenChange(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
              {footer && (
                <div className="border-t border-border bg-white/60 px-6 py-4 backdrop-blur-xl">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
