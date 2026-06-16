/**
 * Types des signaux multi-sources (capteurs).
 */

import type { AlertLevel } from "./types";

export type Impact = "low" | "medium" | "high";

/** Mouvement de marché détecté par le market scraper. */
export interface MarketEvent {
  minute: number | null;
  market: string; // "match_winner" | "next_goal" | "over_under" | "btts" ...
  selection: string; // "home" | "away" | "over_2_5" ...
  movement: "drop" | "rise" | "suspended" | "reopened" | "stable";
  changePct: number | null;
  impact: AlertLevel;
  summary: string;
}

export interface MarketSelection {
  market: string;
  selection: string;
  odd: number;
}

export interface MarketSnapshot {
  minute: number | null;
  suspended: boolean;
  selections: MarketSelection[];
  collectedAt: string;
}

/** Signal compositions / blessures. */
export interface LineupSignal {
  teamName: string | null;
  signalType:
    | "official_lineup"
    | "key_player_out"
    | "key_player_bench"
    | "offensive_sub"
    | "defensive_sub"
    | "injury"
    | "suspension"
    | "unknown";
  playerName: string | null;
  impact: Impact;
  summary: string;
}

/** Signal contexte / news. */
export interface ContextSignal {
  teamName: string | null;
  signalType:
    | "motivation"
    | "rotation"
    | "fatigue"
    | "pressure"
    | "injury_context"
    | "tactical_hint"
    | "morale"
    | "unknown";
  impact: Impact;
  summary: string;
  confidence: Impact;
}

export interface AltTeamStats {
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  possession: number | null;
  dangerousAttacks: number | null;
  xg: number | null;
}

export interface AltStatsSnapshot {
  minute: number | null;
  home: AltTeamStats;
  away: AltTeamStats;
  source: string;
}

/** Snapshot dérivé de l'API (source principale) pour le fusion engine. */
export interface FusionApiSnapshot {
  hasStats: boolean;
  dominantTeam: string | null;
  momentumTeam: string | null;
  pressureType: "none" | "sterile" | "dangerous" | "transition_threat";
  criticalEvent: boolean; // but / rouge / penalty / VAR vient de tomber
  homeName: string;
  awayName: string;
}
