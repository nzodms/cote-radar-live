/**
 * Petits utilitaires partagés (formatage, parsing, classes CSS).
 */

import type { MatchPhase } from "@/types/match";

/** Concatène des classes conditionnelles sans dépendance externe. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Date du jour au format YYYY-MM-DD (UTC). */
export function todayDateUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Valide grossièrement un format de date YYYY-MM-DD. */
export function isValidDateParam(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Convertit une valeur de statistique API ("55%", "12", null) en number ou null.
 * Gère les pourcentages et les chaînes vides.
 */
export function parseStatValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const cleaned = trimmed.replace("%", "").replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Mappe le code court de statut API vers une phase simplifiée. */
export function mapStatusToPhase(statusShort: string): MatchPhase {
  const s = (statusShort || "").toUpperCase();
  if (["NS", "TBD"].includes(s)) return "scheduled";
  if (["1H", "2H", "ET", "P", "BT", "LIVE", "INT"].includes(s)) return "live";
  if (s === "HT") return "halftime";
  if (["FT", "AET", "PEN", "WO"].includes(s)) return "finished";
  if (["PST", "CANC", "ABD", "SUSP"].includes(s)) return "postponed";
  return "unknown";
}

/** true si la phase correspond à un match en cours (live ou mi-temps). */
export function isLivePhase(phase: MatchPhase): boolean {
  return phase === "live" || phase === "halftime";
}

/**
 * Extrait un nom de groupe depuis le champ `round`.
 * Ex: "Group Stage - 1" => null, "Group A" => "Group A", "Groupe B" => "Groupe B".
 */
export function extractGroupName(round: string | null | undefined): string | null {
  if (!round) return null;
  const match = round.match(/\b(group|groupe|grupo)\s+([A-H0-9])\b/i);
  if (match) {
    return `${capitalize(match[1])} ${match[2].toUpperCase()}`;
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Différence en secondes entre maintenant et un timestamp ISO. */
export function secondsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 1000));
}

/** Formate un âge en secondes vers un libellé court ("12s", "3m", "1h"). */
export function formatFreshness(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

/** Formate une heure de coup d'envoi en HH:MM (locale FR par défaut). */
export function formatKickoff(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Clamp numérique. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Délai utilitaire (utilisé pour les retries). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
