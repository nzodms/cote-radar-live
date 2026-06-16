/**
 * Couche d'accès à une API de cotes (optionnelle).
 *
 * Règle d'or : si aucune API de cotes n'est configurée (ou échec réseau), on
 * continue SANS planter. On ne parle alors JAMAIS de "value confirmée" et le
 * moteur live ne propose que WATCH/WAIT (jamais de PLAYABLE fort).
 *
 * Providers supportés :
 *  - "api-football" : réutilise l'endpoint /odds d'API-Football (clé APISPORTS).
 *  - autre / absent : tentative best-effort sinon indisponible propre.
 */

import { getOdds } from "@/lib/api-football";
import type { AfOdds } from "@/types/api-football";
import type { RawOddsResult, RawOddsSelection } from "./odds-normalizer";

export interface OddsApiConfig {
  enabled: boolean;
  provider: string | null;
  apiKey: string | null;
  pollSeconds: number;
}

function int(v: string | undefined, d: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/** Lit la config de l'API cotes depuis l'environnement. */
export function getOddsApiConfig(): OddsApiConfig {
  return {
    enabled: (process.env.ENABLE_ODDS_API ?? "").toLowerCase() === "true",
    provider: (process.env.ODDS_API_PROVIDER || "").trim() || null,
    apiKey: process.env.ODDS_API_KEY || null,
    pollSeconds: int(process.env.ODDS_POLL_INTERVAL_SECONDS, 20),
  };
}

/** Résultat "indisponible" homogène. */
function unavailable(reason: string): RawOddsResult {
  return { available: false, reason, bookmaker: null, fetchedAt: new Date().toISOString(), suspended: false, selections: [] };
}

/** Aplati une réponse AfOdds[] en sélections brutes (PUR). */
export function flattenApiFootballOdds(raw: AfOdds[]): RawOddsResult {
  if (!raw || raw.length === 0) return unavailable("Aucune cote renvoyée par API-Football.");
  const block = raw[0];
  const bm = block.bookmakers?.[0] ?? null;
  const selections: RawOddsSelection[] = [];
  for (const bet of bm?.bets ?? []) {
    for (const v of bet.values ?? []) {
      const odd = Number.parseFloat(v.odd);
      if (!Number.isFinite(odd)) continue;
      selections.push({ market: bet.name ?? "", selection: v.value ?? "", odd });
    }
  }
  if (selections.length === 0) return unavailable("Cotes API-Football vides ou non exploitables.");
  return {
    available: true,
    reason: null,
    bookmaker: bm?.name ?? null,
    fetchedAt: block.update || new Date().toISOString(),
    suspended: false,
    selections,
  };
}

/**
 * Récupère les cotes pour un match. Best-effort : ne lève jamais, renvoie un
 * résultat "indisponible" en cas de souci.
 */
export async function fetchLiveOdds(
  fixtureId: number,
  config: OddsApiConfig = getOddsApiConfig()
): Promise<RawOddsResult> {
  if (!config.enabled) return unavailable("API cotes désactivée (ENABLE_ODDS_API=false) : cotes live non disponibles.");

  const provider = (config.provider ?? "api-football").toLowerCase();

  if (provider === "api-football") {
    try {
      const raw = await getOdds(fixtureId);
      return flattenApiFootballOdds(raw);
    } catch (err) {
      return unavailable(`Cotes API-Football non récupérées (${(err as Error).message}).`);
    }
  }

  // Provider générique non implémenté en dur : on n'invente rien.
  if (!config.apiKey) return unavailable(`ODDS_API_KEY absente pour le provider "${provider}".`);
  return unavailable(`Provider de cotes "${provider}" non pris en charge : cotes live non disponibles.`);
}
