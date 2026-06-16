/**
 * Moteur live du worker: assemble les données, génère l'analyse (cerveau =
 * generateLiveBettingAdvice), et produit des ALERTES classifiées (pré-anti-spam).
 */

import {
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
  getHeadToHead,
  getTeamLastFixtures,
} from "@/lib/api-football";
import {
  normalizeEvents,
  normalizeFixture,
  normalizeH2H,
  normalizeLineups,
  normalizeRecentForm,
  normalizeStatistics,
} from "@/lib/world-cup-filter";
import { generateLiveBettingAdvice } from "@/lib/live-advice";
import type {
  H2HSummary,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedStatsPair,
  RecentForm,
} from "@/types/match";
import type { ExternalCommentaryEvent } from "@/types/commentary";
import type { LiveBettingAdvice, StatsSnapshotPoint } from "@/types/live-advice";
import type { AlertSource, BufferedEvent, LiveAlert } from "./types";
import {
  apiEventId,
  classifyAdviceTransition,
  classifyApiEvent,
  classifyCommentaryEvent,
  commentaryEventId,
} from "./alert-classifier";
import { detectOffensiveSequence, sequenceDedupId } from "./sequence-detector";
import type { WatchState } from "./state";

export interface LiveData {
  fixture: NormalizedFixture;
  statistics: NormalizedStatsPair;
  events: NormalizedEvent[];
  lineups: NormalizedLineup[];
  recentForm: { home: RecentForm | null; away: RecentForm | null };
  h2h: H2HSummary | null;
  previousSnapshots: StatsSnapshotPoint[];
  commentary: ExternalCommentaryEvent[];
}

export interface CycleResult {
  advice: LiveBettingAdvice;
  alerts: LiveAlert[];
}

function teamSide(name: string | null, f: NormalizedFixture): "home" | "away" | null {
  if (!name) return null;
  const l = name.toLowerCase();
  if (f.home.name.toLowerCase().includes(l) || l.includes(f.home.name.toLowerCase())) return "home";
  if (f.away.name.toLowerCase().includes(l) || l.includes(f.away.name.toLowerCase())) return "away";
  return null;
}

function feedBuffer(buffer: BufferedEvent[], c: ExternalCommentaryEvent, f: NormalizedFixture): void {
  if (c.minute === null) return;
  let kind: BufferedEvent["kind"] | null = null;
  if (c.eventType === "shot_on_target") kind = "shot_on_target";
  else if (c.eventType === "shot_off_target" || c.eventType === "dangerous_attack") kind = "shot";
  else if (c.eventType === "corner") kind = "corner";
  else if (c.eventType === "free_kick") kind = "free_kick";
  if (!kind) return;
  buffer.push({ minute: c.minute, team: teamSide(c.teamName, f), kind });
}

function scoreLabel(prev: { h: number; a: number }, hg: number, ag: number, f: NormalizedFixture): string {
  const wasEqual = prev.h === prev.a;
  const nowEqual = hg === ag;
  if (nowEqual && !wasEqual) return "Égalisation !";
  const prevLeader = prev.h > prev.a ? "home" : prev.h < prev.a ? "away" : null;
  const nowLeader = hg > ag ? "home" : hg < ag ? "away" : null;
  if (prevLeader && nowLeader && prevLeader !== nowLeader) {
    return `Retournement de situation : ${nowLeader === "home" ? f.home.name : f.away.name} passe devant.`;
  }
  return "But.";
}

function describeApiEvent(e: NormalizedEvent, f: NormalizedFixture, prev: { h: number; a: number } | null): string {
  const type = (e.type ?? "").toLowerCase();
  const detail = (e.detail ?? "").toLowerCase();
  const min = e.elapsed !== null ? `${e.elapsed}'` : "";
  const team = e.teamName ?? "?";
  const player = e.playerName ?? "?";
  const score = `${f.homeGoals ?? 0}-${f.awayGoals ?? 0}`;
  if (type === "goal" && !detail.includes("missed")) {
    const lbl = prev ? scoreLabel(prev, f.homeGoals ?? 0, f.awayGoals ?? 0, f) : "But.";
    return `But de ${player} (${team}) ${min}. Nouveau score ${score}. ${lbl}`;
  }
  if (type === "goal" && detail.includes("missed")) return `Penalty manqué par ${player} (${team}) ${min}. Grosse occasion gâchée.`;
  if (type === "card" && (detail.includes("red") || detail.includes("second yellow"))) {
    return `Carton rouge pour ${player} (${team}) ${min}. Supériorité numérique pour l'adversaire — le rapport de force change.`;
  }
  if (type === "card") return `Carton jaune ${player} (${team}) ${min}.`;
  if (type === "subst") return `Changement ${team} ${min} (${player}).`;
  if (type === "var") return `Décision VAR (${e.detail ?? "?"}) ${min}.`;
  return `${e.type ?? "Événement"} ${e.detail ?? ""} ${min}`.trim();
}

function describeCommentary(c: ExternalCommentaryEvent): string {
  const min = c.minute !== null ? `~${c.minute}'` : "";
  const team = c.teamName ? ` côté ${c.teamName}` : "";
  const base = c.rawTitle && c.rawTitle.length > 0 ? c.rawTitle : c.eventType.replace(/_/g, " ");
  return `${base}${team} ${min} (source secondaire, à confirmer).`.trim();
}

