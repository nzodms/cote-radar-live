/**
 * Tests du bot Telegram: classification, anti-spam intelligent, séquences,
 * transitions, source secondaire, et routage des commandes.
 * Lancé par `npm run test-telegram`.
 */

import {
  AlertGate,
  classifyAdviceTransition,
  classifyApiEvent,
  classifyCommentaryEvent,
} from "@/bot/alert-classifier";
import { detectOffensiveSequence } from "@/bot/sequence-detector";
import { formatLiveAlert } from "@/bot/format";
import { handleCommand } from "@/bot/commands";
import { BotState } from "@/bot/state";
import type { BotConfig } from "@/bot/config";
import type { BufferedEvent, LiveAlert } from "@/bot/types";
import type { NormalizedEvent, NormalizedFixture } from "@/types/match";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import type { LiveBettingAdvice } from "@/types/live-advice";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function alert(p: Partial<LiveAlert>): LiveAlert {
  return { dedupId: "x", level: "HIGH", source: "api", kind: "k", whatHappened: "", signature: "sig", ...p };
}
function apiGoal(): NormalizedEvent {
  return { elapsed: 70, extra: null, teamId: 1, teamName: "Iran", playerName: "Taremi", assistName: null, type: "Goal", detail: "Normal Goal", comments: null };
}
function apiRed(): NormalizedEvent {
  return { elapsed: 71, extra: null, teamId: 2, teamName: "NZ", playerName: "X", assistName: null, type: "Card", detail: "Red Card", comments: null };
}
function comment(eventType: ExternalCommentaryEvent["eventType"], title = ""): ExternalCommentaryEvent {
  return { minute: 70, timeLabel: null, teamName: "Iran", playerName: null, eventType, rawTitle: title, rawDescription: "", normalizedImpact: "medium" };
}

