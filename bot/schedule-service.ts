/**
 * Service planning Coupe du monde. Récupère TOUTE la compétition en UN appel
 * (/fixtures?league=1&season=2026), met en cache, puis filtre localement
 * (aujourd'hui / demain / date donnée). Quota-friendly.
 */

import { getLeagueFixtures } from "@/lib/api-football";
import { filterWorldCupFixtures, getWorldCupConfig, normalizeFixture } from "@/lib/world-cup-filter";
import { todayDateUTC } from "@/lib/utils";
import type { NormalizedFixture } from "@/types/match";

const TTL_MS = 60 * 60 * 1000; // 1h
let cache: { at: number; fixtures: NormalizedFixture[] } | null = null;

export async function getWorldCupFixturesCached(force = false): Promise<NormalizedFixture[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.fixtures;
  const wc = getWorldCupConfig();
  const raw = await getLeagueFixtures(wc.leagueId, wc.season);
  const fixtures = filterWorldCupFixtures(raw, wc).map(normalizeFixture);
  cache = { at: Date.now(), fixtures };
  return fixtures;
}

/** Permet d'injecter des fixtures (tests) ou d'invalider le cache. */
export function setFixturesCache(fixtures: NormalizedFixture[] | null): void {
  cache = fixtures ? { at: Date.now(), fixtures } : null;
}

export function filterByDate(fixtures: NormalizedFixture[], date: string): NormalizedFixture[] {
  return fixtures
    .filter((f) => (f.kickoffAt ?? "").slice(0, 10) === date)
    .sort((a, b) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? ""));
}

export function isLiveFixture(f: NormalizedFixture): boolean {
  return f.phase === "live" || f.phase === "halftime";
}

export async function getMatchesForDate(date: string): Promise<NormalizedFixture[]> {
  return filterByDate(await getWorldCupFixturesCached(), date);
}

export function addDaysUTC(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getTodayMatches(today = todayDateUTC()): Promise<NormalizedFixture[]> {
  return getMatchesForDate(today);
}

export async function getTomorrowMatches(today = todayDateUTC()): Promise<NormalizedFixture[]> {
  return getMatchesForDate(addDaysUTC(today, 1));
}

export async function getLiveMatches(): Promise<NormalizedFixture[]> {
  return (await getWorldCupFixturesCached()).filter(isLiveFixture);
}

/** Aujourd'hui + demain + live (dédupliqués). */
export async function getMatchesOverview(today = todayDateUTC()): Promise<{
  today: NormalizedFixture[];
  tomorrow: NormalizedFixture[];
  live: NormalizedFixture[];
}> {
  const all = await getWorldCupFixturesCached();
  return {
    today: filterByDate(all, today),
    tomorrow: filterByDate(all, addDaysUTC(today, 1)),
    live: all.filter(isLiveFixture),
  };
}
