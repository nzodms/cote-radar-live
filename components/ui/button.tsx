"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 ease-premium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary-gradient text-primary-foreground shadow-glow-soft hover:shadow-glow hover:brightness-[1.04]",
        secondary:
          "bg-white text-foreground border border-border shadow-sm hover:bg-secondary hover:border-border-strong",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-secondary/70 hover:border-border-strong",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        subtle: "bg-accent text-accent-foreground hover:bg-accent/70",
        danger:
          "bg-danger text-danger-foreground shadow-sm hover:brightness-105",
        success:
          "bg-success text-success-foreground shadow-sm hover:brightness-105",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-[0.95rem]",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
