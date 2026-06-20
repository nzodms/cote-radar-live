/**
 * Parser stats live alternatives (best-effort, public). Sert à la VALIDATION
 * CROISÉE avec l'API. Si contradiction => le fusion-engine baisse la confiance.
 */

import type { AltStatsSnapshot, AltTeamStats } from "../scraper-types";

function emptyTeam(): AltTeamStats {
  return { shots: null, shotsOnTarget: null, corners: null, possession: null, dangerousAttacks: null, xg: null };
}

/** Essaie JSON d'abord (API publique), sinon renvoie null. */
export function parseAltStats(input: string, source = "alt"): AltStatsSnapshot | null {
  try {
    const json = JSON.parse(input);
    const pick = (o: Record<string, unknown> | undefined): AltTeamStats => ({
      shots: numOrNull(o?.shots),
      shotsOnTarget: numOrNull(o?.shotsOnTarget ?? o?.sot),
      corners: numOrNull(o?.corners),
      possession: numOrNull(o?.possession),
      dangerousAttacks: numOrNull(o?.dangerousAttacks ?? o?.da),
      xg: numOrNull(o?.xg),
    });
    if (json && (json.home || json.away)) {
      return {
        minute: numOrNull(json.minute),
        home: pick(json.home),
        away: pick(json.away),
        source,
      };
    }
  } catch {
    /* pas du JSON: best-effort abandonné (renvoie null) */
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(",", ".").replace("%", ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export { emptyTeam as emptyAltTeam };
