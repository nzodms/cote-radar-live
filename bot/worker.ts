/**
 * Worker Telegram CoteRadar Live — système multi-capteurs (process Node, hors Vercel).
 *
 * Capteurs: API-Football (principale), commentaires (5s), marché (10s),
 * lineup/blessures (5min), news/contexte (15min), alt-stats (opt). Fusion engine
 * = cerveau central. Anti-spam intelligent (CRITICAL immédiat). État persistant.
 *
 * Lancer: npm run worker
 */

import { getBotConfig } from "./config";
import { botState } from "./state";
import type { WatchState } from "./state";
import { getMe, getUpdates, sendTelegramMessage } from "./telegram";
import { handleCommand } from "./commands";
import { fetchApiLive, fetchContextOnce, runLiveCycle } from "./live-engine";
import { fetchWinamaxCommentary } from "./winamax-watcher";
import { fetchMarketSnapshot } from "./scrapers/market-scraper";
import { computeMarketEvents } from "./market-signal-engine";
import { fetchLineupInjury } from "./scrapers/lineup-injury-scraper";
import { fetchNewsContext } from "./scrapers/news-context-scraper";
import { fetchAltStats } from "./scrapers/alt-live-stats-scraper";
import { sourceHealth } from "./scrapers/source-health";
import { fuseSignals, type FusionResult } from "./fusion-engine";
import { formatLiveAlert } from "./format";
import { applyPersisted, buildPersisted, loadPersisted, savePersisted } from "./persistence";
import { getAccountStatus } from "@/lib/api-football";
import type { LiveBettingAdvice } from "@/types/live-advice";
import type { NormalizedFixture } from "@/types/match";
import type { FusionApiSnapshot } from "./scraper-types";
import type { LiveAlert } from "./types";

const config = getBotConfig();
let running = true;

function tag(t: string, msg: string): void {
  console.log(`[${t}] ${msg}`);
}

/* ----------------------------- Fusion / dispatch ----------------------------- */

function buildApiSnapshot(
  fixture: NormalizedFixture,
  advice: LiveBettingAdvice,
  criticalEvent: boolean
): FusionApiSnapshot {
  const pressureType = advice.momentum.isSterileDomination
    ? "sterile"
    : advice.momentum.isRealPressure
    ? "dangerous"
    : "none";
  return {
    hasStats: advice.dataQuality.hasStatistics,
    dominantTeam: advice.dominantTeam,
    momentumTeam: advice.dominantTeam,
    pressureType,
    criticalEvent,
    homeName: fixture.home.name,
    awayName: fixture.away.name,
  };
}

function computeFusion(w: WatchState, fixture: NormalizedFixture, advice: LiveBettingAdvice, alerts: LiveAlert[]): FusionResult {
  const criticalEvent = alerts.some((a) => a.level === "CRITICAL");
  const commentaryEvents = alerts
    .filter((a) => a.source === "secondary" && a.kind !== "sequence")
    .map((a) => ({ level: a.level, kind: a.kind, team: null as "home" | "away" | null }));
  return fuseSignals({
    apiSnapshot: buildApiSnapshot(fixture, advice, criticalEvent),
    commentaryEvents,
    marketEvents: w.sensors.recentMarketEvents,
    lineupSignals: w.sensors.lineupSignals,
    contextSignals: w.sensors.contextSignals,
    altStatsSnapshot: w.sensors.altStats,
    previousAdvice: w.prevAdvice,
  });
}

function fusionSummary(f: FusionResult): { sources: string[]; contradictions: string[]; confidence: string } {
  const labels: Record<string, string> = {
    api: "API",
    commentary: "commentaires",
    market: "marché",
    lineup: "compos",
    context: "contexte",
    altStats: "stats alt",
  };
  const sources = Object.entries(f.sourceAgreement)
    .filter(([, v]) => v)
    .map(([k]) => labels[k] ?? k);
  return { sources, contradictions: f.contradictions, confidence: f.confidence };
}

