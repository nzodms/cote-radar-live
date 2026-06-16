/**
 * Moteur de DÉCISION de paris live — orienté action concrète (pas un rapport).
 *
 * generateLiveBettingDecision() est PUR (testable sans réseau). Il choisit une
 * action (NO_BET / WAIT / WATCH / PLAYABLE / AVOID / INVALIDATED) et liste des
 * marchés actionnables avec condition d'entrée, invalidation et cote requise.
 *
 * Garde-fous :
 *  - Pas de cotes => jamais de "value confirmée", jamais de PLAYABLE fort
 *    (on plafonne à WATCH/WAIT).
 *  - Domination stérile => AVOID (le contrôle ne vaut rien sans occasions).
 *  - Marchés déjà résolus par le score => jamais conseillés (déjà passés).
 *  - Marchés joueurs => uniquement si compositions confirmées.
 *  - Wording autorisé seulement (voir bas de fichier).
 */

import type { NormalizedEvent, NormalizedFixture, NormalizedStatsPair, NormalizedTeamStats } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import type { OddsSnapshotComparison } from "./odds/odds-snapshot";
import { hasDropped } from "./odds/odds-snapshot";
import { oddForKey } from "./odds/odds-normalizer";
import type { InternalMarketKey } from "./odds/market-mapper";

export type DecisionAction = "NO_BET" | "WAIT" | "WATCH" | "PLAYABLE" | "AVOID" | "INVALIDATED";
export type DecisionRisk = "low" | "medium" | "high";
export type DecisionUrgency = "low" | "medium" | "high" | "critical";
export type DecisionMarketStatus = "watch" | "playable" | "avoid" | "invalidated" | "already_resolved";

export interface DecisionMarket {
  marketName: string;
  status: DecisionMarketStatus;
  reason: string;
  conditions: string[];
  invalidation: string[];
  oddsRequired: string | null;
  currentOdds: string | null;
  risk: DecisionRisk;
}

export interface LiveBettingDecision {
  action: DecisionAction;
  confidence: number;
  risk: DecisionRisk;
  urgency: DecisionUrgency;
  recommendedMarkets: DecisionMarket[];
  avoidMarkets: DecisionMarket[];
  alreadyResolvedMarkets: DecisionMarket[];
  summary: string;
  nextCheckSeconds: number;
}

export interface LiveDecisionInput {
  fixture: NormalizedFixture;
  statistics: NormalizedStatsPair;
  events?: NormalizedEvent[];
  winamaxCommentaryEvents?: ExternalCommentaryEvent[];
  oddsSnapshot?: OddsSnapshotComparison | null;
  previousAdvice?: LiveBettingAdvice | null;
  previousDecision?: LiveBettingDecision | null;
  minute?: number | null;
  score?: { home: number; away: number };
  lineupsConfirmed?: boolean;
}

/* ----------------------------- Lecture pression ----------------------------- */

type Side = "home" | "away";

interface PressureRead {
  homeSoT: number;
  awaySoT: number;
  homeShots: number;
  awayShots: number;
  homeCorners: number;
  awayCorners: number;
  homePoss: number | null;
  awayPoss: number | null;
  totalCards: number;
  dominantSide: Side | null;
  pressureSide: Side | null;
  isRealPressure: boolean;
  isSterile: boolean;
  bothProduce: boolean;
}

