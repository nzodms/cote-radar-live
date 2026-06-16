/**
 * Lecture de la pression live à partir des statistiques (PUR).
 *
 * Sépare proprement :
 *  - événement ponctuel (un but, un corner isolé)
 *  - pression réelle (tirs cadrés + corners répétés)
 *  - réaction adverse
 *  - bruit de fin de match
 *
 * Momentum exprimé sur /100 (part de chaque équipe), jamais "55/10".
 */

import type { NormalizedEvent, NormalizedFixture, NormalizedStatsPair, NormalizedTeamStats, RecentForm } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";

export type Side = "home" | "away";

/** Côté favori estimé depuis la forme récente (pour la décision live). */
export function favoriteSideFromForm(rf: { home: RecentForm | null; away: RecentForm | null }): Side | null {
  const h = rf.home;
  const a = rf.away;
  if (!h || !a) return null;
  const score = (f: RecentForm) => f.wins * 3 + f.draws + (f.goalsFor - f.goalsAgainst) * 0.3;
  const dh = score(h);
  const da = score(a);
  if (dh > da + 1.5) return "home";
  if (da > dh + 1.5) return "away";
  return null;
}

export interface LivePressure {
  homeSoT: number;
  awaySoT: number;
  homeShots: number;
  awayShots: number;
  homeCorners: number;
  awayCorners: number;
  homePoss: number | null;
  awayPoss: number | null;
  totalCards: number;
  redCardSide: Side | null;
  dominantSide: Side | null;
  pressureSide: Side | null;
  isRealPressure: boolean;
  isSterile: boolean;
  bothProduce: boolean;
  /** Momentum sur /100 (part de chaque équipe). */
  momentum: { home: number; away: number };
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function nameToSide(name: string | null, f: NormalizedFixture): Side | null {
  if (!name) return null;
  const l = name.toLowerCase();
  if (f.home.name.toLowerCase().includes(l) || l.includes(f.home.name.toLowerCase())) return "home";
  if (f.away.name.toLowerCase().includes(l) || l.includes(f.away.name.toLowerCase())) return "away";
  return null;
}

export function redCardSideFromEvents(events: NormalizedEvent[] | undefined, f: NormalizedFixture): Side | null {
  if (!events) return null;
  for (const e of events) {
    const detail = (e.detail ?? "").toLowerCase();
    const type = (e.type ?? "").toLowerCase();
    if (type === "card" && (detail.includes("red") || detail.includes("second yellow"))) {
      return nameToSide(e.teamName, f);
    }
  }
  return null;
}

export interface PressureInput {
  statistics: NormalizedStatsPair;
  fixture: NormalizedFixture;
  events?: NormalizedEvent[];
  previousAdvice?: LiveBettingAdvice | null;
}

export function assessLivePressure(input: PressureInput): LivePressure {
  const h: NormalizedTeamStats = input.statistics.home;
  const a: NormalizedTeamStats = input.statistics.away;
  const homeSoT = num(h.shotsOnGoal);
  const awaySoT = num(a.shotsOnGoal);
  const homeShots = num(h.totalShots);
  const awayShots = num(a.totalShots);
  const homeCorners = num(h.cornerKicks);
  const awayCorners = num(a.cornerKicks);
  const homePoss = h.ballPossession;
  const awayPoss = a.ballPossession;
  const totalCards = num(h.yellowCards) + num(a.yellowCards) + 2 * (num(h.redCards) + num(a.redCards));

  const homeRaw = homeSoT * 3 + homeCorners + homeShots * 0.5 + (homePoss ?? 50) / 10;
  const awayRaw = awaySoT * 3 + awayCorners + awayShots * 0.5 + (awayPoss ?? 50) / 10;
  const tot = homeRaw + awayRaw;
  const homeM = tot > 0 ? Math.round((homeRaw / tot) * 100) : 50;
  const momentum = { home: homeM, away: 100 - homeM };

  let dominantSide: Side | null = null;
  if (homeRaw > awayRaw + 1.5) dominantSide = "home";
  else if (awayRaw > homeRaw + 1.5) dominantSide = "away";

  let pressureSide: Side | null = null;
  if (homeSoT >= awaySoT + 2 && homeSoT >= 2) pressureSide = "home";
  else if (awaySoT >= homeSoT + 2 && awaySoT >= 2) pressureSide = "away";

  let isRealPressure = pressureSide !== null;
  let isSterile = false;

  const mom = input.previousAdvice?.momentum;
  if (mom) {
    if (mom.isRealPressure) isRealPressure = true;
    if (mom.isSterileDomination) isSterile = true;
    const momSide = nameToSide(mom.dominantTeam, input.fixture);
    if (momSide && !pressureSide && mom.isRealPressure) pressureSide = momSide;
    if (momSide && !dominantSide) dominantSide = momSide;
  }

  if (dominantSide) {
    const domSoT = dominantSide === "home" ? homeSoT : awaySoT;
    const domPoss = dominantSide === "home" ? homePoss : awayPoss;
    if (domSoT <= 1 && (domPoss ?? 0) >= 58) isSterile = true;
    if (domSoT >= 2) isSterile = false;
  }

  // Carton rouge : via les événements, sinon via la statistique redCards.
  let redCardSide = redCardSideFromEvents(input.events, input.fixture);
  if (!redCardSide) {
    if (num(h.redCards) > 0) redCardSide = "home";
    else if (num(a.redCards) > 0) redCardSide = "away";
  }

  return {
    homeSoT, awaySoT, homeShots, awayShots, homeCorners, awayCorners, homePoss, awayPoss,
    totalCards,
    redCardSide,
    dominantSide,
    pressureSide,
    isRealPressure,
    isSterile,
    bothProduce: homeSoT >= 1 && awaySoT >= 1,
    momentum,
  };
}