async function dispatch(
  w: WatchState,
  fixture: NormalizedFixture,
  advice: LiveBettingAdvice,
  alerts: LiveAlert[],
  fusion: FusionResult
): Promise<void> {
  const summary = fusionSummary(fusion);
  for (const alert of alerts) {
    const decision = w.gate.decide(alert);
    if (!decision.send) {
      tag("ANTISPAM", `skip [${alert.level}] ${alert.kind}: ${decision.reason}`);
      continue;
    }
    w.gate.markSent(alert);
    const text = formatLiveAlert({
      fixture,
      advice,
      level: alert.level,
      source: alert.source,
      whatHappened: alert.whatHappened,
      fusion: summary,
    });
    w.lastAnalysisText = text;
    w.lastAlertText = `${alert.level}/${alert.kind} (${alert.source}) @ ${new Date().toISOString().slice(11, 19)}`;
    w.alertsSent += 1;
    let sent = false;
    if (config.enableTelegram && config.telegramToken && config.telegramChatId) {
      const r = await sendTelegramMessage(config.telegramToken, config.telegramChatId, text);
      sent = r.ok;
      if (!r.ok) tag("TELEGRAM", `sent=false error=${r.error}`);
    }
    tag("TELEGRAM", `sent=${sent} alertType=${alert.kind} level=${alert.level} source=${alert.source}`);
    // Source secondaire => confirmation API immédiate, throttlée (IMMEDIATE_ANALYSIS_COOLDOWN_SECONDS).
    if (alert.source === "secondary") {
      const now = Date.now();
      if (now - w.lastImmediateConfirmAt >= config.immediateAnalysisCooldownSeconds * 1000) {
        w.lastApiPollAt = 0;
        w.lastImmediateConfirmAt = now;
      }
    }
  }
  persist();
}

/* ----------------------------- Capteur API ----------------------------- */

async function apiPoll(w: WatchState): Promise<void> {
  if (botState.apiCallsUsedToday >= config.maxApiCallsPerDay) {
    tag("API", `quota atteint (${botState.apiCallsUsedToday}/${config.maxApiCallsPerDay}) — poll API ignoré`);
    return;
  }
  const t0 = Date.now();
  botState.lastApiPollAt = Date.now();
  const live = await fetchApiLive(w.fixtureId);
  botState.bumpApi(3);
  if (!live) {
    sourceHealth.recordError("api");
    tag("API", `#${w.fixtureId} fixture introuvable`);
    return;
  }
  if (!w.contextLoaded) {
    try {
      const ctx = await fetchContextOnce(live.fixture);
      botState.bumpApi(4);
      w.recentForm = ctx.recentForm;
      w.h2h = ctx.h2h;
      w.lineups = ctx.lineups;
    } catch {
      /* contexte best-effort */
    }
    w.contextLoaded = true;
  }

  w.snapshots.push({
    collectedAt: new Date().toISOString(),
    elapsed: live.fixture.elapsed,
    home: live.statistics.home,
    away: live.statistics.away,
  });
  if (w.snapshots.length > 40) w.snapshots.shift();

  const { advice, alerts } = runLiveCycle(
    { fixture: live.fixture, statistics: live.statistics, events: live.events, lineups: w.lineups, recentForm: w.recentForm, h2h: w.h2h, previousSnapshots: w.snapshots, commentary: w.commentary },
    w,
    "api"
  );
  sourceHealth.recordSuccess("api", Date.now() - t0, live.events.length, alerts.length);
  const fusion = computeFusion(w, live.fixture, advice, alerts);
  const f = live.fixture;
  tag(
    "API",
    `${f.elapsed ?? 0}' ${f.home.name} ${f.homeGoals ?? 0}-${f.awayGoals ?? 0} ${f.away.name} action=${advice.action} alert=${alerts.length > 0} conf=${fusion.confidence}`
  );
  await dispatch(w, live.fixture, advice, alerts, fusion);

  if (live.fixture.phase === "finished") {
    tag("API", `match #${w.fixtureId} terminé — arrêt surveillance`);
    w.active = false;
  }
}

/* ----------------------------- Capteur commentaires (5s) ----------------------------- */