function n(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function nameToSide(name: string | null, f: NormalizedFixture): Side | null {
  if (!name) return null;
  const l = name.toLowerCase();
  if (f.home.name.toLowerCase().includes(l) || l.includes(f.home.name.toLowerCase())) return "home";
  if (f.away.name.toLowerCase().includes(l) || l.includes(f.away.name.toLowerCase())) return "away";
  return null;
}

function assessPressure(input: LiveDecisionInput): PressureRead {
  const h: NormalizedTeamStats = input.statistics.home;
  const a: NormalizedTeamStats = input.statistics.away;
  const homeSoT = n(h.shotsOnGoal);
  const awaySoT = n(a.shotsOnGoal);
  const homeShots = n(h.totalShots);
  const awayShots = n(a.totalShots);
  const homeCorners = n(h.cornerKicks);
  const awayCorners = n(a.cornerKicks);
  const homePoss = h.ballPossession;
  const awayPoss = a.ballPossession;
  const totalCards = n(h.yellowCards) + n(a.yellowCards) + 2 * (n(h.redCards) + n(a.redCards));

  // Score de domination (tirs cadrés pèsent le plus, puis corners, puis possession).
  const homeScore = homeSoT * 3 + homeCorners + (homePoss ?? 0) / 20 + homeShots * 0.5;
  const awayScore = awaySoT * 3 + awayCorners + (awayPoss ?? 0) / 20 + awayShots * 0.5;
  let dominantSide: Side | null = null;
  if (homeScore > awayScore + 1.5) dominantSide = "home";
  else if (awayScore > homeScore + 1.5) dominantSide = "away";

  // Pression réelle = avantage de tirs CADRÉS (pas la possession).
  let pressureSide: Side | null = null;
  if (homeSoT >= awaySoT + 2 && homeSoT >= 2) pressureSide = "home";
  else if (awaySoT >= homeSoT + 2 && awaySoT >= 2) pressureSide = "away";

  // Affine avec le momentum du conseil précédent si présent.
  const mom = input.previousAdvice?.momentum;
  let isRealPressure = pressureSide !== null;
  let isSterile = false;
  if (mom) {
    if (mom.isRealPressure) isRealPressure = true;
    if (mom.isSterileDomination) isSterile = true;
    const momSide = nameToSide(mom.dominantTeam, input.fixture);
    if (momSide && !pressureSide && mom.isRealPressure) pressureSide = momSide;
    if (momSide && !dominantSide) dominantSide = momSide;
  }

  // Domination stérile : dominant par possession/territoire mais 0-1 tir cadré.
  if (dominantSide) {
    const domSoT = dominantSide === "home" ? homeSoT : awaySoT;
    const domPoss = dominantSide === "home" ? homePoss : awayPoss;
    if (domSoT <= 1 && (domPoss ?? 0) >= 58) isSterile = true;
    if (domSoT >= 2) isSterile = false; // de vraies occasions => plus stérile
  }

  const bothProduce = homeSoT >= 1 && awaySoT >= 1;

  return {
    homeSoT, awaySoT, homeShots, awayShots, homeCorners, awayCorners, homePoss, awayPoss,
    totalCards, dominantSide, pressureSide, isRealPressure, isSterile, bothProduce,
  };
}

/* ----------------------------- Détection d'événements chauds ----------------------------- */

function redCardSide(events: NormalizedEvent[] | undefined, f: NormalizedFixture): Side | null {
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

/* ----------------------------- Construction marché ----------------------------- */

function fmtOdd(v: number | null): string | null {
  return v === null ? null : v.toFixed(2);
}

function nextGoalKey(side: Side): InternalMarketKey {
  return side === "home" ? "next_goal_home" : "next_goal_away";
}

/* ----------------------------- Moteur ----------------------------- */

export function generateLiveBettingDecision(input: LiveDecisionInput): LiveBettingDecision {
  const f = input.fixture;
  const homeGoals = input.score?.home ?? f.homeGoals ?? 0;
  const awayGoals = input.score?.away ?? f.awayGoals ?? 0;
  const totalGoals = homeGoals + awayGoals;
  const minute = input.minute ?? f.elapsed ?? 0;
  const sideName = (s: Side): string => (s === "home" ? f.home.name : f.away.name);

  const oddsAvailable = input.oddsSnapshot?.available === true;
  const board = input.oddsSnapshot?.board ?? null;
  const suspended = input.oddsSnapshot?.suspended === true;

  const p = assessPressure(input);
  const recommended: DecisionMarket[] = [];
  const avoid: DecisionMarket[] = [];
  const resolved: DecisionMarket[] = [];

  /* --- Marchés déjà résolus par le score (jamais conseillés) --- */
  if (totalGoals >= 2) {
    resolved.push(resolvedMarket("Over 1.5 buts", `déjà atteint (${homeGoals}-${awayGoals})`));
  }
  if (totalGoals >= 3) {
    resolved.push(resolvedMarket("Over 2.5 buts", `déjà atteint (${homeGoals}-${awayGoals})`));
  }
  if (homeGoals >= 1 && awayGoals >= 1) {
    resolved.push(resolvedMarket("BTTS (les deux marquent)", "déjà réalisé"));
  }

  /* --- Invalidation : un pari précédent devenu mauvais --- */
  let invalidated = false;
  const rc = redCardSide(input.events, f);
  const prevSide = nameToSide(input.previousAdvice?.dominantTeam ?? null, f);
  if (rc && prevSide && rc === prevSide) {
    invalidated = true;
    avoid.push({
      marketName: `Prochain but ${sideName(prevSide)}`,
      status: "invalidated",
      reason: `carton rouge contre ${sideName(prevSide)} : ce pari est devenu mauvais à cause de la dynamique`,
      conditions: [],
      invalidation: ["déjà invalidé par le carton rouge"],
      oddsRequired: null,
      currentOdds: null,
      risk: "high",
    });
  }

  /* --- Prochain but côté pression --- */
  if (p.pressureSide && !invalidated) {
    const side = p.pressureSide;
    const key = nextGoalKey(side);
    const cur = fmtOdd(oddForKey(board, key));
    const dropped = input.oddsSnapshot ? hasDropped(input.oddsSnapshot, key) : false;

    if (p.isSterile && p.dominantSide === side) {
      avoid.push({
        marketName: `Prochain but ${sideName(side)}`,
        status: "avoid",
        reason: "domination stérile : beaucoup de ballon mais pas d'occasions franches",
        conditions: [],
        invalidation: [],
        oddsRequired: null,
        currentOdds: cur,
        risk: "high",
      });
    } else if (oddsAvailable && dropped) {
      avoid.push({
        marketName: `Prochain but ${sideName(side)}`,
        status: "avoid",
        reason: "cote déjà compressée : le marché a réagi, la value est partie",
        conditions: [],
        invalidation: [],
        oddsRequired: null,
        currentOdds: cur,
        risk: "medium",
      });
    } else if (oddsAvailable && suspended) {
      recommended.push({
        marketName: `Prochain but ${sideName(side)}`,
        status: "watch",
        reason: "marché suspendu (événement chaud) : attendre la réouverture",
        conditions: ["réouverture du marché", "pression maintenue 2-3 min"],
        invalidation: [`${sideName(side === "home" ? "away" : "home")} reprend le contrôle`],
        oddsRequired: null,
        currentOdds: cur,
        risk: "medium",
      });
    } else {
      const playable = oddsAvailable && p.isRealPressure;
      recommended.push({
        marketName: `Prochain but ${sideName(side)}`,
        status: playable ? "playable" : "watch",
        reason: p.isRealPressure
          ? `${sideName(side)} met une pression réelle (tirs cadrés/corners)`
          : `${sideName(side)} prend le dessus, à confirmer`,
        conditions: [
          "nouveau tir cadré ou corner dans les 2-3 min",
          oddsAvailable ? "cote non compressée" : "cote live exploitable (API cotes indisponible)",
        ],
        invalidation: [`${sideName(side === "home" ? "away" : "home")} égalise/reprend le contrôle`, "chute du rythme"],
        oddsRequired: oddsAvailable ? null : "cote live à vérifier manuellement",
        currentOdds: cur,
        risk: p.isRealPressure ? "medium" : "high",
      });
    }

    // Marchés équipe associés (tirs cadrés / corners) — toujours "watch".
    recommended.push({
      marketName: `${sideName(side)} tirs cadrés`,
      status: "watch",
      reason: "mesure directe de la vraie pression",
      conditions: ["la cadence de tirs cadrés se maintient"],
      invalidation: ["la pression retombe"],
      oddsRequired: null,
      currentOdds: null,
      risk: "medium",
    });
    recommended.push({
      marketName: `${sideName(side)} corners`,
      status: "watch",
      reason: "domination territoriale = corners",
      conditions: [`${sideName(side)} continue de pousser sur les côtés`],
      invalidation: ["le camp se rééquilibre"],
      oddsRequired: null,
      currentOdds: null,
      risk: "medium",
    });
  } else if (p.dominantSide && p.isSterile && !invalidated) {
    avoid.push({
      marketName: `Prochain but ${sideName(p.dominantSide)}`,
      status: "avoid",
      reason: "domination stérile : le contrôle ne vaut rien sans occasions franches",
      conditions: [],
      invalidation: [],
      oddsRequired: null,
      currentOdds: null,
      risk: "high",
    });
  }

  /* --- BTTS live (seulement si les deux produisent et pas déjà résolu) --- */
  const bttsResolved = homeGoals >= 1 && awayGoals >= 1;
  if (!bttsResolved && !invalidated) {
    if (p.bothProduce) {
      const cur = fmtOdd(oddForKey(board, "btts_yes"));
      recommended.push({
        marketName: "BTTS (les deux marquent)",
        status: oddsAvailable ? "watch" : "watch",
        reason: "les deux équipes cadrent : BTTS crédible si ça reste ouvert",
        conditions: ["chaque équipe garde de la présence offensive"],
        invalidation: ["une équipe se referme complètement"],
        oddsRequired: null,
        currentOdds: cur,
        risk: "medium",
      });
    } else if (minute >= 35) {
      avoid.push({
        marketName: "BTTS (les deux marquent)",
        status: "avoid",
        reason: "une seule équipe produit : BTTS peu crédible pour l'instant",
        conditions: [],
        invalidation: [],
        oddsRequired: null,
        currentOdds: null,
        risk: "high",
      });
    }
  }

  /* --- Over 2.5 : seulement si vrai rythme --- */
  const combinedSoT = p.homeSoT + p.awaySoT;
  const over25Resolved = totalGoals >= 3;
  if (!over25Resolved && !invalidated) {
    const rhythm = combinedSoT >= 5 || (totalGoals >= 2 && minute <= 65);
    if (rhythm) {
      const cur = fmtOdd(oddForKey(board, "over_2_5"));
      recommended.push({
        marketName: "Over 2.5 buts",
        status: "watch",
        reason: "rythme élevé (tirs cadrés des deux côtés / but déjà tombé tôt)",
        conditions: ["le rythme offensif se maintient"],
        invalidation: ["le match se verrouille", "minute avancée sans occasions"],
        oddsRequired: null,
        currentOdds: cur,
        risk: "medium",
      });
    } else if (minute >= 35 && combinedSoT <= 2) {
      avoid.push({
        marketName: "Over 2.5 buts",
        status: "avoid",
        reason: "rythme faible (peu de tirs cadrés) : Over 2.5 peu probable",
        conditions: [],
        invalidation: [],
        oddsRequired: null,
        currentOdds: null,
        risk: "high",
      });
    }
  }

  /* --- Cartons : si match tendu --- */
  if (p.totalCards >= 3 && !invalidated) {
    recommended.push({
      marketName: "Over cartons",
      status: "watch",
      reason: "match tendu (cartons qui s'accumulent)",
      conditions: ["les duels restent engagés", "arbitre strict"],
      invalidation: ["le match se calme"],
      oddsRequired: null,
      currentOdds: null,
      risk: "high",
    });
  }

  /* --- Marchés joueurs : seulement si compositions confirmées --- */
  const playerNote = input.lineupsConfirmed
    ? null
    : "Marchés joueurs masqués : compositions non confirmées (aucun joueur supposé).";

  /* ----------------------------- Action globale ----------------------------- */
  const hasPlayable = recommended.some((m) => m.status === "playable");
  const hasWatch = recommended.some((m) => m.status === "watch");

  let action: DecisionAction;
  if (invalidated) action = "INVALIDATED";
  else if (hasPlayable) action = "PLAYABLE";
  else if (hasWatch) action = "WATCH";
  else if (p.isSterile) action = "AVOID";
  else if (minute < 20) action = "WAIT";
  else if (recommended.length === 0 && avoid.length === 0) action = "NO_BET";
  else action = "WATCH";

  /* ----------------------------- Confiance / risque / urgence ----------------------------- */
  let confidence = 40;
  if (p.isRealPressure) confidence += 15;
  if (oddsAvailable && !suspended) confidence += 15;
  if (input.statistics.hasData) confidence += 10;
  if (p.isSterile) confidence -= 15;
  if (invalidated) confidence -= 20;
  if (!oddsAvailable) confidence -= 5;
  confidence = Math.max(5, Math.min(90, confidence));

  let risk: DecisionRisk = "medium";
  if (p.isRealPressure && oddsAvailable && !suspended && !p.isSterile) risk = "low";
  if (!oddsAvailable || p.isSterile || invalidated) risk = "high";

  let urgency: DecisionUrgency = "low";
  if (suspended || rc) urgency = "critical";
  else if (hasPlayable && p.isRealPressure) urgency = "high";
  else if (hasWatch) urgency = "medium";

  const nextCheckSeconds = urgency === "critical" ? 45 : urgency === "high" ? 90 : urgency === "medium" ? 150 : 240;

  /* ----------------------------- Résumé (wording prudent) ----------------------------- */
  const summary = buildSummary({ action, pressure: p, sideName, oddsAvailable, invalidated, playerNote });

  return {
    action,
    confidence,
    risk,
    urgency,
    recommendedMarkets: recommended,
    avoidMarkets: avoid,
    alreadyResolvedMarkets: resolved,
    summary,
    nextCheckSeconds,
  };
}

function resolvedMarket(name: string, note: string): DecisionMarket {
  return {
    marketName: name,
    status: "already_resolved",
    reason: note,
    conditions: [],
    invalidation: [],
    oddsRequired: null,
    currentOdds: null,
    risk: "low",
  };
}

function buildSummary(args: {
  action: DecisionAction;
  pressure: PressureRead;
  sideName: (s: Side) => string;
  oddsAvailable: boolean;
  invalidated: boolean;
  playerNote: string | null;
}): string {
  const { action, pressure: p, sideName, oddsAvailable, invalidated } = args;
  const noOdds = oddsAvailable ? "" : " Cotes live non disponibles : aucune value chiffrée, je reste prudent.";
  switch (action) {
    case "INVALIDATED":
      return `Ce pari est devenu mauvais à cause de la dynamique. Je ne jouerais rien sur ce marché maintenant.${noOdds}`;
    case "PLAYABLE":
      return p.pressureSide
        ? `${sideName(p.pressureSide)} met une pression réelle. Je surveillerais le prochain but maintenant, marché jouable sous conditions.${noOdds}`
        : `Marché jouable sous conditions.${noOdds}`;
    case "WATCH":
      return p.pressureSide
        ? `${sideName(p.pressureSide)} prend le dessus. Je surveillerais sans jouer tant que la condition n'est pas remplie.${noOdds}`
        : `Quelques signaux à surveiller, rien à jouer pour l'instant.${noOdds}`;
    case "AVOID":
      return `Domination stérile : je ne jouerais rien pour l'instant (le contrôle ne crée pas d'occasions).${noOdds}`;
    case "WAIT":
      return `Début de match : j'attends d'y voir clair avant toute décision.${noOdds}`;
    case "NO_BET":
    default:
      return `Match sans signal exploitable : je ne jouerais rien pour l'instant.${noOdds}`;
  }
}

/* ----------------------------- Rendu Telegram ----------------------------- */

function riskFr(r: DecisionRisk): string {
  return r === "low" ? "faible" : r === "high" ? "élevé" : "moyen";
}

export function formatLiveBettingDecision(fixture: NormalizedFixture, d: LiveBettingDecision): string {
  const min = fixture.elapsed !== null ? `${fixture.elapsed}'` : "—";
  const score = `${fixture.homeGoals ?? 0}-${fixture.awayGoals ?? 0}`;
  const L: string[] = [];
  L.push(`⚡ Signal live — ${fixture.home.name} vs ${fixture.away.name}`);
  L.push(`⏱ ${min} · ${score}`);
  L.push(`Action : ${d.action}`);
  L.push(`Confiance : ${d.confidence}/100 · Risque : ${riskFr(d.risk)}`);
  L.push("");
  L.push(`Ce qui change : ${d.summary}`);

  const main = d.recommendedMarkets[0] ?? null;
  if (main) {
    L.push("");
    L.push(`🎯 Marché principal : ${main.marketName}`);
    L.push(`• Statut : ${main.status === "playable" ? "jouable sous conditions" : "à surveiller"}`);
    if (main.conditions.length) L.push(`• Condition : ${main.conditions.join(" · ")}`);
    if (main.invalidation.length) L.push(`• Invalidation : ${main.invalidation.join(" · ")}`);
    if (main.currentOdds) L.push(`• Cote actuelle : ${main.currentOdds}`);
    else if (main.oddsRequired) L.push(`• Cote : ${main.oddsRequired}`);
  }

  const others = d.recommendedMarkets.slice(1);
  if (others.length) {
    L.push("");
    L.push(`Autres marchés : ${others.map((m) => `${m.marketName} (à surveiller)`).join(" · ")}`);
  }

  if (d.avoidMarkets.length) {
    L.push("");
    L.push(`⛔ À éviter : ${d.avoidMarkets.map((m) => `${m.marketName} (${m.reason})`).join(" · ")}`);
  }

  if (d.alreadyResolvedMarkets.length) {
    L.push("");
    L.push(`Déjà résolus (ignorer) : ${d.alreadyResolvedMarkets.map((m) => m.marketName).join(", ")}`);
  }

  L.push("");
  L.push(`✅ Décision : ${d.summary}`);
  L.push(`🔁 Prochain check : ${Math.round(d.nextCheckSeconds / 60) >= 1 ? `${Math.round(d.nextCheckSeconds / 60)} min` : `${d.nextCheckSeconds}s`}`);
  L.push("");
  L.push("⚠️ Analyse informative, aucune issue garantie. Réservé aux majeurs. Jouez responsable.");
  return L.join("\n");
}
