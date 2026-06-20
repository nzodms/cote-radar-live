/**
 * Alt Live Stats scraper (optionnel, désactivé par défaut). Source publique de
 * stats live pour validation croisée avec l'API. Disabled-safe.
 */

import type { AltStatsSnapshot } from "../scraper-types";
import { parseAltStats } from "./alt-live-stats-parser";

export async function fetchAltStats(
  url: string
): Promise<{ snapshot: AltStatsSnapshot | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; CoteRadarBot/1.0; public-page-only)", accept: "application/json,text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { snapshot: null, error: `HTTP ${res.status}` };
    return { snapshot: parseAltStats(await res.text(), url), error: null };
  } catch (err) {
    return { snapshot: null, error: (err as Error).message };
  }
}
