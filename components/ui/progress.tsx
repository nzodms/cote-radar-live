import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number; // 0-100
  className?: string;
  indicatorClassName?: string;
  tone?: "primary" | "success" | "warning" | "danger";
}

const TONES = {
  primary: "bg-primary-gradient",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Progress({ value, className, indicatorClassName, tone = "primary" }: ProgressProps) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted-foreground/15", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700 ease-premium", TONES[tone], indicatorClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
