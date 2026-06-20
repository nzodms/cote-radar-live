/**
 * Scheduler de surveillance live (cron-driven, JAMAIS de boucle infinie).
 *
 * Concept Vercel-friendly:
 *  - Une session de watch par fixture (table live_watch_sessions) avec next_poll_at.
 *  - /api/cron/live-monitor exécute UN tick: il poll les sessions "dues".
 *  - Chaque poll fait un cycle court (fixture + collecte sélective + advice + alerte).
 *
 * La stratégie de quota vit dans polling-strategy.ts, la détection de changement
 * dans change-detector.ts.
 */

import { getServiceSupabase, TABLES } from "@/lib/supabase";
import {
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
} from "@/lib/api-football";
import {
  isWorldCupFixture,
  normalizeEvents,
  normalizeFixture,
  normalizeLineups,
  normalizeStatistics,
} from "@/lib/world-cup-filter";
import { generateLiveBettingAdvice } from "@/lib/live-advice";
import {
  generateAdviceFromStoredData,
  insertStatsSnapshotRow,
  loadCommentaryEvents,
  loadLastEventsAt,
  loadLastMatchState,
  loadLatestLiveAdvice,
  loadStatsSnapshotPoints,
  loadStoredContext,
  loadStoredEvents,
  loadStoredLineups,
  loadStoredStatistics,
  persistAdvice,
  replaceEventRows,
  replaceLineupRows,
  upsertMatchFromFixture,
} from "@/lib/match-service";
import { getApiUsageStats } from "@/lib/api-usage";
import { isLivePhase, secondsSince } from "@/lib/utils";
import {
  decidePollPlan,
  getMonitorConfig,
  type MonitorConfig,
} from "./polling-strategy";
import { detectMatchChanges, shouldSendWhatsAppAlert, type MatchChanges } from "./change-detector";
import {
  getWhatsAppMinIntervalSeconds,
  isWhatsAppEnabled,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";
import type { NormalizedStatsPair, NormalizedTeamStats } from "@/types/match";

export interface WatchSession {
  id: string;
  fixtureId: number;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  pollIntervalSeconds: number | null;
  lastPolledAt: string | null;
  nextPollAt: string | null;
  apiCallsUsed: number;
  lastError: string | null;
  mode: string | null;
  lastAlertAt: string | null;
  lastAlertSignature: string | null;
  lastAlertText: string | null;
}

export interface PollResult {
  fixtureId: number;
  polled: boolean;
  mode: string;
  apiCallsUsed: number;
  reasons: string[];
  changes: MatchChanges | null;
  action: string | null;
  alertSent: boolean;
  alertReason: string | null;
  nextPollAt: string | null;
  error: string | null;
}

export interface MonitorTickResult {
  ok: boolean;
  enabled: boolean;
  message: string;
  processed: number;
  remainingQuota: number;
  results: PollResult[];
}

function mapSession(r: any): WatchSession {
  return {
    id: r.id,
    fixtureId: r.fixture_id,
    status: r.status,
    startedAt: r.started_at ?? null,
    stoppedAt: r.stopped_at ?? null,
    pollIntervalSeconds: r.poll_interval_seconds ?? null,
    lastPolledAt: r.last_polled_at ?? null,
    nextPollAt: r.next_poll_at ?? null,
    apiCallsUsed: r.api_calls_used ?? 0,
    lastError: r.last_error ?? null,
    mode: r.mode ?? null,
    lastAlertAt: r.last_alert_at ?? null,
    lastAlertSignature: r.last_alert_signature ?? null,
    lastAlertText: r.last_alert_text ?? null,
  };
}

function emptyStats(): NormalizedStatsPair {
  const z: NormalizedTeamStats = {
    shotsOnGoal: null, shotsOffGoal: null, totalShots: null, blockedShots: null,
    shotsInsideBox: null, shotsOutsideBox: null, fouls: null, cornerKicks: null,
    offsides: null, ballPossession: null, yellowCards: null, redCards: null,
    goalkeeperSaves: null, totalPasses: null, passesAccurate: null, passesPercent: null,
  };
  return { home: { ...z }, away: { ...z }, hasData: false };
}

/* ----------------------------- Sessions ----------------------------- */

export async function getActiveSession(fixtureId: number): Promise<WatchSession | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from(TABLES.watchSessions)
    .select("*")
    .eq("fixture_id", fixtureId)
    .eq("status", "active")
    .maybeSingle();
  return data ? mapSession(data) : null;
}

