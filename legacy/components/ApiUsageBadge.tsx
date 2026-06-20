"use client";

import { useEffect, useState } from "react";
import type { ApiUsageStats } from "@/lib/api-usage";
import { cn } from "@/lib/utils";

interface UsageResponse {
  ok: boolean;
  usage?: ApiUsageStats;
}

/**
 * Badge de consommation API estimée. Se rafraîchit toutes les 60s.
 * Vert / ambre / rouge selon le ratio. Avertit près de la limite Free.
 */
export function ApiUsageBadge() {
  const [usage, setUsage] = useState<ApiUsageStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/usage", { cache: "no-store" });
        const json = (await res.json()) as UsageResponse;
        if (active && json.ok && json.usage) {
          setUsage(json.usage);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (error && !usage) {
    return (
      <span className="badge bg-slate-700/40 text-slate-400" title="Consommation indisponible">
        API —
      </span>
    );
  }

  if (!usage) {
    return <span className="badge bg-slate-700/40 text-slate-400">API …</span>;
  }

  const tone = usage.overLimit
    ? "bg-red-500/15 text-red-300 border border-red-500/30"
    : usage.nearLimit
    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";

  return (
    <span
      className={cn("badge", tone)}
      title={`Appels API estimés aujourd'hui (source: ${usage.source}). Plan: ${usage.dailyQuota}/jour.`}
    >
      <span className="font-mono">
        API {usage.usedToday}/{usage.dailyQuota}
      </span>
      {usage.nearLimit && <span>· limite proche</span>}
    </span>
  );
}
