/**
 * Tests des analyses immédiates: /analyse_match (complet), /context, et le
 * format d'alerte live (marchés résolus). Lancé par `npm run test-immediate-analysis`.
 */

import {
  composeContextPlan,
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
};

console.log("\n[I1] /analyse_match — analyse premium");
{
  const text = composePreMatchAnalysis(data);
  const sections = [
    "🏟 Analyse complète",
    "1. Contexte du match & du groupe",
    "2. Dynamique des équipes",
    "3. Lecture tactique probable",
    "4. Joueurs clés (à confirmer avec les lineups)",
    "5. Scénarios live",
    "6. Marchés à surveiller",
    "🎯 Ce que je ferais",
    "🔎 Checklist live",
    "9. Risques",
  ];
  for (const s of sections) check(`section présente: "${s}"`, text.includes(s), s);
  check("analyse détaillée (> 1500 caractères)", text.length > 1500, text.length);
  check("contexte de groupe (Group I + autres équipes)", text.includes("Group I") && text.includes("Iraq, Norway"));
  check("scénarios live concrets (1..5)", text.includes("Scénario 1") && text.includes("Scénario 5"));
  check("checklist live (signaux d'alerte)", text.includes("Signaux d'alerte"));
  check("cotes non affichées => aucune value confirmée", text.includes("aucune value confirmée"));
  check("pas de répétition du round", text.split("Group Stage - 1").length - 1 <= 1, text.split("Group Stage - 1").length - 1);
  check("mentionne le favori (Iran)", text.includes("Iran"));
}

console.log("\n[I1b] cotes affichées quand disponibles");
{
  const withOdds: PreMatchData = {
    ...data,
    odds: { available: true, bookmaker: "Bet365", updatedAt: "2026-06-16T00:00:00+00:00", oneX2: { home: 1.5, draw: 4.2, away: 6 }, overUnder: { line: "2.5", over: 1.9, under: 1.9 }, btts: { yes: 2.1, no: 1.7 } },
  };
  const text = composePreMatchAnalysis(withOdds);
  check("1X2 affiché", text.includes("1X2") && text.includes("1.5"));
  check("over/under affiché", text.includes("Over/Under 2.5"));
  check("BTTS affiché", text.includes("BTTS : Oui 2.1"));
  check("formulation 'à surveiller'", text.includes("à surveiller"));
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

console.log("\n[I4] découpage Telegram — début jamais perdu");
{
  const analysis = composePreMatchAnalysis(data);
  const parts = buildAnalysisParts(analysis, 1200);
  check("plusieurs parties", parts.length >= 2, parts.length);
  check(
    "partie 1 = en-tête + DÉBUT (titre + Contexte, pas la fin)",
    parts[0].startsWith("📄 Partie 1/") && parts[0].includes("🏟 Analyse complète") && parts[0].includes("1. Contexte")
  );
  check("partie 1 ne commence PAS par 'Ce que je ferais'", !parts[0].includes("🎯 Ce que je ferais") || parts[0].indexOf("1. Contexte") < parts[0].indexOf("🎯"));
  const joined = parts.join("\n");
  for (const s of ["1. Contexte", "2. Dynamique", "3. Lecture tactique", "4. Joueurs clés", "5. Scénarios live", "6. Marchés", "🎯 Ce que je ferais", "🔎 Checklist live", "9. Risques"]) {
    check(`section conservée: ${s}`, joined.includes(s));
  }
  check("chaque partie sous la limite Telegram", parts.every((p) => p.length <= 1300), parts.map((p) => p.length));
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
    context: async () => "ctx",
    forcedLive: async () => "live",
    overview: async () => ({ today: [], tomorrow: [], live: [] }),
    matchById: async () => match,
  };
  const sent: Array<{ text: string; buttons?: unknown }> = [];
  const ctx = { config: getBotConfig(), state: new BotState(), send: async (t: string, b?: unknown) => void sent.push({ text: t, buttons: b }) };
  await routeCommand("/analyse iran new zealand", ctx, deps);

  const analysisSends = sent.filter((s) => s.text.includes("1. Contexte") || s.text.includes("📄 Partie") || s.text.includes("🎯 Ce que je ferais"));
  const joined = analysisSends.map((s) => s.text).join("\n");
  check("analyse envoyée", analysisSends.length >= 1);
  for (const s of ["1. Contexte", "2. Dynamique", "3. Lecture tactique", "4. Joueurs clés", "5. Scénarios live", "6. Marchés", "🎯 Ce que je ferais", "🔎 Checklist live", "9. Risques"]) {
    check(`/analyse envoie: ${s}`, joined.includes(s));
  }
  check("le 1er message d'analyse contient le DÉBUT", analysisSends[0].text.includes("1. Contexte"));
  check("boutons sur le dernier message", Array.isArray(sent[sent.length - 1].buttons));
}

routeAnalyse().then(() => {
  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion(s) en échec (immediate-analysis).`);
    process.exit(1);
  } else {
    console.log("\n✅ Tests analyses immédiates OK.");
  }
});
