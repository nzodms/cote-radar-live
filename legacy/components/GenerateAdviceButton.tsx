"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function GenerateAdviceButton({ fixtureId, big }: { fixtureId: number; big?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const run = async () => {
    setLoading(true);
    setMsg(null);
    setErr(false);
    try {
      const res = await fetch(`/api/matches/${fixtureId}/generate-advice`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const ok = res.ok && json.ok !== false;
      setErr(!ok);
      setMsg(ok ? json.message ?? "Analyse générée." : json.error ?? json.message ?? "Échec.");
      if (ok) router.refresh();
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Échec de la génération.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-60",
          big ? "px-5 py-3 text-sm" : "px-3 py-2 text-xs"
        )}
      >
        {loading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {loading ? "Génération…" : "Générer l'analyse maintenant"}
      </button>
      {msg && (
        <p className={cn("text-[11px] leading-snug", err ? "text-red-300" : "text-emerald-300")}>{msg}</p>
      )}
    </div>
  );
}
