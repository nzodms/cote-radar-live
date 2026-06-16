/**
 * Types bruts renvoyés par l'API-Football / API-SPORTS (v3).
 * Source: https://www.api-football.com/documentation-v3
 *
 * Toutes ces structures peuvent contenir des valeurs `null`.
 * Le code consommateur doit TOUJOURS gérer les nulls et les tableaux vides.
 */

/** Enveloppe standard de toutes les réponses API-Football. */
export interface ApiFootballEnvelope<T> {
  get: string;
  parameters: Record<string, string> | unknown[];
  /** Peut être un tableau OU un objet `{}` selon les cas d'erreur. */
  errors: string[] | Record<string, string>;
  results: number;
  paging: {
    current: number;
    total: number;
  };
  response: T;
}

export interface AfTeam {
  id: number;
  name: string;
  logo: string | null;
  winner?: boolean | null;
}

export interface AfVenue {
  id: number | null;
  name: string | null;
  city: string | null;
}

export interface AfStatus {
  long: string;
  short: string;
  elapsed: number | null;
}

export interface AfFixtureInfo {
  id: number;
  referee: string | null;
  timezone: string;
  date: string;
  timestamp: number;
  periods: {
    first: number | null;
    second: number | null;
  };
  venue: AfVenue;
  status: AfStatus;
}

export interface AfLeague {
  id: number;
  name: string;
  country: string | null;
  logo: string | null;
  flag: string | null;
  season: number;
  round: string | null;
}

export interface AfGoals {
  home: number | null;
  away: number | null;
}

export interface AfScoreSlot {
  home: number | null;
  away: number | null;
}

export interface AfScore {
  halftime: AfScoreSlot;
  fulltime: AfScoreSlot;
  extratime: AfScoreSlot;
  penalty: AfScoreSlot;
}

/** Objet renvoyé par GET /fixtures et GET /fixtures?id= */
export interface AfFixture {
  fixture: AfFixtureInfo;
  league: AfLeague;
  teams: {
    home: AfTeam;
    away: AfTeam;
  };
  goals: AfGoals;
  score: AfScore;
}

/** Une statistique unitaire. `value` peut être number, string ("55%") ou null. */
export interface AfStatisticItem {
  type: string;
  value: number | string | null;
}

/** Objet renvoyé par GET /fixtures/statistics?fixture= (1 par équipe). */
export interface AfTeamStatistics {
  team: AfTeam;
  statistics: AfStatisticItem[];
}

/** Objet renvoyé par GET /fixtures/events?fixture= */
export interface AfEvent {
  time: {
    elapsed: number | null;
    extra: number | null;
  };
  team: AfTeam;
  player: {
    id: number | null;
    name: string | null;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  /** "Goal" | "Card" | "subst" | "Var" | ... */
  type: string | null;
  detail: string | null;
  comments: string | null;
}

export interface AfLineupPlayer {
  player: {
    id: number | null;
    name: string | null;
    number: number | null;
    pos: string | null;
    grid: string | null;
  };
}

/** Objet renvoyé par GET /fixtures/lineups?fixture= (1 par équipe). */
export interface AfLineup {
  team: AfTeam & {
    colors?: unknown;
  };
  formation: string | null;
  startXI: AfLineupPlayer[];
  substitutes: AfLineupPlayer[];
  coach: {
    id: number | null;
    name: string | null;
    photo: string | null;
  };
}

/** ----- Odds (souvent indisponible en plan Free) ----- */
export interface AfOddValue {
  value: string;
  odd: string;
}

export interface AfOddBet {
  id: number;
  name: string;
  values: AfOddValue[];
}

export interface AfOddBookmaker {
  id: number;
  name: string;
  bets: AfOddBet[];
}

export interface AfOdds {
  league: Partial<AfLeague>;
  fixture: { id: number };
  update: string;
  bookmakers: AfOddBookmaker[];
}
