/**
 * Moteur "Live Betting Advice" — l'assistant live actionnable.
 *
 * Cerveau principal = données structurées + scoring + règles + fenêtres + contexte.
 * (L'IA optionnelle ne fait que reformuler ce que ce moteur calcule.)
 *
 * Le bot choisit UNE action: WAIT / WATCH / SIGNAL / AVOID / INVALIDATED,
 * et donne un conseil concret (quoi attendre, surveiller, éviter, pourquoi,
 * à quelle condition, et quand le signal est invalidé).
 *
 * Principe: si les données ne suffisent pas, le meilleur conseil est WAIT / no bet.
 */

import type {
  H2HSummary,
  MatchDataBundle,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedOdds,
  NormalizedStatsPair,
  RecentForm,
} from "@/types/match";
import type {
  AdviceConfidence,
  AdviceRisk,
  AvoidMarket,
  ContextComparison,
  LiveAction,
  LiveBettingAdvice,
  MomentumSummary,
  NextCheck,
  RecommendedMarket,
  StatsSnapshotPoint,
  Urgency,
  WindowSummary,
} from "@/types/live-advice";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import { computeMomentum } from "./momentum";
import { assessRisks } from "./risk-engine";
import { buildContextIntelligence } from "./context-engine";
import {
  getLast10MinuteWindow,
  getLast5MinuteWindow,
  getSinceLastGoalWindow,
  type WindowContext,
} from "./live-window-analysis";
import { extractFavoriteFromOdds } from "./odds-engine";
import { isLivePhase } from "./utils";

export interface GenerateLiveAdviceInput {
  fixture: NormalizedFixture;
  statistics: NormalizedStatsPair;
  events: NormalizedEvent[];
  lineups: NormalizedLineup[];
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  odds: NormalizedOdds;
  previousSnapshots?: StatsSnapshotPoint[];
  externalCommentaryEvents?: ExternalCommentaryEvent[];
  freshnessSeconds?: number | null;
}

function num(v: number | null | undefined): number {
  return v ?? 0;
}

interface Decision {
  action: LiveAction;
  markets: RecommendedMarket[];
  avoid: AvoidMarket[];
  mainAdvice: string;
  urgency: Urgency;
  extraRisks: AdviceRisk[];
}

