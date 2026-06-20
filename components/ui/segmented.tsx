"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SegmentItem {
  key: string;
  label: string;
  count?: number;
}

interface SegmentedProps {
  items: SegmentItem[];
  value: string;
  onChange: (key: string) => void;
  layoutId?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Segmented({
  items,
  value,
  onChange,
  layoutId = "segmented",
  className,
  size = "md",
}: SegmentedProps) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-secondary/60 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative rounded-lg font-medium transition-colors duration-200",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", damping: 30, stiffness: 380 }}
                className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-border/60"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-2xs tabular-nums",
                    active ? "bg-primary-soft text-primary" : "bg-muted-foreground/10 text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
