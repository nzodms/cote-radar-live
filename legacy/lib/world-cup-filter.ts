/**
 * Filtrage STRICT Coupe du monde + normalisation des données brutes API.
 *
 * Priorité absolue du produit: n'afficher QUE les matchs de Coupe du monde.
 * Critères (configurables via env, défauts ci-dessous):
 *   league.id   === 1
 *   league.name === "World Cup"
 *   season      === 2026
 */

import type {
  AfEvent,
  AfFixture,
  AfLineup,
  AfStatisticItem,
  AfTeamStatistics,
} from "@/types/api-football";
import type {
  H2HSummary,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedStatsPair,
  NormalizedTeamStats,
  RecentForm,
  RecentFormResult,
} from "@/types/match";
import { extractGroupName, mapStatusToPhase, parseStatValue } from "./utils";

export interface WorldCupConfig {
  leagueId: number;
  leagueName: string;
  season: number;
}

export function getWorldCupConfig(): WorldCupConfig {
  return {
    leagueId: Number.parseInt(process.env.WORLD_CUP_LEAGUE_ID ?? "1", 10) || 1,
    leagueName: process.env.WORLD_CUP_LEAGUE_NAME ?? "World Cup",
    season: Number.parseInt(process.env.WORLD_CUP_SEASON ?? "2026", 10) || 2026,
  };
}

/**
 * Filtre unitaire strict. La saison est tolérante: certaines réponses
 * /fixtures?date= ne renvoient pas toujours season=2026 de façon fiable,
 * mais on EXIGE league.id ET league.name.
 */
export function isWorldCupFixture(fixture: AfFixture, config = getWorldCupConfig()): boolean {
  if (!fixture?.league) return false;
  const idMatch = fixture.league.id === config.leagueId;
  const nameMatch =
    (fixture.league.name ?? "").trim().toLowerCase() === config.leagueName.trim().toLowerCase();
  // league.id et league.name doivent matcher (exigence du cahier des charges).
  return idMatch && nameMatch;
}

/** Filtre un tableau de fixtures pour ne garder que la Coupe du monde. */
export function filterWorldCupFixtures(
  fixtures: AfFixture[],
  config = getWorldCupConfig()
): AfFixture[] {
  if (!Array.isArray(fixtures)) return [];
  return fixtures.filter((f) => isWorldCupFixture(f, config));
}

/* ========================================================================
 *  Normalisation fixture
 * ===================================================================== */

export function normalizeFixture(af: AfFixture): NormalizedFixture {
  const round = af.league.round ?? null;
  return {
    fixtureId: af.fixture.id,
    leagueId: af.league.id,
    leagueName: af.league.name,
    season: af.league.season,
    round,
    groupName: extractGroupName(round),
    home: {
      id: af.teams.home.id,
      name: af.teams.home.name,
      logo: af.teams.home.logo ?? null,
    },
    away: {
      id: af.teams.away.id,
      name: af.teams.away.name,
      logo: af.teams.away.logo ?? null,
    },
    kickoffAt: af.fixture.date,
    statusShort: af.fixture.status.short,
    statusLong: af.fixture.status.long,
    phase: mapStatusToPhase(af.fixture.status.short),
    elapsed: af.fixture.status.elapsed,
    homeGoals: af.goals.home,
    awayGoals: af.goals.away,
    venueName: af.fixture.venue?.name ?? null,
    venueCity: af.fixture.venue?.city ?? null,
  };
}

/* ========================================================================
 *  Normalisation statistiques
 * ===================================================================== */

/** Mapping libellé API -> champ normalisé. */
const STAT_MAP: Record<string, keyof NormalizedTeamStats> = {
  "shots on goal": "shotsOnGoal",
  "shots off goal": "shotsOffGoal",
  "total shots": "totalShots",
  "blocked shots": "blockedShots",
  "shots insidebox": "shotsInsideBox",
  "shots outsidebox": "shotsOutsideBox",
  fouls: "fouls",
  "corner kicks": "cornerKicks",
  offsides: "offsides",
  "ball possession": "ballPossession",
  "yellow cards": "yellowCards",
  "red cards": "redCards",
  "goalkeeper saves": "goalkeeperSaves",
  "total passes": "totalPasses",
  "passes accurate": "passesAccurate",
  "passes %": "passesPercent",
};

function emptyTeamStats(): NormalizedTeamStats {
  return {
    shotsOnGoal: null,
    shotsOffGoal: null,
    totalShots: null,
    blockedShots: null,
    shotsInsideBox: null,
    shotsOutsideBox: null,
    fouls: null,
    cornerKicks: null,
    offsides: null,
    ballPossession: null,
    yellowCards: null,
    redCards: null,
    goalkeeperSaves: null,
    totalPasses: null,
    passesAccurate: null,
    passesPercent: null,
  };
}

function mapTeamStats(items: AfStatisticItem[] | undefined): NormalizedTeamStats {
  const out = emptyTeamStats();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    const key = STAT_MAP[(item.type ?? "").trim().toLowerCase()];
    if (key) {
      out[key] = parseStatValue(item.value);
    }
  }
  return out;
}

