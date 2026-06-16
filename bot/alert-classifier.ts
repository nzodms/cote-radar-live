/**
 * Classification d'alertes + anti-spam INTELLIGENT.
 *
 * Principe (corrigé): l'anti-spam évite le BRUIT et les DOUBLONS, il ne bloque
 * jamais une vraie grosse action.
 *  - CRITICAL  : envoi immédiat, AUCUN cooldown bloquant. Seul l'événement exact
 *                déjà envoyé est dédupliqué.
 *  - HIGH      : envoyé s'il change/renforce l'analyse. Cooldown court (30s) sur
 *                une ANALYSE identique uniquement (un nouvel événement passe).
 *  - MEDIUM    : pas envoyé seul, bufferisé pour détecter des séquences.
 *  - LOW       : ignoré.
 */

import type { NormalizedEvent } from "@/types/match";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import type { AlertLevel, LiveAlert } from "./types";

export interface Classification {
  level: AlertLevel;
  kind: string;
}

/** Classe un événement API-Football normalisé. */
export function classifyApiEvent(e: NormalizedEvent): Classification {
  const type = (e.type ?? "").toLowerCase();
  const detail = (e.detail ?? "").toLowerCase();

  if (type === "goal") {
    if (detail.includes("missed")) return { level: "HIGH", kind: "penalty_missed" };
    if (detail.includes("penalty")) return { level: "CRITICAL", kind: "penalty_goal" };
    if (detail.includes("own")) return { level: "CRITICAL", kind: "own_goal" };
    return { level: "CRITICAL", kind: "goal" };
  }
  if (type === "var") return { level: "CRITICAL", kind: "var" };
  if (type === "card") {
    if (detail.includes("red") || detail.includes("second yellow")) {
      return { level: "CRITICAL", kind: "red_card" };
    }
    return { level: "MEDIUM", kind: "yellow_card" };
  }
  if (type === "subst") return { level: "MEDIUM", kind: "substitution" };
  return { level: "LOW", kind: "other" };
}

/** Classe un événement de source secondaire (commentaire public). */
export function classifyCommentaryEvent(e: ExternalCommentaryEvent): Classification {
  const title = `${e.rawTitle} ${e.rawDescription}`.toLowerCase();
  switch (e.eventType) {
    case "goal":
      return { level: "CRITICAL", kind: "goal" };
    case "card":
      if (title.includes("red") || title.includes("rouge")) return { level: "CRITICAL", kind: "red_card" };
      return { level: "MEDIUM", kind: "yellow_card" };
    case "injury":
      return { level: "HIGH", kind: "injury" };
    case "shot_on_target":
      return { level: "HIGH", kind: "shot_on_target" };
    case "save":
      return { level: "HIGH", kind: "save" };
    case "dangerous_attack":
      return { level: "HIGH", kind: "dangerous_attack" };
    case "substitution":
      if (/attaquant|striker|forward|offensif/.test(title)) return { level: "HIGH", kind: "offensive_sub" };
      return { level: "MEDIUM", kind: "substitution" };
    case "corner":
      return { level: "MEDIUM", kind: "corner" };
    case "shot_off_target":
      return { level: "MEDIUM", kind: "shot_off_target" };
    case "free_kick":
      return { level: "MEDIUM", kind: "free_kick" };
    default:
      return { level: "LOW", kind: "other" };
  }
}

const ACTION_RANK: Record<string, number> = { AVOID: 0, WAIT: 0, WATCH: 1, SIGNAL: 2, INVALIDATED: 3 };

/** Classe une transition d'action de l'assistant. Renvoie null si non notable. */
export function classifyAdviceTransition(
  prevAction: string | null,
  currAction: string
): Classification | null {
  if (!prevAction || prevAction === currAction) return null;
  if (currAction === "INVALIDATED") return { level: "CRITICAL", kind: "signal_invalidated" };
  const prevRank = ACTION_RANK[prevAction] ?? 0;
  const currRank = ACTION_RANK[currAction] ?? 0;
  if (currRank > prevRank) return { level: "HIGH", kind: "advice_escalation" };
  return null;
}

/* ----------------------------- IDs stables ----------------------------- */

export function apiEventId(fixtureId: number, e: NormalizedEvent): string {
  return [
    "api",
    fixtureId,
    e.elapsed ?? "x",
    e.teamId ?? "x",
    (e.type ?? "").toLowerCase(),
    (e.detail ?? "").toLowerCase(),
    (e.playerName ?? "").toLowerCase(),
  ].join(":");
}

export function commentaryEventId(fixtureId: number, e: ExternalCommentaryEvent): string {
  const h = simpleHash(`${e.rawTitle}|${e.rawDescription}`);
  return ["sec", fixtureId, e.minute ?? "x", e.eventType, h].join(":");
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/* ----------------------------- Anti-spam gate ----------------------------- */

export interface GateDecision {
  send: boolean;
  reason: string;
}

export class AlertGate {
  private sentIds = new Set<string>();
  private sigTs = new Map<string, number>();
  private highCooldownMs: number;

  constructor(highCooldownSeconds = 30) {
    this.highCooldownMs = highCooldownSeconds * 1000;
  }

  decide(alert: LiveAlert, now = Date.now()): GateDecision {
    if (alert.level === "LOW") return { send: false, reason: "LOW ignoré" };
    // Anti-doublon EXACT (même événement) — s'applique à tous les niveaux.
    if (this.sentIds.has(alert.dedupId)) {
      return { send: false, reason: "doublon exact (même événement déjà envoyé)" };
    }
    if (alert.level === "MEDIUM") {
      return { send: false, reason: "MEDIUM seul: bufferisé pour séquence" };
    }
    if (alert.level === "CRITICAL") {
      // Aucun cooldown bloquant pour CRITICAL.
      return { send: true, reason: "CRITICAL: envoi immédiat" };
    }
    // HIGH: cooldown seulement si l'ANALYSE est identique et récente.
    const prevTs = this.sigTs.get(alert.signature);
    if (prevTs !== undefined && now - prevTs < this.highCooldownMs) {
      return {
        send: false,
        reason: `HIGH: même analyse récente (cooldown ${this.highCooldownMs / 1000}s)`,
      };
    }
    return { send: true, reason: "HIGH: envoyé (change/renforce l'analyse)" };
  }

  markSent(alert: LiveAlert, now = Date.now()): void {
    this.sentIds.add(alert.dedupId);
    this.sigTs.set(alert.signature, now);
  }

  alreadySent(dedupId: string): boolean {
    return this.sentIds.has(dedupId);
  }
}
