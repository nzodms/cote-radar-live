import type { LiveBettingAdvice, RecommendedMarket } from "@/types/live-advice";
import { DataFreshnessBadge } from "./DataFreshnessBadge";
import { cn } from "@/lib/utils";
import {
  actionLabelFr,
  actionToneClass,
  confidenceLabelFr,
  severityToneClass,
  signalLabelFr,
  signalToneClass,
  timingLabelFr,
  urgencyLabelFr,
} from "@/lib/ui";

function MarketRow({ m, primary }: { m: RecommendedMarket; primary?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        primary ? "border-accent/40 bg-accent/5" : "border-border bg-night-850"
      )}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-100">{m.label}</span>
        <div className="flex items-center gap-1.5">
          <span className={cn("badge", signalToneClass(m.signal))}>{signalLabelFr(m.signal)}</span>
          <span className="pill">{timingLabelFr(m.timing)}</span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-300">{m.reasoning}</p>
      <div className="mt-2 grid gap-1 text-[11px] leading-relaxed">
        <p className="text-slate-400">
          <span className="font-medium text-slate-300">Confirmation requise: </span>
          {m.requiredConfirmation}
        </p>
        <p className="text-slate-500">
          <span className="font-medium text-slate-400">Condition d&apos;invalidation: </span>
          {m.invalidation}
        </p>
      </div>
    </div>
  );
}

export function LiveAdvicePanel({
  advice,
  lastSyncedAt,
  freshnessSeconds,
}: {
  advice: LiveBettingAdvice;
  lastSyncedAt?: string | null;
  freshnessSeconds?: number | null;
}) {
  const primary = advice.recommendedMarkets[0] ?? null;
  const others = advice.recommendedMarkets.slice(1);

  return (
    <div className="card overflow-hidden">
      {/* En-tête action très visible */}
      <div className="border-b border-border bg-night-850/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-slate-500">Conseil live</span>
            <span className={cn("badge text-sm font-bold", actionToneClass(advice.action))}>
              {actionLabelFr(advice.action)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="badge border border-border bg-night-900 text-slate-300">
              {confidenceLabelFr(advice.confidence)}
            </span>
            <span className="badge border border-border bg-night-900 text-slate-400">
              {urgencyLabelFr(advice.urgency)}
            </span>
            <DataFreshnessBadge iso={lastSyncedAt} seconds={freshnessSeconds} label="MAJ" />
          </div>
        </div>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-100">{advice.mainAdvice}</p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Marché principal à surveiller */}
        {primary ? (
          <div>
            <div className="mb-2 section-title">Marché principal à surveiller</div>
            <MarketRow m={primary} primary />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-night-900 p-3 text-sm text-slate-400">
            Aucun marché à surveiller pour l&apos;instant. {advice.action === "WAIT" ? "Patience." : ""}
          </div>
        )}

        {/* Autres marchés */}
        {others.length > 0 && (
          <div className="space-y-2">
            <div className="section-title">Autres marchés</div>
            {others.map((m, i) => (
              <MarketRow key={i} m={m} />
            ))}
          </div>
        )}

        {/* À éviter */}
        {advice.avoidMarkets.length > 0 && (
          <div>
            <div className="mb-2 section-title">À éviter</div>
            <ul className="space-y-1.5">
              {advice.avoidMarkets.map((a, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-night-850 px-3 py-2 text-xs text-slate-400"
                >
                  <span className="font-medium text-slate-300">{a.market}: </span>
                  {a.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lecture live & scénario */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-night-850 p-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Lecture live</div>
            <p className="text-xs leading-relaxed text-slate-300">{advice.liveReading}</p>
          </div>
          <div className="rounded-lg border border-border bg-night-850 p-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
              Scénario vs pré-match
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              {advice.contextComparison.scenarioShift}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {advice.contextComparison.keyDifference}
            </p>
          </div>
        </div>

        {/* Fenêtres récentes */}
        <div>
          <div className="mb-2 section-title">Dynamique récente</div>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p>• {advice.momentum.last5MinutesSummary}</p>
            <p>• {advice.momentum.last10MinutesSummary}</p>
            <p>• {advice.momentum.sinceLastGoalSummary}</p>
          </div>
        </div>

        {/* Risques */}
        {advice.risks.length > 0 && (
          <div>
            <div className="mb-2 section-title">Risques</div>
            <ul className="space-y-1.5">
              {advice.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={cn("badge shrink-0", severityToneClass(r.severity))}>{r.type}</span>
                  <span className="text-slate-400">{r.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Prochain check */}
        <div className="rounded-lg border border-border bg-night-850 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Prochain check</span>
            <span className="pill">dans ~{advice.nextCheck.inMinutes} min</span>
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
            {advice.nextCheck.whatToWatch.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>

        {/* Verdict + qualité données */}
        <div className="rounded-lg border border-border bg-night-900 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Verdict prudent</div>
          <p className="text-sm text-slate-200">{advice.finalVerdict}</p>
          {advice.dataQuality.warning && (
            <p className="mt-2 text-[11px] text-amber-300/90">⚠ {advice.dataQuality.warning}</p>
          )}
        </div>
      </div>
    </div>
  );
}
