/**
 * Moteur de DÉCISION de paris live — orienté action concrète (pas un rapport).
 *
 * Orchestration PURE : état de jeu (game-state) + pression (live-pressure) +
 * évaluation par marché selon la situation (market-evaluator) + sélection du
 * meilleur marché. Choisit une action et des marchés actionnables.
 *
 * Garde-fous :
 *  - Pas de cote live exploitable => jamais PLAYABLE (WATCH/WAIT/NO_BET max).
 *  - Domination stérile => AVOID. Marchés résolus => jamais conseillés.
 *  - Jamais "prochain but favori" par défaut (cf. market-evaluator).
 *  - Wording autorisé seulement.
 */

import type { NormalizedEvent, NormalizedFixture, NormalizedStatsPair } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import type { OddsSnapshotComparison } from "./odds/odds-snapshot";
import { isLiveOddsExploitable } from "./odds/odds-status";
import { getGameStateContext, hasSituation, type GameStateContext } from "./game-state";
import { assessLivePressure, type LivePressure, type Side } from "./live-pressure";
import {
  evaluateMarketsBySituation,
  selectBestMarketBySituation,
  type BestMarketSelection,
  type EvaluatedMarket,
  type MarketEvalInput,
} from "./market-evaluator";
import type { MatchMemory } from "./match-memory";

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
  /** true si des cotes live exploitables ont été fournies (gate du PLAYABLE). */
  oddsAvailable: boolean;
  gameState: GameStateContext;
  /** Momentum sur /100 (part de chaque équipe). */
  momentum: { home: number; away: number };
  bestMarket: BestMarketSelection;
  recommendedMarkets: DecisionMarket[];
  avoidMarkets: DecisionMarket[];
  alreadyResolvedMarkets: DecisionMarket[];
  invalidatedMarkets: DecisionMarket[];
  summary: string;
  nextCheckSeconds: number;
}

export interface DecisionEvent {
  isGoal: boolean;
  isRedCard: boolean;
  side: Side | null;
  player?: string | null;
  label?: string;
  lateGoal?: boolean;
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
  favoriteSide?: Side | null;
  event?: DecisionEvent | null;
  matchMemory?: MatchMemory | null;
}

function statusMap(s: EvaluatedMarket["status"]): DecisionMarketStatus {
  return s === "resolved" ? "already_resolved" : s;
}

function toDecisionMarket(m: EvaluatedMarket): DecisionMarket {
  return {
    marketName: m.label,
    status: statusMap(m.status),
    reason: m.reason,
    conditions: m.conditions,
    invalidation: [],
    oddsRequired: null,
    currentOdds: m.currentOdds,
    risk: m.risk,
  };
}

export function generateLiveBettingDecision(input: LiveDecisionInput): LiveBettingDecision {
  const f = input.fixture;
  const homeGoals = input.score?.home ?? f.homeGoals ?? 0;
  const awayGoals = input.score?.away ?? f.awayGoals ?? 0;
  const minute = input.minute ?? f.elapsed ?? 0;
  const isHalftime = f.statusShort === "HT" || f.phase === "halftime";

  const game = getGameStateContext(homeGoals, awayGoals, minute, input.favoriteSide ?? null, isHalftime);
  const pressure = assessLivePressure({ statistics: input.statistics, fixture: f, events: input.events, previousAdvice: input.previousAdvice });

  const board = input.oddsSnapshot?.board ?? null;
  const oddsAvailable = isLiveOddsExploitable(board);

  const evalInput: MarketEvalInput = {
    score: { home: homeGoals, away: awayGoals },
    minute,
    pressure,
    odds: input.oddsSnapshot ?? null,
    event: input.event ?? null,
    matchMemory: input.matchMemory ?? null,
    favoriteSide: input.favoriteSide ?? null,
    homeName: f.home.name,
    awayName: f.away.name,
    lineupsConfirmed: input.lineupsConfirmed,
    game,
  };
  const ev = evaluateMarketsBySituation(evalInput);
  const best = selectBestMarketBySituation(evalInput);

  const recommendedMarkets = [...ev.playable, ...ev.watch].map(toDecisionMarket);
  const avoidMarkets = ev.avoid.map(toDecisionMarket);
  const alreadyResolvedMarkets = ev.resolved.map(toDecisionMarket);
  const invalidatedMarkets = ev.invalidated.map(toDecisionMarket);

  const rc = Boolean(pressure.redCardSide || input.event?.isRedCard);

  /* ----------------------------- Action globale ----------------------------- */
  let action: DecisionAction;
  if (rc) action = "INVALIDATED";
  else if (ev.playable.length > 0) action = "PLAYABLE";
  else if (game.decided) action = "NO_BET";
  else if (hasSituation(game, "favorite_trailing") && minute <= 20) action = "WAIT";
  else if (pressure.isSterile && pressure.dominantSide) action = "AVOID";
  else if (hasSituation(game, "closed_low_score") && ev.watch.length === 0) action = "NO_BET";
  else if (ev.watch.length > 0) action = "WATCH";
  else if (minute < 20) action = "WAIT";
  else action = "NO_BET";

  /* ----------------------------- Confiance / risque / urgence ----------------------------- */
  let confidence = 40;
  if (pressure.isRealPressure) confidence += 15;
  if (oddsAvailable) confidence += 15;
  if (input.statistics.hasData) confidence += 10;
  if (pressure.isSterile) confidence -= 15;
  if (action === "INVALIDATED") confidence -= 20;
  if (!oddsAvailable) confidence -= 5;
  if (action === "NO_BET") confidence = Math.min(confidence, 35);
  confidence = Math.max(5, Math.min(90, confidence));

  let risk: DecisionRisk = "medium";
  if (pressure.isRealPressure && oddsAvailable && !pressure.isSterile && action === "PLAYABLE") risk = "low";
  if (!oddsAvailable || pressure.isSterile || rc || game.decided) risk = "high";

  let urgency: DecisionUrgency = "low";
  if (rc || input.oddsSnapshot?.suspended) urgency = "critical";
  else if (action === "PLAYABLE") urgency = "high";
  else if (action === "WATCH") urgency = "medium";

  const nextCheckSeconds = nextCheckFor(game, urgency);
  const summary = buildSummary({ action, game, pressure, best, oddsAvailable, homeName: f.home.name, awayName: f.away.name });

  return {
    action,
    confidence,
    risk,
    urgency,
    oddsAvailable,
    gameState: game,
    momentum: pressure.momentum,
    bestMarket: best,
    recommendedMarkets,
    avoidMarkets,
    alreadyResolvedMarkets,
    invalidatedMarkets,
    summary,
    nextCheckSeconds,
  };
}