export async function getLatestSession(fixtureId: number): Promise<WatchSession | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from(TABLES.watchSessions)
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapSession(data) : null;
}

async function updateSession(id: string, patch: Record<string, any>): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  await supabase.from(TABLES.watchSessions).update(patch).eq("id", id);
}

export async function startWatch(
  fixtureId: number
): Promise<{ ok: boolean; message: string; session: WatchSession | null }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { ok: false, message: "Supabase non configuré.", session: null };

  const existing = await getActiveSession(fixtureId);
  if (existing) {
    return { ok: true, message: "Surveillance déjà active.", session: existing };
  }

  const config = getMonitorConfig();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLES.watchSessions)
    .insert({
      fixture_id: fixtureId,
      status: "active",
      started_at: nowIso,
      poll_interval_seconds: config.livePollSeconds,
      next_poll_at: nowIso, // dû immédiatement au prochain tick
      api_calls_used: 0,
    })
    .select("*")
    .single();

  if (error) return { ok: false, message: `Échec démarrage: ${error.message}`, session: null };
  return { ok: true, message: "Surveillance live démarrée.", session: mapSession(data) };
}

export async function stopWatch(
  fixtureId: number,
  reason = "Arrêt manuel"
): Promise<{ ok: boolean; message: string }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { ok: false, message: "Supabase non configuré." };
  const active = await getActiveSession(fixtureId);
  if (!active) return { ok: true, message: "Aucune surveillance active." };
  await updateSession(active.id, {
    status: "stopped",
    stopped_at: new Date().toISOString(),
    last_error: reason,
  });
  return { ok: true, message: "Surveillance arrêtée." };
}

export interface WatchStatus {
  ok: boolean;
  monitorEnabled: boolean;
  active: boolean;
  session: WatchSession | null;
  nextPollInSeconds: number | null;
  usedToday: number;
  dailyQuota: number;
  remainingQuota: number;
  lastAdviceAction: string | null;
  lastAlertAt: string | null;
  lastAlertText: string | null;
}

export async function getWatchStatus(fixtureId: number): Promise<WatchStatus> {
  const config = getMonitorConfig();
  const session = await getLatestSession(fixtureId);
  const usage = await getApiUsageStats();
  const lastAdvice = await loadLatestLiveAdvice(fixtureId);

  let nextPollInSeconds: number | null = null;
  if (session?.status === "active" && session.nextPollAt) {
    const diff = Math.floor((new Date(session.nextPollAt).getTime() - Date.now()) / 1000);
    nextPollInSeconds = Math.max(0, diff);
  }

  return {
    ok: true,
    monitorEnabled: config.enabled,
    active: session?.status === "active",
    session,
    nextPollInSeconds,
    usedToday: usage.usedToday,
    dailyQuota: config.maxApiCallsPerDay,
    remainingQuota: Math.max(0, config.maxApiCallsPerDay - usage.usedToday),
    lastAdviceAction: lastAdvice?.action ?? null,
    lastAlertAt: session?.lastAlertAt ?? null,
    lastAlertText: session?.lastAlertText ?? null,
  };
}

/* ----------------------------- Tick / poll ----------------------------- */

export async function runMonitorTick(
  opts: { fixtureId?: number; force?: boolean } = {}
): Promise<MonitorTickResult> {
  const config = getMonitorConfig();
  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
      message: "Live monitor désactivé (ENABLE_LIVE_MONITOR=false).",
      processed: 0,
      remainingQuota: 0,
      results: [],
    };
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return { ok: false, enabled: true, message: "Supabase non configuré.", processed: 0, remainingQuota: 0, results: [] };
  }

  const usage = await getApiUsageStats();
  let remaining = Math.max(0, config.maxApiCallsPerDay - usage.usedToday);

  // Sélection des sessions à traiter.
  let sessions: WatchSession[] = [];
  if (opts.fixtureId) {
    const s = await getActiveSession(opts.fixtureId);
    if (s) sessions = [s];
  } else {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from(TABLES.watchSessions)
      .select("*")
      .eq("status", "active")
      .or(`next_poll_at.is.null,next_poll_at.lte.${nowIso}`)
      .order("next_poll_at", { ascending: true })
      .limit(20);
    sessions = (data ?? []).map(mapSession);
  }

  const results: PollResult[] = [];
  for (const session of sessions) {
    // Respecte next_poll_at sauf si force.
    if (!opts.force && session.nextPollAt && new Date(session.nextPollAt).getTime() > Date.now()) {
      continue;
    }
    const res = await pollOneSession(session, { remaining, config });
    remaining = Math.max(0, remaining - res.apiCallsUsed);
    results.push(res);
  }

  return {
    ok: true,
    enabled: true,
    message: `Tick exécuté: ${results.length} session(s) traitée(s).`,
    processed: results.length,
    remainingQuota: remaining,
    results,
  };
}