export function generateLiveBettingAdvice(input: GenerateLiveAdviceInput): LiveBettingAdvice {
  const { fixture, statistics, events, lineups, recentForm, h2h, odds } = input;
  const homeName = fixture.home.name;
  const awayName = fixture.away.name;
  const homeId = fixture.home.id;
  const awayId = fixture.away.id;
  const elapsed = fixture.elapsed ?? 0;
  const live = isLivePhase(fixture.phase);

  // --- Momentum + risques (réutilise le moteur maison) ---
  const bundle: MatchDataBundle = {
    fixture,
    statistics,
    events,
    lineups,
    recentForm,
    h2h,
    odds,
    freshnessSeconds: input.freshnessSeconds ?? null,
  };
  const momentum = computeMomentum(bundle);
  const baseRisks: AdviceRisk[] = assessRisks(bundle, momentum).map((r) => ({
    type: r.type,
    severity: r.severity,
    explanation: `${r.label}: ${r.explanation}`,
  }));

  // --- Contexte pré-match ---
  const favoriteHint = extractFavoriteFromOdds(odds);
  const context = buildContextIntelligence({
    fixture,
    statistics,
    recentForm,
    h2h,
    lineups,
    favoriteSideHint: favoriteHint,
    externalCommentaryEvents: input.externalCommentaryEvents,
  });

  // --- Fenêtres temporelles ---
  const windowCtx: WindowContext = {
    current: { elapsed: fixture.elapsed, home: statistics.home, away: statistics.away },
    snapshots: input.previousSnapshots ?? [],
    events,
    homeId,
    awayId,
    homeName,
    awayName,
  };
  const last5 = getLast5MinuteWindow(windowCtx);
  const last10 = getLast10MinuteWindow(windowCtx);
  const sinceGoal = getSinceLastGoalWindow(windowCtx);

  // --- Décision principale ---
  const decision = decide({
    input,
    momentum,
    context,
    last5,
    last10,
    sinceGoal,
  });

  const risks = dedupeRisks([...decision.extraRisks, ...baseRisks]);

  // --- Momentum summary ---
  const dominantTeam =
    momentum.diff > 10 ? homeName : momentum.diff < -10 ? awayName : null;
  const momentumSummary: MomentumSummary = {
    homeScore: momentum.home,
    awayScore: momentum.away,
    dominantTeam,
    isRealPressure: last5.pressureTeam !== null || last10.pressureTeam !== null,
    isSterileDomination:
      momentum.flags.homeSterileDomination || momentum.flags.awaySterileDomination,
    last5MinutesSummary: last5.summaryText,
    last10MinutesSummary: last10.summaryText,
    sinceLastGoalSummary: sinceGoal.summaryText,
  };

  // --- Comparaison contexte ---
  const hg = num(fixture.homeGoals);
  const ag = num(fixture.awayGoals);
  const currentReality =
    fixture.phase === "scheduled"
      ? "Match non démarré."
      : `${homeName} ${hg}-${ag} ${awayName} à la ${elapsed}' (${fixture.statusLong}).`;
  const contextComparison: ContextComparison = {
    preMatchExpectation: context.preMatchExpectation,
    currentReality,
    scenarioShift: context.scenarioShift,
    keyDifference: context.liveVsPreMatchMismatch,
  };

  // --- Qualité des données ---
  const dataQuality = {
    hasFixture: true,
    hasStatistics: statistics.hasData,
    hasEvents: events.length > 0,
    hasLineups: lineups.length > 0,
    hasRecentForm: Boolean(recentForm.home || recentForm.away),
    hasH2H: Boolean(h2h && h2h.totalMatches > 0),
    hasOdds: odds.available,
    hasExternalCommentary: (input.externalCommentaryEvents?.length ?? 0) > 0,
    freshnessSeconds: input.freshnessSeconds ?? null,
    warning: buildDataWarning(input, live),
  };

  // --- Confiance / urgence / next check ---
  const confidence = computeConfidence({
    decision,
    momentum,
    last5,
    dataQuality,
    risks,
    oddsAvailable: odds.available,
  });
  const nextCheck = buildNextCheck(decision, context, last5);

  const liveReading = buildLiveReading({
    fixture,
    momentum,
    last5,
    sinceGoal,
    context,
    statistics,
  });
  const matchScenario = `${context.scenarioShift} ${context.groupContext}`.trim();
  const finalVerdict = buildFinalVerdict(decision, confidence, odds.available);

  return {
    action: decision.action,
    mainAdvice: decision.mainAdvice,
    matchScenario,
    liveReading,
    confidence,
    urgency: decision.urgency,
    dominantTeam,
    momentum: momentumSummary,
    contextComparison,
    recommendedMarkets: decision.markets,
    avoidMarkets: decision.avoid,
    risks,
    nextCheck,
    dataQuality,
    finalVerdict,
  };
}

/* ======================================================================
 *  Décision principale (arbre de scénarios)
 * =================================================================== */

interface DecideArgs {
  input: GenerateLiveAdviceInput;
  momentum: ReturnType<typeof computeMomentum>;
  context: ReturnType<typeof buildContextIntelligence>;
  last5: WindowSummary;
  last10: WindowSummary;
  sinceGoal: WindowSummary;
}

function mk(
  market: RecommendedMarket["market"],
  label: string,
  signal: RecommendedMarket["signal"],
  timing: RecommendedMarket["timing"],
  reasoning: string,
  requiredConfirmation: string,
  invalidation: string,
  riskLevel: RecommendedMarket["riskLevel"]
): RecommendedMarket {
  return { market, label, signal, timing, reasoning, requiredConfirmation, invalidation, riskLevel };
}

