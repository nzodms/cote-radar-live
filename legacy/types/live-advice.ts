/**
 * Types du moteur "Live Betting Advice" — l'assistant live actionnable.
 *
 * Le bot choisit UNE action principale et donne un conseil concret:
 * quoi attendre, quoi surveiller, quoi éviter, quel marché, pourquoi,
 * à quelle condition, et quand le signal est invalidé.
 *
 * Wording autorisé uniquement (WAIT/WATCH/SIGNAL/AVOID/INVALIDATED,
 * signal faible/moyen/fort, marché à surveiller, risque élevé,
 * domination stérile, pression réelle, value potentielle, données insuffisantes,
 * no bet, verdict prudent, condition d'invalidation).
 */

import type { NormalizedTeamStats } from "./match";

export type LiveAction = "WAIT" | "WATCH" | "SIGNAL" | "AVOID" | "INVALIDATED";
export type AdviceConfidence = "low" | "medium" | "high";
export type Urgency = "none" | "low" | "medium" | "high";
export type AdviceSeverity = "low" | "medium" | "high";
export type AdviceSignal = "weak" | "medium" | "strong";
export type AdviceTiming = "now" | "wait_5_min" | "watch_only" | "avoid";

export type AdviceMarketKey =
  | "home_win_live"
  | "away_win_live"
  | "double_chance_home_draw"
  | "double_chance_away_draw"
  | "next_goal_home"
  | "next_goal_away"
  | "over_1_5"
  | "over_2_5"
  | "btts"
  | "draw_no_bet"
  | "no_bet";

export interface RecommendedMarket {
  market: AdviceMarketKey;
  label: string;
  signal: AdviceSignal;
  timing: AdviceTiming;
  reasoning: string;
  requiredConfirmation: string;
  invalidation: string;
  riskLevel: AdviceSeverity;
}

export interface AvoidMarket {
  market: string;
  reason: string;
}

/** Marché déjà résolu par le score (over 1.5/2.5, BTTS…) — à NE PAS conseiller. */
export interface ResolvedMarket {
  market: string;
  label: string;
  note: string;
}

export interface AdviceRisk {
  type: string;
  severity: AdviceSeverity;
  explanation: string;
}

export interface MomentumSummary {
  homeScore: number;
  awayScore: number;
  dominantTeam: string | null;
  isRealPressure: boolean;
  isSterileDomination: boolean;
  last5MinutesSummary: string;
  last10MinutesSummary: string;
  sinceLastGoalSummary: string;
}

export interface ContextComparison {
  preMatchExpectation: string;
  currentReality: string;
  scenarioShift: string;
  keyDifference: string;
}

export interface NextCheck {
  inMinutes: number;
  whatToWatch: string[];
}

export interface AdviceDataQuality {
  hasFixture: boolean;
  hasStatistics: boolean;
  hasEvents: boolean;
  hasLineups: boolean;
  hasRecentForm: boolean;
  hasH2H: boolean;
  hasOdds: boolean;
  hasExternalCommentary: boolean;
  freshnessSeconds: number | null;
  warning: string | null;
}

/** Sortie principale de generateLiveBettingAdvice(). */
export interface LiveBettingAdvice {
  action: LiveAction;
  mainAdvice: string;
  matchScenario: string;
  liveReading: string;
  confidence: AdviceConfidence;
  urgency: Urgency;
  dominantTeam: string | null;
  /** "Ce que je ferais maintenant" — section la plus importante, langage humain. */
  whatIWouldDoNow: string;
  momentum: MomentumSummary;
  contextComparison: ContextComparison;
  recommendedMarkets: RecommendedMarket[];
  avoidMarkets: AvoidMarket[];
  /** Marchés déjà passés (résolus par le score), affichés à part. */
  resolvedMarkets: ResolvedMarket[];
  risks: AdviceRisk[];
  nextCheck: NextCheck;
  dataQuality: AdviceDataQuality;
  finalVerdict: string;
}

/** Données réellement utilisées par l'analyse (panneau debug). */
export interface AdviceDebug {
  fixtureFound: boolean;
  fixtureId: number;
  scoreHome: number | null;
  scoreAway: number | null;
  minute: number | null;
  statusShort: string | null;
  statusLong: string | null;
  hasStatistics: boolean;
  eventsCount: number;
  lineupsCount: number;
  previousSnapshotsCount: number;
  liveAdviceFound: boolean;
  lastAdviceAt: string | null;
  action: string | null;
  reason: string | null;
}

/* ------------------------------------------------------------------ */
/*  Fenêtres temporelles (5 / 10 min / depuis le dernier but)          */
/* ------------------------------------------------------------------ */

/** Un point de snapshot stats historisé (avec sa minute de jeu). */
export interface StatsSnapshotPoint {
  collectedAt: string;
  elapsed: number | null;
  home: NormalizedTeamStats;
  away: NormalizedTeamStats;
}

export interface WindowStats {
  shots: number | null;
  shotsOnTarget: number | null;
  shotsOffTarget: number | null;
  corners: number | null;
  cards: number;
  dangerousFreeKicks: number;
  injuries: number;
  substitutions: number;
  goals: number;
  offensiveEvents: number;
}

export interface WindowSummary {
  windowLabel: "5min" | "10min" | "since_goal";
  fromMinute: number | null;
  toMinute: number | null;
  home: WindowStats;
  away: WindowStats;
  /** Équipe avec le plus de dynamique offensive sur la fenêtre. */
  momentumTeam: "home" | "away" | null;
  /** Équipe en pression RÉELLE (tirs cadrés / corners), pas juste possession. */
  pressureTeam: "home" | "away" | null;
  summaryText: string;
  /** true si on a pu calculer des deltas exploitables (assez de snapshots). */
  hasData: boolean;
}

/** Renseignement de contexte pré-match comparé au live. */
export interface ContextIntelligence {
  preMatchExpectation: string;
  favoriteTeam: string | null;
  underdogTeam: string | null;
  /** "home" | "away" | null — côté du favori pour la logique interne. */
  favoriteSide: "home" | "away" | null;
  keyPlayers: string[];
  knownInjuries: string[];
  recentFormSummary: string;
  groupContext: string;
  scenarioShift: string;
  liveVsPreMatchMismatch: string;
}

/** Ligne d'historique de conseil live (table live_advice_snapshots). */
export interface LiveAdviceHistoryEntry {
  id: string;
  fixtureId: number;
  collectedAt: string;
  minute: number | null;
  scoreHome: number | null;
  scoreAway: number | null;
  action: LiveAction;
  mainAdvice: string;
  confidence: string | null;
  urgency: string | null;
  recommendedMarkets: RecommendedMarket[];
  avoidMarkets: AvoidMarket[];
  risks: AdviceRisk[];
  status: "pending" | "validated" | "invalidated" | "inconclusive";
}
