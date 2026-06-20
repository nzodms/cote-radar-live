/**
 * Parser news / contexte (best-effort, public). Transforme des titres en
 * ContextSignal courts. Ne republie pas de longs contenus.
 */

import type { ContextSignal, Impact } from "../scraper-types";

interface Rule {
  type: ContextSignal["signalType"];
  impact: Impact;
  re: RegExp;
}

const RULES: Rule[] = [
  { type: "pressure", impact: "high", re: /\b(must[- ]win|qualif|élimin|pression|decisive|décisif)/i },
  { type: "rotation", impact: "medium", re: /\b(rotation|turnover|remanié|repos|tourné)/i },
  { type: "fatigue", impact: "medium", re: /\b(fatigue|tired|usé|enchaîn|calendrier)/i },
  { type: "motivation", impact: "medium", re: /\b(motiv|revanche|fierté|jouer crânement)/i },
  { type: "injury_context", impact: "medium", re: /\b(bless|injur|absent|forfait)/i },
  { type: "tactical_hint", impact: "low", re: /\b(tactique|formation|système|dispositif|bloc bas)/i },
  { type: "morale", impact: "low", re: /\b(moral|confiance|série|dynamique|crise)/i },
];

export function parseNewsContext(
  titles: string[],
  homeName: string,
  awayName: string
): ContextSignal[] {
  const out: ContextSignal[] = [];
  const seen = new Set<string>();
  for (const raw of titles) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t.length < 6 || t.length > 220) continue;
    const low = t.toLowerCase();
    const teamName =
      homeName && low.includes(homeName.toLowerCase())
        ? homeName
        : awayName && low.includes(awayName.toLowerCase())
        ? awayName
        : null;
    for (const rule of RULES) {
      if (rule.re.test(t)) {
        const key = `${rule.type}:${t.slice(0, 60)}`;
        if (seen.has(key)) break;
        seen.add(key);
        out.push({
          teamName,
          signalType: rule.type,
          impact: rule.impact,
          summary: t.slice(0, 180),
          confidence: rule.impact === "high" ? "medium" : "low",
        });
        break;
      }
    }
  }
  return out.slice(0, 10);
}
