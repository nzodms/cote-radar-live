/**
 * Contexte d'état de jeu (score + minute) pour piloter la logique betting live.
 * PUR (testable sans réseau).
 */

export type GamePhase =
  | "early_game"
  | "mid_first_half"
  | "halftime"
  | "early_second_half"
  | "key_window"
  | "late_game"
  | "final_minutes"
  | "stoppage_time";

export type GameSituation =
  | "favorite_leading"
  | "favorite_trailing"
  | "draw_late"
  | "two_goal_lead"
  | "chaotic_high_score"
  | "closed_low_score"
  | "market_chase_risk";

export interface GameStateContext {
  phase: GamePhase;
  minute: number;
  scoreHome: number;
  scoreAway: number;
  totalGoals: number;
  /** home - away */
  goalDiff: number;
  leader: "home" | "away" | null;
  situations: GameSituation[];
  /** minute >= 75 */
  isLate: boolean;
  /** minute >= 85 */
  isVeryLate: boolean;
  /** écart >= 2 buts ET fin de match : scénario quasiment plié */
  decided: boolean;
  /** un prochain but change encore quelque chose ET pas trop tard/volatil */
  scoreExploitableForNextGoal: boolean;
  label: string;
}

function classifyPhase(minute: number, isHalftime: boolean): GamePhase {
  if (isHalftime) return "halftime";
  if (minute >= 90) return "stoppage_time";
  if (minute >= 85) return "final_minutes";
  if (minute >= 75) return "late_game";
  if (minute >= 60) return "key_window";
  if (minute >= 45) return "early_second_half";
  if (minute >= 20) return "mid_first_half";
  return "early_game";
}

const PHASE_LABEL: Record<GamePhase, string> = {
  early_game: "début de match",
  mid_first_half: "première période",
  halftime: "mi-temps",
  early_second_half: "début de seconde période",
  key_window: "fenêtre clé (60-75e)",
  late_game: "fin de match",
  final_minutes: "dernières minutes",
  stoppage_time: "temps additionnel",
};

export function hasSituation(ctx: GameStateContext, s: GameSituation): boolean {
  return ctx.situations.includes(s);
}

export function getGameStateContext(
  scoreHome: number,
  scoreAway: number,
  minute: number,
  favoriteSide: "home" | "away" | null = null,
  isHalftime = false
): GameStateContext {
  const m = Number.isFinite(minute) ? Math.max(0, minute) : 0;
  const total = scoreHome + scoreAway;
  const diff = scoreHome - scoreAway;
  const leader = diff > 0 ? "home" : diff < 0 ? "away" : null;
  const phase = classifyPhase(m, isHalftime);

  const situations: GameSituation[] = [];
  if (favoriteSide && leader === favoriteSide) situations.push("favorite_leading");
  if (favoriteSide && leader && leader !== favoriteSide) situations.push("favorite_trailing");
  if (leader === null && m >= 70) situations.push("draw_late");
  if (Math.abs(diff) >= 2) situations.push("two_goal_lead");
  if (total >= 4 || (total >= 3 && scoreHome >= 1 && scoreAway >= 1 && m < 80)) situations.push("chaotic_high_score");
  if (total === 0 && m >= 60) situations.push("closed_low_score");
  // Risque de "chase" : on arrive en fin de match ou un écart de 2 buts s'installe tard.
  if (m >= 85 || (Math.abs(diff) >= 2 && m >= 75)) situations.push("market_chase_risk");

  const decided = Math.abs(diff) >= 2 && m >= 75;
  const scoreExploitableForNextGoal = Math.abs(diff) <= 1 && m < 80;

  const label = `${PHASE_LABEL[phase]}${leader ? `, ${leader === "home" ? "domicile" : "extérieur"} devant` : ", à égalité"}${
    Math.abs(diff) >= 2 ? ` (${Math.abs(diff)} buts d'écart)` : ""
  }`;

  return {
    phase,
    minute: m,
    scoreHome,
    scoreAway,
    totalGoals: total,
    goalDiff: diff,
    leader,
    situations,
    isLate: m >= 75,
    isVeryLate: m >= 85,
    decided,
    scoreExploitableForNextGoal,
    label,
  };
}
