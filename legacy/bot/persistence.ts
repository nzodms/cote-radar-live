/**
 * État persistant local (data/state.json). Permet au worker de redémarrer sans
 * repartir de zéro ni re-spammer les mêmes événements/alertes.
 *
 * Stocke: lastFixture, lastAdvice, seenWinamaxEventIds (+ seen API), lastAlerts,
 * apiCallsUsedToday, lastApiPollAt, lastWinamaxPollAt.
 */

import fs from "node:fs";
import path from "node:path";
import type { NormalizedFixture } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";
import type { BotState, MatchMeta } from "./state";

interface PersistedWatch {
  fixtureId: number;
  label: string;
  matchMeta: MatchMeta | null;
  sourceUrls: { winamax: string | null };
  lastFixture: NormalizedFixture | null;
  lastAction: string | null;
  lastAdvice: LiveBettingAdvice | null;
  lastCommentaryText: string | null;
  lastAlertText: string | null;
  seenWinamaxEventIds: string[];
  seenApiEventIds: string[];
  lastAlerts: string[];
  alertsSent: number;
}

export interface PersistedState {
  version: number;
  date: string;
  apiCallsUsedToday: number;
  lastApiPollAt: number;
  lastWinamaxPollAt: number;
  watches: PersistedWatch[];
}

export function loadPersisted(filePath: string): PersistedState | null {
  try {
    const p = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(p)) return null;
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as PersistedState;
    return json && Array.isArray(json.watches) ? json : null;
  } catch {
    return null;
  }
}

export function savePersisted(filePath: string, state: PersistedState): void {
  try {
    const p = path.resolve(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch (err) {
    console.warn("[persistence] échec d'écriture:", (err as Error).message);
  }
}

/** Construit l'objet persistable depuis l'état mémoire. */
export function buildPersisted(state: BotState): PersistedState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1,
    date: today,
    apiCallsUsedToday: state.apiCallsUsedToday,
    lastApiPollAt: state.lastApiPollAt ?? 0,
    lastWinamaxPollAt: state.lastWinamaxPollAt ?? 0,
    watches: [...state.watches.values()].map((w) => ({
      fixtureId: w.fixtureId,
      label: w.label,
      matchMeta: w.matchMeta,
      sourceUrls: w.sourceUrls,
      lastFixture: w.lastFixture,
      lastAction: w.lastAction,
      lastAdvice: w.prevAdvice,
      lastCommentaryText: w.lastCommentaryText,
      lastAlertText: w.lastAlertText,
      seenWinamaxEventIds: [...w.knownCommentaryIds].slice(-500),
      seenApiEventIds: [...w.knownEventIds].slice(-500),
      lastAlerts: w.gate.sentSnapshot().slice(-500),
      alertsSent: w.alertsSent,
    })),
  };
}

/** Réhydrate l'état mémoire depuis la persistance (anti re-spam au redémarrage). */
export function applyPersisted(state: BotState, persisted: PersistedState): void {
  const today = new Date().toISOString().slice(0, 10);
  state.apiCallsDate = persisted.date;
  state.apiCallsUsedToday = persisted.date === today ? persisted.apiCallsUsedToday : 0;
  state.lastApiPollAt = persisted.lastApiPollAt || null;
  state.lastWinamaxPollAt = persisted.lastWinamaxPollAt || null;

  for (const pw of persisted.watches) {
    // Ne pas réactiver un match terminé (ex: Iran/NZ de test).
    const finished =
      pw.lastFixture?.phase === "finished" || pw.matchMeta?.status === "finished";
    if (finished) continue;

    const w = state.startWatch(pw.fixtureId, pw.label);
    w.matchMeta = pw.matchMeta ?? null;
    w.sourceUrls = pw.sourceUrls ?? { winamax: null };
    w.lastFixture = pw.lastFixture;
    w.lastAction = pw.lastAction;
    w.prevAdvice = pw.lastAdvice;
    w.lastCommentaryText = pw.lastCommentaryText ?? null;
    w.lastAlertText = pw.lastAlertText ?? null;
    if (pw.lastFixture) {
      w.prevScore = { h: pw.lastFixture.homeGoals ?? 0, a: pw.lastFixture.awayGoals ?? 0 };
    }
    for (const id of pw.seenWinamaxEventIds) w.knownCommentaryIds.add(id);
    for (const id of pw.seenApiEventIds) w.knownEventIds.add(id);
    w.gate.seed(pw.lastAlerts);
    w.alertsSent = pw.alertsSent ?? 0;
  }
}
