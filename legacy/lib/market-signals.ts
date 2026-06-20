/**
 * Détection des "marchés à surveiller" (signaux), à partir des stats live
 * et du momentum. Le moteur est VOLONTAIREMENT prudent: il préfère dire
 * "aucun signal intéressant" plutôt que d'inventer un signal.
 *
 * Wording autorisé uniquement: signal faible/moyen/fort, marché à surveiller,
 * risque élevé, domination stérile, value potentielle, données insuffisantes,
 * verdict prudent, condition d'invalidation.
 */

import type { MatchDataBundle, NormalizedTeamStats } from "@/types/match";
import type { MarketSignal, MomentumResult } from "@/types/analysis";
import { isLivePhase } from "./utils";

function num(v: number | null | undefined): number {
  return v ?? 0;
}

function tier(score: number, mediumAt: number, strongAt: number): MarketSignal["signal"] {
  if (score >= strongAt) return "strong";
  if (score >= mediumAt) return "medium";
  return "weak";
}

interface Ctx {
  h: NormalizedTeamStats;
  a: NormalizedTeamStats;
  elapsed: number;
  homeGoals: number;
  awayGoals: number;
  totalGoals: number;
  goalDiff: number;
  combinedSOG: number;
  combinedShots: number;
  homeName: string;
  awayName: string;
}

export function deriveMarketSignals(
  bundle: MatchDataBundle,
  momentum: MomentumResult
): MarketSignal[] {
  const { fixture, statistics, odds } = bundle;
  const live = isLivePhase(fixture.phase);
  const hasStats = statistics.hasData;

  // Pré-match ou pas de données: pas de marché live exploitable.
  if (!live) {
    return [
      {
        market: "avoid",
        label: "Aucun signal live (match non démarré)",
        signal: "weak",
        reason:
          "Le match n'est pas en cours. L'analyse live se base sur les statistiques en temps réel.",
        invalidation: "Le coup d'envoi déclenche le suivi live et l'évaluation des marchés.",
      },
    ];
  }

  if (!hasStats) {
    return [
      {
        market: "avoid",
        label: "Données insuffisantes",
        signal: "weak",
        reason:
          "Aucune statistique live exploitable n'est disponible pour ce match pour l'instant.",
        invalidation: "Réessayer après le prochain sync, quand l'API fournira des stats.",
      },
    ];
  }

  const h = statistics.home;
  const a = statistics.away;
  const ctx: Ctx = {
    h,
    a,
    elapsed: fixture.elapsed ?? 0,
    homeGoals: num(fixture.homeGoals),
    awayGoals: num(fixture.awayGoals),
    totalGoals: num(fixture.homeGoals) + num(fixture.awayGoals),
    goalDiff: num(fixture.homeGoals) - num(fixture.awayGoals),
    combinedSOG: num(h.shotsOnGoal) + num(a.shotsOnGoal),
    combinedShots: num(h.totalShots) + num(a.totalShots),
    homeName: fixture.home.name,
    awayName: fixture.away.name,
  };

  const signals: MarketSignal[] = [];

  evaluateWinLive(signals, ctx, momentum, "home");
  evaluateWinLive(signals, ctx, momentum, "away");
  evaluateNextGoal(signals, ctx, momentum, "home");
  evaluateNextGoal(signals, ctx, momentum, "away");
  evaluateOver15(signals, ctx, momentum);
  evaluateOver25(signals, ctx, momentum);
  evaluateBtts(signals, ctx, momentum);

  // Marché trop évident: large avance => prudence (value faible/nulle).
  if (Math.abs(ctx.goalDiff) >= 3) {
    signals.push({
      market: "avoid",
      label: "Marché déjà très orienté",
      signal: "weak",
      reason: "L'écart au score est large: les marchés évidents offrent peu de value potentielle.",
      invalidation: "Un retour au score rééquilibrerait l'intérêt des marchés.",
    });
  }

  // Match très fermé tard: prudence sur les overs.
  if (momentum.flags.lowScoringLatePhase) {
    signals.push({
      market: "avoid",
      label: "Match fermé (overs à éviter)",
      signal: "weak",
      reason:
        "0-0 après la 60e avec peu de tirs cadrés: les marchés de buts perdent de la value.",
      invalidation: "Une accélération offensive (tirs cadrés répétés) relancerait les overs.",
    });
  }

  // Si rien n'est ressorti, on le dit clairement (prudence).
  if (signals.length === 0) {
    signals.push({
      market: "avoid",
      label: "Aucun signal intéressant",
      signal: "weak",
      reason: "Les conditions actuelles ne dégagent pas de marché à surveiller avec assez de marge.",
      invalidation: "Un changement de momentum ou un événement clé pourrait créer un signal.",
    });
  }

  if (!odds.available) {
    // On NE force PAS un avoid sur l'absence de cotes (attendu en plan Free),
    // mais on l'expose pour pondérer la confiance ailleurs.
  }

  return signals;
}

