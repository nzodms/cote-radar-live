/**
 * Analyse des fenêtres temporelles récentes (5 min, 10 min, depuis le dernier but).
 *
 * Principe: les statistiques API sont CUMULÉES. En conservant des snapshots
 * horodatés (avec la minute de jeu), on calcule les DELTAS sur une fenêtre =
 * (stats actuelles) - (stats au début de la fenêtre). On y ajoute les
 * événements (buts, cartons, changements) tombés dans la fenêtre.
 *
 * Si on n'a pas assez de snapshots (début d'adoption), la fenêtre se dégrade
 * proprement: hasData=false côté tirs/corners, mais les événements restent comptés.
 */

import type { NormalizedEvent, NormalizedTeamStats } from "@/types/match";
import type { StatsSnapshotPoint, WindowStats, WindowSummary } from "@/types/live-advice";

export interface WindowContext {
  current: { elapsed: number | null; home: NormalizedTeamStats; away: NormalizedTeamStats };
  snapshots: StatsSnapshotPoint[];
  events: NormalizedEvent[];
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
}

function delta(cur: number | null, base: number | null): number | null {
  if (cur === null || base === null) return null;
  return Math.max(0, cur - base);
}

function emptyWindowStats(): WindowStats {
  return {
    shots: null,
    shotsOnTarget: null,
    shotsOffTarget: null,
    corners: null,
    cards: 0,
    dangerousFreeKicks: 0,
    injuries: 0,
    substitutions: 0,
    goals: 0,
    offensiveEvents: 0,
  };
}

/** Trouve le snapshot de référence au début de la fenêtre (elapsed <= target). */
function findBaseline(
  snapshots: StatsSnapshotPoint[],
  targetMinute: number,
  currentElapsed: number
): StatsSnapshotPoint | null {
  const candidates = snapshots
    .filter((s) => s.elapsed !== null && (s.elapsed as number) < currentElapsed)
    .sort((a, b) => (a.elapsed as number) - (b.elapsed as number));
  if (candidates.length === 0) return null;

  let baseline: StatsSnapshotPoint | null = null;
  for (const s of candidates) {
    if ((s.elapsed as number) <= targetMinute) baseline = s;
  }
  // Pas de snapshot assez ancien => on prend le plus ancien disponible (fenêtre partielle).
  return baseline ?? candidates[0];
}

function countEventStats(
  events: NormalizedEvent[],
  teamId: number,
  fromMinute: number,
  toMinute: number
): Pick<WindowStats, "cards" | "substitutions" | "goals" | "offensiveEvents" | "dangerousFreeKicks" | "injuries"> {
  let cards = 0;
  let substitutions = 0;
  let goals = 0;
  let dangerousFreeKicks = 0;
  const injuries = 0;

  for (const e of events) {
    const el = e.elapsed;
    if (el === null) continue;
    if (el <= fromMinute || el > toMinute) continue;
    if (e.teamId !== teamId) continue;
    const type = (e.type ?? "").toLowerCase();
    const detail = (e.detail ?? "").toLowerCase();
    if (type === "goal" && !detail.includes("missed")) goals += 1;
    else if (type === "card") cards += 1;
    else if (type === "subst") substitutions += 1;
    if (detail.includes("free kick")) dangerousFreeKicks += 1;
  }

  const offensiveEvents = goals;
  return { cards, substitutions, goals, offensiveEvents, dangerousFreeKicks, injuries };
}

function buildWindowStats(
  label: WindowSummary["windowLabel"],
  fromMinute: number,
  toMinute: number,
  current: NormalizedTeamStats,
  baseline: NormalizedTeamStats | null,
  events: NormalizedEvent[],
  teamId: number
): WindowStats {
  const stats = emptyWindowStats();
  if (baseline) {
    stats.shots = delta(current.totalShots, baseline.totalShots);
    stats.shotsOnTarget = delta(current.shotsOnGoal, baseline.shotsOnGoal);
    stats.shotsOffTarget = delta(current.shotsOffGoal, baseline.shotsOffGoal);
    stats.corners = delta(current.cornerKicks, baseline.cornerKicks);
  }
  const ev = countEventStats(events, teamId, fromMinute, toMinute);
  stats.cards = ev.cards;
  stats.substitutions = ev.substitutions;
  stats.goals = ev.goals;
  stats.dangerousFreeKicks = ev.dangerousFreeKicks;
  stats.injuries = ev.injuries;
  // Événements offensifs = buts + tirs cadrés mesurés sur la fenêtre.
  stats.offensiveEvents = ev.goals + (stats.shotsOnTarget ?? 0);
  return stats;
}

function offensiveWeight(s: WindowStats): number {
  return (
    (s.goals ?? 0) * 5 +
    (s.shotsOnTarget ?? 0) * 3 +
    (s.shots ?? 0) * 1 +
    (s.corners ?? 0) * 2
  );
}

function isRealPressure(s: WindowStats): boolean {
  return (s.shotsOnTarget ?? 0) >= 1 || ((s.shots ?? 0) >= 2 && (s.corners ?? 0) >= 1) || (s.goals ?? 0) >= 1;
}

