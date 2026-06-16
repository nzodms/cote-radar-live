"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import type { MatchListItem } from "@/lib/match-service";
import type { ApiUsageStats } from "@/lib/api-usage";

export default function LivePage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [usage, setUsage] = useState<ApiUsageStats | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState(120);
  const [countdown, setCountdown] = useState(120);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const didInit = useRef(false);

  // Lecture base (aucun appel API-Football)
  const readFromDb = useCallback(async () => {
    setLoading(true);
    try {
      const [matchesRes, usageRes] = await Promise.all([
        fetch("/api/matches/today?live=1", { cache: "no-store" }),
        fetch("/api/usage", { cache: "no-store" }),
      ]);
      const matchesJson = await matchesRes.json();
      const usageJson = await usageRes.json();
      if (matchesJson.ok) setMatches(matchesJson.matches ?? []);
      if (usageJson.ok) {
        setUsage(usageJson.usage ?? null);
        if (typeof usageJson.refreshIntervalSeconds === "number") {
          setIntervalSeconds(usageJson.refreshIntervalSeconds);
        }
      }
      setLastRefresh(new Date());
    } catch {
      setNote("Lecture impossible (réseau).");
    } finally {
      setLoading(false);
      setCountdown(intervalSeconds);
    }
  }, [intervalSeconds]);

  // Sync API réelle des matchs live (consomme du quota)
  const syncLiveViaApi = useCallback(async () => {
    if (matches.length === 0) {
      setNote("Aucun match live à synchroniser.");
      return;
    }
    if (usage?.overLimit) {
      setNote("Quota Free atteint: synchronisation bloquée pour préserver les appels.");
      return;
    }
    setSyncing(true);
    setNote(`Synchronisation de ${matches.length} match(s) live via API…`);
    try {
      for (const m of matches) {
        await fetch(`/api/cron/sync-live/${m.fixture.fixtureId}`, {
          method: "POST",
          cache: "no-store",
        });
      }
      setNote("Synchronisation terminée.");
      await readFromDb();
    } catch {
      setNote("Échec partiel de la synchronisation.");
    } finally {
      setSyncing(false);
    }
  }, [matches, usage, readFromDb]);

  // Init + auto-refresh (lecture base) toutes les `intervalSeconds`
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    readFromDb();
  }, [readFromDb]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          readFromDb();
          return intervalSeconds;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [intervalSeconds, readFromDb]);

  const warning = useMemo(() => {
    if (!usage) return null;
    if (usage.overLimit)
      return { tone: "red", text: `Limite Free atteinte (${usage.usedToday}/${usage.dailyQuota}). Évitez les syncs API.` };
    if (usage.nearLimit)
      return {
        tone: "amber",
        text: `Attention: ${usage.usedToday}/${usage.dailyQuota} appels API estimés aujourd'hui (limite proche).`,
      };
    return null;
  }, [usage]);

  return (
    <div className="space-y-4">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Suivi live — Coupe du monde</div>
            <div className="text-[11px] text-slate-500">
              Auto-rafraîchissement (lecture base) toutes les {intervalSeconds}s · prochain dans{" "}
              <span className="font-mono text-slate-300">{countdown}s</span>
              {lastRefresh && <> · dernier: {lastRefresh.toLocaleTimeString("fr-FR")}</>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={readFromDb}
              disabled={loading}
              className="rounded-lg border border-border bg-night-850 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-night-800 disabled:opacity-60"
            >
              {loading ? "Lecture…" : "Rafraîchir (base)"}
            </button>
            <button
              type="button"
              onClick={syncLiveViaApi}
              disabled={syncing || usage?.overLimit}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-deep disabled:opacity-60"
              title="Récupère les données fraîches via l'API (consomme du quota)"
            >
              {syncing ? "Sync API…" : "Synchroniser via API"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          L&apos;auto-rafraîchissement ne lit que la base (aucun appel API). La synchronisation via
          API récupère les données fraîches mais consomme le quota Free (100/jour). Ne jamais
          rafraîchir l&apos;API toutes les quelques secondes.
        </p>

        {warning && (
          <div
            className={`mt-3 rounded-lg border p-2.5 text-xs ${
              warning.tone === "red"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            {warning.text}
          </div>
        )}
        {note && <div className="mt-2 text-[11px] text-slate-400">{note}</div>}
      </div>

      {matches.length === 0 ? (
        <div className="card card-pad text-sm text-slate-400">
          Aucun match de Coupe du monde en live actuellement (en base). Lancez un « Sync World Cup
          today » puis une synchronisation live, ou attendez un match en cours.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((m) => (
            <MatchCard key={m.fixture.fixtureId} item={m} />
          ))}
        </div>
      )}
    </div>
  );
}
