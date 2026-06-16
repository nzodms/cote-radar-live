"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  endpoint: string;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "ghost";
  /** Rafraîchit les données serveur après succès. */
  refreshOnDone?: boolean;
  /** Affiche un court résumé de la réponse. */
  showResult?: boolean;
  className?: string;
}

/**
 * Bouton générique qui appelle un endpoint serveur (POST) et affiche un retour.
 * Utilisé pour les syncs (live, world-cup today) et le test API.
 */
export function SyncButton({
  endpoint,
  label,
  pendingLabel = "En cours…",
  variant = "primary",
  refreshOnDone = true,
  showResult = true,
  className,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const run = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const ok = res.ok && json.ok !== false;
      setIsError(!ok);
      setMessage(summarize(json, ok));
      if (ok && refreshOnDone) router.refresh();
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Échec de l'appel.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60",
          variant === "primary"
            ? "bg-accent text-white hover:bg-accent-deep"
            : "border border-border bg-night-850 text-slate-200 hover:bg-night-800"
        )}
      >
        {loading && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {loading ? pendingLabel : label}
      </button>
      {showResult && message && (
        <p className={cn("text-[11px] leading-snug", isError ? "text-red-300" : "text-emerald-300")}>
          {message}
        </p>
      )}
    </div>
  );
}

function summarize(json: any, ok: boolean): string {
  if (!ok) return json?.error ?? "Échec de l'opération.";
  if (typeof json?.message === "string") return json.message;
  if (typeof json?.worldCupCount === "number") {
    return `${json.worldCupCount} match(s) Coupe du monde sur ${json.totalFixturesFromApi} (upsert: ${json.upserted}).`;
  }
  if (json?.status) {
    const s = json.status;
    return `API OK — plan ${s.plan ?? "?"}, ${s.requestsCurrent ?? "?"}/${s.requestsLimitDay ?? "?"} requêtes.`;
  }
  return "Opération terminée.";
}
