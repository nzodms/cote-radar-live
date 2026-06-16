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

interface Props {
  advice: LiveBettingAdvice;
  homeName: string;
  awayName: string;
  scoreHome: number | null;
  scoreAway: number | null;
  minute: number | null;
  statusLong?: string | null;
  lastSyncedAt?: string | null;
  freshnessSeconds?: number | null;
}

export function LiveAdvicePanel({
  advice,
  homeName,
  awayName,
  scoreHome,
  scoreAway,
  minute,
  statusLong,
  lastSyncedAt,
  freshnessSeconds,
}: Props) {
  const primary = advice.recommendedMarkets[0] ?? null;
  const others = advice.recommendedMarkets.slice(1);
  const dq = advice.dataQuality;

  return (
    <div className="card overflow-hidden">
      {/* Titre énorme */}
      <div className="border-b border-border bg-gradient-to-r from-accent/10 to-transparent px-4 py-4 sm:px-5">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent-bright">
          Analyse live du match
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-100 sm:text-xl">
          {homeName} <span className="font-mono">{scoreHome ?? "–"}</span>
          <span className="px-1 text-slate-500">-</span>
          <span className="font-mono">{scoreAway ?? "–"}</span> {awayName}
        </h2>
        <div className="mt-1 text-xs text-slate-400">
          Score &amp; minute utilisés : {scoreHome ?? "–"}-{scoreAway ?? "–"} · {minute ?? "–"}&apos;
          {statusLong ? ` · ${statusLong}` : ""}
        </div>
      </div>

      {/* Bandeau action */}
      <div className="border-b border-border bg-night-850/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("badge text-sm font-bold", actionToneClass(advice.action))}>
            {actionLabelFr(advice.action)}
          </span>
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
        {/* CE QUE JE FERAIS MAINTENANT — section la plus importante */}
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3.5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent-bright">
            Ce que je ferais maintenant
          </div>
          <p className="text-sm leading-relaxed text-slate-100">{advice.whatIWouldDoNow}</p>
        </div>

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

        {/* Momentum / dynamique récente */}
        <div>
          <div className="mb-2 section-title">Momentum &amp; dynamique récente</div>
          <div className="mb-2 flex items-center gap-3 text-xs text-slate-400">
            <span className="font-mono text-accent-bright">{advice.momentum.homeScore}</span>
            <div className="stat-bar-track flex flex-1">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.round(
                    (advice.momentum.homeScore /
                      Math.max(1, advice.momentum.homeScore + advice.momentum.awayScore)) *
                      100
                  )}%`,
                }}
              />
              <div className="h-full flex-1 bg-emerald-500/60" />
            </div>
            <span className="font-mono text-emerald-300">{advice.momentum.awayScore}</span>
          </div>
          <div className="space-y-1 text-xs text-slate-400">
            <p>• {advice.momentum.last5MinutesSummary}</p>
            <p>• {advice.momentum.last10MinutesSummary}</p>
            <p>• {advice.momentum.sinceLastGoalSummary}</p>
          </div>
        </div>

        {/* Marché principal à surveiller */}
        <div>
          <div className="mb-2 section-title">Marchés à surveiller</div>
          {primary ? (
            <div className="space-y-2">
              <MarketRow m={primary} primary />
              {others.map((m, i) => (
                <MarketRow key={i} m={m} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-night-900 p-3 text-sm text-slate-400">
              Aucun marché à surveiller pour l&apos;instant — c&apos;est volontaire (mieux vaut
              attendre qu&apos;inventer un signal).
            </div>
          )}
        </div>

        {/* Marchés à éviter */}
        {advice.avoidMarkets.length > 0 && (
          <div>
            <div className="mb-2 section-title">Marchés à éviter</div>
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

        {/* Marchés déjà passés (résolus) */}
        {advice.resolvedMarkets.length > 0 && (
          <div>
            <div className="mb-2 section-title">Marchés déjà passés (à ne pas conseiller)</div>
            <div className="flex flex-wrap gap-2">
              {advice.resolvedMarkets.map((r, i) => (
                <span
                  key={i}
                  className="badge bg-slate-600/20 text-slate-300 border border-slate-600/40"
                  title={r.note}
                >
                  ✓ {r.label}
                </span>
              ))}
            </div>
          </div>
        )}

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

        {/* Qualité des données */}
        <div>
          <div className="mb-2 section-title">Qualité des données utilisées</div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <Flag ok={dq.hasStatistics} label="Stats" />
            <Flag ok={dq.hasEvents} label="Événements" />
            <Flag ok={dq.hasLineups} label="Compos" />
            <Flag ok={dq.hasRecentForm} label="Forme" />
            <Flag ok={dq.hasH2H} label="H2H" />
            <Flag ok={dq.hasOdds} label="Cotes" />
          </div>
          {dq.warning && <p className="mt-2 text-[11px] text-amber-300/90">⚠ {dq.warning}</p>}
        </div>

        {/* Verdict */}
        <div className="rounded-lg border border-border bg-night-900 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Verdict prudent</div>
          <p className="text-sm text-slate-200">{advice.finalVerdict}</p>
        </div>
      </div>
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "badge",
        ok
          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          : "bg-slate-700/40 text-slate-500 border border-slate-600/30"
      )}
    >
      {ok ? "✓" : "—"} {label}
    </span>
  );
}
