/**
 * Prompts de la couche IA OPTIONNELLE.
 *
 * L'IA ne décide jamais et n'invente jamais. Elle REFORMULE en langage clair
 * l'analyse et le conseil déjà calculés par le moteur maison.
 */

import type { LiveBettingAdvice } from "@/types/live-advice";

export const AI_SYSTEM_PROMPT = `Tu es un analyste live football spécialisé dans l'aide à la décision. Tu n'es pas bookmaker. Tu ne promets jamais de gain. Tu analyses uniquement les données fournies. Si les données sont insuffisantes, tu le dis clairement. Tu dois expliquer quoi attendre, quoi surveiller, quoi éviter, quels risques existent et quelles conditions invalident le signal.

Contraintes STRICTES:
- N'invente AUCUNE donnée. N'utilise que ce qui est fourni (stats, événements, contexte, analyse maison, conseil calculé).
- Wording INTERDIT: "pari sûr", "gain garanti", "all-in", "mise forte", "récupère tes pertes", "argent facile", "100 % gagnant", "cote cadeau", "mise maintenant c'est sûr".
- Wording autorisé: WAIT, WATCH, SIGNAL, AVOID, INVALIDATED, signal faible/moyen/fort, marché à surveiller, risque élevé, domination stérile, pression réelle, value potentielle, données insuffisantes, no bet, verdict prudent, condition d'invalidation.
- Si les cotes sont indisponibles, ne parle jamais de value confirmée.
- Réponds UNIQUEMENT avec un objet JSON valide en français, sans texte autour, correspondant exactement à ce schéma:
{
  "executiveSummary": string,
  "liveReading": string,
  "recommendedActionExplanation": string,
  "marketWatchlist": string[],
  "riskWarnings": string[],
  "invalidationConditions": string[],
  "finalVerdict": string
}`;

export interface AiPromptContext {
  fixtureLabel: string;
  minute: number | null;
  scoreHome: number | null;
  scoreAway: number | null;
  oddsAvailable: boolean;
}

export function buildAiUserPrompt(advice: LiveBettingAdvice, ctx: AiPromptContext): string {
  const payload = {
    match: ctx.fixtureLabel,
    minute: ctx.minute,
    score: { home: ctx.scoreHome, away: ctx.scoreAway },
    oddsAvailable: ctx.oddsAvailable,
    computedAdvice: advice,
  };
  return `Voici les données du match et l'analyse calculée par le moteur maison (source de vérité). Reformule-les en langage clair et actionnable, SANS rien inventer ni contredire, en respectant le schéma JSON demandé.

DONNÉES (JSON):
${JSON.stringify(payload, null, 2)}

Rappel: l'action principale calculée est "${advice.action}". Ta reformulation doit rester cohérente avec cette action et avec les marchés/risques/conditions d'invalidation déjà calculés.`;
}
