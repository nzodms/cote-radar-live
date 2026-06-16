import Link from "next/link";
import { LiveMatchHeader } from "@/components/LiveMatchHeader";
import { LiveStatsGrid } from "@/components/LiveStatsGrid";
import { MomentumPanel } from "@/components/MomentumPanel";
import { MarketSignalsPanel } from "@/components/MarketSignalsPanel";
import { RiskPanel } from "@/components/RiskPanel";
import { EventsTimeline } from "@/components/EventsTimeline";
import { LineupsPanel } from "@/components/LineupsPanel";
import { RecentFormPanel } from "@/components/RecentFormPanel";
import { SyncButton } from "@/components/SyncButton";
import { DataFreshnessBadge } from "@/components/DataFreshnessBadge";
import { loadMatchDetail } from "@/lib/match-service";
import { cn, formatFreshness, formatKickoff } from "@/lib/utils";
import { confidenceLabelFr, signalLabelFr, signalToneClass } from "@/lib/ui";

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

  const { fixture, statistics, events, lineups, analysis, recentForm, h2h, history } = detail;

  return (
    <div className="space-y-4">
      <LiveMatchHeader
        fixture={fixture}
        lastSyncedAt={detail.lastSyncedAt}
        freshnessSeconds={detail.freshnessSeconds}
      />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <SyncButton endpoint={`/api/cron/sync-live/${fixtureId}`} label="Resync live" pendingLabel="Sync…" />
        <SyncButton
          endpoint={`/api/cron/sync-live/${fixtureId}?context=1`}
          label="Resync + contexte (forme/H2H/cotes)"
          pendingLabel="Sync…"
          variant="ghost"
        />
      </div>

      {/* Verdict prudent */}
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
