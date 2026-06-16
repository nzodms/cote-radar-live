/**
 * Moteur cotes / value (préparation affiliation + validation de value).
 *
 * Règle d'or:
 *  - Cotes absentes => on ne parle JAMAIS de value confirmée.
 *  - Cotes présentes => probabilité implicite + comparaison au modèle maison
 *    + détection de compression (cote déjà réagi) et de value potentielle.
 */

import type { AfOdds } from "@/types/api-football";
import type { NormalizedOdds } from "@/types/match";
import type { OddsSnapshot, ValueAssessment } from "@/types/odds";
import { clamp } from "./utils";

/** Probabilité implicite (0-1) à partir d'une cote décimale. */
export function calculateImpliedProbability(odd: number | null | undefined): number | null {
  if (odd === null || odd === undefined || !Number.isFinite(odd) || odd <= 1) return null;
  return clamp(1 / odd, 0, 1);
}

/** edge = probabilité modèle - probabilité marché. Positif = value potentielle. */
export function compareModelProbabilityToMarket(
  modelProbability: number | null,
  marketProbability: number | null
): number | null {
  if (modelProbability === null || marketProbability === null) return null;
  return modelProbability - marketProbability;
}

/** true si la cote a chuté fortement (le marché a déjà réagi à un événement). */
export function detectOddsCompression(
  previousOdd: number | null,
  currentOdd: number | null
): boolean {
  if (previousOdd === null || currentOdd === null) return false;
  if (previousOdd <= 1 || currentOdd <= 1) return false;
  return currentOdd < previousOdd * 0.75;
}

/** true si l'edge dépasse un seuil prudent (par défaut +6 points de probabilité). */
export function detectPotentialValue(
  modelProbability: number | null,
  marketProbability: number | null,
  threshold = 0.06
): boolean {
  const edge = compareModelProbabilityToMarket(modelProbability, marketProbability);
  return edge !== null && edge >= threshold;
}

function findOddValue(raw: AfOdds[] | undefined, betName: RegExp, valueName: RegExp): number | null {
  if (!raw || raw.length === 0) return null;
  for (const block of raw) {
    for (const bm of block.bookmakers ?? []) {
      for (const bet of bm.bets ?? []) {
        if (!betName.test(bet.name ?? "")) continue;
        for (const v of bet.values ?? []) {
          if (valueName.test(v.value ?? "")) {
            const parsed = Number.parseFloat(v.odd);
            if (Number.isFinite(parsed)) return parsed;
          }
        }
      }
    }
  }
  return null;
}

/** Déduit le favori pré-match depuis le marché "Match Winner" si disponible. */
export function extractFavoriteFromOdds(odds: NormalizedOdds): "home" | "away" | null {
  if (!odds.available) return null;
  const homeOdd = findOddValue(odds.raw, /match winner|1x2|winner/i, /^home$|^1$/i);
  const awayOdd = findOddValue(odds.raw, /match winner|1x2|winner/i, /^away$|^2$/i);
  if (homeOdd === null || awayOdd === null) return null;
  if (homeOdd < awayOdd * 0.9) return "home";
  if (awayOdd < homeOdd * 0.9) return "away";
  return null;
}

export interface ValueAssessmentInput {
  odds: NormalizedOdds;
  modelProbability: number | null;
  betName: RegExp;
  valueName: RegExp;
  previousOdd?: number | null;
}

export function buildValueAssessment(input: ValueAssessmentInput): ValueAssessment {
  if (!input.odds.available) {
    return {
      available: false,
      message: input.odds.message ?? "Cotes indisponibles sur le plan actuel.",
      marketProbability: null,
      modelProbability: input.modelProbability,
      edge: null,
      potentialValue: false,
      oddsCompressed: false,
      notes: ["Cotes live indisponibles: impossible de valider la value."],
    };
  }

  const odd = findOddValue(input.odds.raw, input.betName, input.valueName);
  const marketProbability = calculateImpliedProbability(odd);
  const edge = compareModelProbabilityToMarket(input.modelProbability, marketProbability);
  const oddsCompressed = detectOddsCompression(input.previousOdd ?? null, odd);
  const potentialValue = detectPotentialValue(input.modelProbability, marketProbability);

  const notes: string[] = [];
  if (marketProbability === null) notes.push("Sélection non trouvée dans les cotes disponibles.");
  if (oddsCompressed) notes.push("Cote déjà compressée: le marché a probablement réagi.");
  if (potentialValue) notes.push("Edge positif détecté: value potentielle (à confirmer).");

  return {
    available: true,
    message: null,
    marketProbability,
    modelProbability: input.modelProbability,
    edge,
    potentialValue,
    oddsCompressed,
    notes,
  };
}

/** Construit des snapshots de cotes normalisés depuis la réponse brute (pour stockage). */
export function buildOddsSnapshots(fixtureId: number, odds: NormalizedOdds): OddsSnapshot[] {
  if (!odds.available || !odds.raw) return [];
  const out: OddsSnapshot[] = [];
  const collectedAt = new Date().toISOString();
  for (const block of odds.raw) {
    for (const bm of block.bookmakers ?? []) {
      for (const bet of bm.bets ?? []) {
        for (const v of bet.values ?? []) {
          const odd = Number.parseFloat(v.odd);
          if (!Number.isFinite(odd)) continue;
          out.push({
            fixtureId,
            source: "api-football",
            bookmaker: bm.name ?? null,
            market: bet.name ?? "",
            selection: v.value ?? "",
            odd,
            impliedProbability: calculateImpliedProbability(odd) ?? 0,
            collectedAt,
          });
        }
      }
    }
  }
  return out;
}
