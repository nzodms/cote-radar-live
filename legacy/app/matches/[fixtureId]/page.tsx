import Link from "next/link";
import { LiveMatchHeader } from "@/components/LiveMatchHeader";
import { LiveStatsGrid } from "@/components/LiveStatsGrid";
import { MomentumPanel } from "@/components/MomentumPanel";
import { MarketSignalsPanel } from "@/components/MarketSignalsPanel";
import { RiskPanel } from "@/components/RiskPanel";
import { EventsTimeline } from "@/components/EventsTimeline";
import { LineupsPanel } from "@/components/LineupsPanel";
import { RecentFormPanel } from "@/components/RecentFormPanel";
import { LiveAdvicePanel } from "@/components/LiveAdvicePanel";
import { GenerateAdviceButton } from "@/components/GenerateAdviceButton";
import { AnalysisDebugPanel } from "@/components/AnalysisDebugPanel";
import { LiveMonitorPanel } from "@/components/LiveMonitorPanel";
import { CommentaryPanel } from "@/components/CommentaryPanel";
import { AiAnalysisPanel } from "@/components/AiAnalysisPanel";
import { SyncButton } from "@/components/SyncButton";
import { DataFreshnessBadge } from "@/components/DataFreshnessBadge";
import { loadMatchDetail } from "@/lib/match-service";
import { cn, formatFreshness, formatKickoff } from "@/lib/utils";
import { actionLabelFr, actionToneClass, confidenceLabelFr, signalLabelFr, signalToneClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: { fixtureId: string } }) {
  const fixtureId = Number.parseInt(params.fixtureId, 10);

  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return <div className="card card-pad text-sm text-slate-400">Identifiant de match invalide.</div>;
  }

  const detail = await loadMatchDetail(fixtureId);

  // Match pas encore en base => proposer un premier sync.
  if (!detail.fixture) {
    return (
      <div className="card card-pad">
        <h2 className="text-base font-semibold text-slate-100">Match non synchronisé</h2>
        <p className="mt-1 text-sm text-slate-400">
          Le match #{fixtureId} n&apos;est pas encore en base. Lancez un sync live pour récupérer le
          statut, les statistiques, les événements, les compositions et générer une première analyse.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SyncButton
            endpoint={`/api/cron/sync-live/${fixtureId}?context=1`}
            label="Sync ce match (+ contexte)"
            pendingLabel="Synchronisation…"
          />
          <Link href="/matches" className="pill self-center">
            ← Retour aux matchs
          </Link>
        </div>
      </div>
    );
  }

  const { fixture, statistics, events, lineups, analysis, liveAdvice, adviceHistory, commentary, recentForm, h2h, history, debug } =
    detail;

  return (
    <div className="space-y-4">
      <LiveMatchHeader
        fixture={fixture}
        lastSyncedAt={detail.lastSyncedAt}
        freshnessSeconds={detail.freshnessSeconds}
      />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <SyncButton endpoint={`/api/cron/sync-live/${fixtureId}`} label="Resync live (API)" pendingLabel="Sync…" />
        <SyncButton
          endpoint={`/api/cron/sync-live/${fixtureId}?context=1`}
          label="Resync + contexte"
          pendingLabel="Sync…"
          variant="ghost"
        />
        <GenerateAdviceButton fixtureId={fixtureId} />
      </div>

      {/* CONSEIL LIVE — section principale, toujours visible */}
      {liveAdvice ? (
        <LiveAdvicePanel
          advice={liveAdvice}
          homeName={fixture.home.name}
          awayName={fixture.away.name}
          scoreHome={fixture.homeGoals}
          scoreAway={fixture.awayGoals}
          minute={fixture.elapsed}
          statusLong={fixture.statusLong}
          lastSyncedAt={detail.lastSyncedAt}
          freshnessSeconds={detail.freshnessSeconds}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-4 sm:px-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">
              Analyse live du match
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-100">
              {fixture.home.name} {fixture.homeGoals ?? "–"}-{fixture.awayGoals ?? "–"}{" "}
              {fixture.away.name}
            </h2>
            <p className="mt-1 text-sm text-amber-200">Aucune analyse générée pour ce match.</p>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <p className="text-sm text-slate-300">
              Les données du match sont en base ({debug.hasStatistics ? "stats présentes" : "stats absentes"},{" "}
              {debug.eventsCount} événement(s), {debug.lineupsCount} compo(s)). Générez l&apos;analyse
              maintenant — cela lit les dernières données stockées (aucun appel API) et crée le conseil
              live.
            </p>
            <GenerateAdviceButton fixtureId={fixtureId} big />
          </div>
        </div>
      )}

      {/* Surveillance live continue */}
      <LiveMonitorPanel fixtureId={fixtureId} />

      {/* Debug: données utilisées par l'analyse */}
      <AnalysisDebugPanel debug={debug} />

      {/* Analyse détaillée (moteur) */}
      {analysis ? (
        <div className="card card-pad">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={cn("badge", signalToneClass(analysis.signalLevel))}>
              {signalLabelFr(analysis.signalLevel)}
            </span>
            <span className="badge border border-border bg-night-850 text-slate-300">
              {confidenceLabelFr(analysis.confidenceLevel)}
            </span>
            {!analysis.dataQuality.hasOdds && (
              <span className="badge border border-border bg-night-850 text-slate-400">
                Cotes indisponibles
              </span>
            )}
          </div>
          <p className="text-sm text-slate-300">{analysis.summary}</p>
          <div className="mt-3 rounded-lg border border-border bg-night-850 p-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
              Verdict prudent
            </div>
            <p className="text-sm text-slate-200">{analysis.verdict}</p>
          </div>
        </div>
      ) : (
        <div className="card card-pad text-sm text-slate-400">
          Aucune analyse disponible. Lancez un resync live.
        </div>
      )}

      {/* Colonnes analyse / data */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {analysis && (
            <MomentumPanel
              home={analysis.homeMomentum}
              away={analysis.awayMomentum}
              homeName={fixture.home.name}
              awayName={fixture.away.name}
            />
          )}
          {analysis && <MarketSignalsPanel signals={analysis.marketSignals} />}
          {analysis && <RiskPanel risks={analysis.risks} />}
        </div>
        <div className="space-y-4">
          <LiveStatsGrid stats={statistics} />
          <EventsTimeline events={events} />
        </div>
      </div>

      <LineupsPanel lineups={lineups} />

      <RecentFormPanel
        homeName={fixture.home.name}
        awayName={fixture.away.name}
        home={recentForm.home}
        away={recentForm.away}
        h2h={h2h}
      />

      <CommentaryPanel events={commentary} />

      <AiAnalysisPanel fixtureId={fixtureId} />

      {/* Historique des conseils live (ce match) */}
      <div className="card card-pad">
        <div className="mb-3 section-title">Historique des conseils live (ce match)</div>
        {adviceHistory.length === 0 ? (
          <div className="text-sm text-slate-400">Aucun conseil enregistré pour l&apos;instant.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {adviceHistory.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">{a.mainAdvice}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatKickoff(a.collectedAt)} · {a.minute ?? "—"}&apos; · score {a.scoreHome ?? "—"}-
                    {a.scoreAway ?? "—"}
                  </div>
                </div>
                <span className={cn("badge shrink-0", actionToneClass(a.action))}>
                  {actionLabelFr(a.action)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historique des signaux générés pendant le match */}
      <div className="card card-pad">
        <div className="mb-3 section-title">Historique des signaux (ce match)</div>
        {history.length === 0 ? (
          <div className="text-sm text-slate-400">Aucun snapshot d&apos;analyse enregistré.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {history.map((h) => {
              const best = h.marketSignals.find((s) => s.market !== "avoid");
              return (
                <div key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-200">{best?.label ?? "Aucun signal"}</div>
                    <div className="text-[11px] text-slate-500">
                      {formatKickoff(h.collectedAt)} · momentum {h.homeMomentum ?? "—"}/
                      {h.awayMomentum ?? "—"}
                    </div>
                  </div>
                  <span className={cn("badge shrink-0", signalToneClass((h.signalLevel as never) ?? "none"))}>
                    {signalLabelFr((h.signalLevel as never) ?? "none")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Logs de fraîcheur des données */}
      <div className="card card-pad">
        <div className="mb-3 section-title">Fraîcheur des données</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <DataFreshnessBadge iso={detail.lastSyncedAt} seconds={detail.freshnessSeconds} />
          <span>
            Dernier sync: {detail.lastSyncedAt ? formatKickoff(detail.lastSyncedAt) : "—"} (
            {formatFreshness(detail.freshnessSeconds)})
          </span>
          <span>Stats: {statistics?.hasData ? "présentes" : "absentes"}</span>
          <span>Events: {events.length}</span>
          <span>Compositions: {lineups.length}</span>
        </div>
      </div>
    </div>
  );
}