function decide(args: DecideArgs): Decision {
  const { input, momentum, context, last5, last10 } = args;
  const { fixture, statistics, events, odds } = input;
  const homeName = fixture.home.name;
  const awayName = fixture.away.name;
  const homeId = fixture.home.id;
  const awayId = fixture.away.id;
  const elapsed = fixture.elapsed ?? 0;
  const live = isLivePhase(fixture.phase);
  const h = statistics.home;
  const a = statistics.away;
  const hg = num(fixture.homeGoals);
  const ag = num(fixture.awayGoals);
  const totalGoals = hg + ag;
  const lead = hg - ag;
  const leadingSide: "home" | "away" | null = lead > 0 ? "home" : lead < 0 ? "away" : null;
  const diff = momentum.diff;
  const combinedShots = num(h.totalShots) + num(a.totalShots);
  const combinedSOG = num(h.shotsOnGoal) + num(a.shotsOnGoal);

  // ---- Layer 0: non-live / pas de données ----
  if (!live) {
    if (fixture.phase === "finished") {
      return {
        action: "AVOID",
        markets: [],
        avoid: [{ market: "all", reason: "Match terminé: plus de marché live." }],
        mainAdvice: "Match terminé. Aucune action live. Données conservées pour l'historique.",
        urgency: "none",
        extraRisks: [],
      };
    }
    // scheduled
    return {
      action: "WAIT",
      markets: [],
      avoid: [],
      mainAdvice: `WAIT: match non démarré. ${context.preMatchExpectation} Attendre le coup d'envoi et les premières minutes avant toute lecture live.`,
      urgency: "none",
      extraRisks: [],
    };
  }

  if (!statistics.hasData) {
    return {
      action: "WAIT",
      markets: [],
      avoid: [{ market: "no_bet", reason: "Aucune statistique live exploitable." }],
      mainAdvice:
        "WAIT: données insuffisantes pour un signal sérieux. Aucune statistique live exploitable pour l'instant. No bet recommandé jusqu'au prochain sync.",
      urgency: "low",
      extraRisks: [],
    };
  }

  // ---- Helpers de scénario ----
  const scoringSide = (e: NormalizedEvent): "home" | "away" | null => {
    const own = (e.detail ?? "").toLowerCase().includes("own");
    let side: "home" | "away" | null = e.teamId === homeId ? "home" : e.teamId === awayId ? "away" : null;
    if (own && side) side = side === "home" ? "away" : "home";
    return side;
  };
  const goalEvents = events
    .filter((e) => (e.type ?? "").toLowerCase() === "goal" && !(e.detail ?? "").toLowerCase().includes("missed"))
    .filter((e) => e.elapsed !== null)
    .sort((x, y) => (x.elapsed as number) - (y.elapsed as number));
  const lastGoal = goalEvents[goalEvents.length - 1] ?? null;
  const minutesSinceGoal = lastGoal && lastGoal.elapsed !== null ? elapsed - (lastGoal.elapsed as number) : null;

  const recentRedCard = events.find(
    (e) =>
      (e.type ?? "").toLowerCase() === "card" &&
      (e.detail ?? "").toLowerCase().includes("red") &&
      e.elapsed !== null &&
      elapsed - (e.elapsed as number) <= 3
  );

  const onTargetAdv = (side: "home" | "away"): number =>
    side === "home" ? num(h.shotsOnGoal) - num(a.shotsOnGoal) : num(a.shotsOnGoal) - num(h.shotsOnGoal);
  const totalShotsAdv = (side: "home" | "away"): number =>
    side === "home" ? num(h.totalShots) - num(a.totalShots) : num(a.totalShots) - num(h.totalShots);
  const sterileOf = (side: "home" | "away"): boolean =>
    side === "home" ? momentum.flags.homeSterileDomination : momentum.flags.awaySterileDomination;
  const shotsOf = (side: "home" | "away"): number => (side === "home" ? num(h.totalShots) : num(a.totalShots));
  const sogOf = (side: "home" | "away"): number => (side === "home" ? num(h.shotsOnGoal) : num(a.shotsOnGoal));
  const nameOf = (side: "home" | "away"): string => (side === "home" ? homeName : awayName);
  const diffOf = (side: "home" | "away"): number => (side === "home" ? diff : -diff);

  const pressureSide = last5.pressureTeam ?? last10.pressureTeam;
  const lowScoringLate = momentum.flags.lowScoringLatePhase;
  const lateGame = elapsed >= 75;

  const bothCreate =
    num(h.shotsOnGoal) >= 1 && num(a.shotsOnGoal) >= 1 && num(h.totalShots) >= 3 && num(a.totalShots) >= 3;
  const lopsided =
    (num(h.ballPossession) >= 68 && num(a.shotsOnGoal) === 0) ||
    (num(a.ballPossession) >= 68 && num(h.shotsOnGoal) === 0);
  const openMatch =
    totalGoals >= 2 || (num(h.shotsOnGoal) >= 2 && num(a.shotsOnGoal) >= 2) || (combinedSOG >= 6 && combinedShots >= 14);
  const closedMatch = elapsed >= 35 && combinedShots <= 7 && combinedSOG <= 2 && totalGoals === 0;

  const commentaryInjuries = (input.externalCommentaryEvents ?? []).filter((e) => e.eventType === "injury");

  // ---- Layer 1: carton rouge récent => INVALIDATED ----
  if (recentRedCard) {
    const cardedSide: "home" | "away" | null =
      recentRedCard.teamId === homeId ? "home" : recentRedCard.teamId === awayId ? "away" : null;
    const advSide = cardedSide === "home" ? "away" : cardedSide === "away" ? "home" : null;
    const markets: RecommendedMarket[] = [];
    if (advSide) {
      markets.push(
        mk(
          advSide === "home" ? "next_goal_home" : "next_goal_away",
          `Prochain but ${nameOf(advSide)} (supériorité numérique)`,
          "weak",
          "watch_only",
          `${nameOf(advSide)} évolue en supériorité numérique après le carton rouge. Le rapport de force change.`,
          `Confirmer la domination: tirs/corners de ${nameOf(advSide)} dans les prochaines minutes.`,
          "But adverse en contre, ou regroupement défensif efficace de l'équipe à 10.",
          "medium"
        )
      );
    }
    return {
      action: "INVALIDATED",
      markets,
      avoid: [
        { market: "previous_signals", reason: "Carton rouge: tout signal basé sur le 11 contre 11 est annulé." },
      ],
      mainAdvice: `INVALIDATED: carton rouge${cardedSide ? ` (${nameOf(cardedSide)})` : ""}. Les signaux précédents basés sur l'équilibre 11 contre 11 sont invalidés. Momentum recalculé. Surveiller le prochain but${advSide ? ` de ${nameOf(advSide)}` : ""} sans précipitation.`,
      urgency: "high",
      extraRisks: [
        {
          type: "red_card",
          severity: "high",
          explanation: "Carton rouge récent: forte volatilité, scénario de match modifié.",
        },
      ],
    };
  }

  // ---- Layer 2: scénario A — favori mené par l'outsider ----
  const favSide = context.favoriteSide;
  if (favSide && leadingSide && leadingSide !== favSide && totalGoals > 0) {
    const underdogSide = favSide === "home" ? "away" : "home";
    const favName = nameOf(favSide);
    const underName = nameOf(underdogSide);
    const tooEarly = minutesSinceGoal !== null && minutesSinceGoal <= 8;

    const avoid: AvoidMarket[] = [
      {
        market: favSide === "home" ? "home_win_live" : "away_win_live",
        reason: `Scénario pré-match cassé: ${favName} (favori) est mené. Ne pas se précipiter sur sa victoire sèche.`,
      },
    ];
    const extraRisks: AdviceRisk[] = [
      {
        type: "scenario_break",
        severity: "medium",
        explanation: `Scénario pré-match cassé: ${underName} (outsider) mène contre ${favName}.`,
      },
    ];

    if (tooEarly) {
      const m = mk(
        favSide === "home" ? "next_goal_home" : "next_goal_away",
        `Prochain but ${favName} (réaction à confirmer)`,
        "weak",
        "wait_5_min",
        `${favName} vient d'être surpris par ${underName}. Trop tôt pour juger la réaction.`,
        `Au moins 2 tirs, 1 tir cadré ou 2 corners de ${favName} dans les 5 prochaines minutes pour passer en WATCH.`,
        `${favName} ne réagit pas, ou ${underName} marque de nouveau.`,
        "medium"
      );
      return {
        action: "WAIT",
        markets: [m],
        avoid,
        mainAdvice: `WAIT: ${underName} mène ${ag !== hg ? `${hg}-${ag}` : ""} contre ${favName}. Scénario pré-match cassé. Ne touche pas ${favName} vainqueur live maintenant. Attends 5 à 10 minutes. Si ${favName} produit au moins 2 tirs, 1 tir cadré ou 2 corners, le marché ${favName} prochain but devient plus intéressant que sa victoire sèche.`,
        urgency: "low",
        extraRisks,
      };
    }

    // Réaction mesurable
    const favReacting =
      last10.pressureTeam === favSide ||
      (onTargetAdv(favSide) >= 1 && totalShotsAdv(favSide) >= 2 && !sterileOf(favSide));
    const favSterile = sterileOf(favSide);
    const favNoReaction = !favReacting && shotsOf(favSide) <= 3 && sogOf(favSide) <= 1;

    if (favSterile) {
      avoid.push({
        market: "over_2_5",
        reason: "Domination stérile du favori: la possession ne se transforme pas en occasions.",
      });
      return {
        action: "AVOID",
        markets: [],
        avoid,
        mainAdvice: `AVOID: ${favName} pousse mais ne cadre quasiment pas (domination stérile) en étant mené par ${underName}. Éviter ${favName} vainqueur live tant que la pression n'est pas transformée en tirs cadrés.`,
        urgency: "low",
        extraRisks: [
          ...extraRisks,
          { type: "sterile_domination", severity: "medium", explanation: `${favName} domine sans danger réel.` },
        ],
      };
    }

    if (favReacting) {
      const strong = last5.pressureTeam === favSide && (last5[favSide].shotsOnTarget ?? 0) >= 1;
      const m = mk(
        favSide === "home" ? "next_goal_home" : "next_goal_away",
        `Prochain but ${favName} (réaction réelle)`,
        strong ? "medium" : "weak",
        strong ? "now" : "wait_5_min",
        `${favName} réagit après le but de ${underName}: pression réelle mesurée (tirs cadrés / corners récents).`,
        `Maintien de la pression: nouveaux tirs cadrés ou corners de ${favName} dans les 5 min.`,
        `Baisse de rythme de ${favName}, ou ${underName} qui marque en transition.`,
        "medium"
      );
      const dc = mk(
        favSide === "home" ? "double_chance_home_draw" : "double_chance_away_draw",
        `Double chance ${favName} / nul (filet de sécurité)`,
        "weak",
        "watch_only",
        `Si ${favName} égalise, l'issue redevient ouverte. La double chance limite le risque face à une victoire sèche incertaine.`,
        "Égalisation de " + favName + " avant la 80e.",
        favName + " encaisse un 2e but, ou cote indisponible pour valider la value.",
        "medium"
      );
      return {
        action: strong ? "WATCH" : "WATCH",
        markets: [m, dc],
        avoid,
        mainAdvice: `WATCH: ${favName} réagit après le but de ${underName}. Surveiller ${favName} prochain but plutôt que sa victoire sèche. ${odds.available ? "" : "Cotes live indisponibles: pas de value confirmable, marché à surveiller seulement."}`.trim(),
        urgency: strong ? "medium" : "low",
        extraRisks,
      };
    }

    if (favNoReaction) {
      const m = mk(
        underdogSide === "home" ? "double_chance_home_draw" : "double_chance_away_draw",
        `${underName} conserve son avantage (à surveiller)`,
        "weak",
        "watch_only",
        `${favName} (favori) ne réagit pas: peu de tirs, aucune pression réelle. ${underName} peut tenir son avantage.`,
        `${underName} continue de défendre/contrer proprement; ${favName} reste stérile.`,
        `${favName} se réveille (tirs cadrés répétés), ou ${underName} craque physiquement.`,
        "medium"
      );
      return {
        action: "AVOID",
        markets: [m],
        avoid,
        mainAdvice: `AVOID: ${favName} est mené et ne réagit pas (peu de tirs, aucune pression réelle). Éviter ${favName} vainqueur live. Au mieux, surveiller ${underName} pour conserver son avantage. No bet reste acceptable.`,
        urgency: "low",
        extraRisks,
      };
    }

    // Réaction ambiguë
    return {
      action: "WATCH",
      markets: [],
      avoid,
      mainAdvice: `WATCH: ${favName} est mené par ${underName}. Réaction encore ambiguë. Attendre une confirmation claire (tirs cadrés répétés) avant tout signal.`,
      urgency: "low",
      extraRisks,
    };
  }

  // ---- Layer 3+: évaluation générique des marchés ----
  const markets: RecommendedMarket[] = [];
  const avoid: AvoidMarket[] = [];
  const extraRisks: AdviceRisk[] = [];

  // Domination stérile générale (équipe qui mène/contrôle sans cadrer)
  for (const side of ["home", "away"] as const) {
    if (sterileOf(side)) {
      avoid.push({
        market: side === "home" ? "home_win_live" : "away_win_live",
        reason: `Domination stérile de ${nameOf(side)}: possession sans tirs cadrés. La victoire live n'est pas justifiée.`,
      });
      extraRisks.push({
        type: "sterile_domination",
        severity: "medium",
        explanation: `${nameOf(side)} domine sans transformer en occasions franches.`,
      });
    }
  }

  // Prochain but (pression réelle)
  for (const side of ["home", "away"] as const) {
    if (sterileOf(side)) continue;
    const sidePressure = pressureSide === side;
    const onTgt = onTargetAdv(side);
    if (diffOf(side) > 12 && (sidePressure || (onTgt >= 1 && totalShotsAdv(side) >= 2)) && elapsed < 87) {
      const w = side === "home" ? last5.home : last5.away;
      const strong = sidePressure && ((w.shotsOnTarget ?? 0) >= 2 || (w.goals ?? 0) >= 1 || onTgt >= 3);
      const medium = sidePressure || onTgt >= 2;
      markets.push(
        mk(
          side === "home" ? "next_goal_home" : "next_goal_away",
          `Prochain but ${nameOf(side)}`,
          strong ? "strong" : medium ? "medium" : "weak",
          sidePressure ? "now" : "wait_5_min",
          `${nameOf(side)} met une pression réelle (tirs cadrés +${Math.max(0, onTgt)}, momentum ${
            side === "home" ? momentum.home : momentum.away
          }).`,
          `Maintien de la pression: nouveaux tirs cadrés ou corners de ${nameOf(side)} dans les 5 min.`,
          `Baisse d'intensité de ${nameOf(side)}, but adverse en transition, ou carton rouge.`,
          "medium"
        )
      );
    }
  }

  // Over 1.5
  if (totalGoals <= 1 && elapsed < 78 && !lowScoringLate && combinedSOG >= 3 && (openMatch || combinedShots >= 12)) {
    const strong = totalGoals >= 1 && combinedSOG >= 6 && elapsed < 60;
    markets.push(
      mk(
        "over_1_5",
        "Over 1.5 buts",
        strong ? "medium" : "weak",
        elapsed < 65 ? "now" : "watch_only",
        `Match qui produit des occasions: ${combinedShots} tirs cumulés, ${combinedSOG} cadrés${
          totalGoals >= 1 ? ", déjà 1 but" : ""
        }.`,
        "Maintien du rythme: tirs cadrés réguliers des deux côtés.",
        "Le match se ferme, peu de tirs cadrés, ou approche de la 78e sans occasion.",
        "low"
      )
    );
  }

  // Over 2.5 (strict, jamais en fin de match sauf très ouvert)
  if (totalGoals <= 2 && !lowScoringLate) {
    const earlyGoal = totalGoals >= 1 && elapsed <= 60;
    const hugeVolume = combinedSOG >= 8 || combinedShots >= 18;
    if (!lateGame && (earlyGoal || hugeVolume) && combinedShots >= 12 && elapsed < 70) {
      const strong = totalGoals >= 2 && elapsed < 60 && hugeVolume;
      markets.push(
        mk(
          "over_2_5",
          "Over 2.5 buts (strict)",
          strong ? "medium" : "weak",
          "watch_only",
          `Volume offensif élevé (${combinedShots} tirs, ${combinedSOG} cadrés)${
            totalGoals >= 1 ? `, ${totalGoals} but(s)` : ""
          }.`,
          "Confirmation: un 2e/3e but ou un rythme maintenu avant la 70e.",
          "Rythme qui retombe, défenses qui se regroupent, ou passage de la 70e.",
          "medium"
        )
      );
    } else if (lateGame) {
      avoid.push({ market: "over_2_5", reason: "Après la 75e: éviter l'over 2.5 sauf match extrêmement ouvert." });
    }
  }

  // BTTS
  if (hg >= 1 && ag >= 1) {
    // déjà réalisé: rien
  } else if (bothCreate && !lopsided && elapsed < 80 && !closedMatch) {
    const strong = num(h.shotsOnGoal) >= 2 && num(a.shotsOnGoal) >= 2;
    markets.push(
      mk(
        "btts",
        "Les deux équipes marquent (BTTS)",
        strong ? "medium" : "weak",
        "watch_only",
        `Occasions des deux côtés (cadrés: ${num(h.shotsOnGoal)} / ${num(a.shotsOnGoal)}), transitions réelles.`,
        "Les deux équipes continuent de se créer des occasions franches.",
        "Une équipe défend bas et n'attaque plus, ou expulsion déséquilibrante.",
        "medium"
      )
    );
  } else if (closedMatch) {
    avoid.push({ market: "btts", reason: "Match fermé: peu de tirs cadrés, BTTS non justifié." });
  }

  // Match fermé => no bet
  if (closedMatch) {
    avoid.push({ market: "over_2_5", reason: "Match fermé: rythme faible, over 2.5 non justifié." });
    extraRisks.push({
      type: "closed_match",
      severity: "low",
      explanation: "Match fermé: peu d'occasions, prudence sur les marchés de buts.",
    });
  }

  // Marché trop orienté (large avance)
  if (Math.abs(lead) >= 3) {
    avoid.push({ market: "winner", reason: "Écart au score large: marchés évidents, peu de value potentielle." });
  }

  // Blessure joueur clé (source secondaire)
  if (commentaryInjuries.length > 0) {
    extraRisks.push({
      type: "key_player_issue",
      severity: "medium",
      explanation: `Blessure(s) signalée(s) (source secondaire): ${commentaryInjuries
        .map((e) => e.playerName ?? "joueur")
        .join(", ")}. Confiance offensive réduite, à confirmer par un changement.`,
    });
  }

  // Phase finale: prudence
  if (lateGame) {
    extraRisks.push({
      type: "late_game",
      severity: "medium",
      explanation: "Phase finale (75e+): volatilité accrue, signaux forts rares.",
    });
    // Caper les signaux forts en fin de match
    for (const m of markets) {
      if (m.signal === "strong") m.signal = "medium";
    }
  }

  // ---- Résolution de l'action ----
  const decisionOut = resolveGenericAction({
    markets,
    avoid,
    extraRisks,
    closedMatch,
    elapsed,
    homeName,
    awayName,
    context,
    oddsAvailable: odds.available,
    diff,
  });
  return decisionOut;
}