function evaluateWinLive(
  signals: MarketSignal[],
  ctx: Ctx,
  momentum: MomentumResult,
  side: "home" | "away"
): void {
  const isHome = side === "home";
  const me = isHome ? ctx.h : ctx.a;
  const opp = isHome ? ctx.a : ctx.h;
  const diff = isHome ? momentum.diff : -momentum.diff;
  const sterile = isHome
    ? momentum.flags.homeSterileDomination
    : momentum.flags.awaySterileDomination;
  const name = isHome ? ctx.homeName : ctx.awayName;
  const leadByMe = isHome ? ctx.goalDiff : -ctx.goalDiff;

  const sogSup = me.shotsOnGoal !== null && opp.shotsOnGoal !== null && me.shotsOnGoal > opp.shotsOnGoal;
  const cornersSup = num(me.cornerKicks) > num(opp.cornerKicks);
  const possSup = num(me.ballPossession) > num(opp.ballPossession);

  // Conditions: diff > +20, tirs cadrés supérieurs, corners OU possession sup,
  // pas de domination stérile, et marché pas déjà trop évident (avance < 2).
  if (diff > 20 && sogSup && (cornersSup || possSup) && !sterile && leadByMe < 2) {
    const sogGap = num(me.shotsOnGoal) - num(opp.shotsOnGoal);
    const strength = diff + sogGap * 4 + (cornersSup ? 4 : 0);
    signals.push({
      market: isHome ? "home_win_live" : "away_win_live",
      label: `Victoire ${name} (live) — marché à surveiller`,
      signal: tier(strength, 30, 45),
      reason: `Momentum ${isHome ? momentum.home : momentum.away} vs ${
        isHome ? momentum.away : momentum.home
      }, tirs cadrés supérieurs et ${cornersSup ? "corners" : "possession"} en faveur de ${name}.`,
      invalidation: `But adverse, carton rouge pour ${name}, ou inversion du momentum.`,
    });
  }
}

function evaluateNextGoal(
  signals: MarketSignal[],
  ctx: Ctx,
  momentum: MomentumResult,
  side: "home" | "away"
): void {
  const isHome = side === "home";
  const me = isHome ? ctx.h : ctx.a;
  const opp = isHome ? ctx.a : ctx.h;
  const diff = isHome ? momentum.diff : -momentum.diff;
  const sterile = isHome
    ? momentum.flags.homeSterileDomination
    : momentum.flags.awaySterileDomination;
  const name = isHome ? ctx.homeName : ctx.awayName;

  const sogGap = num(me.shotsOnGoal) - num(opp.shotsOnGoal);
  const pressure = sogGap >= 1 && num(me.cornerKicks) >= num(opp.cornerKicks);

  // Momentum home fort + pression récente (tirs/corners) + adversaire subit.
  if (diff > 12 && pressure && !sterile && ctx.elapsed < 85) {
    const strength = diff + sogGap * 5;
    signals.push({
      market: isHome ? "next_goal_home" : "next_goal_away",
      label: `Prochain but: ${name} — marché à surveiller`,
      signal: tier(strength, 22, 34),
      reason: `${name} met la pression (tirs cadrés +${sogGap}, corners au moins égaux) avec un momentum supérieur.`,
      invalidation: "Baisse d'intensité, temporisation, ou but de l'adversaire en transition.",
    });
  }
}

