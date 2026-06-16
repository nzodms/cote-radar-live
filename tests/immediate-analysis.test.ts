/**
 * Tests des analyses immédiates avant match :
 *  - /analyse (COMPACT, orienté marchés, 1-2 messages)
 *  - /analyse_full (version longue conservée)
 *  - /markets, /brief, /context
 *  - format d'alerte live (marchés résolus)
 * Lancé par `npm run test-immediate-analysis`.
 */

import {
  composeBrief,
  composeContextPlan,
  composeFullPreMatchAnalysis,
  composeMarketsWatch,
  composePreMatchAnalysis,
  type PreMatchData,
} from "@/bot/prematch-analysis";
import { formatLiveAlert } from "@/bot/format";
import { buildAnalysisParts } from "@/bot/analysis-splitter";
import { routeCommand, type RouterDeps } from "@/bot/telegram-command-router";
import { BotState } from "@/bot/state";
import { getBotConfig } from "@/bot/config";
import type { ResolvedMatch } from "@/bot/match-resolver";
import type { NormalizedFixture, RecentForm } from "@/types/match";
import type { ContextIntelligence, LiveBettingAdvice } from "@/types/live-advice";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function fixture(): NormalizedFixture {
  return {
    fixtureId: 1489378, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1",
    groupName: "Group A", home: { id: 1, name: "Iran", logo: null }, away: { id: 2, name: "New Zealand", logo: null },
    kickoffAt: "2026-06-16T01:00:00+00:00", statusShort: "NS", statusLong: "Not Started", phase: "scheduled",
    elapsed: null, homeGoals: null, awayGoals: null, venueName: "Stade test", venueCity: "Doha",
  };
}

function form(teamId: number, w: number, d: number, l: number, gf: number, ga: number): RecentForm {
  const results = Array.from({ length: w + d + l }, (_, i) => ({
    fixtureId: i, date: "2026-06-01", opponentName: "Adv", isHome: i % 2 === 0,
    goalsFor: 1, goalsAgainst: i < 1 ? 0 : 1, outcome: (i < w ? "W" : i < w + d ? "D" : "L") as "W" | "D" | "L",
  }));
  return { teamId, results, wins: w, draws: d, losses: l, goalsFor: gf, goalsAgainst: ga };
}

const context: ContextIntelligence = {
  preMatchExpectation: "Iran attendu favori face à New Zealand, sur la base de la forme récente.",
  favoriteTeam: "Iran", underdogTeam: "New Zealand", favoriteSide: "home",
  keyPlayers: ["Taremi (Iran)", "Azmoun (Iran)"], knownInjuries: [],
  recentFormSummary: "Iran: 4V 1N 0D · New Zealand: 0V 1N 4D",
  groupContext: "Phase de groupes — Group A. Chaque point compte pour la qualification.",
  scenarioShift: "Match non démarré: scénario pré-match encore intact.",
  liveVsPreMatchMismatch: "Comparaison live indisponible avant le coup d'envoi.",
};

const data: PreMatchData = {
  fixture: fixture(),
  recentForm: { home: form(1, 4, 1, 0, 9, 2), away: form(2, 0, 1, 4, 3, 11) },
  h2h: { totalMatches: 3, team1Wins: 2, team2Wins: 1, draws: 0, recent: [] },
  lineups: [],
  context,
  group: { name: "Group I", others: ["Iraq", "Norway"] },
  odds: { available: false, bookmaker: null, updatedAt: null, oneX2: null, overUnder: null, btts: null },
  weather: null,
};

