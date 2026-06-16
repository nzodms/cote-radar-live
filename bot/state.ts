/**
 * État en mémoire du worker (pas de dépendance Supabase).
 * Un worker = potentiellement plusieurs matchs surveillés.
 */

import type {
  H2HSummary,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedStatsPair,
  RecentForm,
} from "@/types/match";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import type { LiveBettingAdvice, StatsSnapshotPoint } from "@/types/live-advice";
import type { BufferedEvent } from "./types";
import type {
  AltStatsSnapshot,
  ContextSignal,
  LineupSignal,
  MarketEvent,
  MarketSnapshot,
} from "./scraper-types";
import type { NormalizedOddsBoard } from "./odds/odds-normalizer";
import { AlertGate } from "./alert-classifier";

export interface SensorState {
  lastMarketSnapshot: MarketSnapshot | null;
  recentMarketEvents: MarketEvent[];
  lineupSignals: LineupSignal[];
  contextSignals: ContextSignal[];
  altStats: AltStatsSnapshot | null;
  knownMarketIds: Set<string>;
  lastMarketPollAt: number;
  lastLineupPollAt: number;
  lastNewsPollAt: number;
  lastAltStatsPollAt: number;
  // Cotes API (optionnel) — board courant pour détecter les mouvements (runtime).
  lastOddsBoard: NormalizedOddsBoard | null;
  lastOddsPollAt: number;
}

export interface MatchMeta {
  homeTeam: string;
  awayTeam: string;
  status: string;
  date: string;
  venue: string | null;
  round: string;
}

export interface WatchState {
  fixtureId: number;
  label: string;
  startedAt: number;
  active: boolean;

  // Métadonnées du match (affichage avant le 1er poll API) + URLs sources.
  matchMeta: MatchMeta | null;
  sourceUrls: { winamax: string | null };

  // Contexte (récupéré une fois)
  contextLoaded: boolean;
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  lineups: NormalizedLineup[];

  // État live
  knownEventIds: Set<string>;
  knownCommentaryIds: Set<string>;
  prevAdvice: LiveBettingAdvice | null;
  prevScore: { h: number; a: number } | null;
  buffer: BufferedEvent[];
  snapshots: StatsSnapshotPoint[];
  commentary: ExternalCommentaryEvent[];
  lastFixture: NormalizedFixture | null;
  lastStatistics: NormalizedStatsPair | null;
  gate: AlertGate;

  // Timing
  lastApiPollAt: number;
  lastWinamaxPollAt: number;
  lastImmediateConfirmAt: number;
  winamaxErrorCount: number;

  // Capteurs multi-sources
  sensors: SensorState;

  // Statut / sortie
  lastAction: string | null;
  alertsSent: number;
  lastAlertText: string | null;
  lastAnalysisText: string | null;
  lastCommentaryText: string | null;
}

export function createWatchState(
  fixtureId: number,
  label: string,
  gateCooldownSeconds = 30
): WatchState {
  return {
    fixtureId,
    label,
    startedAt: Date.now(),
    active: true,
    matchMeta: null,
    sourceUrls: { winamax: null },
    contextLoaded: false,
    recentForm: { home: null, away: null },
    h2h: null,
    lineups: [],
    knownEventIds: new Set(),
    knownCommentaryIds: new Set(),
    prevAdvice: null,
    prevScore: null,
    buffer: [],
    snapshots: [],
    commentary: [],
    lastFixture: null,
    lastStatistics: null,
    gate: new AlertGate(gateCooldownSeconds),
    lastApiPollAt: 0,
    lastWinamaxPollAt: 0,
    lastImmediateConfirmAt: 0,
    winamaxErrorCount: 0,
    sensors: {
      lastMarketSnapshot: null,
      recentMarketEvents: [],
      lineupSignals: [],
      contextSignals: [],
      altStats: null,
      knownMarketIds: new Set(),
      lastMarketPollAt: 0,
      lastLineupPollAt: 0,
      lastNewsPollAt: 0,
      lastAltStatsPollAt: 0,
      lastOddsBoard: null,
      lastOddsPollAt: 0,
    },
    lastAction: null,
    alertsSent: 0,
    lastAlertText: null,
    lastAnalysisText: null,
    lastCommentaryText: null,
  };
}

export class BotState {
  watches = new Map<number, WatchState>();
  startedAt = Date.now();
  lastApiPollAt: number | null = null;
  lastWinamaxPollAt: number | null = null;
  apiCallsUsedToday = 0;
  apiCallsDate = new Date().toISOString().slice(0, 10);
  /** Cooldown anti-doublon des alertes similaires (HIGH), configurable. */
  defaultGateCooldownSeconds = 30;

  /** Incrémente le compteur d'appels API du jour (reset auto chaque jour UTC). */
  bumpApi(n: number): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.apiCallsDate) {
      this.apiCallsDate = today;
      this.apiCallsUsedToday = 0;
    }
    this.apiCallsUsedToday += n;
  }

  startWatch(fixtureId: number, label: string): WatchState {
    const existing = this.watches.get(fixtureId);
    if (existing) {
      existing.active = true;
      return existing;
    }
    const w = createWatchState(fixtureId, label, this.defaultGateCooldownSeconds);
    this.watches.set(fixtureId, w);
    return w;
  }

  stopWatch(fixtureId: number): boolean {
    const w = this.watches.get(fixtureId);
    if (!w) return false;
    w.active = false;
    return true;
  }

  get(fixtureId: number): WatchState | undefined {
    return this.watches.get(fixtureId);
  }

  activeWatches(): WatchState[] {
    return [...this.watches.values()].filter((w) => w.active);
  }
}

export const botState = new BotState();
