/**
 * Moteur d'analyse principal (sans IA obligatoire).
 *
 * analyzeMatch() orchestre:
 *   computeMomentum -> deriveMarketSignals -> assessRisks
 * et produit un verdict PRUDENT + niveaux de signal/confiance + qualité data.
 *
 * Principe directeur: mieux vaut dire "aucun signal intéressant" que d'inventer.
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
  ConfidenceLevel,
  DataQuality,
  MarketKey,
  MarketSignal,
  MatchAnalysis,
  MomentumResult,
  RiskItem,
  SignalLevel,
} from "@/types/analysis";
import { computeMomentum } from "./momentum";
import { deriveMarketSignals } from "./market-signals";
import { assessRisks } from "./risk-engine";
import { isLivePhase } from "./utils";

export interface AnalyzeMatchInput {
  fixture: NormalizedFixture;
  statistics: NormalizedStatsPair;
  events: NormalizedEvent[];
  lineups: NormalizedLineup[];
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  odds: NormalizedOdds;
  freshnessSeconds?: number | null;
}

/** Libellés FR des marchés (réutilisés par l'UI). */
export const MARKET_LABELS: Record<MarketKey, string> = {
  home_win_live: "Victoire domicile (live)",
  away_win_live: "Victoire extérieur (live)",
  next_goal_home: "Prochain but domicile",
  next_goal_away: "Prochain but extérieur",
  over_1_5: "Over 1.5 buts",
  over_2_5: "Over 2.5 buts",
  btts: "Les deux équipes marquent",
  draw_no_bet: "Remboursé si nul",
  avoid: "À éviter / pas de signal",
};

export function analyzeMatch(input: AnalyzeMatchInput): MatchAnalysis {
  const bundle: MatchDataBundle = {
    fixture: input.fixture,
    statistics: input.statistics,
    events: input.events,
    lineups: input.lineups,
    recentForm: input.recentForm,
    h2h: input.h2h,
    odds: input.odds,
    freshnessSeconds: input.freshnessSeconds ?? null,
  };

  const momentum = computeMomentum(bundle);
  const marketSignals = deriveMarketSignals(bundle, momentum);
  const risks = assessRisks(bundle, momentum);

  const dataQuality: DataQuality = {
    hasStats: input.statistics.hasData,
    hasEvents: input.events.length > 0,
    hasLineups: input.lineups.length > 0,
    hasOdds: input.odds.available,
    freshnessSeconds: input.freshnessSeconds ?? null,
  };

  const signalLevel = computeSignalLevel(marketSignals);
  const confidenceLevel = computeConfidence(dataQuality, momentum, risks);
  const summary = buildSummary(bundle, momentum, marketSignals, signalLevel);
  const verdict = buildVerdict(bundle, marketSignals, risks, signalLevel, confidenceLevel);

  return {
    summary,
    homeMomentum: momentum.home,
    awayMomentum: momentum.away,
    signalLevel,
    confidenceLevel,
    marketSignals,
    risks,
    verdict,
    dataQuality,
  };
}

function computeSignalLevel(signals: MarketSignal[]): SignalLevel {
  const real = signals.filter((s) => s.market !== "avoid");
  if (real.length === 0) return "none";
  if (real.some((s) => s.signal === "strong")) return "strong";
  if (real.some((s) => s.signal === "medium")) return "medium";
  return "weak";
}