function nextCheckFor(game: GameStateContext, urgency: DecisionUrgency): number {
  if (game.phase === "halftime") return 300;
  if (game.phase === "stoppage_time" || game.phase === "final_minutes") return 120;
  if (urgency === "critical") return 45;
  if (urgency === "high") return 90;
  if (urgency === "medium") return 150;
  return 240;
}

function buildSummary(args: {
  action: DecisionAction;
  game: GameStateContext;
  pressure: LivePressure;
  best: BestMarketSelection;
  oddsAvailable: boolean;
  homeName: string;
  awayName: string;
}): string {
  const { action, game, pressure, best, oddsAvailable } = args;
  const sideName = (s: Side | null): string => (s === "home" ? args.homeName : s === "away" ? args.awayName : "");
  const noOdds = oddsAvailable ? "" : " Cotes live non disponibles : aucune value chiffrée, je reste prudent.";
  switch (action) {
    case "INVALIDATED":
      return `Carton rouge : les anciens signaux sont morts, ce pari est devenu mauvais à cause de la dynamique. Tout recalculer.${noOdds}`;
    case "PLAYABLE":
      return best.side
        ? `${sideName(best.side)} met une pression réelle. Je surveillerais le prochain but maintenant, marché jouable sous conditions.${noOdds}`
        : `Marché jouable sous conditions.${noOdds}`;
    case "WATCH":
      return best.market === "no_market"
        ? `Quelques signaux à surveiller, rien à jouer pour l'instant.${noOdds}`
        : `${best.reason}. Je surveillerais sans jouer tant que la condition n'est pas remplie.${noOdds}`;
    case "AVOID":
      return `Domination stérile : je ne jouerais rien pour l'instant (le contrôle ne crée pas d'occasions).${noOdds}`;
    case "WAIT":
      return hasSituation(game, "favorite_trailing")
        ? `Favori mené tôt : j'attends la réaction sur 5-10 minutes avant toute décision.${noOdds}`
        : `Début de match : j'attends d'y voir clair avant toute décision.${noOdds}`;
    case "NO_BET":
    default:
      return `${game.scoreHome}-${game.scoreAway}, ${game.minute}e : ${best.market === "avoid_chasing_goal" ? "ne pas courir après le but" : "pas de marché exploitable maintenant"}. No bet.${noOdds}`;
  }
}

/* ----------------------------- Rendu Telegram (version longue) ----------------------------- */

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
  L.push(`Momentum : ${fixture.home.name} ${d.momentum.home}/100 · ${fixture.away.name} ${d.momentum.away}/100`);
  if (!d.oddsAvailable) L.push("💸 Cotes : aucune cote live exploitable — PLAYABLE désactivé.");
  L.push("");
  L.push(`Ce qui change : ${d.summary}`);

  const main = d.recommendedMarkets[0] ?? null;
  if (main) {
    L.push("");
    L.push(`🎯 Marché principal : ${main.marketName}`);
    L.push(`• Statut : ${main.status === "playable" ? "jouable sous conditions" : "à surveiller"}`);
    if (main.conditions.length) L.push(`• Condition : ${main.conditions.join(" · ")}`);
    if (main.currentOdds) L.push(`• Cote actuelle : ${main.currentOdds}`);
  }

  const others = d.recommendedMarkets.slice(1);
  if (others.length) {
    L.push("");
    L.push(`Autres marchés : ${others.map((m) => `${m.marketName} (à surveiller)`).join(" · ")}`);
  }

  if (d.invalidatedMarkets.length) {
    L.push("");
    L.push(`❌ Invalidés : ${d.invalidatedMarkets.map((m) => `${m.marketName} (${m.reason})`).join(" · ")}`);
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
  if (!d.oddsAvailable) L.push("Sans cote live exploitable, aucune value confirmée.");
  L.push(`✅ Décision : ${d.summary}`);
  L.push(`🔁 Prochain check : ${Math.round(d.nextCheckSeconds / 60) >= 1 ? `${Math.round(d.nextCheckSeconds / 60)} min` : `${d.nextCheckSeconds}s`}`);
  L.push("");
  L.push("⚠️ Analyse informative, aucune issue garantie. Réservé aux majeurs. Jouez responsable.");
  return L.join("\n");
}
