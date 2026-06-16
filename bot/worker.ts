/**
 * Worker Telegram CoteRadar Live (process Node indépendant de Vercel).
 *
 * - Long-polling Telegram pour les commandes.
 * - Boucle de surveillance: par match actif, poll API (~30s) + Winamax (~10s).
 * - Anti-spam intelligent: CRITICAL immédiat, HIGH si l'analyse change, MEDIUM
 *   bufferisé, LOW ignoré, doublon exact bloqué.
 *
 * Lancer: npm run worker
 */

import { getBotConfig } from "./config";
import { botState } from "./state";
import type { WatchState } from "./state";
import { getUpdates, sendTelegramMessage } from "./telegram";
import { handleCommand } from "./commands";
import { fetchApiLive, fetchContextOnce, runLiveCycle } from "./live-engine";
import { fetchWinamaxCommentary } from "./winamax-watcher";
import { formatLiveAlert } from "./format";
import type { LiveBettingAdvice } from "@/types/live-advice";
import type { NormalizedFixture } from "@/types/match";
import type { LiveAlert } from "./types";

const config = getBotConfig();
let running = true;

function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), ...args);
}

async function dispatchAlerts(
  w: WatchState,
  fixture: NormalizedFixture,
  advice: LiveBettingAdvice,
  alerts: LiveAlert[]
): Promise<void> {
  for (const alert of alerts) {
    const decision = w.gate.decide(alert);
    if (!decision.send) {
      log(`  ⤷ skip [${alert.level}] ${alert.kind}: ${decision.reason}`);
      continue;
    }
    w.gate.markSent(alert);
    const text = formatLiveAlert({
      fixture,
      advice,
      level: alert.level,
      source: alert.source,
      whatHappened: alert.whatHappened,
    });
    w.lastAnalysisText = text;
    w.alertsSent += 1;
    log(`  📤 ALERTE [${alert.level}] ${alert.kind} (${alert.source})`);
    if (config.enableTelegram && config.telegramToken && config.telegramChatId) {
      const r = await sendTelegramMessage(config.telegramToken, config.telegramChatId, text);
      if (!r.ok) log("  ⚠️ envoi Telegram échoué:", r.error);
    }
    // Source secondaire => confirmation API immédiate au prochain tick.
    if (alert.source === "secondary") w.lastApiPollAt = 0;
  }
}

async function apiPoll(w: WatchState): Promise<void> {
  botState.lastApiPollAt = Date.now();
  const live = await fetchApiLive(w.fixtureId);
  if (!live) {
    log(`apiPoll #${w.fixtureId}: fixture introuvable`);
    return;
  }
  if (!w.contextLoaded) {
    try {
      const ctx = await fetchContextOnce(live.fixture);
      w.recentForm = ctx.recentForm;
      w.h2h = ctx.h2h;
      w.lineups = ctx.lineups;
    } catch (err) {
      log("contexte indisponible:", (err as Error).message);
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
    {
      fixture: live.fixture,
      statistics: live.statistics,
      events: live.events,
      lineups: w.lineups,
      recentForm: w.recentForm,
      h2h: w.h2h,
      previousSnapshots: w.snapshots,
      commentary: w.commentary,
    },
    w,
    "api"
  );
  await dispatchAlerts(w, live.fixture, advice, alerts);

  if (live.fixture.phase === "finished") {
    log(`Match #${w.fixtureId} terminé — arrêt de la surveillance.`);
    w.active = false;
  }
}

async function winamaxPoll(w: WatchState): Promise<void> {
  if (!config.winamaxUrl || !w.lastFixture || !w.lastStatistics) return;
  botState.lastWinamaxPollAt = Date.now();
  const res = await fetchWinamaxCommentary(
    config.winamaxUrl,
    w.lastFixture.home.name,
    w.lastFixture.away.name
  );
  if (res.error) {
    w.winamaxErrorCount += 1;
    log(`winamaxPoll #${w.fixtureId} erreur (${w.winamaxErrorCount}): ${res.error}`);
    return;
  }
  w.winamaxErrorCount = 0;
  if (res.events.length === 0) return; // page inchangée: ne rien envoyer

  for (const e of res.events) w.commentary.push(e);
  if (w.commentary.length > 200) w.commentary = w.commentary.slice(-200);

  const { advice, alerts } = runLiveCycle(
    {
      fixture: w.lastFixture,
      statistics: w.lastStatistics,
      events: [],
      lineups: w.lineups,
      recentForm: w.recentForm,
      h2h: w.h2h,
      previousSnapshots: w.snapshots,
      commentary: w.commentary,
    },
    w,
    "secondary"
  );
  await dispatchAlerts(w, w.lastFixture, advice, alerts);
}

function winamaxIntervalMs(w: WatchState): number {
  const base = config.winamaxPollSeconds * 1000;
  return w.winamaxErrorCount >= 3 ? base * 3 : base; // backoff après 3 erreurs
}

function startWatcherLoop(): void {
  setInterval(() => {
    const now = Date.now();
    for (const w of botState.activeWatches()) {
      if (config.enableApiMonitor && now - w.lastApiPollAt >= config.apiPollSeconds * 1000) {
        w.lastApiPollAt = now;
        apiPoll(w).catch((e) => log("apiPoll err:", (e as Error).message));
      }
      if (config.enableWinamax && config.winamaxUrl && now - w.lastWinamaxPollAt >= winamaxIntervalMs(w)) {
        w.lastWinamaxPollAt = now;
        winamaxPoll(w).catch((e) => log("winamaxPoll err:", (e as Error).message));
      }
    }
  }, 3000);
}

async function startTelegramLoop(): Promise<void> {
  if (!config.telegramToken) {
    log("⚠️ TELEGRAM_BOT_TOKEN absent: commandes Telegram désactivées.");
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
      // Bot privé: ne répondre qu'au chat configuré si défini.
      if (config.telegramChatId && String(chatId) !== String(config.telegramChatId)) continue;
      log(`commande reçue: ${msg}`);
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

async function main(): Promise<void> {
  log("CoteRadar Live — worker Telegram");
  if (!config.apiKey) {
    log("❌ APISPORTS_KEY manquante. Renseigne .env. Arrêt.");
    process.exit(1);
  }
  if (!config.telegramToken || !config.telegramChatId) {
    log("⚠️ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquant: les alertes proactives ne partiront pas.");
  }

  // Auto-watch du match par défaut si configuré.
  if (config.defaultFixtureId) {
    botState.startWatch(config.defaultFixtureId, config.matchLabel ?? `Match #${config.defaultFixtureId}`);
    log(`Auto-watch du match par défaut #${config.defaultFixtureId} (${config.matchLabel ?? ""}).`);
  }

  if (config.telegramToken && config.telegramChatId && config.enableTelegram) {
    await sendTelegramMessage(
      config.telegramToken,
      config.telegramChatId,
      "🤖 CoteRadar Live démarré. Tape /help pour les commandes."
    ).catch(() => undefined);
  }

  startWatcherLoop();
  await startTelegramLoop();
}

process.on("SIGINT", () => {
  running = false;
  log("Arrêt du worker.");
  process.exit(0);
});

main().catch((err) => {
  log("Erreur fatale:", (err as Error).message);
  process.exit(1);
});