function evaluateOver15(signals: MarketSignal[], ctx: Ctx, momentum: MomentumResult): void {
  // Over 1.5 = 2 buts ou plus. Si déjà 2+, le marché est résolu (pas un signal).
  if (ctx.totalGoals > 1) return;
  if (ctx.elapsed >= 75) return;
  if (momentum.flags.lowScoringLatePhase) return;

  const openMatch = ctx.totalGoals >= 1 || ctx.combinedShots >= 12;
  const enoughSOG = ctx.combinedSOG >= 3;
  const tempo = ctx.elapsed < 65;

  if (openMatch && enoughSOG) {
    const strength = ctx.combinedSOG * 3 + (ctx.totalGoals >= 1 ? 8 : 0) + (tempo ? 6 : 0);
    signals.push({
      market: "over_1_5",
      label: "Over 1.5 buts — marché à surveiller",
      signal: tier(strength, 20, 30),
      reason: `Match ouvert: ${ctx.combinedShots} tirs cumulés, ${ctx.combinedSOG} cadrés${
        ctx.totalGoals >= 1 ? ", déjà 1 but" : ""
      }.`,
      invalidation: "Match qui se ferme, peu de tirs cadrés, ou approche de la 75e sans occasion.",
    });
  }
}

function evaluateOver25(signals: MarketSignal[], ctx: Ctx, momentum: MomentumResult): void {
  // Over 2.5 = 3 buts ou plus. Si déjà 3+, marché résolu.
  if (ctx.totalGoals > 2) return;
  if (ctx.elapsed >= 70) return;
  if (momentum.flags.lowScoringLatePhase) return;

  const earlyGoal = ctx.totalGoals >= 1 && ctx.elapsed <= 60;
  const hugeVolume = ctx.combinedSOG >= 8 || ctx.combinedShots >= 18;
  const redCards = num(ctx.h.redCards) + num(ctx.a.redCards);
  const fragile = redCards > 0 || ctx.totalGoals >= 2;
  const manySituations = ctx.combinedShots >= 12;

  if ((earlyGoal || hugeVolume) && manySituations) {
    const strength =
      ctx.combinedSOG * 3 + ctx.totalGoals * 6 + (hugeVolume ? 8 : 0) + (fragile ? 6 : 0);
    signals.push({
      market: "over_2_5",
      label: "Over 2.5 buts — marché à surveiller (strict)",
      signal: tier(strength, 26, 40),
      reason: `Volume offensif élevé (${ctx.combinedShots} tirs, ${ctx.combinedSOG} cadrés)${
        ctx.totalGoals >= 1 ? `, ${ctx.totalGoals} but(s) avant la 60e` : ""
      }${redCards > 0 ? ", supériorité numérique" : ""}.`,
      invalidation: "Rythme qui retombe, défenses qui se regroupent, ou passage de la 70e.",
    });
  }
}

function evaluateBtts(signals: MarketSignal[], ctx: Ctx, momentum: MomentumResult): void {
  const bothScored = ctx.homeGoals >= 1 && ctx.awayGoals >= 1;
  if (bothScored) return; // marché résolu
  if (ctx.elapsed >= 80) return;

  const bothCreate =
    num(ctx.h.shotsOnGoal) >= 1 &&
    num(ctx.a.shotsOnGoal) >= 1 &&
    num(ctx.h.totalShots) >= 3 &&
    num(ctx.a.totalShots) >= 3;

  // "pas seulement possession d'une équipe": exclure les matchs à sens unique stérile.
  const lopsided =
    (num(ctx.h.ballPossession) >= 68 && num(ctx.a.shotsOnGoal) === 0) ||
    (num(ctx.a.ballPossession) >= 68 && num(ctx.h.shotsOnGoal) === 0);

  if (bothCreate && !lopsided) {
    const strength =
      (num(ctx.h.shotsOnGoal) + num(ctx.a.shotsOnGoal)) * 3 + (ctx.totalGoals >= 1 ? 8 : 0);
    signals.push({
      market: "btts",
      label: "Les deux équipes marquent (BTTS) — marché à surveiller",
      signal: tier(strength, 18, 28),
      reason: `Occasions des deux côtés (cadrés: ${num(ctx.h.shotsOnGoal)} / ${num(
        ctx.a.shotsOnGoal
      )}), transitions réelles.`,
      invalidation: "Une équipe se met à défendre bas et n'attaque plus, ou expulsion déséquilibrante.",
    });
  }
}
