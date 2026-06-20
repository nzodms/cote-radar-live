/**
 * Détection de changements de match + politique d'alerte WhatsApp (anti-spam).
 *
 * detectMatchChanges() compare l'état précédent (depuis la base) à la fixture
 * fraîche pour décider quoi re-collecter. shouldSendWhatsAppAlert() décide si un
 * changement mérite une alerte (transition d'action, but, carton rouge, etc.).
 */

import type { NormalizedEvent, NormalizedFixture } from "@/types/match";
import type { LiveBettingAdvice } from "@/types/live-advice";

export interface MatchStateSnapshot {
  homeGoals: number | null;
  awayGoals: number | null;
  elapsed: number | null;
  statusShort: string | null;
}

export interface MatchChanges {
  scoreChanged: boolean;
  statusChanged: boolean;
  minuteAdvanced: boolean;
  importantChange: boolean;
  reason: string[];
}

const MINUTE_ADVANCE_THRESHOLD = 3;

export function detectMatchChanges(
  previous: MatchStateSnapshot | null,
  current: NormalizedFixture
): MatchChanges {
  // Première observation: on considère qu'il faut tout collecter.
  if (!previous) {
    return {
      scoreChanged: false,
      statusChanged: false,
      minuteAdvanced: true,
      importantChange: true,
      reason: ["première observation du match"],
    };
  }

  const reason: string[] = [];
  const scoreChanged =
    (previous.homeGoals ?? 0) !== (current.homeGoals ?? 0) ||
    (previous.awayGoals ?? 0) !== (current.awayGoals ?? 0);
  const statusChanged = (previous.statusShort ?? "") !== (current.statusShort ?? "");
  const minuteAdvanced =
    (current.elapsed ?? 0) - (previous.elapsed ?? 0) >= MINUTE_ADVANCE_THRESHOLD;

  if (scoreChanged) reason.push("score modifié");
  if (statusChanged) reason.push(`statut ${previous.statusShort} → ${current.statusShort}`);
  if (minuteAdvanced) reason.push("minute avancée");

  return {
    scoreChanged,
    statusChanged,
    minuteAdvanced,
    importantChange: scoreChanged || statusChanged,
    reason: reason.length > 0 ? reason : ["aucun changement notable"],
  };
}

/** Détecte un carton rouge récent dans la liste d'événements. */
export function hasRecentRedCard(events: NormalizedEvent[], currentElapsed: number, window = 4): boolean {
  return events.some(
    (e) =>
      (e.type ?? "").toLowerCase() === "card" &&
      (e.detail ?? "").toLowerCase().includes("red") &&
      e.elapsed !== null &&
      currentElapsed - (e.elapsed as number) <= window
  );
}

const ACTION_RANK: Record<string, number> = { AVOID: 0, WAIT: 0, WATCH: 1, SIGNAL: 2, INVALIDATED: 3 };

export interface AlertDecision {
  send: boolean;
  type: string | null;
  message: string | null;
  /** Empreinte pour l'anti-spam (alertes "similaires"). */
  signature: string;
}

export function shouldSendWhatsAppAlert(args: {
  fixture: NormalizedFixture;
  previousAdvice: LiveBettingAdvice | null;
  currentAdvice: LiveBettingAdvice;
  changes: MatchChanges;
  events: NormalizedEvent[];
}): AlertDecision {
  const { fixture, previousAdvice, currentAdvice, changes, events } = args;
  const prevAction = previousAdvice?.action ?? null;
  const currAction = currentAdvice.action;
  const elapsed = fixture.elapsed ?? 0;
  const score = `${fixture.homeGoals ?? 0}-${fixture.awayGoals ?? 0}`;
  const primary = currentAdvice.recommendedMarkets[0]?.label ?? "—";
  const signature = `${currAction}|${primary}|${score}`;

  const triggers: string[] = [];

  // Transitions d'action notables
  if (currAction === "INVALIDATED" && prevAction !== "INVALIDATED") triggers.push("signal invalidé");
  else if (prevAction && ACTION_RANK[currAction] > ACTION_RANK[prevAction]) {
    triggers.push(`montée ${prevAction} → ${currAction}`);
  }

  // Événements de match
  if (changes.scoreChanged) triggers.push("but");
  if (hasRecentRedCard(events, elapsed)) triggers.push("carton rouge");

  // Marché résolu (nouveau) — proxy via changement de score qui résout un marché
  const prevResolved = previousAdvice?.resolvedMarkets.length ?? 0;
  if (currentAdvice.resolvedMarkets.length > prevResolved) triggers.push("marché résolu");

  // Gros changement de momentum
  if (previousAdvice) {
    const prevDom = previousAdvice.momentum.dominantTeam;
    const currDom = currentAdvice.momentum.dominantTeam;
    if (prevDom !== currDom && currDom !== null) triggers.push("bascule de momentum");
  }

  if (triggers.length === 0) {
    return { send: false, type: null, message: null, signature };
  }

  const message = buildAlertMessage(fixture, currentAdvice, triggers);
  return { send: true, type: triggers.join(", "), message, signature };
}

function buildAlertMessage(
  fixture: NormalizedFixture,
  advice: LiveBettingAdvice,
  triggers: string[]
): string {
  const score = `${fixture.homeGoals ?? 0}-${fixture.awayGoals ?? 0}`;
  const min = fixture.elapsed !== null ? `${fixture.elapsed}'` : "";
  const primary = advice.recommendedMarkets[0];
  const head = `⚽ ${fixture.home.name} ${score} ${fixture.away.name} ${min} — ${advice.action}`;
  const why = `Changement: ${triggers.join(", ")}.`;
  const market = primary
    ? `À surveiller: ${primary.label} (signal ${primary.signal}). ${primary.requiredConfirmation}`
    : advice.whatIWouldDoNow;
  return `${head}\n${why}\n${market}\n— Analyse informative, aucune issue garantie. No bet sans cote.`;
}