console.log("\n[I1] /analyse — COMPACT orienté marchés");
{
  const text = composePreMatchAnalysis(data);
  const sections = [
    "🏟 Analyse — Iran vs New Zealand",
    "1. Résumé express",
    "2. Forme récente",
    "3. Conditions importantes",
    "🎯 Marchés à surveiller",
    "⛔ À éviter pour l'instant",
    "🎯 Mon plan",
    "📊 Score final de lecture",
  ];
  for (const s of sections) check(`section présente: "${s}"`, text.includes(s), s);
  const parts = buildAnalysisParts(text);
  check("tient en 1-2 messages Telegram", parts.length <= 2, parts.length);
  check("contexte de groupe (Group I + équipes)", text.includes("Group I") && text.includes("Iraq, Norway"));
  check("favori mentionné (Iran)", text.includes("Iran"));
  check("forme récente chiffrée", text.includes("buts/match") && text.includes("encaissés"));
  check("météo non inventée (non disponible)", text.includes("Météo : non disponible"));
  check("cotes absentes => aucune value confirmée", text.includes("aucune value confirmée"));
  check("marchés joueurs masqués sans compos", text.includes("compositions non confirmées"));
  check("score final: signal pré-match", /Signal pré-match : (WATCH|WAIT|AVOID)/.test(text));
  check("score final: confiance /100", /Confiance : \d{1,3}\/100/.test(text));
  check("aucun joueur inventé", !/Taremi|Azmoun/.test(text));
}

console.log("\n[I1b] /analyse — cotes affichées quand disponibles (sinon jamais)");
{
  const withOdds: PreMatchData = {
    ...data,
    odds: { available: true, bookmaker: "Bet365", updatedAt: "2026-06-16T00:00:00+00:00", oneX2: { home: 1.5, draw: 4.2, away: 6 }, overUnder: { line: "2.5", over: 1.9, under: 1.9 }, btts: { yes: 2.1, no: 1.7 } },
  };
  const text = composePreMatchAnalysis(withOdds);
  check("1X2 affiché quand dispo", text.includes("Cotes 1X2") && text.includes("1.5"));
  check("formulation 'à surveiller'", text.includes("à surveiller"));
  const noOdds = composePreMatchAnalysis(data);
  check("cotes jamais inventées si absentes", noOdds.includes("non affichées"));
}

console.log("\n[I1c] météo intégrée seulement si disponible (jamais de température inventée)");
{
  const withWeather: PreMatchData = {
    ...data,
    weather: { available: true, reason: null, location: "Doha", temperatureC: 34, feelsLikeC: 38, condition: "Clear", description: "ciel dégagé", windKph: 12, humidityPct: 40, summary: "🌡 34°C · ciel dégagé · vent 12 km/h", impact: "forte chaleur : rythme souvent plus bas" },
  };
  const text = composePreMatchAnalysis(withWeather);
  check("météo affichée si disponible", text.includes("34°C"));
  check("impact météo mentionné", text.includes("chaleur"));
}

console.log("\n[I1d] /analyse_full — version longue conservée");
{
  const text = composeFullPreMatchAnalysis(data);
  const sections = [
    "🏟 Analyse complète",
    "1. Contexte du match & du groupe",
    "3. Lecture tactique probable",
    "5. Scénarios live",
    "🔎 Checklist live",
    "9. Risques",
  ];
  for (const s of sections) check(`section longue présente: "${s}"`, text.includes(s), s);
  check("analyse longue détaillée (> 1500 caractères)", text.length > 1500, text.length);
  check("scénarios live concrets (1..5)", text.includes("Scénario 1") && text.includes("Scénario 5"));
  check("longue > compacte", text.length > composePreMatchAnalysis(data).length);
}

console.log("\n[I1e] /markets — marchés à surveiller (classés, jamais 'à jouer' sans condition)");
{
  const text = composeMarketsWatch(data);
  check("titre marchés", text.includes("Marchés à surveiller — Iran vs New Zealand"));
  check("classement présent", text.includes("Classement"));
  check("marché équipe (prochain but Iran)", text.includes("Prochain but Iran"));
  check("marché match (Over/BTTS)", /Over 1\.5|BTTS/.test(text));
  check("joueurs masqués sans compos", text.includes("compositions non confirmées"));
  check("chaque marché a une condition d'entrée", text.includes("Entrée :"));
  check("à éviter présent", text.includes("À éviter"));
}

console.log("\n[I1f] /brief — résumé très court");
{
  const text = composeBrief(data);
  check("titre brief", text.includes("⚡ Brief — Iran vs New Zealand"));
  check("court (< 700 caractères)", text.length < 700, text.length);
  check("signal + confiance", /Signal pré-match : (WATCH|WAIT|AVOID)/.test(text) && /Confiance \d/.test(text));
  check("à surveiller listé", text.includes("À surveiller :"));
}

