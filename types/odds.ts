/**
 * Types pour la préparation cotes / value / affiliation (V1 = placeholders propres).
 *
 * Règles:
 *  - Cotes absentes => ne JAMAIS parler de value confirmée.
 *  - Cotes présentes => probabilité implicite + comparaison au modèle + détection
 *    de compression (le marché a déjà réagi) et de value potentielle.
 */

export interface OddsSnapshot {
  fixtureId: number;
  /** "api-football" | "manual" | nom d'agrégateur futur */
  source: string;
  bookmaker: string | null;
  /** Libellé du marché côté source (ex: "Match Winner", "Over/Under"). */
  market: string;
  /** Sélection (ex: "Home", "Over 2.5"). */
  selection: string;
  odd: number;
  impliedProbability: number;
  collectedAt: string;
}

export interface ValueAssessment {
  available: boolean;
  message: string | null;
  /** Probabilité implicite du marché (0-1) pour la sélection évaluée. */
  marketProbability: number | null;
  /** Probabilité estimée par le modèle maison (0-1). */
  modelProbability: number | null;
  /** modelProbability - marketProbability. Positif = value potentielle. */
  edge: number | null;
  potentialValue: boolean;
  /** true si la cote semble déjà très compressée après un événement. */
  oddsCompressed: boolean;
  notes: string[];
}