function resolveGenericAction(args: {
  markets: RecommendedMarket[];
  avoid: AvoidMarket[];
  extraRisks: AdviceRisk[];
  closedMatch: boolean;
  elapsed: number;
  homeName: string;
  awayName: string;
  context: ReturnType<typeof buildContextIntelligence>;
  oddsAvailable: boolean;
  diff: number;
}): Decision {
  const { markets, avoid, extraRisks, closedMatch, context, oddsAvailable } = args;

  // Sans cotes, un marché "now" reste une surveillance: pas de value confirmable.
  const oddsNote = oddsAvailable ? "" : " Cotes live indisponibles: marché à surveiller, value non confirmable.";

  const hasNowSignal = markets.some((m) => m.timing === "now" && (m.signal === "medium" || m.signal === "strong"));
  const hasWatch = markets.length > 0;

  let action: LiveAction;
  let primary: RecommendedMarket | null = null;

  if (hasNowSignal) {
    action = "SIGNAL";
    primary = markets.find((m) => m.timing === "now" && m.signal !== "weak") ?? markets[0];
  } else if (hasWatch) {
    action = "WATCH";
    primary =
      markets.find((m) => m.signal === "strong") ??
      markets.find((m) => m.signal === "medium") ??
      markets[0];
  } else if (closedMatch || avoid.length > 0) {
    action = "AVOID";
  } else {
    action = "WAIT";
  }

  let mainAdvice: string;
  let urgency: Urgency;

  if (action === "SIGNAL" && primary) {
    mainAdvice = `SIGNAL (${frSignal(primary.signal)}): ${primary.label}. ${primary.reasoning} Condition d'invalidation: ${primary.invalidation}.${oddsNote}`;
    urgency = primary.signal === "strong" ? "high" : "medium";
  } else if (action === "WATCH" && primary) {
    mainAdvice = `WATCH: ${primary.label} devient intéressant mais demande confirmation. ${primary.requiredConfirmation}${oddsNote}`;
    urgency = "low";
  } else if (action === "AVOID") {
    const why = closedMatch
      ? "match fermé, peu d'occasions"
      : avoid[0]?.reason ?? "configuration piégeuse";
    mainAdvice = `AVOID: ${why}. No bet recommandé pour l'instant. Mieux vaut attendre une vraie opportunité.`;
    urgency = "none";
  } else {
    mainAdvice =
      "WAIT: aucun marché intéressant actuellement. Les conditions ne dégagent pas de signal sérieux. No bet recommandé jusqu'à une évolution claire.";
    urgency = "none";
  }

  return { action, markets, avoid, mainAdvice, urgency, extraRisks };
}

