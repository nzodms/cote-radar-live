/**
 * Couche OPTIONNELLE d'ingestion de commentaires live publics (source secondaire).
 *
 * ⚠️ CONFORMITÉ / ÉTHIQUE (V1 = DÉSACTIVÉ par défaut):
 *  - Source principale = API-Football. Cette couche ne fait qu'ENRICHIR.
 *  - Ne JAMAIS contourner login / captcha / protection anti-bot.
 *  - Ne JAMAIS récupérer de données personnelles.
 *  - Ne JAMAIS spammer une source (respecter PUBLIC_COMMENTARY_REFRESH_INTERVAL_SECONDS).
 *  - Ne JAMAIS republier de longs commentaires mot pour mot (on structure).
 *  - Si la source contredit l'API => non utilisée pour un signal fort.
 *
 * En V1, `ingestPublicLiveCommentary` ne réalise AUCUN scraping: il renvoie un
 * résultat "désactivé" propre. Le branchement d'une vraie source publique
 * (page accessible sans compte, conditions d'utilisation respectées) se fera
 * plus tard, en passant des `rawItems` déjà récupérés légitimement à
 * `buildCommentaryResultFromRawItems`.
 */

import type { ExternalCommentaryResult, IngestCommentaryInput } from "@/types/commentary";
import { parseCommentaryFeed, type RawCommentaryItem } from "../commentary-parser";
import { validateAgainstPrimary } from "../source-validation";

export function isPublicCommentaryEnabled(): boolean {
  return (process.env.ENABLE_PUBLIC_COMMENTARY_INGESTION ?? "false").toLowerCase() === "true";
}

export function getCommentaryRefreshIntervalSeconds(): number {
  const raw = Number.parseInt(process.env.PUBLIC_COMMENTARY_REFRESH_INTERVAL_SECONDS ?? "120", 10);
  return Number.isFinite(raw) && raw >= 60 ? raw : 120;
}

/**
 * Point d'entrée. En V1 (désactivé), renvoie un résultat vide mais valide.
 * Ne fait aucun appel réseau vers une source tierce.
 */
export async function ingestPublicLiveCommentary(
  input: IngestCommentaryInput
): Promise<ExternalCommentaryResult> {
  const collectedAt = new Date().toISOString();

  if (!isPublicCommentaryEnabled()) {
    return {
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      collectedAt,
      isValidAgainstPrimarySource: true,
      validationWarnings: [
        "Ingestion de commentaires publics désactivée (ENABLE_PUBLIC_COMMENTARY_INGESTION=false).",
      ],
      events: [],
    };
  }

  // Activé: on NE scrape toujours pas automatiquement une source tierce ici.
  // L'architecture attend des `rawItems` fournis légitimement (cf. fonction
  // ci-dessous). Tant qu'aucune source conforme n'est branchée, on renvoie vide.
  return {
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    collectedAt,
    isValidAgainstPrimarySource: true,
    validationWarnings: [
      "Aucune source publique conforme branchée: brancher une source via buildCommentaryResultFromRawItems().",
    ],
    events: [],
  };
}

/**
 * Construit un résultat structuré à partir d'items déjà récupérés légitimement.
 * Sépare la logique de parsing/validation de toute récupération réseau.
 */
export function buildCommentaryResultFromRawItems(
  input: IngestCommentaryInput,
  rawItems: RawCommentaryItem[]
): ExternalCommentaryResult {
  const collectedAt = new Date().toISOString();
  const events = parseCommentaryFeed(rawItems, input.homeTeamName, input.awayTeamName);

  const latestMinute = events.reduce<number | null>((acc, e) => {
    if (e.minute === null) return acc;
    return acc === null ? e.minute : Math.max(acc, e.minute);
  }, null);

  const validation = validateAgainstPrimary(
    {
      scoreHome: input.currentApiFootballScore.home,
      scoreAway: input.currentApiFootballScore.away,
      elapsed: input.currentApiFootballElapsed,
    },
    events,
    latestMinute
  );

  return {
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    collectedAt,
    isValidAgainstPrimarySource: validation.isValid,
    validationWarnings: validation.warnings,
    events,
  };
}
