/**
 * Détection de séquences offensives (enrichit l'analyse live).
 *
 * Travaille sur un buffer d'événements offensifs horodatés (minute) par équipe,
 * alimenté surtout par la source secondaire (tirs/corners/coups francs) car
 * l'API-Football ne timestampe pas les tirs.
 */

import type { BufferedEvent, DetectedSequence } from "./types";

function seq(
  type: string,
  team: "home" | "away" | null,
  label: string,
  windowMinutes: number,
  currentMinute: number,
  contributing: BufferedEvent[]
): DetectedSequence {
  return {
    type,
    team,
    label,
    windowStart: Math.max(0, currentMinute - windowMinutes),
    windowEnd: currentMinute,
    contributingMinutes: contributing.map((e) => e.minute).sort((a, b) => a - b),
  };
}

export function detectOffensiveSequence(
  buffer: BufferedEvent[],
  currentMinute: number
): DetectedSequence | null {
  for (const team of ["home", "away"] as const) {
    const ev = buffer.filter((e) => e.team === team && currentMinute - e.minute >= 0);
    const within = (min: number) => ev.filter((e) => currentMinute - e.minute <= min);
    const w5 = within(5);
    const w7 = within(7);

    const shotsAny5 = w5.filter((e) => e.kind === "shot" || e.kind === "shot_on_target");
    const sot5 = w5.filter((e) => e.kind === "shot_on_target");
    const corners5 = w5.filter((e) => e.kind === "corner");
    const corners7 = w7.filter((e) => e.kind === "corner");
    const fk5 = w5.filter((e) => e.kind === "free_kick");

    if (sot5.length >= 2) {
      return seq("two_shots_on_target", team, "2 tirs cadrés en 5 minutes", 5, currentMinute, sot5);
    }
    if (shotsAny5.length >= 2 && corners5.length >= 1) {
      return seq("shots_and_corner", team, "2 tirs + 1 corner en 5 minutes", 5, currentMinute, [
        ...shotsAny5,
        ...corners5,
      ]);
    }
    if (corners7.length >= 3) {
      return seq("three_corners", team, "3 corners en 7 minutes", 7, currentMinute, corners7);
    }
    if (fk5.length >= 1 && shotsAny5.length >= 1) {
      return seq("freekick_and_shot", team, "coup franc dangereux + tir", 5, currentMinute, [
        ...fk5,
        ...shotsAny5,
      ]);
    }
  }
  return null;
}

export function sequenceDedupId(fixtureId: number, s: DetectedSequence): string {
  return ["seq", fixtureId, s.type, s.team ?? "x", s.contributingMinutes.join(",")].join(":");
}