/* ======================================================================
 *  Sorties dérivées (confiance, next check, textes)
 * =================================================================== */

function computeConfidence(args: {
  decision: Decision;
  momentum: ReturnType<typeof computeMomentum>;
  last5: WindowSummary;
  dataQuality: { hasEvents: boolean; hasLineups: boolean; freshnessSeconds: number | null; hasStatistics: boolean };
  risks: AdviceRisk[];
  oddsAvailable: boolean;
}): AdviceConfidence {
  const { decision, momentum, last5, dataQuality, risks } = args;
  if (!dataQuality.hasStatistics) return "low";

  let score = 2;
  if (dataQuality.hasEvents) score += 1;
  if (dataQuality.hasLineups) score += 1;
  const absDiff = Math.abs(momentum.diff);
  if (absDiff >= 25) score += 2;
  else if (absDiff >= 12) score += 1;
  if (last5.hasData) score += 1;
  if (dataQuality.freshnessSeconds !== null && dataQuality.freshnessSeconds <= 180) score += 1;
  if (risks.some((r) => r.severity === "high")) score -= 2;

  let level: AdviceConfidence = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  // WAIT/INVALIDATED ne devraient pas afficher une confiance élevée.
  if ((decision.action === "WAIT" || decision.action === "INVALIDATED") && level === "high") {
    level = "medium";
  }
  return level;
}

