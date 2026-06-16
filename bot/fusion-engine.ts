/**
 * Fusion Engine — cerveau central multi-sources.
 *
 * Combine API (principale) + commentaires + marché + lineups + contexte + stats
 * alternatives pour décider: faut-il analyser/alerter maintenant, avec quelle
 * confiance, et un SIGNAL fort est-il permis.
 *
 * Règles clés:
 *  - SIGNAL fort => confirmation API OU >= 2 sources secondaires cohérentes.
 *  - Commentary seul / Market seul => WATCH maximum (pas de signal fort).
 *  - News seul => jamais de signal live.
 *  - Lineup seul => ajustement risque/contexte, pas un signal live.
 *  - Contradictions => baissent la confiance, interdisent le signal fort.
 *  - Événement CRITICAL => analyse immédiate.
 */

import { clamp } from "@/lib/utils";
import type { LiveBettingAdvice } from "@/types/live-advice";
import type { AlertLevel } from "./types";
import type {
  AltStatsSnapshot,
  ContextSignal,
  FusionApiSnapshot,
  LineupSignal,
  MarketEvent,
} from "./scraper-types";
import { SOURCE_WEIGHTS } from "./source-weighting";

export interface FusionCommentaryEvent {
  level: AlertLevel;
  kind: string;
  team: "home" | "away" | null;
}

export interface FusionInput {
  apiSnapshot: FusionApiSnapshot | null;
  commentaryEvents: FusionCommentaryEvent[];
  marketEvents: MarketEvent[];
  lineupSignals: LineupSignal[];
  contextSignals: ContextSignal[];
  altStatsSnapshot: AltStatsSnapshot | null;
  previousAdvice: LiveBettingAdvice | null;
}

export interface FusionResult {
  dominantTeam: string | null;
  momentumTeam: string | null;
  pressureType: "none" | "sterile" | "dangerous" | "transition_threat";
  sourceAgreement: {
    api: boolean;
    commentary: boolean;
    market: boolean;
    lineup: boolean;
    context: boolean;
    altStats: boolean;
  };
  confidence: "low" | "medium" | "high";
  urgency: "low" | "medium" | "high" | "critical";
  signalStrength: number;
  scenarioShift: string;
  contradictions: string[];
  shouldAnalyzeNow: boolean;
  shouldAlert: boolean;
  /** true si un SIGNAL fort est autorisé (API confirmée ou 2+ secondaires cohérentes). */
  strongSignalAllowed: boolean;
  reason: string;
}

function altPressureTeam(alt: AltStatsSnapshot): "home" | "away" | null {
  const w = (s: AltStatsSnapshot["home"]) =>
    (s.shotsOnTarget ?? 0) * 3 + (s.dangerousAttacks ?? 0) + (s.shots ?? 0);
  const h = w(alt.home);
  const a = w(alt.away);
  if (h > a && h > 0) return "home";
  if (a > h && a > 0) return "away";
  return null;
}

function nameToSide(name: string | null, api: FusionApiSnapshot): "home" | "away" | null {
  if (!name) return null;
  if (name === api.homeName) return "home";
  if (name === api.awayName) return "away";
  return null;
}

