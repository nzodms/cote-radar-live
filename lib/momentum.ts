/**
 * Moteur de momentum (sans IA).
 *
 * Implémente les règles de scoring du cahier des charges:
 *  - possession > 58% : +8 ; > 65% : +12 (paliers)
 *  - total shots supérieur de 3+ : +12
 *  - tirs cadrés supérieurs de 2+ : +15
 *  - corners supérieurs de 2+ : +8
 *  - carton rouge adverse : +20
 *  - but récent (<= 10') : +10
 *  - plusieurs événements offensifs récents : +10
 *  - domination sans tir cadré : -15 + flag "domination stérile"
 *  - équipe dominée avec corners/transitions : flag "risque de contre"
 *  - 0-0 après 60' avec peu de tirs cadrés : flag overs réduits
 *  - score serré après 75' : flag risque live
 */

import type { MatchDataBundle, NormalizedEvent, NormalizedTeamStats } from "@/types/match";
import type { MomentumBreakdownItem, MomentumResult } from "@/types/analysis";
import { clamp } from "./utils";

function num(v: number | null | undefined): number {
  return v ?? 0;
}

/** L'équipe "domine" si possession > 58% OU avantage de 3+ tirs totaux. */
function dominates(side: NormalizedTeamStats, opp: NormalizedTeamStats): boolean {
  const possDom = side.ballPossession !== null && side.ballPossession > 58;
  const shotsDom =
    side.totalShots !== null && opp.totalShots !== null && side.totalShots - opp.totalShots >= 3;
  return possDom || shotsDom;
}

/**
 * Compte les buts marqués par une équipe dans les `window` dernières minutes.
 * Gère les buts contre son camp (créditer l'adversaire) et exclut les penalties manqués.
 */
function recentGoals(
  events: NormalizedEvent[],
  forTeamId: number,
  homeId: number,
  awayId: number,
  currentElapsed: number,
  window: number
): number {
  return events.filter((e) => {
    if ((e.type ?? "").toLowerCase() !== "goal") return false;
    const detail = (e.detail ?? "").toLowerCase();
    if (detail.includes("missed")) return false; // penalty manqué = type "Goal"
    const el = e.elapsed ?? -999;
    if (el < 0) return false;
    if (currentElapsed - el > window) return false;
    const isOwnGoal = detail.includes("own");
    const scoringTeam = isOwnGoal ? (e.teamId === homeId ? awayId : homeId) : e.teamId;
    return scoringTeam === forTeamId;
  }).length;
}

