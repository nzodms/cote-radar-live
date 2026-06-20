/**
 * Liens bookmaker (Winamax) — boutons inline. Public uniquement.
 * V2: URL directe par fixture via WINAMAX_MATCH_URL_<fixtureId> ou WINAMAX_MATCH_URL.
 * V1 (fallback): bouton "Ouvrir Winamax Foot" + "Rechercher".
 */

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

const WINAMAX_FOOT_URL = "https://www.winamax.fr/paris-sportifs/sports/1";

/** URL directe configurée pour ce match, sinon null. */
export function winamaxUrlForFixture(fixtureId: number): string | null {
  const specific = process.env[`WINAMAX_MATCH_URL_${fixtureId}`];
  if (specific && specific.trim()) return specific.trim();
  const global = process.env.WINAMAX_MATCH_URL;
  if (global && global.trim()) return global.trim();
  return null;
}

/** Bouton Winamax: direct si URL configurée, sinon page Foot. Ne bloque jamais. */
export function winamaxButton(fixtureId: number): InlineButton {
  const url = winamaxUrlForFixture(fixtureId);
  if (url) return { text: "🔗 Winamax (match)", url };
  return { text: "🔗 Ouvrir Winamax Foot", url: WINAMAX_FOOT_URL };
}

/** Bouton de recherche (fallback) pour retrouver le match. */
export function winamaxSearchButton(homeTeam: string, awayTeam: string): InlineButton {
  const q = encodeURIComponent(`Winamax ${homeTeam} ${awayTeam} cotes`);
  return { text: "🔎 Rechercher le match", url: `https://duckduckgo.com/?q=${q}` };
}