function buildNextCheck(
  decision: Decision,
  context: ReturnType<typeof buildContextIntelligence>,
  last5: WindowSummary
): NextCheck {
  const inMinutes =
    decision.action === "AVOID" ? 10 : decision.action === "WATCH" ? 5 : decision.action === "WAIT" ? 5 : 3;

  const whatToWatch: string[] = [];
  const primary = decision.markets[0];
  if (primary) whatToWatch.push(primary.requiredConfirmation);
  if (context.favoriteTeam) whatToWatch.push(`Réaction de ${context.favoriteTeam} (tirs cadrés, corners).`);
  if (last5.pressureTeam) {
    whatToWatch.push("Le maintien (ou non) de la pression sur les 5 prochaines minutes.");
  } else {
    whatToWatch.push("L'apparition d'une vraie pression (tirs cadrés répétés, corners).");
  }
  whatToWatch.push("Tout événement majeur: but, carton rouge, blessure, changement tactique.");
  return { inMinutes, whatToWatch: Array.from(new Set(whatToWatch)).slice(0, 4) };
}

function buildLiveReading(args: {
  fixture: NormalizedFixture;
  momentum: ReturnType<typeof computeMomentum>;
  last5: WindowSummary;
  sinceGoal: WindowSummary;
  context: ReturnType<typeof buildContextIntelligence>;
  statistics: NormalizedStatsPair;
}): string {
  const { fixture, momentum, last5, sinceGoal, context } = args;
  if (fixture.phase === "scheduled") {
    return `Match à venir. ${context.preMatchExpectation} ${context.recentFormSummary}`;
  }
  if (!args.statistics.hasData) {
    return "Données live insuffisantes: lecture fiable impossible pour l'instant.";
  }
  const parts: string[] = [];
  parts.push(
    `Momentum ${momentum.home}/${momentum.away}${
      momentum.diff > 10
        ? ` en faveur de ${fixture.home.name}`
        : momentum.diff < -10
        ? ` en faveur de ${fixture.away.name}`
        : " (équilibré)"
    }.`
  );
  parts.push(last5.summaryText);
  if (sinceGoal.toMinute !== null && sinceGoal.fromMinute !== null && sinceGoal.fromMinute > 0) {
    parts.push(sinceGoal.summaryText);
  }
  return parts.join(" ");
}

