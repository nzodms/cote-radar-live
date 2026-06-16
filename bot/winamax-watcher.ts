/**
 * Watcher source secondaire (Winamax / commentaires publics).
 *
 * CONFORMITÉ (strict):
 *  - Page PUBLIQUE uniquement, pas de login, pas de captcha, pas de contournement.
 *  - On ne republie pas de longs commentaires: on extrait une structure courte.
 *  - Source SECONDAIRE: déclenche une analyse rapide mais ne décide jamais seule
 *    (action plafonnée à WATCH côté affichage, confirmation API ensuite).
 *
 * Best-effort: si la page est rendue côté client (SPA), le HTML peut ne rien
 * contenir d'exploitable -> on renvoie [] sans planter.
 */

import type { ExternalCommentaryEvent } from "@/types/commentary";
import { parseCommentaryFeed, type RawCommentaryItem } from "@/lib/commentary-parser";

const KEYWORDS =
  /\b(but|goal|corner|tir|shot|cadr|on target|carton|card|rouge|red|jaune|yellow|penalty|coup\s?franc|free\s?kick|arr[êe]t|save|remplac|substitu|bless|injur|hors-?jeu|offside|occasion|chance|dangereu)/i;

/** Extrait des items courts depuis du HTML (pure, testable). */
export function extractCommentaryItems(html: string): RawCommentaryItem[] {
  if (!html) return [];
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = withoutScripts
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

  const seen = new Set<string>();
  const items: RawCommentaryItem[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 4 || line.length > 200) continue;
    if (!KEYWORDS.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    const minuteHint = extractMinute(line);
    items.push({ title: line, minuteHint });
  }
  // On garde les plus récents (souvent en haut des fils live).
  return items.slice(0, 25);
}

function extractMinute(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*['’´]/) || text.match(/\b(\d{1,3})\s*(?:e|ème|th)?\s*min/i);
  if (m) {
    const v = Number.parseInt(m[1], 10);
    if (Number.isFinite(v) && v >= 0 && v <= 130) return v;
  }
  return null;
}

export interface WinamaxFetchResult {
  events: ExternalCommentaryEvent[];
  error: string | null;
}

export async function fetchWinamaxCommentary(
  url: string,
  homeName: string,
  awayName: string
): Promise<WinamaxFetchResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; CoteRadarBot/1.0; analyse informative; +public-page-only)",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { events: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    const items = extractCommentaryItems(html);
    const events = parseCommentaryFeed(items, homeName, awayName);
    return { events, error: null };
  } catch (err) {
    return { events: [], error: (err as Error).message };
  }
}
