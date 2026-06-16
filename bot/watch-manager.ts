/**
 * Watch manager multi-match. Démarre/arrête des sessions scopées par fixtureId,
 * en s'appuyant sur l'état (déjà indexé par fixtureId).
 */

import type { BotConfig } from "./config";
import type { BotState, WatchState } from "./state";
import type { ResolvedMatch } from "./match-resolver";
import { winamaxUrlForFixture } from "./bookmaker-links";

export function startWatchForMatch(state: BotState, config: BotConfig, match: ResolvedMatch): WatchState {
  const label = `${match.homeTeam} vs ${match.awayTeam}`;
  const w = state.startWatch(match.fixtureId, label);
  w.label = label;
  w.matchMeta = {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    status: match.status,
    date: match.date,
    venue: match.venue,
    round: match.round,
  };
  w.sourceUrls = { winamax: winamaxUrlForFixture(match.fixtureId) };
  w.lastApiPollAt = 0; // poll immédiat au prochain tick
  return w;
}

export function stopWatchByFixture(state: BotState, fixtureId: number): boolean {
  return state.stopWatch(fixtureId);
}

export function activeWatchCount(state: BotState): number {
  return state.activeWatches().length;
}

export function formatWatchStarted(config: BotConfig, match: ResolvedMatch): string {
  const commentary =
    config.commentary.enabled && config.commentary.url
      ? `actif, ${config.commentary.pollSeconds}s`
      : "inactif (URL non configurée)";
  const market =
    config.market.enabled && config.market.url ? `actif, ${config.market.pollSeconds}s` : "inactif";
  return [
    `✅ Surveillance lancée — ${match.homeTeam} vs ${match.awayTeam}`,
    `Fixture : ${match.fixtureId}`,
    `API-Football : actif, ${config.apiPollSeconds}s`,
    `Commentaires : ${commentary}`,
    `Marché : ${market}`,
    `Source secondaire : à confirmer (sources secondaires seules = WATCH maximum)`,
    `Prochain check : ${config.apiPollSeconds}s`,
  ].join("\n");
}