function fixture(p: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return { fixtureId: 1489378, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1", groupName: "Group A", home: { id: 1, name: "Iran", logo: null }, away: { id: 2, name: "New Zealand", logo: null }, kickoffAt: "2026-06-16T01:00:00+00:00", statusShort: "2H", statusLong: "Second Half", phase: "live", elapsed: 72, homeGoals: 2, awayGoals: 2, venueName: null, venueCity: null, ...p };
}
function adv(p: Partial<LiveBettingAdvice> = {}): LiveBettingAdvice {
  return {
    action: "WATCH", mainAdvice: "", matchScenario: "", liveReading: "Lecture.", confidence: "medium", urgency: "medium",
    dominantTeam: null, whatIWouldDoNow: "Ce que je ferais : surveiller.",
    momentum: { homeScore: 0, awayScore: 0, dominantTeam: null, isRealPressure: false, isSterileDomination: false, last5MinutesSummary: "", last10MinutesSummary: "", sinceLastGoalSummary: "" },
    contextComparison: { preMatchExpectation: "", currentReality: "", scenarioShift: "Match ouvert.", keyDifference: "" },
    recommendedMarkets: [{ market: "next_goal_home", label: "Prochain but Iran", signal: "medium", timing: "now", reasoning: "r", requiredConfirmation: "c", invalidation: "i", riskLevel: "medium" }],
    avoidMarkets: [], resolvedMarkets: [{ market: "over_1_5", label: "Over 1.5 buts", note: "" }, { market: "over_2_5", label: "Over 2.5 buts", note: "" }, { market: "btts", label: "BTTS", note: "" }],
    risks: [], nextCheck: { inMinutes: 3, whatToWatch: [] },
    dataQuality: { hasFixture: true, hasStatistics: true, hasEvents: true, hasLineups: false, hasRecentForm: false, hasH2H: false, hasOdds: false, hasExternalCommentary: false, freshnessSeconds: 0, warning: null },
    finalVerdict: "", ...p,
  };
}

console.log("\n[T1] Classification des événements");
{
  check("but API = CRITICAL", classifyApiEvent(apiGoal()).level === "CRITICAL");
  check("carton rouge API = CRITICAL", classifyApiEvent(apiRed()).level === "CRITICAL");
  check("carton jaune API = MEDIUM", classifyApiEvent({ ...apiRed(), detail: "Yellow Card" }).level === "MEDIUM");
  check("tir cadré (secondaire) = HIGH", classifyCommentaryEvent(comment("shot_on_target")).level === "HIGH");
  check("corner (secondaire) = MEDIUM", classifyCommentaryEvent(comment("corner")).level === "MEDIUM");
}

console.log("\n[T2] Transitions d'action");
{
  check("WAIT → WATCH = HIGH", classifyAdviceTransition("WAIT", "WATCH")?.level === "HIGH");
  check("WATCH → SIGNAL = HIGH", classifyAdviceTransition("WATCH", "SIGNAL")?.level === "HIGH");
  check("SIGNAL → INVALIDATED = CRITICAL", classifyAdviceTransition("SIGNAL", "INVALIDATED")?.level === "CRITICAL");
  check("pas de transition si identique", classifyAdviceTransition("WATCH", "WATCH") === null);
}

console.log("\n[T3] Anti-spam: CRITICAL passe toujours, doublon bloqué");
{
  const gate = new AlertGate(60);
  // Un HIGH récent pose un cooldown sur la signature.
  const high = alert({ dedupId: "h1", level: "HIGH", signature: "sigA" });
  check("HIGH envoyé", gate.decide(high).send === true);
  gate.markSent(high);
  // HIGH identique (même signature) bloqué par cooldown.
  const highDup = alert({ dedupId: "h2", level: "HIGH", signature: "sigA" });
  check("HIGH même analyse récente bloqué (cooldown)", gate.decide(highDup).send === false);
  // CRITICAL avec la MÊME signature, malgré cooldown récent => ENVOYÉ.
  const goal = alert({ dedupId: "g1", level: "CRITICAL", signature: "sigA", kind: "goal" });
  check("CRITICAL but envoyé immédiatement malgré cooldown", gate.decide(goal).send === true);
  gate.markSent(goal);
  // Doublon EXACT du même CRITICAL bloqué.
  check("doublon exact (même event) bloqué", gate.decide(goal).send === false);
  // CRITICAL différent (rouge) => envoyé.
  const red = alert({ dedupId: "r1", level: "CRITICAL", signature: "sigA", kind: "red_card" });
  check("CRITICAL rouge (event différent) envoyé", gate.decide(red).send === true);
}

console.log("\n[T4] Anti-spam: MEDIUM seul / HIGH nouveau");
{
  const gate = new AlertGate(60);
  check("MEDIUM corner isolé non envoyé seul", gate.decide(alert({ dedupId: "c1", level: "MEDIUM", signature: "s" })).send === false);
  const h1 = alert({ dedupId: "h1", level: "HIGH", signature: "sigA" });
  gate.decide(h1); gate.markSent(h1);
  // HIGH NOUVEL événement avec analyse DIFFÉRENTE => envoyé même peu après.
  check("HIGH nouvel événement (analyse différente) envoyé", gate.decide(alert({ dedupId: "h2", level: "HIGH", signature: "sigB" })).send === true);
}

console.log("\n[T5] Séquences offensives");
{
  const buf: BufferedEvent[] = [
    { minute: 64, team: "home", kind: "corner" },
    { minute: 66, team: "home", kind: "corner" },
    { minute: 69, team: "home", kind: "corner" },
  ];
  const seq = detectOffensiveSequence(buf, 70);
  check("3 corners en 7 min détectés", seq?.type === "three_corners", seq);

  const buf2: BufferedEvent[] = [
    { minute: 68, team: "away", kind: "shot_on_target" },
    { minute: 70, team: "away", kind: "shot_on_target" },
  ];
  check("2 tirs cadrés en 5 min détectés", detectOffensiveSequence(buf2, 71)?.type === "two_shots_on_target");
}

console.log("\n[T6] Source secondaire = WATCH maximum à l'affichage");
{
  const text = formatLiveAlert({ fixture: fixture(), advice: adv({ action: "SIGNAL" }), level: "HIGH", source: "secondary", whatHappened: "Tir cadré détecté." });
  check("action plafonnée à WATCH", /Action : WATCH/.test(text), text.split("\n").find((l) => l.startsWith("Action")));
  check("mention source secondaire", /source secondaire, à confirmer/.test(text));
  check("marchés déjà résolus listés", /Marchés déjà résolus/.test(text));
}

console.log("\n[T7] Routage des commandes");
async function runCommands(): Promise<void> {
  const state = new BotState();
  const scraper = (enabled: boolean, pollSeconds: number) => ({ enabled, url: null, pollSeconds });
  const config: BotConfig = {
    apiKey: "x", telegramToken: null, telegramBotLink: null, telegramChatId: null, defaultFixtureId: 1489378, matchLabel: "Iran vs NZ",
    apiPollSeconds: 30, maxApiCallsPerDay: 7500, immediateAnalysisCooldownSeconds: 10, minSecondsBetweenSimilarAlerts: 120,
    nodeEnv: "test", envFileLoaded: false, enableTelegram: true, enableApiMonitor: true, statePath: "data/state.json",
    commentary: scraper(true, 5), market: scraper(true, 10), lineup: scraper(true, 300),
    news: { enabled: true, urls: [], pollSeconds: 900 }, altStats: scraper(false, 30),
    weather: { enabled: false, apiKeyConfigured: false, location: null },
    oddsApi: { enabled: false, provider: null, apiKeyConfigured: false, pollSeconds: 20 },
    winamaxUrl: null, winamaxPollSeconds: 5, enableWinamax: true,
  };
  const sent: string[] = [];
  const deps = {
    send: async (t: string) => void sent.push(t),
    state,
    config,
    buildPreMatch: async () => "ANALYSE_PRE_MATCH_COMPLETE",
    forcedLive: async (st: BotState, id: number) => {
      const w = st.get(id);
      if (w) w.lastAnalysisText = "ANALYSE_LIVE_FORCEE";
      return "ANALYSE_LIVE_FORCEE";
    },
  };

  await handleCommand("/help", deps);
  check("/help répond", sent.some((m) => m.includes("Commandes")));

  await handleCommand("/watch 1489378", deps);
  check("/watch démarre une surveillance", state.activeWatches().length === 1);
  check("/watch confirme", sent.some((m) => m.includes("Surveillance live démarrée")));

  await handleCommand("/analyse_match 1489378", deps);
  check("/analyse_match renvoie l'analyse complète", sent.includes("ANALYSE_PRE_MATCH_COMPLETE"));

  await handleCommand("/analyse_live 1489378", deps);
  check("/analyse_live renvoie une analyse live", sent.includes("ANALYSE_LIVE_FORCEE"));

  // /last doit renvoyer la dernière analyse stockée par /analyse_live.
  await handleCommand("/last", deps);
  check("/last renvoie la dernière analyse", sent[sent.length - 1] === "ANALYSE_LIVE_FORCEE");

  await handleCommand("/status", deps);
  check("/status renvoie l'état du worker", sent[sent.length - 1].includes("Statut du worker"));

  await handleCommand("/sources", deps);
  check("/sources affiche l'état des sources", sent[sent.length - 1].includes("État des sources") && sent[sent.length - 1].includes("API-Football"));

  await handleCommand("/stop 1489378", deps);
  check("/stop arrête la surveillance", state.activeWatches().length === 0);
}

runCommands().then(() => {
  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion(s) en échec (telegram).`);
    process.exit(1);
  } else {
    console.log("\n✅ Tests Telegram OK.");
  }
});
