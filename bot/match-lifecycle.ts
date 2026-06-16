/**
 * Cycle de vie d'un match + orientation calendrier (le bot suit la Coupe du
 * monde, pas un seul match). PUR pour la classification ; les fonctions de
 * sélection s'appuient sur le cache planning.
 */

import type { NormalizedFixture } from "@/types/match";
import { getWorldCupFixturesCached } from "./schedule-service";

export type LifecycleStatus = "not_started" | "live" | "halftime" | "finished" | "cancelled" | "unknown";

export function getMatchLifecycleStatus(fixture: { statusShort?: string; phase?: string } | null | undefined): LifecycleStatus {
  if (!fixture) return "unknown";
  const s = (fixture.statusShort ?? "").toUpperCase();
  if (["FT", "AET", "PEN", "WO"].includes(s)) return "finished";
  if (s === "HT") return "halftime";
  if (["1H", "2H", "ET", "P", "BT", "LIVE", "INT"].includes(s)) return "live";
  if (["NS", "TBD"].includes(s)) return "not_started";
  if (["PST", "CANC", "ABD", "SUSP"].includes(s)) return "cancelled";
  // Repli sur la phase normalisée.
  if (fixture.phase === "finished") return "finished";
  if (fixture.phase === "halftime") return "halftime";
  if (fixture.phase === "live") return "live";
  if (fixture.phase === "scheduled") return "not_started";
  if (fixture.phase === "postponed") return "cancelled";
  return "unknown";
}

export function isFinished(fixture: { statusShort?: string; phase?: string } | null | undefined): boolean {
  return getMatchLifecycleStatus(fixture) === "finished";
}

export function isLiveOrHalftime(fixture: { statusShort?: string; phase?: string } | null | undefined): boolean {
  const s = getMatchLifecycleStatus(fixture);
  return s === "live" || s === "halftime";
}

export interface LifecycleSplit {
  finished: NormalizedFixture[];
  live: NormalizedFixture[];
  upcoming: NormalizedFixture[];
}

export function splitByLifecycle(fixtures: NormalizedFixture[]): LifecycleSplit {
  const finished: NormalizedFixture[] = [];
  const live: NormalizedFixture[] = [];
  const upcoming: NormalizedFixture[] = [];
  for (const f of fixtures) {
    const s = getMatchLifecycleStatus(f);
    if (s === "finished") finished.push(f);
    else if (s === "live" || s === "halftime") live.push(f);
    else if (s === "not_started") upcoming.push(f);
  }
  const byDate = (a: NormalizedFixture, b: NormalizedFixture) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? "");
  finished.sort((a, b) => byDate(b, a));
  live.sort(byDate);
  upcoming.sort(byDate);
  return { finished, live, upcoming };
}

export interface ActionableMatches {
  finished: NormalizedFixture[];
  live: NormalizedFixture[];
  upcoming: NormalizedFixture[];
  /** Prochain match Coupe du monde NON terminé (live d'abord, sinon le plus proche). */
  nextMatch: NormalizedFixture | null;
}

export async function getNextActionableMatches(
  fixturesProvider: () => Promise<NormalizedFixture[]> = () => getWorldCupFixturesCached()
): Promise<ActionableMatches> {
  const all = await fixturesProvider().catch(() => [] as NormalizedFixture[]);
  const { finished, live, upcoming } = splitByLifecycle(all);
  const nextMatch = live[0] ?? upcoming[0] ?? null;
  return { finished, live, upcoming, nextMatch };
}
