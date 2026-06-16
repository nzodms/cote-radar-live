/**
 * Service planning Coupe du monde. Récupère TOUTE la compétition en UN appel
 * (/fixtures?league=1&season=2026), met en cache, puis filtre localement
 * (aujourd'hui / demain / date donnée). Quota-friendly.
 */

import { getLeagueFixtures, getStandings, type StandingGroup } from "@/lib/api-football";
import { filterWorldCupFixtures, getWorldCupConfig, normalizeFixture } from "@/lib/world-cup-filter";
import { todayDateUTC } from "@/lib/utils";
import type { NormalizedFixture } from "@/types/match";
import { sameTeam } from "./team-normalizer";

const TTL_MS = 60 * 60 * 1000; // 1h
let cache: { at: number; fixtures: NormalizedFixture[] } | null = null;
let standingsCache: { at: number; groups: StandingGroup[] } | null = null;

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

export async function getStandingsCached(force = false): Promise<StandingGroup[]> {
  if (!force && standingsCache && Date.now() - standingsCache.at < TTL_MS) return standingsCache.groups;
  const wc = getWorldCupConfig();
  const groups = await getStandings(wc.leagueId, wc.season).catch(() => []);
  standingsCache = { at: Date.now(), groups };
  return groups;
}

export function setStandingsCache(groups: StandingGroup[] | null): void {
  standingsCache = groups ? { at: Date.now(), groups } : null;
}

/** Groupe d'une équipe + autres équipes du groupe (best-effort). */
export async function getGroupInfo(teamName: string): Promise<{ name: string | null; others: string[] }> {
  const groups = await getStandingsCached().catch(() => []);
  for (const g of groups) {
    if (g.teams.some((t) => sameTeam(t, teamName))) {
      return { name: g.group || null, others: g.teams.filter((t) => !sameTeam(t, teamName)) };
    }
  }
  return { name: null, others: [] };
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
