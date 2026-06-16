/**
 * Pondération des sources. API-Football reste prioritaire; les sources
 * secondaires ne produisent jamais seules un SIGNAL fort.
 */

export const SOURCE_WEIGHTS = {
  api_goal: 100,
  api_stats_trend: 80,
  commentary_critical: 70,
  market_suspension: 65,
  market_strong_move: 55,
  alt_stats_trend: 50,
  lineup_key_player: 45,
  news_context: 25,
  social: 10,
} as const;

export type WeightedSource = keyof typeof SOURCE_WEIGHTS;

export function weightFor(source: WeightedSource): number {
  return SOURCE_WEIGHTS[source];
}
