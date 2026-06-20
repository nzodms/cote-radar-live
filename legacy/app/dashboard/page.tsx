import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";
import {
  countAllMatches,
  countGeneratedSignals,
  loadLiveMatches,
  loadRecentAlerts,
  loadTodayMatches,
  type MatchListItem,
} from "@/lib/match-service";
import { getApiUsageStats } from "@/lib/api-usage";
import { hasApiKey } from "@/lib/api-football";
import { isSupabaseConfigured } from "@/lib/supabase";
import { todayDateUTC } from "@/lib/utils";
import { signalToneClass } from "@/lib/ui";
import type { AnalysisHistoryEntry } from "@/types/analysis";
import { cn, formatKickoff } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card card-pad">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold text-slate-100">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

function Section({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <span className="text-[11px] text-slate-500">{count}</span>
      </div>
      {count === 0 ? (
        <div className="card card-pad text-sm text-slate-400">{empty}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function bestSignalLabel(entry: AnalysisHistoryEntry): string | null {
  const real = entry.marketSignals.find((s) => s.market !== "avoid");
  return real?.label ?? null;
}

export default async function DashboardPage() {
  const date = todayDateUTC();
  const [live, today, matchesCount, signalsCount, alerts, usage] = await Promise.all([
    loadLiveMatches(),
    loadTodayMatches(date),
    countAllMatches(),
    countGeneratedSignals(),
    loadRecentAlerts(6),
    getApiUsageStats(),
  ]);

  const liveIds = new Set(live.map((m) => m.fixture.fixtureId));
  const upcoming = today.filter(
    (m) => m.fixture.phase === "scheduled" && !liveIds.has(m.fixture.fixtureId)
  );
  const finished = today.filter((m: MatchListItem) => m.fixture.phase === "finished");

  const showConfigBanner = !hasApiKey() || !isSupabaseConfigured();

  return (
    <div>
      {showConfigBanner && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="font-semibold">Configuration incomplète</div>
          <ul className="mt-1 list-disc pl-5 text-amber-200/90">
            {!hasApiKey() && <li>APISPORTS_KEY absente — renseignez-la dans .env.local.</li>}
            {!isSupabaseConfigured() && (
              <li>Supabase non configuré — les données ne seront pas persistées.</li>
            )}
          </ul>
          <Link href="/settings" className="mt-2 inline-block text-amber-100 underline">
            Ouvrir les réglages →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Matchs suivis" value={matchesCount} hint="Coupe du monde" />
        <StatCard label="Signaux générés" value={signalsCount} hint="snapshots d'analyse" />
        <StatCard label="En live" value={live.length} hint={`${upcoming.length} à venir aujourd'hui`} />
        <StatCard
          label="API estimée"
          value={`${usage.usedToday}/${usage.dailyQuota}`}
          hint={usage.nearLimit ? "limite proche" : `${usage.remaining} restants`}
        />
      </div>

      <Section
        title="Matchs live"
        count={live.length}
        empty="Aucun match de Coupe du monde en live actuellement. Lancez un sync depuis les réglages."
      >
        {live.map((m) => (
          <MatchCard key={m.fixture.fixtureId} item={m} />
        ))}
      </Section>

      <Section
        title="À venir aujourd'hui"
        count={upcoming.length}
        empty="Aucun match à venir trouvé pour aujourd'hui en base. Lancez « Sync World Cup today »."
      >
        {upcoming.map((m) => (
          <MatchCard key={m.fixture.fixtureId} item={m} />
        ))}
      </Section>

      <Section
        title="Terminés (aujourd'hui)"
        count={finished.length}
        empty="Aucun match terminé enregistré pour aujourd'hui."
      >
        {finished.map((m) => (
          <MatchCard key={m.fixture.fixtureId} item={m} />
        ))}
      </Section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Dernières alertes</h2>
        {alerts.length === 0 ? (
          <div className="card card-pad text-sm text-slate-400">
            Aucune alerte (signal moyen/fort) générée pour l&apos;instant.
          </div>
        ) : (
          <div className="card divide-y divide-border/60">
            {alerts.map((a) => (
              <Link
                key={a.id}
                href={`/matches/${a.fixtureId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-night-850"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">
                    {bestSignalLabel(a) ?? "Signal"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Match #{a.fixtureId} · {formatKickoff(a.collectedAt)}
                  </div>
                </div>
                <span className={cn("badge shrink-0", signalToneClass((a.signalLevel as never) ?? "weak"))}>
                  {a.signalLevel === "strong" ? "Signal fort" : "Signal moyen"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
