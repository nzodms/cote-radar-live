import { cn } from "@/lib/utils";

interface StatusDotProps {
  className?: string;
  /** tailwind bg-* color class, e.g. "bg-success" */
  color?: string;
  pulse?: boolean;
  size?: "sm" | "md";
}

/** Small animated status indicator with a soft pulsing ring. */
export function StatusDot({ className, color = "bg-success", pulse = true, size = "md" }: StatusDotProps) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span className={cn("relative inline-flex", dim, className)}>
      {pulse && (
        <span
          className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulse-ring", color)}
        />
      )}
      <span className={cn("relative inline-flex rounded-full", dim, color)} />
    </span>
  );
}
