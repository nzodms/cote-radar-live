/**
 * Moteur de décision live PAR MARCHÉ, selon la situation (score + minute +
 * pression + cotes + mémoire). PUR (testable sans réseau).
 *
 * Principe : choisir le marché le plus logique selon la SITUATION, jamais un
 * marché "favori prochain but" par défaut.
 */

import { getGameStateContext, hasSituation, type GameStateContext } from "./game-state";
import type { LivePressure, Side } from "./live-pressure";
import type { OddsSnapshotComparison } from "./odds/odds-snapshot";
import { hasDropped } from "./odds/odds-snapshot";
import { oddForKey } from "./odds/odds-normalizer";
import { isLiveOddsExploitable } from "./odds/odds-status";
import type { InternalMarketKey } from "./odds/market-mapper";
import type { MatchMemory } from "./match-memory";

export type MarketKey =
  | "home_win"
  | "draw"
  | "away_win"
  | "double_chance"
  | "next_goal_home"
  | "next_goal_away"
  | "over_1_5"
  | "over_2_5"
  | "over_3_5"
  | "over_4_5"
  | "btts"
  | "corners"
  | "cards"
  | "player_goal";

export type MarketStatus = "playable" | "watch" | "avoid" | "resolved" | "invalidated";

export interface EvaluatedMarket {
  key: MarketKey;
  label: string;
  status: MarketStatus;
  reason: string;
  conditions: string[];
  currentOdds: string | null;
  risk: "low" | "medium" | "high";
}

export interface MarketEvaluation {
  playable: EvaluatedMarket[];
  watch: EvaluatedMarket[];
  avoid: EvaluatedMarket[];
  resolved: EvaluatedMarket[];
  invalidated: EvaluatedMarket[];
  reason: string;
}

export interface MarketEvalInput {
  score: { home: number; away: number };
  minute: number;
  pressure: LivePressure;
  odds?: OddsSnapshotComparison | null;
  event?: { isGoal: boolean; isRedCard: boolean; side: Side | null; lateGoal?: boolean } | null;
  matchMemory?: MatchMemory | null;
  favoriteSide?: Side | null;
  homeName: string;
  awayName: string;
  lineupsConfirmed?: boolean;
  game?: GameStateContext;
}

export type BestMarketKey =
  | "no_market"
  | "next_goal_home"
  | "next_goal_away"
  | "over_3_5"
  | "over_4_5"
  | "btts"
  | "double_chance"
  | "corners"
  | "cards"
  | "avoid_home_win"
  | "avoid_chasing_goal";

export interface BestMarketSelection {
  market: BestMarketKey;
  side: Side | null;
  status: "playable" | "watch" | "avoid" | "none";
  reason: string;
}

const INTERNAL: Partial<Record<MarketKey, InternalMarketKey>> = {
  home_win: "1x2_home",
  away_win: "1x2_away",
  draw: "1x2_draw",
  next_goal_home: "next_goal_home",
  next_goal_away: "next_goal_away",
  over_1_5: "over_1_5",
  over_2_5: "over_2_5",
  btts: "btts_yes",
};

function fmtOdd(n: number | null): string | null {
  return n === null ? null : n.toFixed(2);
}

function gameOf(input: MarketEvalInput): GameStateContext {
  return input.game ?? getGameStateContext(input.score.home, input.score.away, input.minute, input.favoriteSide ?? null);
}