export function runLiveCycle(data: LiveData, state: WatchState, source: AlertSource): CycleResult {
  const f = data.fixture;
  const fixtureId = f.fixtureId;
  const hg = f.homeGoals ?? 0;
  const ag = f.awayGoals ?? 0;
  const score = `${hg}-${ag}`;
  const elapsed = f.elapsed ?? 0;

  const advice = generateLiveBettingAdvice({
    fixture: f,
    statistics: data.statistics,
    events: data.events,
    lineups: data.lineups,
    recentForm: data.recentForm,
    h2h: data.h2h,
    odds: { available: false, message: "Cotes indisponibles sur le plan actuel." },
    previousSnapshots: data.previousSnapshots,
    externalCommentaryEvents: data.commentary,
    freshnessSeconds: 0,
  });

  const primaryKey = advice.recommendedMarkets[0]?.market ?? "none";
  const analysisSig = `${advice.action}|${primaryKey}|${score}`;
  const alerts: LiveAlert[] = [];

  // 1) Nouveaux événements API
  let sawGoalEvent = false;
  for (const e of data.events) {
    const id = apiEventId(fixtureId, e);
    if (state.knownEventIds.has(id)) continue;
    state.knownEventIds.add(id);
    const cls = classifyApiEvent(e);
    if (cls.kind.includes("goal")) sawGoalEvent = true;
    if (cls.level === "LOW" || cls.level === "MEDIUM") continue;
    alerts.push({
      dedupId: id,
      level: cls.level,
      source: "api",
      kind: cls.kind,
      whatHappened: describeApiEvent(e, f, state.prevScore),
      signature: analysisSig,
    });
  }

  // 2) Changement de score sans événement détecté (lag / secondaire)
  if (state.prevScore && (state.prevScore.h !== hg || state.prevScore.a !== ag) && !sawGoalEvent) {
    const id = `score:${fixtureId}:${score}`;
    if (!state.knownEventIds.has(id)) {
      state.knownEventIds.add(id);
      alerts.push({
        dedupId: id,
        level: "CRITICAL",
        source,
        kind: "score_change",
        whatHappened: `Changement de score : ${score}. ${scoreLabel(state.prevScore, hg, ag, f)}`,
        signature: analysisSig,
      });
    }
  }

  // 3) Transition d'action
  const trans = classifyAdviceTransition(state.prevAdvice?.action ?? null, advice.action);
  if (trans) {
    const prevA = state.prevAdvice?.action ?? "none";
    const id = `adv:${fixtureId}:${prevA}>${advice.action}:${score}`;
    if (!state.knownEventIds.has(id)) {
      state.knownEventIds.add(id);
      alerts.push({
        dedupId: id,
        level: trans.level,
        source,
        kind: trans.kind,
        whatHappened: `La lecture du match évolue : ${prevA} → ${advice.action}.`,
        signature: `transition|${analysisSig}`,
      });
    }
  }

  // 4) Commentaires (source secondaire): buffer + alertes HIGH/CRITICAL
  for (const c of data.commentary) {
    const id = commentaryEventId(fixtureId, c);
    if (state.knownCommentaryIds.has(id)) continue;
    state.knownCommentaryIds.add(id);
    feedBuffer(state.buffer, c, f);
    const cls = classifyCommentaryEvent(c);
    if (cls.level === "LOW" || cls.level === "MEDIUM") continue;
    alerts.push({
      dedupId: id,
      level: cls.level,
      source: "secondary",
      kind: cls.kind,
      whatHappened: describeCommentary(c),
      signature: analysisSig,
    });
  }

  // 5) Séquences offensives (HIGH)
  const seq = detectOffensiveSequence(state.buffer, elapsed);
  if (seq) {
    const id = sequenceDedupId(fixtureId, seq);
    if (!state.knownEventIds.has(id)) {
      state.knownEventIds.add(id);
      const team = seq.team === "home" ? f.home.name : seq.team === "away" ? f.away.name : "une équipe";
      alerts.push({
        dedupId: id,
        level: "HIGH",
        source: "secondary",
        kind: "sequence",
        whatHappened: `Séquence offensive (${team}) : ${seq.label}. Pression concrète.`,
        signature: `seq|${seq.type}|${analysisSig}`,
      });
    }
  }

  state.prevAdvice = advice;
  state.prevScore = { h: hg, a: ag };
  state.lastAction = advice.action;
  state.lastFixture = f;
  state.lastStatistics = data.statistics;

  return { advice, alerts };
}

/* ----------------------------- Récupération données ----------------------------- */

export async function fetchApiLive(
  fixtureId: number
): Promise<{ fixture: NormalizedFixture; statistics: NormalizedStatsPair; events: NormalizedEvent[] } | null> {
  const af = await getFixtureById(fixtureId);
  if (!af) return null;
  const fixture = normalizeFixture(af);
  const [rawStats, rawEvents] = await Promise.all([
    getFixtureStatistics(fixtureId).catch(() => []),
    getFixtureEvents(fixtureId).catch(() => []),
  ]);
  return {
    fixture,
    statistics: normalizeStatistics(rawStats, fixture.home.id, fixture.away.id),
    events: normalizeEvents(rawEvents),
  };
}

export async function fetchContextOnce(
  fixture: NormalizedFixture
): Promise<{ recentForm: { home: RecentForm | null; away: RecentForm | null }; h2h: H2HSummary | null; lineups: NormalizedLineup[] }> {
  const [homeLast, awayLast, h2hRaw, lineupsRaw] = await Promise.all([
    getTeamLastFixtures(fixture.home.id, 5).catch(() => []),
    getTeamLastFixtures(fixture.away.id, 5).catch(() => []),
    getHeadToHead(fixture.home.id, fixture.away.id, 10).catch(() => []),
    getFixtureLineups(fixture.fixtureId).catch(() => []),
  ]);
  return {
    recentForm: {
      home: normalizeRecentForm(fixture.home.id, homeLast),
      away: normalizeRecentForm(fixture.away.id, awayLast),
    },
    h2h: normalizeH2H(fixture.home.id, fixture.away.id, h2hRaw),
    lineups: normalizeLineups(lineupsRaw),
  };
}
