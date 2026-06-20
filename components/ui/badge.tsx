import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/labels";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        primary: "border-primary/20 bg-primary-soft text-primary",
        success: "border-success/20 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning-foreground",
        danger: "border-danger/20 bg-danger-soft text-danger",
        info: "border-info/20 bg-info-soft text-info",
      } satisfies Record<BadgeTone, string>,
      size: {
        sm: "px-2 py-0 text-2xs",
        md: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
