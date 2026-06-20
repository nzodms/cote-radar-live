/**
 * News/Context scraper (best-effort, public). Plusieurs URLs possibles. Disabled-safe.
 */

import type { ContextSignal } from "../scraper-types";
import { parseNewsContext } from "./news-context-parser";

export function extractTitles(html: string): string[] {
  const titles: string[] = [];
  const tagRe = /<(title|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const t = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) titles.push(t);
  }
  return titles.slice(0, 40);
}

export async function fetchNewsContext(
  urls: string[],
  homeName: string,
  awayName: string
): Promise<{ signals: ContextSignal[]; error: string | null }> {
  const titles: string[] = [];
  let error: string | null = null;
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; CoteRadarBot/1.0; public-page-only)", accept: "text/html" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        error = `HTTP ${res.status}`;
        continue;
      }
      titles.push(...extractTitles(await res.text()));
    } catch (err) {
      error = (err as Error).message;
    }
  }
  return { signals: parseNewsContext(titles, homeName, awayName), error };
}