async function pollOneSession(
  session: WatchSession,
  ctx: { remaining: number; config: MonitorConfig }
): Promise<PollResult> {
  const fixtureId = session.fixtureId;
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  let calls = 0;

  const base: PollResult = {
    fixtureId,
    polled: false,
    mode: "free",
    apiCallsUsed: 0,
    reasons: [],
    changes: null,
    action: null,
    alertSent: false,
    alertReason: null,
    nextPollAt: null,
    error: null,
  };

  // --- Quota épuisé: on régénère depuis la base (0 appel API) et on replanifie loin.
  if (ctx.remaining <= 0) {
    const gen = await generateAdviceFromStoredData(fixtureId).catch(() => null);
    const nextPollAt = new Date(nowMs + 600_000).toISOString();
    await updateSession(session.id, {
      last_polled_at: nowIso,
      next_poll_at: nextPollAt,
      last_error: "Quota journalier atteint: pas d'appel API.",
      mode: "economy",
    });
    return {
      ...base,
      mode: "economy",
      reasons: ["quota épuisé: régénération depuis la base"],
      action: gen?.advice?.action ?? null,
      nextPollAt,
      error: "Quota atteint",
    };
  }

  // --- 1) fixture (1 appel)
  let af;
  try {
    af = await getFixtureById(fixtureId);
    calls += 1;
  } catch (err) {
    const nextPollAt = new Date(nowMs + 300_000).toISOString();
    await updateSession(session.id, { last_polled_at: nowIso, next_poll_at: nextPollAt, last_error: (err as Error).message });
    return { ...base, apiCallsUsed: calls, nextPollAt, error: (err as Error).message };
  }

  if (!af) {
    const nextPollAt = new Date(nowMs + 300_000).toISOString();
    await updateSession(session.id, { last_polled_at: nowIso, next_poll_at: nextPollAt, last_error: "Fixture introuvable.", api_calls_used: session.apiCallsUsed + calls });
    return { ...base, apiCallsUsed: calls, nextPollAt, error: "Fixture introuvable." };
  }

  if (!isWorldCupFixture(af)) {
    await updateSession(session.id, { status: "stopped", stopped_at: nowIso, last_error: "Hors Coupe du monde." });
    return { ...base, polled: true, apiCallsUsed: calls, error: "Hors Coupe du monde: surveillance arrêtée." };
  }

  const fixture = normalizeFixture(af);
  const isLive = isLivePhase(fixture.phase);
  const prevState = await loadLastMatchState(fixtureId);
  const changes = detectMatchChanges(prevState, fixture);

  // --- timing + état stocké
  const storedStats = await loadStoredStatistics(fixtureId);
  const lastEventsAt = await loadLastEventsAt(fixtureId);
  const lineups = await loadStoredLineups(fixtureId);
  const previousAdvice = await loadLatestLiveAdvice(fixtureId);

  const plan = decidePollPlan({
    config: ctx.config,
    quotaRemaining: ctx.remaining - calls,
    isLive,
    secondsSinceLastStats: secondsSince(storedStats.collectedAt),
    secondsSinceLastEvents: secondsSince(lastEventsAt),
    currentAction: previousAdvice?.action ?? null,
    changes,
    hasLineups: lineups.length > 0,
  });

  // --- 2) collecte sélective
  let statistics = storedStats.statistics;
  let rawStats: unknown = null;
  if (plan.fetchStats && ctx.remaining - calls > 0) {
    try {
      rawStats = await getFixtureStatistics(fixtureId);
      calls += 1;
      statistics = normalizeStatistics(rawStats as any, fixture.home.id, fixture.away.id);
    } catch (err) {
      plan.reasons.push(`stats KO: ${(err as Error).message}`);
    }
  }

  let events = await loadStoredEvents(fixtureId);
  let rawEvents: any[] | null = null;
  if (plan.fetchEvents && ctx.remaining - calls > 0) {
    try {
      rawEvents = await getFixtureEvents(fixtureId);
      calls += 1;
      events = normalizeEvents(rawEvents as any);
    } catch (err) {
      plan.reasons.push(`events KO: ${(err as Error).message}`);
    }
  }

  let lineupsToUse = lineups;
  let fetchedLineups = false;
  if (plan.fetchLineups && ctx.remaining - calls > 0) {
    try {
      const rawL = await getFixtureLineups(fixtureId);
      calls += 1;
      const nl = normalizeLineups(rawL);
      if (nl.length > 0) {
        lineupsToUse = nl;
        fetchedLineups = true;
      }
    } catch (err) {
      plan.reasons.push(`lineups KO: ${(err as Error).message}`);
    }
  }

  // --- 3) stockage
  await upsertMatchFromFixture(fixture, af);
  if (plan.fetchStats && statistics?.hasData) {
    await insertStatsSnapshotRow(fixtureId, statistics, rawStats, fixture.elapsed);
  }
  if (plan.fetchEvents && events.length > 0) {
    await replaceEventRows(fixtureId, events, rawEvents ?? undefined);
  }
  if (fetchedLineups) {
    await replaceLineupRows(fixtureId, lineupsToUse);
  }

  // --- 4) advice
  const previousSnapshots = await loadStatsSnapshotPoints(fixtureId, 20);
  const commentary = await loadCommentaryEvents(fixtureId);
  const context = await loadStoredContext(fixtureId);
  const advice = generateLiveBettingAdvice({
    fixture,
    statistics: statistics ?? emptyStats(),
    events,
    lineups: lineupsToUse,
    recentForm: context.recentForm,
    h2h: context.h2h,
    odds: { available: false, message: "Cotes indisponibles sur le plan actuel." },
    previousSnapshots,
    externalCommentaryEvents: commentary,
    freshnessSeconds: 0,
  });
  await persistAdvice(fixtureId, fixture, advice);

  // --- 5) alerte WhatsApp (anti-spam)
  let alertSent = false;
  let alertReason: string | null = null;
  const decision = shouldSendWhatsAppAlert({ fixture, previousAdvice, currentAdvice: advice, changes, events });
  const patch: Record<string, any> = {
    last_polled_at: nowIso,
    api_calls_used: session.apiCallsUsed + calls,
    mode: plan.mode,
    last_error: null,
    poll_interval_seconds: plan.nextPollSeconds,
  };

  if (decision.send) {
    const minInterval = getWhatsAppMinIntervalSeconds();
    const sinceLast = secondsSince(session.lastAlertAt);
    const similar = session.lastAlertSignature === decision.signature;
    const cooldownBlocked = similar && sinceLast !== null && sinceLast < minInterval;

    if (cooldownBlocked) {
      alertReason = `${decision.type} (anti-spam: cooldown ${minInterval}s)`;
    } else if (!isWhatsAppEnabled()) {
      alertReason = `${decision.type} (WhatsApp désactivé)`;
    } else {
      const r = await sendWhatsAppMessage(decision.message ?? "");
      alertSent = r.sent;
      alertReason = r.sent ? decision.type : `${decision.type} (échec: ${r.reason ?? "?"})`;
      if (r.sent) {
        patch.last_alert_at = nowIso;
        patch.last_alert_signature = decision.signature;
        patch.last_alert_text = decision.message;
      }
    }
  }

  // --- 6) replanification (ou clôture si match terminé)
  let nextPollAt: string;
  if (fixture.phase === "finished") {
    patch.status = "finished";
    patch.stopped_at = nowIso;
    nextPollAt = nowIso;
  } else {
    nextPollAt = new Date(nowMs + plan.nextPollSeconds * 1000).toISOString();
    patch.next_poll_at = nextPollAt;
  }
  await updateSession(session.id, patch);

  return {
    fixtureId,
    polled: true,
    mode: plan.mode,
    apiCallsUsed: calls,
    reasons: plan.reasons,
    changes,
    action: advice.action,
    alertSent,
    alertReason,
    nextPollAt,
    error: null,
  };
}
