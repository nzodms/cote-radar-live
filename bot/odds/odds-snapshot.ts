/**
 * Compare deux snapshots de cotes pour détecter baisse/hausse/suspension.
 * PUR (testable sans réseau).
 *
 * Règle: une baisse de cote = le marché a déjà réagi (value souvent partie).
 * Une suspension = événement chaud en cours (but probable / VAR).
 */

import { oddForKey, type NormalizedOddsBoard, type NormalizedOddsLine } from "./odds-normalizer";
import { type InternalMarketKey } from "./market-mapper";

export type OddsDirection = "drop" | "rise" | "stable" | "new" | "suspended";

export interface OddsMovement {
  key: InternalMarketKey;
  label: string;
  previous: number | null;
  current: number | null;
  direction: OddsDirection;
  /** Variation relative en % (positif = hausse, négatif = baisse). */
  changePct: number | null;
}

export interface OddsSnapshotComparison {
  available: boolean;
  reason: string | null;
  board: NormalizedOddsBoard | null;
  bookmaker: string | null;
  suspended: boolean;
  movements: OddsMovement[];
}

/** Comparaison "indisponible" homogène. */
export function unavailableComparison(reason: string): OddsSnapshotComparison {
  return { available: false, reason, board: null, bookmaker: null, suspended: false, movements: [] };
}

const DROP_THRESHOLD = -0.08; // -8% => baisse notable
const RISE_THRESHOLD = 0.08; // +8% => hausse notable

function classify(prev: number | null, cur: number | null): { direction: OddsDirection; changePct: number | null } {
  if (prev === null && cur !== null) return { direction: "new", changePct: null };
  if (prev !== null && cur === null) return { direction: "suspended", changePct: null };
  if (prev === null || cur === null) return { direction: "stable", changePct: null };
  const changePct = (cur - prev) / prev;
  if (changePct <= DROP_THRESHOLD) return { direction: "drop", changePct };
  if (changePct >= RISE_THRESHOLD) return { direction: "rise", changePct };
  return { direction: "stable", changePct };
}

/** Compare le board courant au précédent et renvoie les mouvements notables. */
export function compareOdds(
  previous: NormalizedOddsBoard | null,
  current: NormalizedOddsBoard
): OddsSnapshotComparison {
  if (!current.available) return unavailableComparison(current.reason ?? "Cotes non disponibles.");

  const movements: OddsMovement[] = [];
  for (const line of current.lines as NormalizedOddsLine[]) {
    const prev = oddForKey(previous, line.key);
    const { direction, changePct } = classify(prev, line.odd);
    if (direction === "stable") continue;
    movements.push({ key: line.key, label: line.label, previous: prev, current: line.odd, direction, changePct });
  }

  // Sélections présentes avant et disparues maintenant => suspension probable.
  if (previous?.available) {
    for (const prevLine of previous.lines) {
      if (!current.lines.some((l) => l.key === prevLine.key)) {
        movements.push({
          key: prevLine.key,
          label: prevLine.label,
          previous: prevLine.odd,
          current: null,
          direction: "suspended",
          changePct: null,
        });
      }
    }
  }

  return {
    available: true,
    reason: null,
    board: current,
    bookmaker: current.bookmaker,
    suspended: current.suspended || movements.some((m) => m.direction === "suspended"),
    movements,
  };
}

/** Vrai si la cote d'une clé a chuté nettement (le marché a réagi). */
export function hasDropped(comparison: OddsSnapshotComparison, key: InternalMarketKey): boolean {
  return comparison.movements.some((m) => m.key === key && m.direction === "drop");
}
