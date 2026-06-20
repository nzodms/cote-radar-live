/**
 * Parser compositions / blessures (best-effort, public). Transforme du texte en
 * LineupSignal structurés. Aucune donnée personnelle, pas de republication.
 */

import type { LineupSignal } from "../scraper-types";

export function parseLineupInjury(text: string, homeName: string, awayName: string): LineupSignal[] {
  const out: LineupSignal[] = [];
  const lines = text
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 4 && l.length <= 200);

  const team = (l: string): string | null => {
    const low = l.toLowerCase();
    if (homeName && low.includes(homeName.toLowerCase())) return homeName;
    if (awayName && low.includes(awayName.toLowerCase())) return awayName;
    return null;
  };

  const seen = new Set<string>();
  for (const l of lines) {
    const low = l.toLowerCase();
    let signal: LineupSignal | null = null;
    if (/\b(bless|injur|forfait|out\b|indisponible)/.test(low)) {
      signal = { teamName: team(l), signalType: "injury", playerName: null, impact: "high", summary: l.slice(0, 160) };
    } else if (/\b(suspendu|suspended|suspension)/.test(low)) {
      signal = { teamName: team(l), signalType: "suspension", playerName: null, impact: "medium", summary: l.slice(0, 160) };
    } else if (/\b(banc|bench|remplaç)/.test(low)) {
      signal = { teamName: team(l), signalType: "key_player_bench", playerName: null, impact: "medium", summary: l.slice(0, 160) };
    } else if (/\b(compo|composition|lineup|onze|starting xi|titulaires)/.test(low)) {
      signal = { teamName: team(l), signalType: "official_lineup", playerName: null, impact: "low", summary: l.slice(0, 160) };
    }
    if (signal && !seen.has(signal.summary)) {
      seen.add(signal.summary);
      out.push(signal);
    }
  }
  return out.slice(0, 12);
}
