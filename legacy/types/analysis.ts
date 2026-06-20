/**
 * Types du moteur d'analyse maison (sans IA obligatoire).
 * Wording prudent imposé: "signal faible/moyen/fort", "marché à surveiller",
 * "risque élevé", "domination stérile", "value potentielle", "verdict prudent".
 */

export type SignalLevel = "none" | "weak" | "medium" | "strong";
export type ConfidenceLevel = "low" | "medium" | "high";
export type Severity = "low" | "medium" | "high";

/** Marchés surveillés (libellés techniques). */
export type MarketKey =
  | "home_win_live"
  | "away_win_live"
  | "next_goal_home"
  | "next_goal_away"
  | "over_1_5"
  | "over_2_5"
  | "btts"
  | "draw_no_bet"
  | "avoid";

export interface MarketSignal {
  market: MarketKey;
  label: string;
  signal: "weak" | "medium" | "strong";
  reason: string;
  /** Condition d'invalidation: quand le signal cesse d'être valable. */
  invalidation: string;
}

export interface RiskItem {
  type: string;
  label: string;
  severity: Severity;
  explanation: string;
}

export interface DataQuality {
  hasStats: boolean;
  hasEvents: boolean;
  hasLineups: boolean;
  hasOdds: boolean;
  freshnessSeconds: number | null;
}

/** Résultat principal renvoyé par analyzeMatch(). */
export interface MatchAnalysis {
  summary: string;
  homeMomentum: number;
  awayMomentum: number;
  signalLevel: SignalLevel;
  confidenceLevel: ConfidenceLevel;
  marketSignals: MarketSignal[];
  risks: RiskItem[];
  verdict: string;
  dataQuality: DataQuality;
}

/** Détail interne du calcul de momentum (utile pour l'UI et le debug). */
export interface MomentumBreakdownItem {
  label: string;
  homeDelta: number;
  awayDelta: number;
}

export interface MomentumResult {
  home: number;
  away: number;
  /** Différentiel home - away (peut être négatif). */
  diff: number;
  breakdown: MomentumBreakdownItem[];
  /** Drapeaux qualitatifs détectés. */
  flags: {
    homeSterileDomination: boolean;
    awaySterileDomination: boolean;
    counterAttackRiskAgainstHome: boolean;
    counterAttackRiskAgainstAway: boolean;
    lowScoringLatePhase: boolean;
    tightLatePhase: boolean;
  };
}

/** Ligne d'historique de signal (table analysis_snapshots côté UI). */
export interface AnalysisHistoryEntry {
  id: string;
  fixtureId: number;
  collectedAt: string;
  homeMomentum: number | null;
  awayMomentum: number | null;
  signalLevel: string | null;
  confidenceLevel: string | null;
  verdict: string | null;
  marketSignals: MarketSignal[];
  risks: RiskItem[];
}
