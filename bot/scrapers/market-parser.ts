/**
 * Parser marché (best-effort, source publique uniquement).
 * Transforme du texte/HTML en MarketSnapshot structuré (sélections + suspension).
 * Aucune republication de contenu: on extrait seulement des cotes/états.
 */

import type { MarketSelection, MarketSnapshot } from "../scraper-types";

const SUSPENDED_RE = /\b(suspendu|suspended|indispo|ferm[ée]|locked|verrouill)/i;

const SELECTION_RE =
  /\b(home|domicile|away|ext[ée]rieur|draw|nul|over\s?\d(?:[.,]\d)?|under\s?\d(?:[.,]\d)?|btts|yes|no|1|x|2)\b[^0-9]{0,12}(\d{1,2}[.,]\d{1,2})/gi;

function normSelection(raw: string): { market: string; selection: string } {
  const s = raw.toLowerCase();
  if (/over/.test(s)) return { market: "over_under", selection: s.replace(/\s+/g, "_") };
  if (/under/.test(s)) return { market: "over_under", selection: s.replace(/\s+/g, "_") };
  if (/home|domicile|^1$/.test(s)) return { market: "match_winner", selection: "home" };
  if (/away|ext|^2$/.test(s)) return { market: "match_winner", selection: "away" };
  if (/draw|nul|^x$/.test(s)) return { market: "match_winner", selection: "draw" };
  if (/btts|yes|no/.test(s)) return { market: "btts", selection: s };
  return { market: "unknown", selection: s };
}

export function parseMarketText(text: string, minute: number | null = null): MarketSnapshot {
  const suspended = SUSPENDED_RE.test(text);
  const selections: MarketSelection[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  SELECTION_RE.lastIndex = 0;
  while ((m = SELECTION_RE.exec(text)) !== null) {
    const odd = Number.parseFloat(m[2].replace(",", "."));
    if (!Number.isFinite(odd) || odd <= 1 || odd > 100) continue;
    const { market, selection } = normSelection(m[1]);
    const key = `${market}:${selection}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selections.push({ market, selection, odd });
  }
  return { minute, suspended, selections, collectedAt: new Date().toISOString() };
}

export function parseMarketHtml(html: string, minute: number | null = null): MarketSnapshot {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
  return parseMarketText(text, minute);
}
