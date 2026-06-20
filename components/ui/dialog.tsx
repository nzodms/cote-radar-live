"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./portal";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: DialogProps) {
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className={cn(
                "relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-elevated",
                SIZES[size],
              )}
            >
              {(title || description) && (
                <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
                  <div>
                    {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
                    {description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-6 py-2">{children}</div>
              {footer && <div className="flex justify-end gap-2 px-6 py-4">{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
