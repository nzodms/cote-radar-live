"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastTone } from "@/lib/store/toast";

const ICONS: Record<ToastTone, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const TONE: Record<ToastTone, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-popover/95 p-3.5 shadow-elevated backdrop-blur-xl"
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TONE[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