console.log("\n[I2] /context — contexte + plan live");
{
  const text = composeContextPlan(data);
  check("titre contexte & plan", text.includes("Contexte & plan live"));
  check("plan live présent", text.includes("Plan live à suivre"));
  check("règle marchés résolus 2-2", text.includes("2-2"));
}

console.log("\n[I3] Alerte live — marchés résolus jamais conseillés");
{
  const advice: LiveBettingAdvice = {
    action: "WATCH", mainAdvice: "", matchScenario: "", liveReading: "À 2-2, match ouvert.", confidence: "medium", urgency: "medium",
    dominantTeam: null, whatIWouldDoNow: "Ce que je ferais : surveiller prochain but Iran.",
    momentum: { homeScore: 30, awayScore: 12, dominantTeam: "Iran", isRealPressure: true, isSterileDomination: false, last5MinutesSummary: "Iran pousse.", last10MinutesSummary: "", sinceLastGoalSummary: "" },
    contextComparison: { preMatchExpectation: "", currentReality: "", scenarioShift: "Match ouvert et instable.", keyDifference: "" },
    recommendedMarkets: [{ market: "next_goal_home", label: "Prochain but Iran", signal: "medium", timing: "now", reasoning: "Pression réelle.", requiredConfirmation: "Nouveau tir cadré ou corner.", invalidation: "NZ reprend le contrôle.", riskLevel: "medium" }],
    avoidMarkets: [], resolvedMarkets: [{ market: "over_1_5", label: "Over 1.5 buts", note: "" }, { market: "over_2_5", label: "Over 2.5 buts", note: "" }, { market: "btts", label: "BTTS", note: "" }],
    risks: [], nextCheck: { inMinutes: 3, whatToWatch: [] },
    dataQuality: { hasFixture: true, hasStatistics: true, hasEvents: true, hasLineups: false, hasRecentForm: false, hasH2H: false, hasOdds: false, hasExternalCommentary: false, freshnessSeconds: 0, warning: null },
    finalVerdict: "",
  };
  const f: NormalizedFixture = { ...fixture(), statusShort: "2H", statusLong: "Second Half", phase: "live", elapsed: 72, homeGoals: 2, awayGoals: 2 };
  const text = formatLiveAlert({ fixture: f, advice, level: "HIGH", source: "api", whatHappened: "Tir cadré iranien." });
  check("score & minute dans l'entête", text.includes("Iran 2-2 New Zealand") && text.includes("72e"));
  check("marchés déjà résolus listés", /Marchés déjà résolus/.test(text) && text.includes("Over 1.5 buts"));
  check("marché à surveiller = prochain but", text.includes("Prochain but Iran"));
  check("section 'Ce que je ferais maintenant'", text.includes("Ce que je ferais"));
  check("sans cotes => value non confirmée", text.includes("aucune value confirmée"));
}

console.log("\n[I4] découpage Telegram — début jamais perdu (format compact)");
{
  const analysis = composePreMatchAnalysis(data);
  const parts = buildAnalysisParts(analysis, 1000);
  check("plusieurs parties", parts.length >= 2, parts.length);
  check(
    "partie 1 = en-tête + DÉBUT (titre + Résumé express)",
    parts[0].startsWith("📄 Partie 1/") && parts[0].includes("🏟 Analyse — Iran vs New Zealand") && parts[0].includes("1. Résumé express")
  );
  const joined = parts.join("\n");
  for (const s of ["1. Résumé express", "2. Forme récente", "3. Conditions importantes", "🎯 Marchés à surveiller", "⛔ À éviter", "🎯 Mon plan", "📊 Score final"]) {
    check(`section conservée: ${s}`, joined.includes(s));
  }
  check("chaque partie sous la limite", parts.every((p) => p.length <= 1100), parts.map((p) => p.length));
}

