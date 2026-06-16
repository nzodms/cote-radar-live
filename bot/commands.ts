/**
 * Routeur des commandes Telegram. Les dépendances sont injectables pour les tests
 * (aucun appel réseau requis en test).
 */

import type { BotConfig } from "./config";
import type { BotState } from "./state";
import { createWatchState } from "./state";
import { formatLiveAlert, formatStartHelp } from "./format";
import type { AlertLevel } from "./types";
import {
  buildPreMatchAnalysis,
  composeContextPlan,
  fetchPreMatchData,
} from "./prematch-analysis";
import { fetchApiLive, fetchContextOnce, runLiveCycle } from "./live-engine";

export interface CommandDeps {
  send: (text: string) => Promise<void>;
  state: BotState;
  config: BotConfig;
  buildPreMatch?: (id: number) => Promise<string>;
  buildContext?: (id: number) => Promise<string>;
  forcedLive?: (state: BotState, id: number) => Promise<string>;
}

function resolveId(arg: string | undefined, config: BotConfig): number | null {
  if (arg) {
    const n = Number.parseInt(arg, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return config.defaultFixtureId;
}

async function defaultBuildPreMatch(id: number): Promise<string> {
  const { text } = await buildPreMatchAnalysis(id);
  return text;
}
async function defaultBuildContext(id: number): Promise<string> {
  const data = await fetchPreMatchData(id);
  return composeContextPlan(data);
}

export async function runForcedLiveAnalysis(state: BotState, id: number): Promise<string> {
  const live = await fetchApiLive(id);
  if (!live) throw new Error("Fixture introuvable via l'API.");
  const watch = state.get(id);
  const context =
    watch && watch.contextLoaded
      ? { recentForm: watch.recentForm, h2h: watch.h2h, lineups: watch.lineups }
      : await fetchContextOnce(live.fixture);

  const scratch = createWatchState(id, watch?.label ?? `Match #${id}`);
  const { advice } = runLiveCycle(
    {
      fixture: live.fixture,
      statistics: live.statistics,
      events: live.events,
      lineups: context.lineups,
      recentForm: context.recentForm,
      h2h: context.h2h,
      previousSnapshots: watch?.snapshots ?? [],
      commentary: watch?.commentary ?? [],
    },
    scratch,
    "api"
  );

  const level: AlertLevel =
    advice.action === "SIGNAL" || advice.action === "INVALIDATED"
      ? "CRITICAL"
      : advice.action === "WATCH"
      ? "HIGH"
      : "MEDIUM";

  const text = formatLiveAlert({
    fixture: live.fixture,
    advice,
    level,
    source: "api",
    whatHappened: "Analyse live forcée à la demande.",
  });

  if (watch) {
    watch.lastAnalysisText = text;
    watch.lastAction = advice.action;
    watch.lastFixture = live.fixture;
  }
  return text;
}

function formatStatus(state: BotState, config: BotConfig): string {
  const watches = state.activeWatches();
  const L: string[] = [];
  L.push("📊 Statut du worker CoteRadar Live");
  L.push(`Matchs surveillés : ${watches.length}`);
  L.push(
    `Monitor API: ${config.enableApiMonitor ? "on" : "off"} (poll ${config.apiPollSeconds}s) · Winamax: ${
      config.enableWinamax ? "on" : "off"
    } (poll ${config.winamaxPollSeconds}s) · Telegram: ${config.enableTelegram ? "on" : "off"}`
  );
  if (watches.length === 0) {
    L.push("Aucun match surveillé. Lance /watch <id>.");
  }
  for (const w of watches) {
    const f = w.lastFixture;
    const score = f ? `${f.homeGoals ?? 0}-${f.awayGoals ?? 0}` : "?";
    const apiAgo = w.lastApiPollAt ? `${Math.round((Date.now() - w.lastApiPollAt) / 1000)}s` : "—";
    const winAgo = w.lastWinamaxPollAt ? `${Math.round((Date.now() - w.lastWinamaxPollAt) / 1000)}s` : "—";
    L.push(
      `• #${w.fixtureId} ${w.label} | score ${score} | action ${w.lastAction ?? "—"} | API il y a ${apiAgo} | Winamax il y a ${winAgo} | alertes ${w.alertsSent}`
    );
  }
  return L.join("\n");
}

function lastAnalysis(state: BotState): string {
  const watches = [...state.watches.values()].filter((w) => w.lastAnalysisText);
  if (watches.length === 0) return "Aucune analyse live disponible pour l'instant. Lance /watch <id> ou /analyse_live <id>.";
  // la plus récente
  watches.sort((a, b) => (b.lastAnalysisText ? 1 : 0) - (a.lastAnalysisText ? 1 : 0));
  return watches[watches.length - 1].lastAnalysisText as string;
}

export async function handleCommand(rawText: string, deps: CommandDeps): Promise<void> {
  const text = rawText.trim();
  const parts = text.split(/\s+/);
  const cmd = (parts[0] ?? "").toLowerCase().replace(/@.+$/, "");
  const arg = parts[1];
  const { send, state, config } = deps;

  const buildPreMatch = deps.buildPreMatch ?? defaultBuildPreMatch;
  const buildContext = deps.buildContext ?? defaultBuildContext;
  const forcedLive = deps.forcedLive ?? runForcedLiveAnalysis;

  try {
    switch (cmd) {
      case "/start":
      case "/help":
        await send(formatStartHelp());
        return;

      case "/analyse_match": {
        const id = resolveId(arg, config);
        if (!id) return void (await send("Usage : /analyse_match <fixtureId>"));
        await send(`⏳ Analyse complète avant match #${id} en cours…`);
        const out = await buildPreMatch(id);
        await send(out);
        return;
      }

      case "/context": {
        const id = resolveId(arg, config);
        if (!id) return void (await send("Usage : /context <fixtureId>"));
        const out = await buildContext(id);
        await send(out);
        return;
      }

      case "/analyse_live": {
        const id = resolveId(arg, config);
        if (!id) return void (await send("Usage : /analyse_live <fixtureId>"));
        await send(`⏳ Analyse live immédiate #${id}…`);
        const out = await forcedLive(state, id);
        await send(out);
        return;
      }

      case "/watch": {
        const id = resolveId(arg, config);
        if (!id) return void (await send("Usage : /watch <fixtureId>"));
        const label = id === config.defaultFixtureId && config.matchLabel ? config.matchLabel : `Match #${id}`;
        state.startWatch(id, label);
        await send(
          `✅ Surveillance live démarrée pour #${id} (${label}).\nJe poll l'API toutes les ${config.apiPollSeconds}s et la source secondaire toutes les ${config.winamaxPollSeconds}s. Je t'alerte sur tout changement notable.`
        );
        return;
      }

      case "/stop": {
        const id = resolveId(arg, config);
        if (!id) return void (await send("Usage : /stop <fixtureId>"));
        const ok = state.stopWatch(id);
        await send(ok ? `🛑 Surveillance arrêtée pour #${id}.` : `Aucune surveillance active pour #${id}.`);
        return;
      }

      case "/status":
        await send(formatStatus(state, config));
        return;

      case "/last":
        await send(lastAnalysis(state));
        return;

      default:
        await send("Commande inconnue. Tape /help pour la liste des commandes.");
        return;
    }
  } catch (err) {
    await send(`⚠️ Erreur : ${(err as Error).message}`);
  }
}