function buildFinalVerdict(decision: Decision, confidence: AdviceConfidence, oddsAvailable: boolean): string {
  const prudence =
    "Verdict prudent: lecture informative, aucune issue garantie. Si le doute persiste, no bet.";
  const oddsNote = oddsAvailable ? "" : " (cotes indisponibles: pas de value confirmée).";
  switch (decision.action) {
    case "SIGNAL":
      return `Action SIGNAL — un marché à surveiller se dégage avec une confiance ${frConfidence(confidence)}${oddsNote}. ${prudence}`;
    case "WATCH":
      return `Action WATCH — un marché devient intéressant mais demande confirmation${oddsNote}. ${prudence}`;
    case "AVOID":
      return `Action AVOID — configuration peu favorable, no bet recommandé. ${prudence}`;
    case "INVALIDATED":
      return `Action INVALIDATED — événement majeur: signaux précédents annulés, on repart de zéro. ${prudence}`;
    default:
      return `Action WAIT — pas de signal sérieux, patience recommandée. ${prudence}`;
  }
}

function buildDataWarning(input: GenerateLiveAdviceInput, live: boolean): string | null {
  if (!live && input.fixture.phase === "scheduled") return "Match non démarré: analyse live indisponible.";
  if (live && !input.statistics.hasData) return "Statistiques live absentes: lecture peu fiable.";
  if (!input.odds.available) return "Cotes live indisponibles: value non confirmable.";
  const f = input.freshnessSeconds;
  if (f !== null && f !== undefined && f > 600) return "Données anciennes (>10 min): resynchroniser.";
  return null;
}

function dedupeRisks(risks: AdviceRisk[]): AdviceRisk[] {
  const seen = new Set<string>();
  const out: AdviceRisk[] = [];
  for (const r of risks) {
    if (seen.has(r.type)) continue;
    seen.add(r.type);
    out.push(r);
  }
  return out;
}

function frSignal(s: RecommendedMarket["signal"]): string {
  return s === "strong" ? "fort" : s === "medium" ? "moyen" : "faible";
}

function frConfidence(c: AdviceConfidence): string {
  return c === "high" ? "élevée" : c === "medium" ? "moyenne" : "faible";
}