console.log("\n[I5] /analyse envoie toutes les sections (dans l'ordre, début d'abord)");
async function routeAnalyse(): Promise<void> {
  const analysis = composePreMatchAnalysis(data);
  const match: ResolvedMatch = {
    fixtureId: 1489378, homeTeam: "Iran", awayTeam: "New Zealand", date: data.fixture.kickoffAt,
    status: "not_started", leagueName: "World Cup", round: "Group Stage - 1", venue: null, confidence: "high", alternatives: [],
  };
  const deps: RouterDeps = {
    resolve: async () => ({ ok: true, kind: "match", match, alternatives: [], reason: "" }),
    preMatch: async () => analysis,
    fullPreMatch: async () => composeFullPreMatchAnalysis(data),
    markets: async () => composeMarketsWatch(data),
    brief: async () => composeBrief(data),
    weather: async () => "🌡 Météo — Iran vs New Zealand\n\nMétéo non disponible (non intégrée au signal).",
    betLive: async () => "⚡ Signal live",
    context: async () => "ctx",
    forcedLive: async () => "live",
    overview: async () => ({ today: [], tomorrow: [], live: [] }),
    matchById: async () => match,
  };
  const sent: Array<{ text: string; buttons?: unknown }> = [];
  const ctx = { config: getBotConfig(), state: new BotState(), send: async (t: string, b?: unknown) => void sent.push({ text: t, buttons: b }) };
  await routeCommand("/analyse iran new zealand", ctx, deps);

  const analysisSends = sent.filter((s) => s.text.includes("1. Résumé express") || s.text.includes("📄 Partie") || s.text.includes("🎯 Mon plan"));
  const joined = analysisSends.map((s) => s.text).join("\n");
  check("analyse envoyée", analysisSends.length >= 1);
  for (const s of ["1. Résumé express", "2. Forme récente", "🎯 Marchés à surveiller", "⛔ À éviter", "🎯 Mon plan", "📊 Score final"]) {
    check(`/analyse envoie: ${s}`, joined.includes(s));
  }
  check("le 1er message d'analyse contient le DÉBUT", analysisSends[0].text.includes("1. Résumé express"));
  check("boutons sur le dernier message", Array.isArray(sent[sent.length - 1].buttons));
}

console.log("\n[I6] /markets et /analyse_full routent correctement");
async function routeMarketsAndFull(): Promise<void> {
  const match: ResolvedMatch = {
    fixtureId: 1489378, homeTeam: "Iran", awayTeam: "New Zealand", date: data.fixture.kickoffAt,
    status: "not_started", leagueName: "World Cup", round: "Group Stage - 1", venue: "Doha", confidence: "high", alternatives: [],
  };
  const deps: RouterDeps = {
    resolve: async () => ({ ok: true, kind: "match", match, alternatives: [], reason: "" }),
    preMatch: async () => composePreMatchAnalysis(data),
    fullPreMatch: async () => composeFullPreMatchAnalysis(data),
    markets: async () => composeMarketsWatch(data),
    brief: async () => composeBrief(data),
    weather: async () => "🌡 Météo — Iran vs New Zealand\n\nMétéo non disponible (non intégrée au signal).",
    betLive: async () => "⚡ Signal live — décision",
    context: async () => "ctx",
    forcedLive: async () => "live",
    overview: async () => ({ today: [], tomorrow: [], live: [] }),
    matchById: async () => match,
  };
  const cfg = getBotConfig();

  const sentM: string[] = [];
  await routeCommand("/markets iran new zealand", { config: cfg, state: new BotState(), send: async (t: string) => void sentM.push(t) }, deps);
  check("/markets renvoie les marchés", sentM.join("\n").includes("Marchés à surveiller"));

  const sentF: string[] = [];
  await routeCommand("/analyse_full iran new zealand", { config: cfg, state: new BotState(), send: async (t: string) => void sentF.push(t) }, deps);
  check("/analyse_full renvoie la version longue", sentF.join("\n").includes("Scénario 5"));

  const sentW: string[] = [];
  await routeCommand("/weather iran new zealand", { config: cfg, state: new BotState(), send: async (t: string) => void sentW.push(t) }, deps);
  check("/weather renvoie la météo", sentW.join("\n").includes("Météo"));

  const sentB: string[] = [];
  await routeCommand("/bet_live iran new zealand", { config: cfg, state: new BotState(), send: async (t: string) => void sentB.push(t) }, deps);
  check("/bet_live renvoie un signal live", sentB.join("\n").includes("Signal live"));
}

Promise.all([routeAnalyse(), routeMarketsAndFull()]).then(() => {
  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion(s) en échec (immediate-analysis).`);
    process.exit(1);
  } else {
    console.log("\n✅ Tests analyses immédiates OK.");
  }
});
