/**
 * Mémoire d'un match depuis le /watch. Le bot garde l'historique pour ne plus
 * analyser une action isolée hors contexte. PUR (testable sans réseau).
 */

export interface ScorePoint {
  minute: number | null;
  home: number;
  away: number;
  at: number;
}

export interface EventPoint {
  minute: number | null;
  type: string;
  team: "home" | "away" | null;
  player: string | null;
  detail: string | null;
  at: number;
}

export interface AdvicePoint {
  minute: number | null;
  action: string;
  bestMarket: string | null;
  at: number;
}

export interface AlertPoint {
  minute: number | null;
  level: string;
  kind: string;
  at: number;
}

export interface PressureWindowPoint {
  minute: number | null;
  side: "home" | "away" | null;
  momentumHome: number;
  note: string;
  at: number;
}

export interface MatchMemory {
  fixtureId: number;
  startedWatchingAt: number;
  startScore: { home: number; away: number } | null;
  scoreTimeline: ScorePoint[];
  eventTimeline: EventPoint[];
  adviceTimeline: AdvicePoint[];
  alertTimeline: AlertPoint[];
  pressureWindows: PressureWindowPoint[];
  marketStates: Record<string, "watch" | "playable" | "avoid" | "resolved" | "invalidated">;
  lastImportantAction: string | null;
  lastGoal: { minute: number | null; team: "home" | "away" | null; player: string | null; at: number } | null;
  currentNarrative: string;
  resolvedMarkets: string[];
  deadMarkets: string[];
  watchMarkets: string[];
  invalidatedMarkets: string[];
}

export function createMatchMemory(fixtureId: number, startScore: { home: number; away: number } | null = null): MatchMemory {
  return {
    fixtureId,
    startedWatchingAt: Date.now(),
    startScore,
    scoreTimeline: startScore ? [{ minute: null, home: startScore.home, away: startScore.away, at: Date.now() }] : [],
    eventTimeline: [],
    adviceTimeline: [],
    alertTimeline: [],
    pressureWindows: [],
    marketStates: {},
    lastImportantAction: null,
    lastGoal: null,
    currentNarrative: "Surveillance lancée.",
    resolvedMarkets: [],
    deadMarkets: [],
    watchMarkets: [],
    invalidatedMarkets: [],
  };
}

function cap<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(-max) : arr;
}

export function recordScore(mem: MatchMemory, minute: number | null, home: number, away: number): boolean {
  const last = mem.scoreTimeline[mem.scoreTimeline.length - 1];
  if (last && last.home === home && last.away === away) return false;
  mem.scoreTimeline.push({ minute, home, away, at: Date.now() });
  mem.scoreTimeline = cap(mem.scoreTimeline, 40);
  if (mem.startScore === null) mem.startScore = { home, away };
  return true;
}

export function recordGoal(mem: MatchMemory, minute: number | null, team: "home" | "away" | null, player: string | null): void {
  mem.lastGoal = { minute, team, player, at: Date.now() };
  mem.lastImportantAction = `But ${player ? `${player} ` : ""}(${team ?? "?"}) ${minute ?? "?"}'`;
}

export function recordEvent(mem: MatchMemory, e: EventPoint): void {
  mem.eventTimeline.push(e);
  mem.eventTimeline = cap(mem.eventTimeline, 60);
}

export function recordAdvice(mem: MatchMemory, minute: number | null, action: string, bestMarket: string | null): void {
  mem.adviceTimeline.push({ minute, action, bestMarket, at: Date.now() });
  mem.adviceTimeline = cap(mem.adviceTimeline, 60);
}

export function recordAlert(mem: MatchMemory, minute: number | null, level: string, kind: string): void {
  mem.alertTimeline.push({ minute, level, kind, at: Date.now() });
  mem.alertTimeline = cap(mem.alertTimeline, 60);
  mem.lastImportantAction = `${level}/${kind} @ ${minute ?? "?"}'`;
}

export function recordPressure(mem: MatchMemory, minute: number | null, side: "home" | "away" | null, momentumHome: number, note: string): void {
  mem.pressureWindows.push({ minute, side, momentumHome, note, at: Date.now() });
  mem.pressureWindows = cap(mem.pressureWindows, 40);
}

/** Met à jour les listes de marchés (resolved/dead/watch/invalidated) + states. */
export function updateMarketMemory(
  mem: MatchMemory,
  lists: { watch: string[]; resolved: string[]; avoid: string[]; invalidated: string[] }
): void {
  const merge = (cur: string[], add: string[]) => Array.from(new Set([...cur, ...add]));
  mem.resolvedMarkets = merge(mem.resolvedMarkets, lists.resolved);
  mem.invalidatedMarkets = merge(mem.invalidatedMarkets, lists.invalidated);
  mem.deadMarkets = merge(mem.deadMarkets, [...lists.resolved, ...lists.invalidated]);
  // watchMarkets : on garde ceux encore d'actualité (pas résolus/invalidés).
  mem.watchMarkets = lists.watch.filter((m) => !mem.deadMarkets.includes(m));
  for (const m of lists.watch) mem.marketStates[m] = "watch";
  for (const m of lists.avoid) mem.marketStates[m] = "avoid";
  for (const m of lists.resolved) mem.marketStates[m] = "resolved";
  for (const m of lists.invalidated) mem.marketStates[m] = "invalidated";
}

export function goalsSinceWatch(mem: MatchMemory, currentHome: number, currentAway: number): number {
  if (!mem.startScore) return 0;
  return Math.max(0, currentHome - mem.startScore.home) + Math.max(0, currentAway - mem.startScore.away);
}

export function setNarrative(mem: MatchMemory, narrative: string): void {
  mem.currentNarrative = narrative;
}
