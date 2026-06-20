/**
 * Santé des sources (capteurs). Si une source échoue, on la passe en degraded/down
 * sans crasher le bot; les autres continuent.
 */

export type SourceStatus = "ok" | "degraded" | "down" | "disabled";

export interface SourceHealth {
  name: string;
  enabled: boolean;
  status: SourceStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  errorCount: number;
  avgLatencyMs: number;
  lastItems: number;
  lastImportant: number;
}

export class SourceHealthRegistry {
  private map = new Map<string, SourceHealth>();

  register(name: string, enabled: boolean): void {
    if (this.map.has(name)) {
      const h = this.map.get(name)!;
      h.enabled = enabled;
      if (!enabled) h.status = "disabled";
      return;
    }
    this.map.set(name, {
      name,
      enabled,
      status: enabled ? "ok" : "disabled",
      lastSuccessAt: null,
      lastErrorAt: null,
      errorCount: 0,
      avgLatencyMs: 0,
      lastItems: 0,
      lastImportant: 0,
    });
  }

  recordSuccess(name: string, latencyMs: number, items = 0, important = 0): void {
    const h = this.map.get(name);
    if (!h) return;
    h.status = "ok";
    h.errorCount = 0;
    h.lastSuccessAt = new Date().toISOString();
    h.avgLatencyMs = h.avgLatencyMs === 0 ? latencyMs : Math.round(h.avgLatencyMs * 0.7 + latencyMs * 0.3);
    h.lastItems = items;
    h.lastImportant = important;
  }

  recordError(name: string): void {
    const h = this.map.get(name);
    if (!h) return;
    h.errorCount += 1;
    h.lastErrorAt = new Date().toISOString();
    h.status = h.errorCount >= 3 ? "down" : "degraded";
  }

  get(name: string): SourceHealth | undefined {
    return this.map.get(name);
  }

  all(): SourceHealth[] {
    return [...this.map.values()];
  }
}

export const sourceHealth = new SourceHealthRegistry();
