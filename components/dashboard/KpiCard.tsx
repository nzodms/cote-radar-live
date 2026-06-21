"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTone = "primary" | "info" | "warning" | "success" | "danger" | "violet";

const TONES: Record<KpiTone, { icon: string; spark: string; sparkFill: string; glow: string }> = {
  primary: { icon: "bg-primary-soft text-primary", spark: "hsl(var(--primary))", sparkFill: "hsl(var(--primary) / 0.12)", glow: "from-primary/10" },
  info: { icon: "bg-info-soft text-info", spark: "hsl(var(--info))", sparkFill: "hsl(var(--info) / 0.12)", glow: "from-info/10" },
  warning: { icon: "bg-warning-soft text-warning-foreground", spark: "hsl(var(--warning))", sparkFill: "hsl(var(--warning) / 0.14)", glow: "from-warning/10" },
  success: { icon: "bg-success-soft text-success", spark: "hsl(var(--success))", sparkFill: "hsl(var(--success) / 0.12)", glow: "from-success/10" },
  danger: { icon: "bg-danger-soft text-danger", spark: "hsl(var(--danger))", sparkFill: "hsl(var(--danger) / 0.12)", glow: "from-danger/10" },
  violet: { icon: "bg-violet-100 text-violet-600", spark: "#7c3aed", sparkFill: "rgba(124,58,237,0.12)", glow: "from-violet-500/10" },
};

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  trend?: string;
  trendUp?: boolean;
  trendGood?: boolean;
  spark?: number[];
  href?: string;
  loading?: boolean;
  index?: number;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  trend,
  trendUp = true,
  trendGood = true,
  spark = [],
  href,
  loading,
  index = 0,
}: KpiCardProps) {
  const t = TONES[tone];

  const body = (
    <Card interactive={!!href} className={cn("group relative flex h-full flex-col overflow-hidden p-4", href && "cursor-pointer")}>
      <div className={cn("pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl", t.glow)} />

      <div className="relative flex items-center justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", t.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {trend && !loading && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold",
              trendGood ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>

      <div className="relative mt-3.5">
        {loading ? (
          <Skeleton className="h-7 w-14" />
        ) : (
          <div className="text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
        )}
      </div>

      <div className="relative mt-1.5 min-h-[2.1em] text-xs font-medium leading-snug text-muted-foreground">
        {loading ? <Skeleton className="h-3 w-20" /> : label}
      </div>

      {spark.length > 1 && !loading && (
        <div className="relative mt-auto pt-3">
          <Sparkline data={spark} stroke={t.spark} fill={t.sparkFill} width={120} height={26} dot={false} className="h-7 w-full" />
        </div>
      )}
    </Card>
  );

  const wrapped = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      {body}
    </motion.div>
  );

  return href ? <Link href={href}>{wrapped}</Link> : wrapped;
}
