/**
 * Tests multi-sources: fusion-engine, market-signal-engine, source-health.
 * Lancé par `npm run test-multi-source`.
 */

import { fuseSignals, type FusionInput } from "@/bot/fusion-engine";
import { computeMarketEvents } from "@/bot/market-signal-engine";
import { parseMarketText } from "@/bot/scrapers/market-parser";
import { SourceHealthRegistry } from "@/bot/scrapers/source-health";
import type { FusionApiSnapshot, MarketSnapshot } from "@/bot/scraper-types";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function apiSnap(p: Partial<FusionApiSnapshot> = {}): FusionApiSnapshot {
  return { hasStats: true, dominantTeam: "Iran", momentumTeam: "Iran", pressureType: "dangerous", criticalEvent: false, homeName: "Iran", awayName: "New Zealand", ...p };
}
function input(p: Partial<FusionInput> = {}): FusionInput {
  return { apiSnapshot: null, commentaryEvents: [], marketEvents: [], lineupSignals: [], contextSignals: [], altStatsSnapshot: null, previousAdvice: null, ...p };
}

console.log("\n[F1] API + commentary + market alignés → confiance haute");
{
  const f = fuseSignals(input({
    apiSnapshot: apiSnap({ pressureType: "dangerous" }),
    commentaryEvents: [{ level: "HIGH", kind: "shot_on_target", team: "home" }],
    marketEvents: [{ minute: 70, market: "next_goal", selection: "home", movement: "drop", changePct: 12, impact: "HIGH", summary: "" }],
  }));
  check("confidence high", f.confidence === "high", f.confidence);
  check("signal fort autorisé", f.strongSignalAllowed === true);
  check("shouldAlert", f.shouldAlert === true);
}

console.log("\n[F2] Commentary seul → WATCH maximum");
{
  const f = fuseSignals(input({ commentaryEvents: [{ level: "HIGH", kind: "shot_on_target", team: "home" }] }));
  check("confidence != high", f.confidence !== "high", f.confidence);
  check("signal fort NON autorisé", f.strongSignalAllowed === false);
  check("on alerte quand même (WATCH)", f.shouldAlert === true);
}

console.log("\n[F3] Market seul → WATCH maximum");
{
  const f = fuseSignals(input({ marketEvents: [{ minute: 70, market: "match_winner", selection: "home", movement: "drop", changePct: 12, impact: "HIGH", summary: "" }] }));
  check("signal fort NON autorisé", f.strongSignalAllowed === false);
  check("confidence != high", f.confidence !== "high");
}

console.log("\n[F4] News seul → pas de signal live");
{
  const f = fuseSignals(input({ contextSignals: [{ teamName: "Iran", signalType: "pressure", impact: "high", summary: "must win", confidence: "medium" }] }));
  check("shouldAlert false", f.shouldAlert === false, f);
  check("signal fort NON autorisé", f.strongSignalAllowed === false);
}

console.log("\n[F5] Lineup blessure joueur clé → ajuste risque (pas signal live)");
{
  const f = fuseSignals(input({ lineupSignals: [{ teamName: "Iran", signalType: "key_player_out", playerName: "Taremi", impact: "high", summary: "Taremi out" }] }));
  check("signal fort NON autorisé", f.strongSignalAllowed === false);
  check("analyse à refaire (shouldAnalyzeNow)", f.shouldAnalyzeNow === true);
  check("raison mentionne le risque", /risque/i.test(f.reason), f.reason);
}

console.log("\n[F6] Alt stats contradictoires → confiance baisse");
{
  const f = fuseSignals(input({
    apiSnapshot: apiSnap({ pressureType: "dangerous", momentumTeam: "Iran" }),
    altStatsSnapshot: { minute: 70, source: "alt", home: { shots: 1, shotsOnTarget: 0, corners: 0, possession: 40, dangerousAttacks: 1, xg: 0 }, away: { shots: 6, shotsOnTarget: 3, corners: 4, possession: 60, dangerousAttacks: 8, xg: 1 } },
  }));
  check("contradictions détectées", f.contradictions.length > 0, f.contradictions);
  check("confidence != high", f.confidence !== "high", f.confidence);
  check("signal fort NON autorisé", f.strongSignalAllowed === false);
}

console.log("\n[F7] Événement CRITICAL → analyse immédiate");
{
  const f = fuseSignals(input({ apiSnapshot: apiSnap({ criticalEvent: true }) }));
  check("shouldAnalyzeNow true", f.shouldAnalyzeNow === true);
  check("urgence critical", f.urgency === "critical", f.urgency);
  check("shouldAlert true", f.shouldAlert === true);
}

console.log("\n[F8] Market signal engine: mouvements & suspension");
{
  const snap = (odd: number, suspended = false): MarketSnapshot => ({ minute: 70, suspended, selections: [{ market: "next_goal", selection: "home", odd }], collectedAt: "" });
  check("baisse 20% = CRITICAL", computeMarketEvents(snap(2.0), snap(1.6))[0]?.impact === "CRITICAL");
  check("baisse 10% = HIGH", computeMarketEvents(snap(2.0), snap(1.8))[0]?.impact === "HIGH");
  check("pas de mouvement = []", computeMarketEvents(snap(2.0), snap(1.97)).length === 0);
  const susp = computeMarketEvents(snap(2.0, false), snap(2.0, true), true);
  check("suspension après danger = CRITICAL", susp.some((e) => e.movement === "suspended" && e.impact === "CRITICAL"));
}

console.log("\n[F9] Market parser");
{
  const s = parseMarketText("Home 1.85 Draw 3.40 Away 4.10", 70);
  check("3 sélections parsées", s.selections.length >= 2, s.selections);
  const sus = parseMarketText("Marché suspendu", 71);
  check("suspension détectée", sus.suspended === true);
}

console.log("\n[F10] Source health: down après 3 erreurs, le bot continue");
{
  const reg = new SourceHealthRegistry();
  reg.register("market", true);
  reg.recordError("market");
  check("1 erreur = degraded", reg.get("market")?.status === "degraded");
  reg.recordError("market");
  reg.recordError("market");
  check("3 erreurs = down", reg.get("market")?.status === "down");
  reg.recordSuccess("market", 120, 5);
  check("succès = ok (récupération)", reg.get("market")?.status === "ok");
  reg.register("altStats", false);
  check("source désactivée = disabled", reg.get("altStats")?.status === "disabled");
}

if (failures > 0) {
  console.error(`\n❌ ${failures} assertion(s) en échec (multi-source).`);
  process.exit(1);
} else {
  console.log("\n✅ Tests multi-sources OK.");
}
