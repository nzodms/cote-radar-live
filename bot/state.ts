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
import { AlertGate } from "./alert-classifier";

export interface WatchState {
  fixtureId: number;
  label: string;
  startedAt: number;
  active: boolean;

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
  winamaxErrorCount: number;

  // Statut / sortie
  lastAction: string | null;
  alertsSent: number;
  lastAlertText: string | null;
  lastAnalysisText: string | null;
}

export function createWatchState(fixtureId: number, label: string): WatchState {
  return {
    fixtureId,
    label,
    startedAt: Date.now(),
    active: true,
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
    gate: new AlertGate(30),
    lastApiPollAt: 0,
    lastWinamaxPollAt: 0,
    winamaxErrorCount: 0,
    lastAction: null,
    alertsSent: 0,
    lastAlertText: null,
    lastAnalysisText: null,
  };
}

export class BotState {
  watches = new Map<number, WatchState>();
  startedAt = Date.now();
  lastApiPollAt: number | null = null;
  lastWinamaxPollAt: number | null = null;

  startWatch(fixtureId: number, label: string): WatchState {
    const existing = this.watches.get(fixtureId);
    if (existing) {
      existing.active = true;
      return existing;
    }
    const w = createWatchState(fixtureId, label);
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
