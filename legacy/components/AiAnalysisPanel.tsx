"use client";

import { useState } from "react";
import type { AiAnalysisResult } from "@/lib/ai";
import { cn } from "@/lib/utils";

interface AiResponse {
  ok: boolean;
  enabled?: boolean;
  status?: { provider: string; model: string; enabled: boolean; hasKey: boolean };
  ai?: AiAnalysisResult | null;
  note?: string | null;
  error?: string;
}

export function AiAnalysisPanel({ fixtureId }: { fixtureId: number }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiResponse | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/matches/${fixtureId}/ai-analysis`, {
        method: "POST",
        cache: "no-store",
      });
      setData((await res.json()) as AiResponse);
    } catch (err) {
      setData({ ok: false, error: err instanceof Error ? err.message : "Échec de l'appel IA." });
    } finally {
      setLoading(false);
    }
  };

  const ai = data?.ai ?? null;

  return (
    <div className="card card-pad">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="section-title">Reformulation IA (optionnelle)</div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded-lg border border-border bg-night-850 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-night-800 disabled:opacity-60"
        >
          {loading ? "Génération…" : "Générer l'explication IA"}
        </button>
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        L&apos;IA ne décide rien: elle reformule en langage clair le conseil déjà calculé par le
        moteur maison. Désactivée par défaut.
      </p>

      {data && data.enabled === false && (
        <div className="rounded-lg border border-border bg-night-850 p-3 text-xs text-slate-400">
          {data.note ?? "IA désactivée."}
        </div>
      )}

      {data && data.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {data.error}
        </div>
      )}

      {data && data.enabled && !ai && data.note && (
        <div className="rounded-lg border border-border bg-night-850 p-3 text-xs text-slate-400">
          {data.note}
        </div>
      )}

      {ai && (
        <div className="space-y-3 text-sm">
          {ai.executiveSummary && (
            <p className="leading-relaxed text-slate-200">{ai.executiveSummary}</p>
          )}
          {ai.liveReading && (
            <Section title="Lecture live" text={ai.liveReading} />
          )}
          {ai.recommendedActionExplanation && (
            <Section title="Explication de l'action" text={ai.recommendedActionExplanation} />
          )}
          {ai.marketWatchlist.length > 0 && (
            <ListSection title="Marchés à surveiller" items={ai.marketWatchlist} />
          )}
          {ai.riskWarnings.length > 0 && (
            <ListSection title="Risques" items={ai.riskWarnings} tone="amber" />
          )}
          {ai.invalidationConditions.length > 0 && (
            <ListSection title="Conditions d'invalidation" items={ai.invalidationConditions} />
          )}
          {ai.finalVerdict && (
            <div className="rounded-lg border border-border bg-night-900 p-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Verdict IA</div>
              <p className="text-sm text-slate-200">{ai.finalVerdict}</p>
            </div>
          )}
          {ai.meta && (
            <p className="text-[11px] text-slate-600">
              Généré via {ai.meta.provider} ({ai.meta.model}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-slate-500">{title}</div>
      <p className="text-xs leading-relaxed text-slate-300">{text}</p>
    </div>
  );
}

function ListSection({ title, items, tone }: { title: string; items: string[]; tone?: "amber" }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4 text-xs">
        {items.map((it, i) => (
          <li key={i} className={cn(tone === "amber" ? "text-amber-300/90" : "text-slate-300")}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
