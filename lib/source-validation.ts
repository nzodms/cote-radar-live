/**
 * Validation d'une source SECONDAIRE (commentaires publics) contre la source
 * PRINCIPALE (API-Football).
 *
 * Règle: si la source secondaire contredit l'API (score incohérent), on ne
 * l'utilise PAS pour un signal. Au mieux, elle confirme une pression récente.
 */

import type { ExternalCommentaryEvent } from "@/types/commentary";

export interface PrimarySourceState {
  scoreHome: number | null;
  scoreAway: number | null;
  elapsed: number | null;
}

export interface SourceValidationResult {
  isValid: boolean;
  warnings: string[];
}

/**
 * Compare le nombre de buts/minute déduits de la source secondaire à l'API.
 * - Écart de score >= 2 => incohérent (isValid=false).
 * - Écart de score = 1 ou décalage de minute important => avertissement (lag).
 */
export function validateAgainstPrimary(
  primary: PrimarySourceState,
  secondaryEvents: ExternalCommentaryEvent[],
  secondaryLatestMinute: number | null = null
): SourceValidationResult {
  const warnings: string[] = [];

  const primaryTotal =
    primary.scoreHome !== null && primary.scoreAway !== null
      ? primary.scoreHome + primary.scoreAway
      : null;
  const secondaryGoals = secondaryEvents.filter((e) => e.eventType === "goal").length;

  let isValid = true;

  if (primaryTotal !== null) {
    const diff = Math.abs(primaryTotal - secondaryGoals);
    if (diff >= 2) {
      isValid = false;
      warnings.push(
        `Score incohérent: ${secondaryGoals} but(s) côté source secondaire vs ${primaryTotal} côté API. Source non fiable pour un signal.`
      );
    } else if (diff === 1) {
      warnings.push("Léger décalage de score (lag probable de la source secondaire).");
    }
  } else {
    warnings.push("Score API indisponible: validation partielle uniquement.");
  }

  if (primary.elapsed !== null && secondaryLatestMinute !== null) {
    const drift = Math.abs(primary.elapsed - secondaryLatestMinute);
    if (drift > 5) {
      warnings.push(`Décalage de minute important (${drift}'). Traiter la source comme indicative.`);
    }
  }

  return { isValid, warnings };
}