export function fuseSignals(input: FusionInput): FusionResult {
  const api = input.apiSnapshot;
  const commHigh = input.commentaryEvents.some((c) => c.level === "HIGH");
  const commCritical = input.commentaryEvents.some((c) => c.level === "CRITICAL");
  const marketActive = input.marketEvents.filter((m) => m.movement !== "stable");
  const marketSuspended = input.marketEvents.some((m) => m.movement === "suspended");
  const marketStrong = input.marketEvents.some((m) => m.impact === "HIGH" || m.impact === "CRITICAL");

  const sourceAgreement = {
    api: Boolean(api?.hasStats),
    commentary: input.commentaryEvents.length > 0,
    market: marketActive.length > 0,
    lineup: input.lineupSignals.length > 0,
    context: input.contextSignals.length > 0,
    altStats: Boolean(input.altStatsSnapshot),
  };

  const contradictions: string[] = [];

  // Contradiction stats alternatives vs API.
  if (api && input.altStatsSnapshot && api.pressureType === "dangerous") {
    const altSide = altPressureTeam(input.altStatsSnapshot);
    const apiSide = nameToSide(api.momentumTeam, api);
    if (altSide && apiSide && altSide !== apiSide) {
      contradictions.push("Sources contradictoires: stats alternatives ne confirment pas l'équipe qui pousse selon l'API.");
    }
  }
  // Marché qui dérive malgré domination apparente.
  if (api && api.pressureType === "dangerous" && input.marketEvents.some((m) => m.movement === "rise")) {
    contradictions.push("Le marché dérive malgré une domination apparente: prudence.");
  }

  const criticalEvent =
    Boolean(api?.criticalEvent) || commCritical || input.marketEvents.some((m) => m.impact === "CRITICAL");

  // Force du signal (pondérée).
  let strength = 0;
  if (api?.pressureType === "dangerous") strength += SOURCE_WEIGHTS.api_stats_trend;
  else if (api?.pressureType === "sterile") strength += 20;
  if (api?.criticalEvent) strength += SOURCE_WEIGHTS.api_goal;
  if (commCritical) strength += SOURCE_WEIGHTS.commentary_critical;
  else if (commHigh) strength += 40;
  if (marketSuspended) strength += SOURCE_WEIGHTS.market_suspension;
  else if (marketStrong) strength += SOURCE_WEIGHTS.market_strong_move;
  if (sourceAgreement.altStats && contradictions.length === 0) strength += SOURCE_WEIGHTS.alt_stats_trend;
  // lineup & news n'ajoutent pas de "force live" (risque/contexte uniquement).
  strength -= contradictions.length * 30;
  const signalStrength = clamp(Math.round(strength), 0, 200);

  // Nombre de sources secondaires cohérentes.
  const secondaryAligned = [
    sourceAgreement.commentary && (commHigh || commCritical),
    (marketStrong || marketSuspended) && contradictions.length === 0,
    sourceAgreement.altStats && contradictions.length === 0,
  ].filter(Boolean).length;

  // SIGNAL fort autorisé ?
  let strongSignalAllowed =
    (sourceAgreement.api && (api?.pressureType === "dangerous" || Boolean(api?.criticalEvent))) ||
    secondaryAligned >= 2;
  if (contradictions.length > 0) strongSignalAllowed = false;

  // Confiance.
  let confidence: FusionResult["confidence"] = "low";
  if (criticalEvent && contradictions.length === 0) confidence = "high";
  else if (strongSignalAllowed && contradictions.length === 0) confidence = "high";
  else if ((sourceAgreement.api && secondaryAligned >= 1) || secondaryAligned >= 2) confidence = "medium";
  else confidence = "low";
  if (contradictions.length > 0) confidence = confidence === "high" ? "medium" : "low";

  // Urgence.
  let urgency: FusionResult["urgency"] = "low";
  if (criticalEvent) urgency = "critical";
  else if (api?.pressureType === "dangerous" && (commHigh || marketStrong || marketSuspended)) urgency = "high";
  else if (commHigh || marketActive.length > 0 || api?.pressureType === "dangerous") urgency = "medium";

  const shouldAnalyzeNow =
    criticalEvent ||
    commHigh ||
    commCritical ||
    marketActive.some((m) => m.impact !== "LOW") ||
    api?.pressureType === "dangerous" ||
    contradictions.length > 0 ||
    input.lineupSignals.length > 0;

  const shouldAlert =
    criticalEvent ||
    confidence !== "low" ||
    commHigh ||
    marketStrong ||
    marketSuspended;

  // Scénario.
  const dominantTeam = api?.dominantTeam ?? null;
  const momentumTeam = api?.momentumTeam ?? null;
  const pressureType = api?.pressureType ?? "none";
  let scenarioShift: string;
  if (criticalEvent) scenarioShift = "Événement majeur: la lecture du match peut basculer.";
  else if (pressureType === "dangerous" && momentumTeam) scenarioShift = `${momentumTeam} met une pression réelle.`;
  else if (pressureType === "sterile" && dominantTeam) scenarioShift = `${dominantTeam} domine mais sans danger (domination stérile).`;
  else if (contradictions.length > 0) scenarioShift = "Signaux divergents entre les sources: prudence.";
  else scenarioShift = "Pas de bascule nette pour l'instant.";

  // Raison.
  const reasonParts: string[] = [];
  reasonParts.push(`confiance=${confidence}`, `urgence=${urgency}`, `force=${signalStrength}`);
  if (input.lineupSignals.length > 0) reasonParts.push("ajustement risque (lineups/blessures)");
  if (contradictions.length > 0) reasonParts.push("contradictions détectées");
  if (!strongSignalAllowed) reasonParts.push("signal fort non autorisé (besoin API ou 2+ sources cohérentes)");

  return {
    dominantTeam,
    momentumTeam,
    pressureType,
    sourceAgreement,
    confidence,
    urgency,
    signalStrength,
    scenarioShift,
    contradictions,
    shouldAnalyzeNow,
    shouldAlert,
    strongSignalAllowed,
    reason: reasonParts.join(" · "),
  };
}
