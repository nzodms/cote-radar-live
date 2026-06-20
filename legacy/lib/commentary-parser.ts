/**
 * Parser de commentaires live publics -> événements STRUCTURÉS.
 *
 * Important (conformité):
 *  - On NE republie JAMAIS de longs commentaires mot pour mot: on extrait une
 *    structure (minute, type, équipe, impact) et un titre court.
 *  - Aucune donnée personnelle. Aucune source protégée par login/captcha.
 */

import type { CommentaryEventType, ExternalCommentaryEvent } from "@/types/commentary";

export interface RawCommentaryItem {
  title: string;
  description?: string;
  minuteHint?: number | null;
}

interface Rule {
  type: CommentaryEventType;
  impact: ExternalCommentaryEvent["normalizedImpact"];
  patterns: RegExp[];
}

// Ordre = priorité (le premier match gagne).
const RULES: Rule[] = [
  { type: "goal", impact: "high", patterns: [/\bgoal\b/i, /\bbut\b/i, /\bscores?\b/i, /\bmarque\b/i] },
  { type: "injury", impact: "high", patterns: [/\binjur/i, /\bbless/i, /\bstretcher\b/i, /civi[èe]re/i] },
  { type: "card", impact: "medium", patterns: [/\b(red|yellow)\s+card\b/i, /\bcarton\b/i, /\bbooked\b/i] },
  { type: "substitution", impact: "low", patterns: [/\bsub(stitution)?\b/i, /\bremplac/i, /\bcomes? on\b/i] },
  { type: "save", impact: "medium", patterns: [/\bsave[sd]?\b/i, /\barr[êe]t\b/i, /\bdenied\b/i] },
  {
    type: "shot_on_target",
    impact: "medium",
    patterns: [/\bon target\b/i, /\bforces? a save\b/i, /\bcadr[ée]\b/i, /\btir cadr/i],
  },
  { type: "shot_off_target", impact: "low", patterns: [/\boff target\b/i, /\bwide\b/i, /\bover the bar\b/i, /\bnon cadr/i] },
  { type: "corner", impact: "low", patterns: [/\bcorner\b/i] },
  { type: "free_kick", impact: "low", patterns: [/\bfree[- ]?kick\b/i, /\bcoup franc\b/i] },
  { type: "dangerous_attack", impact: "medium", patterns: [/\bdangerous\b/i, /\bgreat chance\b/i, /\bgrosse occasion\b/i, /\bbreak(s|ing)? (forward|away)\b/i] },
];

function classify(text: string): { type: CommentaryEventType; impact: ExternalCommentaryEvent["normalizedImpact"] } {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { type: rule.type, impact: rule.impact };
    }
  }
  return { type: "unknown", impact: "low" };
}

function extractMinute(text: string, hint?: number | null): number | null {
  if (typeof hint === "number") return hint;
  const m = text.match(/(\d{1,3})\s*['’´]/) || text.match(/\bminute\s+(\d{1,3})\b/i) || text.match(/\b(\d{1,3})\s*(?:e|ème|th)?\s*min/i);
  if (m) {
    const v = Number.parseInt(m[1], 10);
    if (Number.isFinite(v) && v >= 0 && v <= 130) return v;
  }
  return null;
}

function detectTeam(text: string, homeTeamName: string, awayTeamName: string): string | null {
  const lower = text.toLowerCase();
  if (homeTeamName && lower.includes(homeTeamName.toLowerCase())) return homeTeamName;
  if (awayTeamName && lower.includes(awayTeamName.toLowerCase())) return awayTeamName;
  return null;
}

/** Titre court borné (jamais un long copier-coller). */
function shortTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
}

export function parseCommentaryItem(
  item: RawCommentaryItem,
  homeTeamName: string,
  awayTeamName: string
): ExternalCommentaryEvent {
  const text = `${item.title} ${item.description ?? ""}`;
  const { type, impact } = classify(text);
  return {
    minute: extractMinute(text, item.minuteHint),
    timeLabel: null,
    teamName: detectTeam(text, homeTeamName, awayTeamName),
    playerName: null,
    eventType: type,
    rawTitle: shortTitle(item.title),
    rawDescription: shortTitle(item.description ?? ""),
    normalizedImpact: impact,
  };
}

export function parseCommentaryFeed(
  items: RawCommentaryItem[],
  homeTeamName: string,
  awayTeamName: string
): ExternalCommentaryEvent[] {
  if (!Array.isArray(items)) return [];
  return items.map((i) => parseCommentaryItem(i, homeTeamName, awayTeamName));
}
