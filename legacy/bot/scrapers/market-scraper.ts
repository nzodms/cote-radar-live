/**
 * Market scraper (best-effort, page PUBLIQUE uniquement, pas de login/anti-bot).
 * Récupère un snapshot de cotes; ne crashe jamais.
 */

import type { MarketSnapshot } from "../scraper-types";
import { parseMarketHtml } from "./market-parser";

export interface MarketFetchResult {
  snapshot: MarketSnapshot | null;
  error: string | null;
}

export async function fetchMarketSnapshot(url: string, minute: number | null = null): Promise<MarketFetchResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CoteRadarBot/1.0; public-page-only)",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { snapshot: null, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { snapshot: parseMarketHtml(html, minute), error: null };
  } catch (err) {
    return { snapshot: null, error: (err as Error).message };
  }
}
