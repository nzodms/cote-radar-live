/**
 * Types normalisés "métier" utilisés dans toute l'app.
 * Ils découplent l'UI et le moteur d'analyse de la forme brute de l'API.
 */

import type { AfEvent, AfFixture, AfLineup, AfOdds, AfTeamStatistics } from "./api-football";

/** Catégories de statut simplifiées. */
export type MatchPhase = "scheduled" | "live" | "halftime" | "finished" | "postponed" | "unknown";

export interface NormalizedTeam {
  id: number;
  name: string;
  logo: string | null;
}

export interface NormalizedFixture {
  fixtureId: number;
  leagueId: number;
  leagueName: string;
  season: number;
  round: string | null;
  /** Nom de groupe extrait du round ("Group A") si présent. */
  groupName: string | null;
  home: NormalizedTeam;
  away: NormalizedTeam;
  kickoffAt: string;
  statusShort: string;
  statusLong: string;
  phase: MatchPhase;
  elapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  venueName: string | null;
  venueCity: string | null;
}

/**
 * Statistiques live normalisées pour UNE équipe.
 * Toutes les valeurs sont nullable: l'API ne renvoie pas tout, tout le temps.
 */
export interface NormalizedTeamStats {
  shotsOnGoal: number | null;
  shotsOffGoal: number | null;
  totalShots: number | null;
  blockedShots: number | null;
  shotsInsideBox: number | null;
  shotsOutsideBox: number | null;
  fouls: number | null;
  cornerKicks: number | null;
  offsides: number | null;
  /** Possession en % (0-100). */
  ballPossession: number | null;
  yellowCards: number | null;
  redCards: number | null;
  goalkeeperSaves: number | null;
  totalPasses: number | null;
  passesAccurate: number | null;
  passesPercent: number | null;
}

export interface NormalizedStatsPair {
  home: NormalizedTeamStats;
  away: NormalizedTeamStats;
  /** true si au moins une stat exploitable existe. */
  hasData: boolean;
}

export interface NormalizedEvent {
  elapsed: number | null;
  extra: number | null;
  teamId: number | null;
  teamName: string | null;
  playerName: string | null;
  assistName: string | null;
  type: string | null;
  detail: string | null;
  comments: string | null;
}

export interface NormalizedLineupPlayer {
  id: number | null;
  name: string | null;
  number: number | null;
  pos: string | null;
  grid: string | null;
}

export interface NormalizedLineup {
  teamId: number;
  teamName: string;
  formation: string | null;
  coachName: string | null;
  startXI: NormalizedLineupPlayer[];
  substitutes: NormalizedLineupPlayer[];
}

/** Forme récente: résultats des derniers matchs vus du point de vue d'une équipe. */
export interface RecentFormResult {
  fixtureId: number;
  date: string;
  opponentName: string;
  isHome: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
  /** "W" | "D" | "L" | "?" */
  outcome: "W" | "D" | "L" | "?";
}

export interface RecentForm {
  teamId: number;
  results: RecentFormResult[];
  /** Compteur agrégé. */
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface H2HSummary {
  totalMatches: number;
  team1Wins: number;
  team2Wins: number;
  draws: number;
  recent: RecentFormResult[];
}

export interface NormalizedOdds {
  available: boolean;
  /** Message d'affichage si indisponible. */
  message?: string;
  raw?: AfOdds[];
}

/** Bundle complet d'une analyse: tout ce que le moteur reçoit. */
export interface MatchDataBundle {
  fixture: NormalizedFixture;
  statistics: NormalizedStatsPair;
  events: NormalizedEvent[];
  lineups: NormalizedLineup[];
  recentForm: {
    home: RecentForm | null;
    away: RecentForm | null;
  };
  h2h: H2HSummary | null;
  odds: NormalizedOdds;
  /** Âge des données en secondes (depuis le dernier sync). */
  freshnessSeconds: number | null;
}

/** Entrée brute (raw) — utile pour le debug et le stockage jsonb. */
export interface RawMatchData {
  fixture: AfFixture | null;
  statistics: AfTeamStatistics[] | null;
  events: AfEvent[] | null;
  lineups: AfLineup[] | null;
}