function computeConfidence(
  dataQuality: DataQuality,
  momentum: MomentumResult,
  risks: RiskItem[]
): ConfidenceLevel {
  if (!dataQuality.hasStats) return "low";

  let score = 2; // base: on a des stats
  if (dataQuality.hasEvents) score += 1;
  if (dataQuality.hasLineups) score += 1;

  const absDiff = Math.abs(momentum.diff);
  if (absDiff >= 25) score += 2;
  else if (absDiff >= 12) score += 1;

  if (dataQuality.freshnessSeconds !== null && dataQuality.freshnessSeconds <= 180) {
    score += 1;
  }

  if (risks.some((r) => r.severity === "high")) score -= 2;
  if (risks.some((r) => r.type === "partial_data")) score -= 1;

  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function buildSummary(
  bundle: MatchDataBundle,
  momentum: MomentumResult,
  signals: MarketSignal[],
  signalLevel: SignalLevel
): string {
  const { fixture } = bundle;

  if (!isLivePhase(fixture.phase)) {
    if (fixture.phase === "finished") {
      return `Match terminé: ${fixture.home.name} ${fixture.homeGoals ?? 0}-${
        fixture.awayGoals ?? 0
      } ${fixture.away.name}. Analyse à des fins d'historique.`;
    }
    return `Match non démarré. L'analyse live (momentum, marchés) sera disponible après le coup d'envoi.`;
  }

  if (!bundle.statistics.hasData) {
    return `À la ${fixture.elapsed ?? 0}', ${fixture.home.name} ${fixture.homeGoals ?? 0}-${
      fixture.awayGoals ?? 0
    } ${fixture.away.name}. Données statistiques insuffisantes pour une lecture fiable.`;
  }

  const lead =
    momentum.diff > 10
      ? `Momentum en faveur de ${fixture.home.name}`
      : momentum.diff < -10
      ? `Momentum en faveur de ${fixture.away.name}`
      : "Momentum équilibré";

  const best = signals.find((s) => s.market !== "avoid");
  const signalText =
    signalLevel === "none"
      ? "Aucun marché à surveiller ne se dégage clairement."
      : `Marché à surveiller principal: ${best?.label ?? "—"} (signal ${frSignal(best?.signal)}).`;

  return `À la ${fixture.elapsed ?? 0}', ${fixture.home.name} ${fixture.homeGoals ?? 0}-${
    fixture.awayGoals ?? 0
  } ${fixture.away.name}. ${lead} (${momentum.home}/${momentum.away}). ${signalText}`;
}

function buildVerdict(
  bundle: MatchDataBundle,
  signals: MarketSignal[],
  risks: RiskItem[],
  signalLevel: SignalLevel,
  confidence: ConfidenceLevel
): string {
  const { fixture } = bundle;
  const prudence =
    "Verdict prudent: aucune issue n'est garantie, ce n'est qu'une lecture informative.";

  if (!isLivePhase(fixture.phase)) {
    if (fixture.phase === "finished") {
      return `Match terminé. ${prudence}`;
    }
    return `Match non démarré: pas de signal live à ce stade. ${prudence}`;
  }

  if (!bundle.statistics.hasData) {
    return `Données insuffisantes pour conclure: on s'abstient. ${prudence}`;
  }

  const highRisks = risks.filter((r) => r.severity === "high");
  const best = signals.find((s) => s.market !== "avoid");

  if (signalLevel === "none" || !best) {
    return `Aucun marché à surveiller ne ressort avec assez de marge. On s'abstient pour l'instant. ${prudence}`;
  }

  let head: string;
  if (signalLevel === "strong" && confidence !== "low") {
    head = `Signal fort identifié — ${best.label}. Value potentielle à surveiller, en gardant la condition d'invalidation: ${best.invalidation}`;
  } else if (signalLevel === "medium") {
    head = `Signal moyen — ${best.label}. À surveiller sans précipitation. Invalidation: ${best.invalidation}`;
  } else {
    head = `Signal faible — ${best.label}. Intérêt limité, à confirmer. Invalidation: ${best.invalidation}`;
  }

  const riskNote =
    highRisks.length > 0
      ? ` Attention: ${highRisks.map((r) => r.label.toLowerCase()).join(", ")} (risque élevé).`
      : "";

  return `${ensurePeriod(head)}${riskNote} ${prudence}`;
}

/** Ajoute un point final seulement si la phrase n'en a pas déjà un. */
function ensurePeriod(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text : `${text}.`;
}

function frSignal(signal: MarketSignal["signal"] | undefined): string {
  switch (signal) {
    case "strong":
      return "fort";
    case "medium":
      return "moyen";
    case "weak":
      return "faible";
    default:
      return "—";
  }
}
