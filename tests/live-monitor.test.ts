/**
 * Tests runtime du live monitor: change-detector + polling-strategy + alertes.
 * Lancé par `npm run test`.
 */

import { detectMatchChanges, shouldSendWhatsAppAlert, type MatchChanges } from "@/lib/live-monitor/change-detector";
import { decidePollPlan, type MonitorConfig } from "@/lib/live-monitor/polling-strategy";
import type { NormalizedEvent, NormalizedFixture } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function fixture(p: Partial<NormalizedFixture>): NormalizedFixture {
  return {
    fixtureId: 1489378, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1",
    groupName: "Group A", home: { id: 1, name: "Iran", logo: null }, away: { id: 2, name: "New Zealand", logo: null },
    kickoffAt: "2026-06-16T01:00:00+00:00", statusShort: "2H", statusLong: "Second Half", phase: "live",
    elapsed: 33, homeGoals: 1, awayGoals: 0, venueName: null, venueCity: null, ...p,
  };
}

function cfg(p: Partial<MonitorConfig> = {}): MonitorConfig {
  return {
    enabled: true, livePollSeconds: 180, statsPollSeconds: 180, eventsPollSeconds: 360,
    lineupsOnce: true, contextOnce: true, maxApiCallsPerDay: 100, safeFreePlan: true, ...p,
  };
}

const noChange: MatchChanges = { scoreChanged: false, statusChanged: false, minuteAdvanced: false, importantChange: false, reason: [] };
const scoreChange: MatchChanges = { scoreChanged: true, statusChanged: false, minuteAdvanced: true, importantChange: true, reason: ["score"] };

function adv(p: Partial<LiveBettingAdvice>): LiveBettingAdvice {
  return {
    action: "WAIT", mainAdvice: "", matchScenario: "", liveReading: "", confidence: "low", urgency: "none",
    dominantTeam: null, whatIWouldDoNow: "", momentum: { homeScore: 0, awayScore: 0, dominantTeam: null, isRealPressure: false, isSterileDomination: false, last5MinutesSummary: "", last10MinutesSummary: "", sinceLastGoalSummary: "" },
    contextComparison: { preMatchExpectation: "", currentReality: "", scenarioShift: "", keyDifference: "" },
    recommendedMarkets: [], avoidMarkets: [], resolvedMarkets: [], risks: [],
    nextCheck: { inMinutes: 5, whatToWatch: [] },
    dataQuality: { hasFixture: true, hasStatistics: true, hasEvents: false, hasLineups: false, hasRecentForm: false, hasH2H: false, hasOdds: false, hasExternalCommentary: false, freshnessSeconds: 0, warning: null },
    finalVerdict: "", ...p,
  };
}

console.log("\n[M1] detectMatchChanges");
{
  const first = detectMatchChanges(null, fixture({}));
  check("première observation = importantChange", first.importantChange === true);

  const scored = detectMatchChanges({ homeGoals: 0, awayGoals: 0, elapsed: 30, statusShort: "2H" }, fixture({ homeGoals: 1, awayGoals: 0, elapsed: 33 }));
  check("but détecté (scoreChanged + important)", scored.scoreChanged && scored.importantChange);

  const calm = detectMatchChanges({ homeGoals: 1, awayGoals: 0, elapsed: 30, statusShort: "2H" }, fixture({ homeGoals: 1, awayGoals: 0, elapsed: 31 }));
  check("rien de notable (pas de change important)", !calm.importantChange && !calm.minuteAdvanced);
}

console.log("\n[M2] decidePollPlan — Free plan");
{
  const neverFetched = decidePollPlan({ config: cfg(), quotaRemaining: 80, isLive: true, secondsSinceLastStats: null, secondsSinceLastEvents: null, currentAction: null, changes: noChange, hasLineups: false });
  check("mode free", neverFetched.mode === "free", neverFetched.mode);
  check("fetch stats si jamais collecté", neverFetched.fetchStats === true);
  check("prochain poll = 180s", neverFetched.nextPollSeconds === 180, neverFetched.nextPollSeconds);
  check("fetch lineups (manquantes)", neverFetched.fetchLineups === true);

  const recent = decidePollPlan({ config: cfg(), quotaRemaining: 80, isLive: true, secondsSinceLastStats: 60, secondsSinceLastEvents: 60, currentAction: "WAIT", changes: noChange, hasLineups: true });
  check("pas de fetch stats si récent + pas de change", recent.fetchStats === false);
  check("pas de fetch events si récent + pas de change", recent.fetchEvents === false);

  const onChange = decidePollPlan({ config: cfg(), quotaRemaining: 80, isLive: true, secondsSinceLastStats: 60, secondsSinceLastEvents: 60, currentAction: "WAIT", changes: scoreChange, hasLineups: true });
  check("changement important force stats", onChange.fetchStats === true);
  check("changement de score force events", onChange.fetchEvents === true);
}

