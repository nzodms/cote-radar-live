/**
 * Lineup/Injury scraper (best-effort, public, sans login). Disabled-safe.
 */

import type { LineupSignal } from "../scraper-types";
import { parseLineupInjury } from "./lineup-injury-parser";

export async function fetchLineupInjury(
  url: string,
  homeName: string,
  awayName: string
): Promise<{ signals: LineupSignal[]; error: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; CoteRadarBot/1.0; public-page-only)", accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { signals: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    return { signals: parseLineupInjury(html, homeName, awayName), error: null };
  } catch (err) {
    return { signals: [], error: (err as Error).message };
  }
}
