/**
 * Types pour la couche OPTIONNELLE de commentaires live publics (source secondaire).
 *
 * Règles strictes:
 *  - Source principale = API-Football. La source secondaire ne fait qu'ENRICHIR.
 *  - Ne jamais déclencher un signal FORT uniquement sur la source secondaire.
 *  - Si la source secondaire contredit l'API, on ne l'utilise pas pour un signal.
 */

export type CommentaryEventType =
  | "goal"
  | "shot_on_target"
  | "shot_off_target"
  | "corner"
  | "free_kick"
  | "injury"
  | "card"
  | "substitution"
  | "save"
  | "dangerous_attack"
  | "unknown";

export interface ExternalCommentaryEvent {
  minute: number | null;
  timeLabel: string | null;
  teamName: string | null;
  playerName: string | null;
  eventType: CommentaryEventType;
  /** Titre brut (court). On ne republie jamais de longs commentaires mot pour mot. */
  rawTitle: string;
  /** Description courte normalisée (jamais un copier-coller long). */
  rawDescription: string;
  normalizedImpact: "low" | "medium" | "high";
}

export interface ExternalCommentaryResult {
  sourceName: string;
  sourceUrl: string;
  collectedAt: string;
  /** true si cohérent avec l'API-Football (score/minute). */
  isValidAgainstPrimarySource: boolean;
  validationWarnings: string[];
  events: ExternalCommentaryEvent[];
}

export interface IngestCommentaryInput {
  fixtureId: number;
  sourceName: string;
  sourceUrl: string;
  homeTeamName: string;
  awayTeamName: string;
  currentApiFootballScore: { home: number | null; away: number | null };
  currentApiFootballElapsed: number | null;
}
