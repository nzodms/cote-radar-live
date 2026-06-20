"use client";

import { useEffect, useState } from "react";
import { cn, formatFreshness, secondsSince } from "@/lib/utils";

interface Props {
  /** Timestamp ISO du dernier sync (recommandé: se met à jour tout seul). */
  iso?: string | null;
  /** Ou bien un âge déjà calculé en secondes. */
  seconds?: number | null;
  label?: string;
  className?: string;
}

/**
 * Badge de fraîcheur des données. Si `iso` est fourni, l'âge est recalculé
 * côté client toutes les 15s. Couleur selon l'ancienneté.
 */
export function DataFreshnessBadge({ iso, seconds, label = "Données", className }: Props) {
  const [age, setAge] = useState<number | null>(
    typeof seconds === "number" ? seconds : secondsSince(iso)
  );

  useEffect(() => {
    if (!iso) {
      if (typeof seconds === "number") setAge(seconds);
      return;
    }
    const tick = () => setAge(secondsSince(iso));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [iso, seconds]);

  const tone =
    age === null
      ? "bg-slate-700/40 text-slate-400"
      : age <= 150
      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
      : age <= 600
      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
      : "bg-red-500/15 text-red-300 border border-red-500/30";

  return (
    <span className={cn("badge", tone, className)} title="Âge des données depuis le dernier sync">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          age !== null && age <= 150 ? "bg-emerald-400 animate-pulse-live" : "bg-current"
        )}
      />
      {label} · {formatFreshness(age)}
    </span>
  );
}