export function evaluateMarketsBySituation(input: MarketEvalInput): MarketEvaluation {
  const game = gameOf(input);
  const { pressure, homeName, awayName } = input;
  const minute = game.minute;
  const total = game.totalGoals;
  const sideName = (s: Side): string => (s === "home" ? homeName : awayName);
  const board = input.odds?.board ?? null;
  const oddsAvailable = isLiveOddsExploitable(board);
  const oddFor = (k: MarketKey): string | null => {
    const ik = INTERNAL[k];
    return ik ? fmtOdd(oddForKey(board, ik)) : null;
  };
  const droppedFor = (k: MarketKey): boolean => {
    const ik = INTERNAL[k];
    return Boolean(ik && input.odds && hasDropped(input.odds, ik));
  };

  const lateGoal = input.event?.lateGoal ?? Boolean(input.event?.isGoal && minute >= 80);
  const rc: Side | null = (input.event?.isRedCard ? input.event.side : null) ?? pressure.redCardSide;

  // Collecte unifiée puis dédoublonnage par priorité.
  const collected: EvaluatedMarket[] = [];
  const add = (m: EvaluatedMarket) => collected.push(m);
  const base = (key: MarketKey, label: string, status: MarketStatus, reason: string, opts: Partial<EvaluatedMarket> = {}): EvaluatedMarket => ({
    key, label, status, reason, conditions: opts.conditions ?? [], currentOdds: opts.currentOdds ?? null, risk: opts.risk ?? "medium",
  });

  /* --- Résolus par le score --- */
  if (total >= 2) add(base("over_1_5", "Over 1.5", "resolved", "déjà atteint", { risk: "low" }));
  if (total >= 3) add(base("over_2_5", "Over 2.5", "resolved", "déjà atteint", { risk: "low" }));
  if (total >= 4) add(base("over_3_5", "Over 3.5", "resolved", "déjà atteint", { risk: "low" }));
  if (total >= 5) add(base("over_4_5", "Over 4.5", "resolved", "déjà atteint", { risk: "low" }));
  if (input.score.home >= 1 && input.score.away >= 1) add(base("btts", "BTTS", "resolved", "déjà réalisé", { risk: "low" }));

  /* --- Carton rouge : recalcul, marchés offensifs du côté sanctionné invalidés --- */
  if (rc) {
    add(base(rc === "home" ? "next_goal_home" : "next_goal_away", `Prochain but ${sideName(rc)}`, "invalidated", `carton rouge ${sideName(rc)} : signal cassé`, { risk: "high" }));
    add(base(rc === "home" ? "home_win" : "away_win", `Victoire ${sideName(rc)}`, "invalidated", "supériorité numérique adverse : ancien signal mort", { risk: "high" }));
  }

  /* --- Vainqueur (live) : surtout à éviter --- */
  if (game.decided && game.leader && rc !== game.leader) {
    add(base(game.leader === "home" ? "home_win" : "away_win", `Victoire ${sideName(game.leader)} live`, "avoid", "match quasiment plié : trop tard, cote écrasée", { risk: "high" }));
  } else if (pressure.isSterile && pressure.dominantSide && rc !== pressure.dominantSide) {
    add(base(pressure.dominantSide === "home" ? "home_win" : "away_win", `Victoire ${sideName(pressure.dominantSide)} live`, "avoid", "domination stérile : éviter la victoire live", { risk: "high" }));
  }

  /* --- PROCHAIN BUT : jamais par défaut, seulement si conditions réunies --- */
  for (const side of ["home", "away"] as Side[]) {
    if (rc === side) continue; // déjà invalidé
    const key: MarketKey = side === "home" ? "next_goal_home" : "next_goal_away";
    const label = `Prochain but ${sideName(side)}`;
    const cur = oddFor(key);
    const pressuring = pressure.pressureSide === side && pressure.isRealPressure;
    const eligible =
      game.scoreExploitableForNextGoal && minute < 78 && pressuring && !game.decided && !lateGoal;

    if (eligible) {
      if (droppedFor(key)) {
        add(base(key, label, "avoid", "cote déjà compressée : le marché a réagi, value partie", { currentOdds: cur, risk: "medium" }));
      } else if (oddsAvailable && cur !== null) {
        add(base(key, label, "playable", `${sideName(side)} met une pression réelle + cote exploitable`, {
          currentOdds: cur,
          conditions: ["nouveau tir cadré ou corner dans les 2-3 min", "cote non compressée"],
          risk: "medium",
        }));
      } else {
        add(base(key, label, "watch", `${sideName(side)} pousse — à surveiller seulement, pas PLAYABLE (cote live indisponible)`, {
          currentOdds: cur,
          conditions: ["confirmer la pression", "cote live exploitable"],
          risk: "medium",
        }));
      }
    } else if (hasSituation(game, "market_chase_risk") && (side === input.favoriteSide || side === game.leader)) {
      add(base(key, label, "avoid", "ne pas chase : signal trop tardif / cote probablement compressée", { risk: "high" }));
    }
    // sinon : on n'ajoute RIEN (pas de prochain but par défaut)
  }

  /* --- Over markets --- */
  const combinedSoT = pressure.homeSoT + pressure.awaySoT;
  const rhythm = combinedSoT >= 5 || (total >= 2 && minute <= 65);
  if (total < 2) {
    if (hasSituation(game, "closed_low_score") || (minute >= 60 && combinedSoT <= 2)) {
      add(base("over_1_5", "Over 1.5", "avoid", "rythme faible / match fermé", { risk: "medium" }));
    } else if (rhythm || total >= 1) {
      add(base("over_1_5", "Over 1.5", "watch", "si le rythme se maintient (tirs cadrés des deux côtés)", { risk: "low" }));
    }
  }
  if (total < 3) {
    if (rhythm && !game.isLate) add(base("over_2_5", "Over 2.5", "watch", "rythme correct, marché encore vivant", { risk: "medium" }));
    else if (minute >= 60 && combinedSoT <= 2) add(base("over_2_5", "Over 2.5", "avoid", "rythme insuffisant : peu probable", { risk: "high" }));
  }
  if (total < 4 && hasSituation(game, "chaotic_high_score") && rhythm) {
    add(base("over_3_5", "Over 3.5", "watch", "match débridé, encore des occasions", { risk: "high" }));
  }
  if (total < 5 && total >= 3 && (game.phase === "final_minutes" || game.phase === "stoppage_time") && !pressure.isSterile) {
    add(base("over_4_5", "Over 4.5", "watch", "seulement si temps additionnel long + cote encore exploitable + match ouvert", { risk: "high", conditions: ["temps additionnel long", "cote exploitable"] }));
  }

  /* --- BTTS (si pas résolu) --- */
  if (!(input.score.home >= 1 && input.score.away >= 1)) {
    if (pressure.bothProduce && !hasSituation(game, "closed_low_score")) {
      add(base("btts", "BTTS", "watch", "les deux équipes produisent : crédible si ça reste ouvert", { currentOdds: oddFor("btts"), risk: "medium" }));
    } else if (minute >= 60) {
      add(base("btts", "BTTS", "avoid", "une seule équipe produit : peu crédible", { risk: "high" }));
    }
  }

  /* --- Corners / cartons --- */
  if (pressure.pressureSide && !game.decided) {
    add(base("corners", `Corners ${sideName(pressure.pressureSide)}`, "watch", "poussée territoriale", { risk: "medium" }));
  }
  if (pressure.totalCards >= 3 || rc) {
    add(base("cards", "Cartons", "watch", "match tendu / arbitre strict", { risk: "high" }));
  }

  /* --- Marché joueur (seulement si compos confirmées) --- */
  if (input.lineupsConfirmed && pressure.pressureSide && !game.decided) {
    add(base("player_goal", `Buteur ${sideName(pressure.pressureSide)}`, "watch", "compo confirmée : ciblage possible", { risk: "high" }));
  }

  /* --- Mémoire : marchés autrefois surveillés désormais résolus/invalidés --- */
  if (input.matchMemory) {
    for (const m of input.matchMemory.watchMarkets) {
      const isOver = /over 1\.5|over 2\.5|over 3\.5/i.test(m);
      const overResolved = (/1\.5/.test(m) && total >= 2) || (/2\.5/.test(m) && total >= 3) || (/3\.5/.test(m) && total >= 4);
      if (isOver && overResolved && !collected.some((c) => c.label.toLowerCase() === m.toLowerCase())) {
        add(base("over_2_5", m, "resolved", "déjà passé depuis le watch", { risk: "low" }));
      }
    }
  }

  /* --- Dédoublonnage par clé (priorité invalidated > resolved > playable > avoid > watch) --- */
  const priority: Record<MarketStatus, number> = { invalidated: 5, resolved: 4, playable: 3, avoid: 2, watch: 1 };
  const bestByKey = new Map<MarketKey, EvaluatedMarket>();
  for (const m of collected) {
    const cur = bestByKey.get(m.key);
    if (!cur || priority[m.status] > priority[cur.status]) bestByKey.set(m.key, m);
  }
  const all = [...bestByKey.values()];
  const pick = (s: MarketStatus) => all.filter((m) => m.status === s);

  return {
    playable: pick("playable"),
    watch: pick("watch"),
    avoid: pick("avoid"),
    resolved: pick("resolved"),
    invalidated: pick("invalidated"),
    reason: buildSituationReason(game, pressure),
  };
}

