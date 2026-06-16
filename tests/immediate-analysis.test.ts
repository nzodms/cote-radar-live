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
  oddsAvailable: false,
};

console.log("\n[I1] /analyse_match — analyse complète");
{
  const text = composePreMatchAnalysis(data);
  const sections = [
    "🏟 Analyse complète",
    "1. Contexte du match",
    "2. Dynamique des équipes",
    "3. Lecture tactique probable",
    "4. Joueurs clés",
    "5. Scénarios probables",
    "6. Marchés à surveiller AVANT match",
    "7. Ce que je ferais avant match",
    "8. Risques",
    "9. Plan live à suivre",
  ];
  for (const s of sections) check(`section présente: "${s}"`, text.includes(s), s);
  check("analyse détaillée (> 1000 caractères)", text.length > 1000, text.length);
  check("mentionne le favori (Iran)", text.includes("Iran"));
  check("rappelle 'sans cotes live, aucune value' / cotes non disponibles", /value confirmée|Cotes non disponibles|cotes/i.test(text));
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

if (failures > 0) {
  console.error(`\n❌ ${failures} assertion(s) en échec (immediate-analysis).`);
  process.exit(1);
} else {
  console.log("\n✅ Tests analyses immédiates OK.");
}