export function computeMomentum(bundle: MatchDataBundle): MomentumResult {
  const { fixture, statistics, events } = bundle;
  const h = statistics.home;
  const a = statistics.away;
  const homeId = fixture.home.id;
  const awayId = fixture.away.id;
  const elapsed = fixture.elapsed ?? 0;
  const homeGoals = num(fixture.homeGoals);
  const awayGoals = num(fixture.awayGoals);

  let home = 0;
  let away = 0;
  const breakdown: MomentumBreakdownItem[] = [];

  const add = (label: string, homeDelta: number, awayDelta: number) => {
    if (homeDelta === 0 && awayDelta === 0) return;
    home += homeDelta;
    away += awayDelta;
    breakdown.push({ label, homeDelta, awayDelta });
  };

  // --- Possession (paliers) ---
  if (h.ballPossession !== null) {
    if (h.ballPossession > 65) add("Possession home > 65%", 12, 0);
    else if (h.ballPossession > 58) add("Possession home > 58%", 8, 0);
  }
  if (a.ballPossession !== null) {
    if (a.ballPossession > 65) add("Possession away > 65%", 0, 12);
    else if (a.ballPossession > 58) add("Possession away > 58%", 0, 8);
  }

  // --- Total shots (écart 3+) ---
  if (h.totalShots !== null && a.totalShots !== null) {
    const diff = h.totalShots - a.totalShots;
    if (diff >= 3) add("Avantage tirs totaux home (+3)", 12, 0);
    else if (diff <= -3) add("Avantage tirs totaux away (+3)", 0, 12);
  }

  // --- Tirs cadrés (écart 2+) ---
  if (h.shotsOnGoal !== null && a.shotsOnGoal !== null) {
    const diff = h.shotsOnGoal - a.shotsOnGoal;
    if (diff >= 2) add("Avantage tirs cadrés home (+2)", 15, 0);
    else if (diff <= -2) add("Avantage tirs cadrés away (+2)", 0, 15);
  }

  // --- Corners (écart 2+) ---
  if (h.cornerKicks !== null && a.cornerKicks !== null) {
    const diff = h.cornerKicks - a.cornerKicks;
    if (diff >= 2) add("Avantage corners home (+2)", 8, 0);
    else if (diff <= -2) add("Avantage corners away (+2)", 0, 8);
  }

  // --- Carton rouge adverse ---
  if (num(a.redCards) > 0) add("Carton rouge adverse (subi par away)", 20, 0);
  if (num(h.redCards) > 0) add("Carton rouge adverse (subi par home)", 0, 20);

  // --- But récent (<= 10') ---
  const homeRecentGoal = recentGoals(events, homeId, homeId, awayId, elapsed, 10);
  const awayRecentGoal = recentGoals(events, awayId, homeId, awayId, elapsed, 10);
  if (homeRecentGoal > 0) add("But récent home (<10')", 10, 0);
  if (awayRecentGoal > 0) add("But récent away (<10')", 0, 10);

  // --- Plusieurs événements offensifs récents (<= 18') ---
  const homeBurst = recentGoals(events, homeId, homeId, awayId, elapsed, 18);
  const awayBurst = recentGoals(events, awayId, homeId, awayId, elapsed, 18);
  if (homeBurst >= 2) add("Séquence offensive récente home", 10, 0);
  if (awayBurst >= 2) add("Séquence offensive récente away", 0, 10);

  // --- Domination stérile (réduction -15) ---
  const flags = {
    homeSterileDomination: false,
    awaySterileDomination: false,
    counterAttackRiskAgainstHome: false,
    counterAttackRiskAgainstAway: false,
    lowScoringLatePhase: false,
    tightLatePhase: false,
  };

  const homeSterile =
    dominates(h, a) &&
    num(h.shotsOnGoal) <= 1 &&
    (num(h.totalShots) >= 4 || num(h.ballPossession) > 60);
  const awaySterile =
    dominates(a, h) &&
    num(a.shotsOnGoal) <= 1 &&
    (num(a.totalShots) >= 4 || num(a.ballPossession) > 60);

  if (homeSterile) {
    add("Domination stérile home (-15)", -15, 0);
    flags.homeSterileDomination = true;
  }
  if (awaySterile) {
    add("Domination stérile away (-15)", 0, -15);
    flags.awaySterileDomination = true;
  }

  // --- Risque de contre (équipe dominée mais avec corners/transitions) ---
  if (
    dominates(h, a) &&
    (num(a.cornerKicks) >= 2 || num(a.totalShots) >= 3 || num(a.shotsOnGoal) >= 1)
  ) {
    flags.counterAttackRiskAgainstHome = true;
  }
  if (
    dominates(a, h) &&
    (num(h.cornerKicks) >= 2 || num(h.totalShots) >= 3 || num(h.shotsOnGoal) >= 1)
  ) {
    flags.counterAttackRiskAgainstAway = true;
  }

  // --- 0-0 après 60' avec peu de tirs cadrés ---
  const combinedSOG = num(h.shotsOnGoal) + num(a.shotsOnGoal);
  if (elapsed >= 60 && homeGoals + awayGoals === 0 && combinedSOG <= 3) {
    flags.lowScoringLatePhase = true;
  }

  // --- Score serré après 75' ---
  if (elapsed >= 75 && Math.abs(homeGoals - awayGoals) <= 1) {
    flags.tightLatePhase = true;
  }

  const homeFinal = clamp(Math.round(home), 0, 150);
  const awayFinal = clamp(Math.round(away), 0, 150);

  return {
    home: homeFinal,
    away: awayFinal,
    diff: homeFinal - awayFinal,
    breakdown,
    flags,
  };
}