async function commentaryPoll(w: WatchState): Promise<void> {
  if (!config.commentary.url || !w.lastFixture || !w.lastStatistics) return;
  const fx = w.lastFixture;
  const st = w.lastStatistics;
  const t0 = Date.now();
  botState.lastWinamaxPollAt = Date.now();
  const res = await fetchWinamaxCommentary(config.commentary.url, fx.home.name, fx.away.name);
  if (res.error) {
    w.winamaxErrorCount += 1;
    sourceHealth.recordError("commentary");
    tag("WINAMAX", `error=${res.error} count=${w.winamaxErrorCount}`);
    return;
  }
  w.winamaxErrorCount = 0;
  const before = w.commentary.length;
  for (const e of res.events) w.commentary.push(e);
  if (w.commentary.length > 200) w.commentary = w.commentary.slice(-200);
  const newCount = w.commentary.length - before;
  sourceHealth.recordSuccess("commentary", Date.now() - t0, res.events.length);
  if (res.events.length === 0) return;

  const { advice, alerts } = runLiveCycle(
    { fixture: fx, statistics: st, events: [], lineups: w.lineups, recentForm: w.recentForm, h2h: w.h2h, previousSnapshots: w.snapshots, commentary: w.commentary },
    w,
    "secondary"
  );
  const important = alerts.some((a) => a.level === "HIGH" || a.level === "CRITICAL");
  const top = alerts[0];
  w.lastCommentaryText = res.events[res.events.length - 1]?.rawTitle ?? w.lastCommentaryText;
  tag(
    "WINAMAX",
    `newEvents=${newCount} important=${important} type=${top?.kind ?? "none"} immediateAnalysis=${important}`
  );
  const fusion = computeFusion(w, fx, advice, alerts);
  await dispatch(w, fx, advice, alerts, fusion);
}

/* ----------------------------- Capteur marché (10s) ----------------------------- */

async function marketPoll(w: WatchState): Promise<void> {
  if (!config.market.url || !w.lastFixture) return;
  const fx = w.lastFixture;
  const t0 = Date.now();
  w.sensors.lastMarketPollAt = Date.now();
  const { snapshot, error } = await fetchMarketSnapshot(config.market.url, fx.elapsed);
  if (error || !snapshot) {
    sourceHealth.recordError("market");
    tag("MARKET", `error=${error ?? "no snapshot"}`);
    return;
  }
  const dangerRecent = w.prevAdvice?.momentum.isRealPressure ?? false;
  const events = computeMarketEvents(w.sensors.lastMarketSnapshot, snapshot, dangerRecent);
  w.sensors.lastMarketSnapshot = snapshot;
  w.sensors.recentMarketEvents = events;
  sourceHealth.recordSuccess("market", Date.now() - t0, snapshot.selections.length, events.length);
  if (events.length === 0) {
    tag("MARKET", `suspended=${snapshot.suspended} selections=${snapshot.selections.length} moves=0`);
    return;
  }
  tag("MARKET", `moves=${events.length} top=${events[0].movement}/${events[0].impact}`);

  if (!w.lastStatistics) return;
  const st = w.lastStatistics;
  // Construit des alertes marché (source secondaire => WATCH max).
  const { advice } = runLiveCycle(
    { fixture: fx, statistics: st, events: [], lineups: w.lineups, recentForm: w.recentForm, h2h: w.h2h, previousSnapshots: w.snapshots, commentary: w.commentary },
    w,
    "secondary"
  );
  const alerts: LiveAlert[] = events.map((m) => ({
    dedupId: `market:${w.fixtureId}:${m.market}:${m.selection}:${m.movement}:${m.minute ?? "x"}:${m.changePct ?? "x"}`,
    level: m.impact,
    source: "secondary",
    kind: `market_${m.movement}`,
    whatHappened: m.summary,
    signature: `market|${advice.action}|${fx.homeGoals ?? 0}-${fx.awayGoals ?? 0}`,
  }));
  const fusion = computeFusion(w, fx, advice, alerts);
  await dispatch(w, fx, advice, alerts, fusion);
}

/* ----------------------------- Capteurs contexte ----------------------------- */

