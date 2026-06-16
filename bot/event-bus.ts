/**
 * Event Bus interne: les scrapers publient des signaux, le fusion-engine
 * (et les logs) les consomment. Découple capteurs et cerveau.
 */

import type { ExternalCommentaryEvent } from "@/types/commentary";
import type {
  AltStatsSnapshot,
  ContextSignal,
  FusionApiSnapshot,
  LineupSignal,
  MarketEvent,
} from "./scraper-types";

export type BusEvent =
  | { type: "commentary_event"; fixtureId: number; payload: ExternalCommentaryEvent }
  | { type: "market_event"; fixtureId: number; payload: MarketEvent }
  | { type: "lineup_signal"; fixtureId: number; payload: LineupSignal }
  | { type: "context_signal"; fixtureId: number; payload: ContextSignal }
  | { type: "alt_stats_snapshot"; fixtureId: number; payload: AltStatsSnapshot }
  | { type: "api_snapshot"; fixtureId: number; payload: FusionApiSnapshot };

export type BusHandler = (e: BusEvent) => void;

export class EventBus {
  private handlers: BusHandler[] = [];

  on(handler: BusHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  emit(event: BusEvent): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (err) {
        console.warn("[event-bus] handler error:", (err as Error).message);
      }
    }
  }
}

export const eventBus = new EventBus();
