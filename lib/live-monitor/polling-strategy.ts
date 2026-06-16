/**
 * Stratégie de polling intelligente (quota-aware).
 *
 * Décide, à chaque cycle, ce qu'on (re)collecte: stats, events, lineups —
 * en fonction du temps écoulé, des changements détectés, de l'action courante
 * et du quota restant. Free plan = prudent, plan payant = rapide, économie =
 * minimal quand le quota est presque épuisé.
 */

import type { MatchChanges } from "./change-detector";

export type MonitorMode = "paid" | "free" | "economy";

export interface MonitorConfig {
  enabled: boolean;
  livePollSeconds: number;
  statsPollSeconds: number;
  eventsPollSeconds: number;
  lineupsOnce: boolean;
  contextOnce: boolean;
  maxApiCallsPerDay: number;
  safeFreePlan: boolean;
}

export function getMonitorConfig(): MonitorConfig {
  const intp = (v: string | undefined, d: number) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const bool = (v: string | undefined, d: boolean) =>
    v === undefined ? d : v.toLowerCase() === "true";
  return {
    enabled: bool(process.env.ENABLE_LIVE_MONITOR, true),
    livePollSeconds: intp(process.env.LIVE_POLL_INTERVAL_SECONDS, 180),
    statsPollSeconds: intp(process.env.STATS_POLL_INTERVAL_SECONDS, 180),
    eventsPollSeconds: intp(process.env.EVENTS_POLL_INTERVAL_SECONDS, 360),
    lineupsOnce: bool(process.env.LINEUPS_SYNC_ONCE, true),
    contextOnce: bool(process.env.CONTEXT_SYNC_ONCE, true),
    maxApiCallsPerDay: intp(process.env.MAX_API_CALLS_PER_DAY, 100),
    safeFreePlan: bool(process.env.SAFE_FREE_PLAN, true),
  };
}

export interface PollStrategyInput {
  config: MonitorConfig;
  quotaRemaining: number;
  isLive: boolean;
  secondsSinceLastStats: number | null;
  secondsSinceLastEvents: number | null;
  currentAction: string | null;
  changes: MatchChanges;
  hasLineups: boolean;
}

export interface PollPlan {
  fetchStats: boolean;
  fetchEvents: boolean;
  fetchLineups: boolean;
  nextPollSeconds: number;
  mode: MonitorMode;
  reasons: string[];
}

const ECONOMY_THRESHOLD = 15;

export function resolveMode(config: MonitorConfig, quotaRemaining: number): MonitorMode {
  if (!config.safeFreePlan) return "paid";
  if (quotaRemaining < ECONOMY_THRESHOLD) return "economy";
  return "free";
}

export function decidePollPlan(input: PollStrategyInput): PollPlan {
  const { config, quotaRemaining, isLive, changes } = input;
  const mode = resolveMode(config, quotaRemaining);
  const reasons: string[] = [`mode=${mode}`, `quota=${quotaRemaining}`];

  // Intervalles selon le mode.
  let fixtureInterval: number;
  let statsInterval: number;
  let eventsInterval: number;
  if (mode === "paid") {
    fixtureInterval = 60;
    statsInterval = 60;
    eventsInterval = 60;
  } else if (mode === "economy") {
    fixtureInterval = 300;
    statsInterval = 600;
    eventsInterval = Number.POSITIVE_INFINITY; // events seulement si score change
  } else {
    fixtureInterval = config.livePollSeconds;
    statsInterval = config.statsPollSeconds;
    eventsInterval = config.eventsPollSeconds;
  }

  const attentive = input.currentAction === "WATCH" || input.currentAction === "SIGNAL";

  // --- Lineups: une seule fois si manquantes (et quota dispo) ---
  const fetchLineups = !input.hasLineups && quotaRemaining > 3;
  if (fetchLineups) reasons.push("lineups manquantes → 1 fetch");

  // Pré-match: pas de stats/events live.
  if (!isLive) {
    return {
      fetchStats: false,
      fetchEvents: false,
      fetchLineups,
      nextPollSeconds: 600,
      mode,
      reasons: [...reasons, "pré-match: pas de stats/events"],
    };
  }

  // --- Stats ---
  const statsDue = input.secondsSinceLastStats === null || input.secondsSinceLastStats >= statsInterval;
  let fetchStats =
    statsDue || changes.importantChange || (attentive && (input.secondsSinceLastStats ?? 9999) >= 90);
  if (mode === "economy") {
    // En économie: stats seulement si vraiment dû (10 min) ou score change.
    fetchStats = changes.scoreChanged || input.secondsSinceLastStats === null || (input.secondsSinceLastStats ?? 0) >= statsInterval;
  }
  if (quotaRemaining <= 1) fetchStats = false;
  if (fetchStats) reasons.push("stats à rafraîchir");

  // --- Events ---
  const eventsDue = input.secondsSinceLastEvents === null || input.secondsSinceLastEvents >= eventsInterval;
  let fetchEvents = eventsDue || changes.scoreChanged || changes.importantChange;
  if (mode === "economy") {
    fetchEvents = changes.scoreChanged; // strict
  }
  if (quotaRemaining <= 1) fetchEvents = false;
  if (fetchEvents) reasons.push("events à rafraîchir");

  // Prochain poll = intervalle fixture du mode.
  const nextPollSeconds = fixtureInterval;

  return { fetchStats, fetchEvents, fetchLineups, nextPollSeconds, mode, reasons };
}