async function lineupPoll(w: WatchState): Promise<void> {
  if (!config.lineup.url || !w.lastFixture) return;
  const t0 = Date.now();
  w.sensors.lastLineupPollAt = Date.now();
  const { signals, error } = await fetchLineupInjury(config.lineup.url, w.lastFixture.home.name, w.lastFixture.away.name);
  if (error) {
    sourceHealth.recordError("lineup");
    return;
  }
  w.sensors.lineupSignals = signals;
  sourceHealth.recordSuccess("lineup", Date.now() - t0, signals.length);
  tag("LINEUP", `signals=${signals.length}`);
}

async function newsPoll(w: WatchState): Promise<void> {
  if (config.news.urls.length === 0 || !w.lastFixture) return;
  const t0 = Date.now();
  w.sensors.lastNewsPollAt = Date.now();
  const { signals, error } = await fetchNewsContext(config.news.urls, w.lastFixture.home.name, w.lastFixture.away.name);
  if (error && signals.length === 0) {
    sourceHealth.recordError("news");
    return;
  }
  w.sensors.contextSignals = signals;
  sourceHealth.recordSuccess("news", Date.now() - t0, signals.length);
  tag("NEWS", `signals=${signals.length}`);
}

async function altStatsPoll(w: WatchState): Promise<void> {
  if (!config.altStats.url || !w.lastFixture) return;
  const t0 = Date.now();
  w.sensors.lastAltStatsPollAt = Date.now();
  const { snapshot, error } = await fetchAltStats(config.altStats.url);
  if (error || !snapshot) {
    sourceHealth.recordError("altStats");
    return;
  }
  w.sensors.altStats = snapshot;
  sourceHealth.recordSuccess("altStats", Date.now() - t0, 1);
  tag("ALTSTATS", `minute=${snapshot.minute ?? "?"} source=${snapshot.source}`);
}

/* ----------------------------- Boucles ----------------------------- */

function due(now: number, last: number, intervalSec: number): boolean {
  return now - last >= intervalSec * 1000;
}

function startWatcherLoop(): void {
  setInterval(() => {
    const now = Date.now();
    for (const w of botState.activeWatches()) {
      if (config.enableApiMonitor && due(now, w.lastApiPollAt, config.apiPollSeconds)) {
        w.lastApiPollAt = now;
        apiPoll(w).catch((e) => tag("API", `err=${(e as Error).message}`));
      }
      if (config.commentary.enabled && config.commentary.url) {
        const interval = w.winamaxErrorCount >= 3 ? config.commentary.pollSeconds * 3 : config.commentary.pollSeconds;
        if (due(now, w.lastWinamaxPollAt, interval)) {
          w.lastWinamaxPollAt = now;
          commentaryPoll(w).catch((e) => tag("WINAMAX", `err=${(e as Error).message}`));
        }
      }
      if (config.market.enabled && config.market.url && due(now, w.sensors.lastMarketPollAt, config.market.pollSeconds)) {
        w.sensors.lastMarketPollAt = now;
        marketPoll(w).catch((e) => tag("MARKET", `err=${(e as Error).message}`));
      }
      if (config.lineup.enabled && config.lineup.url && due(now, w.sensors.lastLineupPollAt, config.lineup.pollSeconds)) {
        w.sensors.lastLineupPollAt = now;
        lineupPoll(w).catch((e) => tag("LINEUP", `err=${(e as Error).message}`));
      }
      if (config.news.enabled && config.news.urls.length > 0 && due(now, w.sensors.lastNewsPollAt, config.news.pollSeconds)) {
        w.sensors.lastNewsPollAt = now;
        newsPoll(w).catch((e) => tag("NEWS", `err=${(e as Error).message}`));
      }
      if (config.altStats.enabled && config.altStats.url && due(now, w.sensors.lastAltStatsPollAt, config.altStats.pollSeconds)) {
        w.sensors.lastAltStatsPollAt = now;
        altStatsPoll(w).catch((e) => tag("ALTSTATS", `err=${(e as Error).message}`));
      }
    }
  }, 2000);
}

