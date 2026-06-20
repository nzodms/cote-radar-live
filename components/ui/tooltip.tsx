"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal hover/focus tooltip — no external dependency. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right" | "left";
  className?: string;
}) {
  const pos = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
  }[side];

  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-elevated transition-opacity duration-150 group-hover/tt:block group-hover/tt:opacity-100",
          pos,
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