console.log("\n[M3] decidePollPlan — économie (<15 restants)");
{
  const eco = decidePollPlan({ config: cfg(), quotaRemaining: 10, isLive: true, secondsSinceLastStats: 200, secondsSinceLastEvents: 400, currentAction: "WATCH", changes: noChange, hasLineups: true });
  check("mode economy", eco.mode === "economy", eco.mode);
  check("prochain poll = 300s (5 min)", eco.nextPollSeconds === 300, eco.nextPollSeconds);
  check("events PAS récupérés sans changement de score", eco.fetchEvents === false);

  const ecoScore = decidePollPlan({ config: cfg(), quotaRemaining: 10, isLive: true, secondsSinceLastStats: 200, secondsSinceLastEvents: 400, currentAction: "WATCH", changes: scoreChange, hasLineups: true });
  check("events récupérés si score change (même en éco)", ecoScore.fetchEvents === true);
}

console.log("\n[M4] decidePollPlan — plan payant & pré-match");
{
  const paid = decidePollPlan({ config: cfg({ safeFreePlan: false }), quotaRemaining: 5000, isLive: true, secondsSinceLastStats: 90, secondsSinceLastEvents: 90, currentAction: "SIGNAL", changes: noChange, hasLineups: true });
  check("mode paid", paid.mode === "paid", paid.mode);
  check("prochain poll = 60s", paid.nextPollSeconds === 60, paid.nextPollSeconds);

  const pre = decidePollPlan({ config: cfg(), quotaRemaining: 80, isLive: false, secondsSinceLastStats: null, secondsSinceLastEvents: null, currentAction: null, changes: noChange, hasLineups: false });
  check("pré-match: pas de stats", pre.fetchStats === false);
  check("pré-match: pas d'events", pre.fetchEvents === false);
  check("pré-match: lineups si manquantes", pre.fetchLineups === true);
}

console.log("\n[M5] shouldSendWhatsAppAlert — anti-spam");
{
  const f = fixture({});
  const escalation = shouldSendWhatsAppAlert({ fixture: f, previousAdvice: adv({ action: "WAIT" }), currentAdvice: adv({ action: "WATCH" }), changes: noChange, events: [] });
  check("WAIT → WATCH déclenche une alerte", escalation.send === true, escalation.type);

  const stable = shouldSendWhatsAppAlert({ fixture: f, previousAdvice: adv({ action: "WATCH" }), currentAdvice: adv({ action: "WATCH" }), changes: noChange, events: [] });
  check("WATCH → WATCH sans changement = pas d'alerte", stable.send === false);

  const goal = shouldSendWhatsAppAlert({ fixture: f, previousAdvice: adv({ action: "WAIT" }), currentAdvice: adv({ action: "WAIT" }), changes: scoreChange, events: [] });
  check("but déclenche une alerte", goal.send === true && /but/.test(goal.type ?? ""));

  const red: NormalizedEvent = { elapsed: 32, extra: null, teamId: 2, teamName: "New Zealand", playerName: "X", assistName: null, type: "Card", detail: "Red Card", comments: null };
  const redCard = shouldSendWhatsAppAlert({ fixture: fixture({ elapsed: 33 }), previousAdvice: adv({ action: "WAIT" }), currentAdvice: adv({ action: "WAIT" }), changes: noChange, events: [red] });
  check("carton rouge déclenche une alerte", redCard.send === true && /carton rouge/.test(redCard.type ?? ""));

  check("signature stable pour cooldown", escalation.signature === "WATCH|—|1-0", escalation.signature);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} assertion(s) en échec (monitor).`);
  process.exit(1);
} else {
  console.log("\n✅ Tests live monitor OK.");
}
