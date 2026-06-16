import { SyncButton } from "@/components/SyncButton";
import { hasApiKey } from "@/lib/api-football";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getApiUsageStats } from "@/lib/api-usage";
import { getWorldCupConfig } from "@/lib/world-cup-filter";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <span
        className={cn(
          "badge",
          ok === true
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            : ok === false
            ? "bg-red-500/15 text-red-300 border border-red-500/30"
            : "border border-border bg-night-850 text-slate-300"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const usage = await getApiUsageStats();
  const wc = getWorldCupConfig();
  const apiKeyPresent = hasApiKey();
  const supabaseOk = isSupabaseConfigured();
  const refreshInterval = process.env.API_REFRESH_INTERVAL_SECONDS ?? "120";
  const safeFreePlan = (process.env.SAFE_FREE_PLAN ?? "true").toLowerCase() === "true";

  return (
    <div className="space-y-4">
      {/* Configuration */}
      <div className="card card-pad">
        <div className="mb-2 section-title">Configuration</div>
        <StatusRow
          label="Clé API-Football (APISPORTS_KEY)"
          value={apiKeyPresent ? "Présente" : "Absente"}
          ok={apiKeyPresent}
        />
        <StatusRow
          label="Supabase (stockage)"
          value={supabaseOk ? "Configuré" : "Non configuré"}
          ok={supabaseOk}
        />
        <StatusRow label="Intervalle de refresh" value={`${refreshInterval}s`} />
        <StatusRow
          label="Mode plan Free (SAFE_FREE_PLAN)"
          value={safeFreePlan ? "Activé" : "Désactivé"}
          ok={safeFreePlan ? true : null}
        />
        <StatusRow
          label="Appels API estimés (aujourd'hui)"
          value={`${usage.usedToday}/${usage.dailyQuota}`}
          ok={usage.overLimit ? false : usage.nearLimit ? null : true}
        />
        <StatusRow
          label="Filtre Coupe du monde"
          value={`league ${wc.leagueId} · ${wc.leagueName} · ${wc.season}`}
        />
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          La clé API n&apos;est jamais exposée ici ni côté client. Seul son statut (présente/absente)
          est affiché. Tous les appels API-Football sont effectués côté serveur.
        </p>
      </div>

      {/* Actions */}
      <div className="card card-pad">
        <div className="mb-3 section-title">Actions</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium text-slate-200">Tester l&apos;API</div>
            <p className="mb-2 text-[11px] text-slate-500">
              Vérifie la clé via GET /status et affiche le quota réel.
            </p>
            <SyncButton endpoint="/api/test-api" label="Tester l'API" variant="ghost" refreshOnDone={false} />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-slate-200">Sync World Cup (aujourd&apos;hui)</div>
            <p className="mb-2 text-[11px] text-slate-500">
              Récupère les fixtures du jour et ne garde que la Coupe du monde.
            </p>
            <SyncButton endpoint="/api/cron/sync-world-cup" label="Sync World Cup today" />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-slate-200">
              Sync World Cup (2026-06-16, test)
            </div>
            <p className="mb-2 text-[11px] text-slate-500">
              Date du match test Iran vs New Zealand.
            </p>
            <SyncButton
              endpoint="/api/cron/sync-world-cup?date=2026-06-16"
              label="Sync 2026-06-16"
              variant="ghost"
            />
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-slate-200">
              Sync Iran vs New Zealand (#1489378)
            </div>
            <p className="mb-2 text-[11px] text-slate-500">
              Fixture test: récupère statut, stats, events, compositions + contexte, et génère
              l&apos;analyse.
            </p>
            <SyncButton
              endpoint="/api/cron/sync-live/1489378?context=1"
              label="Sync match test"
            />
          </div>
        </div>
      </div>

      {/* Quota / plan Free */}
      <div className="card card-pad">
        <div className="mb-2 section-title">Plan Free &amp; quota</div>
        <p className="text-xs leading-relaxed text-slate-400">
          Le plan Free d&apos;API-Football est limité à <strong>100 requêtes/jour</strong>. CoteRadar
          minimise les appels: les pages lisent la base, et seuls les syncs consomment le quota.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
          <li>Pré-match: synchroniser toutes les 30 à 60 minutes.</li>
          <li>Live: synchroniser au maximum toutes les {refreshInterval}s (jamais toutes les 5-10s).</li>
          <li>Un sync live = ~3-4 appels (fixture, stats, events, compositions).</li>
          <li>Le contexte (forme, H2H, cotes) ajoute ~4 appels: à utiliser ponctuellement.</li>
        </ul>
        {usage.nearLimit && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            Vous approchez la limite du plan Free ({usage.usedToday}/{usage.dailyQuota}).
          </div>
        )}
      </div>
    </div>
  );
}