function teamHasAnyStat(stats: NormalizedTeamStats): boolean {
  return Object.values(stats).some((v) => v !== null);
}

/**
 * Normalise les stats des deux équipes en se basant sur les IDs.
 * Fallback sur l'ordre [home, away] si l'ID ne matche pas.
 */
export function normalizeStatistics(
  afStats: AfTeamStatistics[],
  homeTeamId: number,
  awayTeamId: number
): NormalizedStatsPair {
  const safe = Array.isArray(afStats) ? afStats : [];
  const byHome = safe.find((s) => s.team?.id === homeTeamId);
  const byAway = safe.find((s) => s.team?.id === awayTeamId);

  const home = mapTeamStats(byHome?.statistics ?? safe[0]?.statistics);
  const away = mapTeamStats(byAway?.statistics ?? safe[1]?.statistics);

  return {
    home,
    away,
    hasData: teamHasAnyStat(home) || teamHasAnyStat(away),
  };
}

/* ========================================================================
 *  Normalisation événements
 * ===================================================================== */

export function normalizeEvents(afEvents: AfEvent[]): NormalizedEvent[] {
  if (!Array.isArray(afEvents)) return [];
  return afEvents.map((e) => ({
    elapsed: e.time?.elapsed ?? null,
    extra: e.time?.extra ?? null,
    teamId: e.team?.id ?? null,
    teamName: e.team?.name ?? null,
    playerName: e.player?.name ?? null,
    assistName: e.assist?.name ?? null,
    type: e.type ?? null,
    detail: e.detail ?? null,
    comments: e.comments ?? null,
  }));
}

/* ========================================================================
 *  Normalisation compositions
 * ===================================================================== */

export function normalizeLineups(afLineups: AfLineup[]): NormalizedLineup[] {
  if (!Array.isArray(afLineups)) return [];
  return afLineups.map((l) => ({
    teamId: l.team?.id ?? 0,
    teamName: l.team?.name ?? "—",
    formation: l.formation ?? null,
    coachName: l.coach?.name ?? null,
    startXI: (l.startXI ?? []).map((p) => ({
      id: p.player?.id ?? null,
      name: p.player?.name ?? null,
      number: p.player?.number ?? null,
      pos: p.player?.pos ?? null,
      grid: p.player?.grid ?? null,
    })),
    substitutes: (l.substitutes ?? []).map((p) => ({
      id: p.player?.id ?? null,
      name: p.player?.name ?? null,
      number: p.player?.number ?? null,
      pos: p.player?.pos ?? null,
      grid: p.player?.grid ?? null,
    })),
  }));
}

/* ========================================================================
 *  Normalisation forme récente & H2H
 * ===================================================================== */

function outcomeFor(
  af: AfFixture,
  teamId: number
): { result: RecentFormResult; counted: boolean } {
  const isHome = af.teams.home.id === teamId;
  const goalsFor = isHome ? af.goals.home : af.goals.away;
  const goalsAgainst = isHome ? af.goals.away : af.goals.home;
  const opponentName = isHome ? af.teams.away.name : af.teams.home.name;
  const phase = mapStatusToPhase(af.fixture.status.short);
  const finished = phase === "finished";

  let outcome: RecentFormResult["outcome"] = "?";
  if (finished && goalsFor !== null && goalsAgainst !== null) {
    if (goalsFor > goalsAgainst) outcome = "W";
    else if (goalsFor < goalsAgainst) outcome = "L";
    else outcome = "D";
  }

  return {
    counted: finished && outcome !== "?",
    result: {
      fixtureId: af.fixture.id,
      date: af.fixture.date,
      opponentName,
      isHome,
      goalsFor,
      goalsAgainst,
      outcome,
    },
  };
}

export function normalizeRecentForm(teamId: number, fixtures: AfFixture[]): RecentForm {
  const safe = Array.isArray(fixtures) ? fixtures : [];
  const form: RecentForm = {
    teamId,
    results: [],
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };

  for (const af of safe) {
    const { result, counted } = outcomeFor(af, teamId);
    form.results.push(result);
    if (counted) {
      if (result.outcome === "W") form.wins += 1;
      else if (result.outcome === "D") form.draws += 1;
      else if (result.outcome === "L") form.losses += 1;
      form.goalsFor += result.goalsFor ?? 0;
      form.goalsAgainst += result.goalsAgainst ?? 0;
    }
  }

  return form;
}

export function normalizeH2H(
  team1Id: number,
  team2Id: number,
  fixtures: AfFixture[]
): H2HSummary {
  const safe = Array.isArray(fixtures) ? fixtures : [];
  let team1Wins = 0;
  let team2Wins = 0;
  let draws = 0;
  const recent: RecentFormResult[] = [];

  for (const af of safe) {
    const { result, counted } = outcomeFor(af, team1Id);
    recent.push(result);
    if (counted) {
      if (result.outcome === "W") team1Wins += 1;
      else if (result.outcome === "L") team2Wins += 1;
      else draws += 1;
    }
  }

  return {
    totalMatches: team1Wins + team2Wins + draws,
    team1Wins,
    team2Wins,
    draws,
    recent: recent.slice(0, 8),
  };
}
