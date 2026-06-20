/**
 * Normalise une réponse brute de cotes (issue d'un provider) vers un "board"
 * homogène avec probabilités implicites. PUR (testable sans réseau).
 */

import { mapMarketSelection, marketKeyLabel, type InternalMarketKey } from "./market-mapper";

/** Sélection brute renvoyée par un provider (déjà aplatie). */
export interface RawOddsSelection {
  market: string;
  selection: string;
  odd: number;
}

/** Résultat brut d'un appel provider (avant normalisation). */
export interface RawOddsResult {
  available: boolean;
  /** Raison de l'indisponibilité (si available=false). */
  reason: string | null;
  bookmaker: string | null;
  fetchedAt: string;
  suspended: boolean;
  selections: RawOddsSelection[];
}

export interface NormalizedOddsLine {
  key: InternalMarketKey;
  label: string;
  odd: number;
  impliedProbability: number;
}

export interface NormalizedOddsBoard {
  available: boolean;
  reason: string | null;
  bookmaker: string | null;
  fetchedAt: string;
  suspended: boolean;
  lines: NormalizedOddsLine[];
}

function impliedProbability(odd: number): number {
  if (!Number.isFinite(odd) || odd <= 1) return 0;
  return Math.min(1, Math.max(0, 1 / odd));
}

/** Board "indisponible" homogène. */
export function unavailableBoard(reason: string): NormalizedOddsBoard {
  return {
    available: false,
    reason,
    bookmaker: null,
    fetchedAt: new Date().toISOString(),
    suspended: false,
    lines: [],
  };
}

/** Normalise un RawOddsResult en board avec clés internes + proba implicite. */
export function normalizeOddsResult(raw: RawOddsResult): NormalizedOddsBoard {
  if (!raw.available) return unavailableBoard(raw.reason ?? "Cotes non disponibles.");

  const seen = new Set<InternalMarketKey>();
  const lines: NormalizedOddsLine[] = [];
  for (const s of raw.selections) {
    const mapped = mapMarketSelection(s.market, s.selection);
    if (!mapped) continue;
    if (seen.has(mapped.key)) continue; // garde la 1re cote vue par clé (meilleur bookmaker)
    if (!Number.isFinite(s.odd) || s.odd <= 1) continue;
    seen.add(mapped.key);
    lines.push({
      key: mapped.key,
      label: marketKeyLabel(mapped.key),
      odd: s.odd,
      impliedProbability: impliedProbability(s.odd),
    });
  }

  return {
    available: lines.length > 0,
    reason: lines.length > 0 ? null : "Aucun marché exploitable dans la réponse cotes.",
    bookmaker: raw.bookmaker,
    fetchedAt: raw.fetchedAt,
    suspended: raw.suspended,
    lines,
  };
}

/** Cote pour une clé donnée (ou null). */
export function oddForKey(board: NormalizedOddsBoard | null, key: InternalMarketKey): number | null {
  if (!board || !board.available) return null;
  return board.lines.find((l) => l.key === key)?.odd ?? null;
}