function buildSituationReason(game: GameStateContext, pressure: LivePressure): string {
  const score = `${game.scoreHome}-${game.scoreAway}`;
  if (game.decided) return `${score}, ${game.minute}e : écart de 2 buts en fin de match, marchés principaux résolus — no bet par défaut.`;
  if (hasSituation(game, "closed_low_score")) return `${score}, ${game.minute}e : match fermé, peu de rythme — éviter les over, no bet.`;
  if (pressure.isSterile) return `${score}, ${game.minute}e : domination stérile — éviter la victoire live.`;
  if (pressure.pressureSide) return `${score}, ${game.minute}e : pression réelle, à exploiter seulement si le marché et la cote suivent.`;
  return `${score}, ${game.minute}e : pas de signal fort, prudence.`;
}

/* ============================================================================
 *  Sélection du MEILLEUR marché selon la situation (jamais le favori par défaut)
 * ========================================================================= */

export function selectBestMarketBySituation(input: MarketEvalInput): BestMarketSelection {
  const game = gameOf(input);
  const ev = evaluateMarketsBySituation(input);
  const board = input.odds?.board ?? null;
  const oddsAvailable = isLiveOddsExploitable(board);

  const mapBest = (m: EvaluatedMarket, status: BestMarketSelection["status"]): BestMarketSelection => {
    const table: Record<MarketKey, BestMarketKey> = {
      next_goal_home: "next_goal_home", next_goal_away: "next_goal_away",
      over_3_5: "over_3_5", over_4_5: "over_4_5", btts: "btts",
      double_chance: "double_chance", corners: "corners", cards: "cards",
      home_win: "avoid_home_win", away_win: "avoid_home_win", draw: "no_market",
      over_1_5: "no_market", over_2_5: "no_market", player_goal: "no_market",
    };
    const side: Side | null = m.key === "next_goal_home" ? "home" : m.key === "next_goal_away" ? "away" : null;
    return { market: table[m.key], side, status, reason: m.reason };
  };

  // 1. Match plié / risque de "chase" : jamais prochain but du favori.
  if (game.decided || hasSituation(game, "market_chase_risk")) {
    const o45 = ev.watch.find((m) => m.key === "over_4_5");
    if (o45 && oddsAvailable) return { market: "over_4_5", side: null, status: "watch", reason: o45.reason };
    if (input.event?.isGoal || input.event?.lateGoal || hasSituation(game, "market_chase_risk")) {
      return { market: "avoid_chasing_goal", side: null, status: "avoid", reason: "but/contexte tardif : ne pas courir après le but, cote probablement compressée" };
    }
    return { market: "no_market", side: null, status: "none", reason: ev.reason };
  }

  // 2. Carton rouge : on recalcule, prudence (pas de PLAYABLE auto).
  if (input.pressure.redCardSide || input.event?.isRedCard) {
    const adv: Side | null = input.pressure.redCardSide ? (input.pressure.redCardSide === "home" ? "away" : "home") : null;
    const ng = adv && ev.watch.find((m) => m.key === (adv === "home" ? "next_goal_home" : "next_goal_away"));
    if (ng) return mapBest(ng, "watch");
    return { market: "no_market", side: null, status: "none", reason: "carton rouge : situation à recalculer, no bet pour l'instant" };
  }

  // 3. Un marché jouable (cote exploitable + pression réelle).
  if (ev.playable[0]) return mapBest(ev.playable[0], "playable");

  // 4. Domination stérile du favori => éviter la victoire live.
  if (input.pressure.isSterile && input.pressure.dominantSide) {
    if (!input.favoriteSide || input.pressure.dominantSide === input.favoriteSide) {
      return { market: "avoid_home_win", side: input.pressure.dominantSide, status: "avoid", reason: "domination stérile : éviter la victoire live" };
    }
  }

  // 5. À surveiller : prochain but > BTTS > over 3.5/4.5 > corners/cartons.
  const w =
    ev.watch.find((m) => m.key === "next_goal_home" || m.key === "next_goal_away") ??
    ev.watch.find((m) => m.key === "btts") ??
    ev.watch.find((m) => ["over_3_5", "over_4_5", "corners", "cards", "double_chance"].includes(m.key));
  if (w) return mapBest(w, "watch");

  return { market: "no_market", side: null, status: "none", reason: ev.reason };
}
