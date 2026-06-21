"use client";

import Link from "next/link";
import { FlaskConical, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { useHydrated } from "@/lib/store/selectors";

const MAP = {
  demo: {
    label: "Démo",
    icon: FlaskConical,
    className: "border-warning/30 bg-warning-soft text-warning-foreground",
    dot: "bg-warning",
  },
  shopify: {
    label: "Shopify connecté",
    icon: CheckCircle2,
    className: "border-success/30 bg-success-soft text-success",
    dot: "bg-success",
  },
  error: {
    label: "Erreur Shopify",
    icon: AlertTriangle,
    className: "border-danger/30 bg-danger-soft text-danger",
    dot: "bg-danger",
  },
} as const;

export function DataSourceBadge() {
  const hydrated = useHydrated();
  const dataSource = useStore((s) => s.dataSource);
  if (!hydrated) return null;

  const meta = MAP[dataSource];
  const Icon = meta.icon;

  return (
    <Link
      href="/connection"
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold transition-all hover:brightness-[0.98] sm:inline-flex",
        meta.className,
      )}
      title="Gérer la connexion Shopify"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, dataSource !== "demo" && "animate-pulse-dot")} />
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Link>
  );
}
