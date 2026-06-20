/**
 * Types du worker Telegram.
 */

import type { NormalizedEvent } from "@/types/match";

export type AlertLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type AlertSource = "api" | "secondary";

/** Alerte candidate produite par le moteur live (avant passage par l'anti-spam). */
export interface LiveAlert {
  /** Identifiant unique de l'événement (anti-doublon exact). */
  dedupId: string;
  level: AlertLevel;
  source: AlertSource;
  /** Type technique: goal, red_card, shot_on_target, advice_transition, sequence... */
  kind: string;
  /** "Ce qui vient de se passer" (1-2 phrases). */
  whatHappened: string;
  /** Signature de l'analyse (score|action|marché) pour éviter de répéter la même lecture. */
  signature: string;
}

/** Évément offensif bufférisé pour la détection de séquences. */
export interface BufferedEvent {
  minute: number;
  team: "home" | "away" | null;
  kind: "shot" | "shot_on_target" | "corner" | "free_kick" | "other";
}

export interface DetectedSequence {
  type: string;
  team: "home" | "away" | null;
  label: string;
  windowStart: number;
  windowEnd: number;
  contributingMinutes: number[];
}

export interface ApiEventKey {
  event: NormalizedEvent;
  id: string;
}