async function startTelegramLoop(): Promise<void> {
  if (!config.telegramToken) {
    tag("TELEGRAM", "token absent — commandes désactivées");
    return;
  }
  let offset = 0;
  while (running) {
    const updates = await getUpdates(config.telegramToken, offset, 30);
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message?.text;
      const chatId = u.message?.chat.id;
      if (!msg || chatId === undefined) continue;
      if (config.telegramChatId && String(chatId) !== String(config.telegramChatId)) continue;
      tag("TELEGRAM", `cmd="${msg}"`);
      await handleCommand(msg, {
        send: async (text) => {
          await sendTelegramMessage(config.telegramToken as string, chatId, text);
        },
        state: botState,
        config,
      });
    }
  }
}

/* ----------------------------- Persistance ----------------------------- */

function persist(): void {
  savePersisted(config.statePath, buildPersisted(botState));
}

function registerSources(): void {
  sourceHealth.register("api", config.enableApiMonitor);
  sourceHealth.register("commentary", config.commentary.enabled && Boolean(config.commentary.url));
  sourceHealth.register("market", config.market.enabled && Boolean(config.market.url));
  sourceHealth.register("lineup", config.lineup.enabled && Boolean(config.lineup.url));
  sourceHealth.register("news", config.news.enabled && config.news.urls.length > 0);
  sourceHealth.register("altStats", config.altStats.enabled && Boolean(config.altStats.url));
}

async function main(): Promise<void> {
  tag("BOOT", "CoteRadar worker starting");
  tag("CONFIG", `loaded=${config.envFileLoaded}`);

  // Cooldown anti-doublon configurable.
  botState.defaultGateCooldownSeconds = config.minSecondsBetweenSimilarAlerts;

  registerSources();

  // Réhydrate l'état (anti re-spam au redémarrage).
  const persisted = loadPersisted(config.statePath);
  if (persisted) applyPersisted(botState, persisted);

  // Telegram.
  let tgConnected = false;
  if (config.telegramToken) {
    tgConnected = (await getMe(config.telegramToken)).ok;
  }
  tag("TELEGRAM", `enabled=${config.enableTelegram} connected=${tgConnected}`);

  // API-Football.
  let apiConnected = false;
  if (config.apiKey) {
    try {
      apiConnected = (await getAccountStatus()).ok;
    } catch {
      apiConnected = false;
    }
  }
  tag("API-FOOTBALL", `connected=${apiConnected} quotaMode=${config.maxApiCallsPerDay}/day`);

  // Watch par défaut.
  const fid = config.defaultFixtureId;
  if (fid && !botState.get(fid)) {
    botState.startWatch(fid, config.matchLabel ?? `Match #${fid}`);
  }
  if (fid) tag("WATCH", `defaultFixture=${fid} label="${config.matchLabel ?? ""}"`);

  tag("COMMENTARY", `enabled=${config.commentary.enabled} interval=${config.commentary.pollSeconds}s`);
  tag("MARKET", `enabled=${config.market.enabled} interval=${config.market.pollSeconds}s`);

  // Chat id manquant => guide l'utilisateur.
  if (config.enableTelegram && !config.telegramChatId) {
    const link = config.telegramBotLink ?? "https://t.me/CoteRadar_bot";
    console.log("");
    console.log("TELEGRAM_CHAT_ID manquant.");
    console.log(`1. Ouvre le bot : ${link}`);
    console.log("2. Envoie /start");
    console.log("3. Lance npm run get-chat-id");
    console.log("4. Copie le chat.id dans .env");
    console.log("");
  }

  if (config.telegramToken && config.telegramChatId && config.enableTelegram && tgConnected) {
    await sendTelegramMessage(config.telegramToken, config.telegramChatId, "🤖 CoteRadar Live démarré. /help pour les commandes.").catch(() => undefined);
  }

  tag("BOOT", "Worker ready");

  setInterval(persist, 15000);
  startWatcherLoop();
  await startTelegramLoop();
}

process.on("SIGINT", () => {
  running = false;
  persist();
  tag("BOOT", "arrêt du worker (état sauvegardé)");
  process.exit(0);
});

main().catch((err) => {
  tag("BOOT", `erreur fatale: ${(err as Error).message}`);
  process.exit(1);
});