function buildWindow(
  label: WindowSummary["windowLabel"],
  windowMinutes: number | null,
  ctx: WindowContext
): WindowSummary {
  const currentElapsed = ctx.current.elapsed;
  const empty: WindowSummary = {
    windowLabel: label,
    fromMinute: null,
    toMinute: currentElapsed,
    home: emptyWindowStats(),
    away: emptyWindowStats(),
    momentumTeam: null,
    pressureTeam: null,
    summaryText: "Fenêtre indisponible (match non démarré ou données insuffisantes).",
    hasData: false,
  };
  if (currentElapsed === null || windowMinutes === null) return empty;

  const targetMinute = Math.max(0, currentElapsed - windowMinutes);
  const baseline = findBaseline(ctx.snapshots, targetMinute, currentElapsed);
  const fromMinute = baseline?.elapsed ?? targetMinute;

  const home = buildWindowStats(
    label,
    fromMinute,
    currentElapsed,
    ctx.current.home,
    baseline?.home ?? null,
    ctx.events,
    ctx.homeId
  );
  const away = buildWindowStats(
    label,
    fromMinute,
    currentElapsed,
    ctx.current.away,
    baseline?.away ?? null,
    ctx.events,
    ctx.awayId
  );

  const homeWeight = offensiveWeight(home);
  const awayWeight = offensiveWeight(away);
  let momentumTeam: "home" | "away" | null = null;
  if (homeWeight > awayWeight && homeWeight > 0) momentumTeam = "home";
  else if (awayWeight > homeWeight && awayWeight > 0) momentumTeam = "away";

  let pressureTeam: "home" | "away" | null = null;
  if (isRealPressure(home) && homeWeight >= awayWeight) pressureTeam = "home";
  else if (isRealPressure(away) && awayWeight >= homeWeight) pressureTeam = "away";

  const hasData =
    Boolean(baseline) ||
    home.goals + away.goals + home.cards + away.cards + home.substitutions + away.substitutions > 0;

  const summary: WindowSummary = {
    windowLabel: label,
    fromMinute,
    toMinute: currentElapsed,
    home,
    away,
    momentumTeam,
    pressureTeam,
    summaryText: "",
    hasData,
  };
  summary.summaryText = summarizeWindowMomentum(summary, ctx.homeName, ctx.awayName);
  return summary;
}

export function getLast5MinuteWindow(ctx: WindowContext): WindowSummary {
  return buildWindow("5min", 5, ctx);
}

export function getLast10MinuteWindow(ctx: WindowContext): WindowSummary {
  return buildWindow("10min", 10, ctx);
}

/** Fenêtre depuis le dernier but (tous camps confondus). */
export function getSinceLastGoalWindow(ctx: WindowContext): WindowSummary {
  const currentElapsed = ctx.current.elapsed;
  if (currentElapsed === null) return buildWindow("since_goal", null, ctx);

  const goals = ctx.events
    .filter((e) => (e.type ?? "").toLowerCase() === "goal" && !(e.detail ?? "").toLowerCase().includes("missed"))
    .filter((e) => e.elapsed !== null)
    .sort((a, b) => (a.elapsed as number) - (b.elapsed as number));

  const lastGoal = goals[goals.length - 1];
  if (!lastGoal || lastGoal.elapsed === null) {
    // Aucun but: équivalent à une grande fenêtre depuis le début.
    const w = buildWindow("since_goal", currentElapsed, ctx);
    return w;
  }
  const windowMinutes = Math.max(1, currentElapsed - (lastGoal.elapsed as number));
  return buildWindow("since_goal", windowMinutes, ctx);
}

function teamWindowPhrase(name: string, s: WindowStats): string {
  const parts: string[] = [];
  if (s.shots !== null) parts.push(`${s.shots} tir(s)`);
  if (s.shotsOnTarget !== null) parts.push(`${s.shotsOnTarget} cadré(s)`);
  if (s.corners !== null) parts.push(`${s.corners} corner(s)`);
  if (s.goals > 0) parts.push(`${s.goals} but(s)`);
  if (s.cards > 0) parts.push(`${s.cards} carton(s)`);
  if (s.substitutions > 0) parts.push(`${s.substitutions} changement(s)`);
  if (parts.length === 0) return `${name}: activité non mesurable`;
  return `${name}: ${parts.join(", ")}`;
}

export function summarizeWindowMomentum(
  w: WindowSummary,
  homeName: string,
  awayName: string
): string {
  const labelFr =
    w.windowLabel === "5min"
      ? "Sur les 5 dernières minutes"
      : w.windowLabel === "10min"
      ? "Sur les 10 dernières minutes"
      : w.fromMinute !== null
      ? `Depuis la ${w.fromMinute}'`
      : "Sur la période récente";

  if (!w.hasData) {
    return `${labelFr}: données insuffisantes pour mesurer la dynamique récente.`;
  }

  const home = teamWindowPhrase(homeName, w.home);
  const away = teamWindowPhrase(awayName, w.away);

  let verdict = "rythme équilibré ou faible.";
  if (w.pressureTeam === "home") verdict = `pression réelle de ${homeName}.`;
  else if (w.pressureTeam === "away") verdict = `pression réelle de ${awayName}.`;
  else if (w.momentumTeam === "home") verdict = `légère initiative de ${homeName} (à confirmer).`;
  else if (w.momentumTeam === "away") verdict = `légère initiative de ${awayName} (à confirmer).`;

  return `${labelFr}: ${home} | ${away} — ${verdict}`;
}
