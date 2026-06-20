/**
 * Tests de la nouvelle logique live : game-state, pression, évaluation par
 * marché, sélection du meilleur marché, alerte compacte, mémoire du match,
 * cycle de vie / calendrier. Scénarios réels demandés.
 *
 * `npm run test-live-decision`. Aucun réseau (fonctions pures + deps injectées).
 */

import { getGameStateContext, hasSituation } from "@/bot/game-state";
import { assessLivePressure, favoriteSideFromForm } from "@/bot/live-pressure";
import { evaluateMarketsBySituation, selectBestMarketBySituation, type MarketEvalInput } from "@/bot/market-evaluator";
import { generateLiveBettingDecision } from "@/bot/live-betting-decision-engine";
import { formatCompactLiveAlert } from "@/bot/compact-live-alert";
import { createMatchMemory, goalsSinceWatch, recordScore, updateMarketMemory } from "@/bot/match-memory";
import { getMatchLifecycleStatus, getNextActionableMatches, splitByLifecycle } from "@/bot/match-lifecycle";
import { composeMatchStory, composePostMatchSummary } from "@/bot/postmatch-analysis";
import { normalizeOddsResult } from "@/bot/odds/odds-normalizer";
import { compareOdds, unavailableComparison, type OddsSnapshotComparison } from "@/bot/odds/odds-snapshot";
import { routeCommand, type RouterDeps } from "@/bot/telegram-command-router";
import { toResolved } from "@/bot/match-resolver";
import { BotState } from "@/bot/state";
import { getBotConfig } from "@/bot/config";
import type { NormalizedFixture, NormalizedStatsPair, NormalizedTeamStats, RecentForm } from "@/types/match";
import type { LivePressure } from "@/bot/live-pressure";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

/* ----------------------------- helpers ----------------------------- */

function nf(o: Partial<NormalizedFixture> & { homeName?: string; awayName?: string }): NormalizedFixture {
  return {
    fixtureId: o.fixtureId ?? 1, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1",
    groupName: "Group I", home: { id: 1, name: o.homeName ?? "France", logo: null }, away: { id: 2, name: o.awayName ?? "Senegal", logo: null },
    kickoffAt: o.kickoffAt ?? "2026-06-16T19:00:00+00:00", statusShort: o.statusShort ?? "2H", statusLong: o.statusLong ?? "Second Half",
    phase: o.phase ?? "live", elapsed: o.elapsed ?? 60, homeGoals: o.homeGoals ?? 0, awayGoals: o.awayGoals ?? 0,
    venueName: "Stade", venueCity: "New York",
  };
}

function ts(o: Partial<NormalizedTeamStats>): NormalizedTeamStats {
  const z: NormalizedTeamStats = {
    shotsOnGoal: null, shotsOffGoal: null, totalShots: null, blockedShots: null,
    shotsInsideBox: null, shotsOutsideBox: null, fouls: null, cornerKicks: null,
    offsides: null, ballPossession: null, yellowCards: null, redCards: null,
    goalkeeperSaves: null, totalPasses: null, passesAccurate: null, passesPercent: null,
  };
  return { ...z, ...o };
}
function pair(home: Partial<NormalizedTeamStats>, away: Partial<NormalizedTeamStats>): NormalizedStatsPair {
  return { home: ts(home), away: ts(away), hasData: true };
}
function form(w: number, d: number, l: number, gf: number, ga: number): RecentForm {
  return { teamId: 0, results: [], wins: w, draws: d, losses: l, goalsFor: gf, goalsAgainst: ga };
}
function pressureOf(fixture: NormalizedFixture, home: Partial<NormalizedTeamStats>, away: Partial<NormalizedTeamStats>): LivePressure {
  return assessLivePressure({ statistics: pair(home, away), fixture });
}
function snap(selections: { market: string; selection: string; odd: number }[]): OddsSnapshotComparison {
  return compareOdds(null, normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t", suspended: false, selections }));
}
function evalInput(o: Partial<MarketEvalInput> & { fixture: NormalizedFixture; home: Partial<NormalizedTeamStats>; away: Partial<NormalizedTeamStats> }): MarketEvalInput {
  return {
    score: { home: o.fixture.homeGoals ?? 0, away: o.fixture.awayGoals ?? 0 },
    minute: o.fixture.elapsed ?? 0,
    pressure: pressureOf(o.fixture, o.home, o.away),
    odds: o.odds ?? null,
    event: o.event ?? null,
    favoriteSide: o.favoriteSide ?? null,
    homeName: o.fixture.home.name,
    awayName: o.fixture.away.name,
    matchMemory: o.matchMemory ?? null,
  };
}

/* ============================== GAME STATE ============================== */
console.log("\n[GS] getGameStateContext — phases + situations");
{
  const a = getGameStateContext(3, 1, 90, "home");
  check("3-1 90e: stoppage_time", a.phase === "stoppage_time", a.phase);
  check("3-1 90e: décidé", a.decided === true);
  check("3-1 90e: two_goal_lead + chase + favori devant", hasSituation(a, "two_goal_lead") && hasSituation(a, "market_chase_risk") && hasSituation(a, "favorite_leading"));
  check("3-1 90e: prochain but NON exploitable", a.scoreExploitableForNextGoal === false);

  const b = getGameStateContext(0, 0, 70);
  check("0-0 70e: closed_low_score + key_window", hasSituation(b, "closed_low_score") && b.phase === "key_window");

  const c = getGameStateContext(0, 1, 15, "home");
  check("0-1 15e: favori mené tôt", hasSituation(c, "favorite_trailing") && c.phase === "early_game");

  const d = getGameStateContext(2, 2, 70);
  check("2-2 70e: nul tardif + exploitable", hasSituation(d, "draw_late") && d.scoreExploitableForNextGoal === true);
}

/* ============================== DÉCISION : SCÉNARIOS RÉELS ============================== */
console.log("\n[S1] France 3-1 Senegal 90e (but Mbappé) → NO BET, marchés principaux résolus, pas de prochain but générique");
{
  const f = nf({ elapsed: 90, statusShort: "2H", homeGoals: 3, awayGoals: 1 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 5, totalShots: 12 }, { shotsOnGoal: 3 }),
    oddsSnapshot: unavailableComparison("cotes live non disponibles"),
    minute: 90, score: { home: 3, away: 1 }, favoriteSide: "home",
    event: { isGoal: true, isRedCard: false, side: "home", label: "But de Mbappé (France) 90'. Score 3-1." },
  });
  check("action NO_BET", d.action === "NO_BET", d.action);
  check("Over 1.5/2.5/3.5 + BTTS résolus", d.alreadyResolvedMarkets.length >= 3, d.alreadyResolvedMarkets.map((m) => m.marketName));
  check("PAS de 'Prochain but France' recommandé", !d.recommendedMarkets.some((m) => m.marketName.includes("Prochain but France")));
  check("jamais PLAYABLE", d.action !== "PLAYABLE");

  const alert = formatCompactLiveAlert({ match: f, event: { label: "But de Mbappé (France) 90'.", isGoal: true }, liveDecision: d });
  check("alerte compacte <= 1200 caractères", alert.length <= 1200, alert.length);
  check("alerte: 'NO BET'", alert.includes("NO BET"));
  check("alerte: pas de 'Prochain but France' en surveillance", !/À surveiller[\s\S]*Prochain but France/.test(alert));
  check("alerte: marchés déjà passés mentionnés", /déjà validés|déjà passés/.test(alert));
}

console.log("\n[S2] 2-2 70e → prochain but selon pression (+cote), over/BTTS résolus");
{
  const f = nf({ elapsed: 70, homeGoals: 2, awayGoals: 2 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 4, cornerKicks: 5, ballPossession: 57 }, { shotsOnGoal: 2 }),
    oddsSnapshot: snap([{ market: "Next Goal", selection: "Home", odd: 2.2 }]),
    minute: 70, score: { home: 2, away: 2 }, favoriteSide: "home",
  });
  check("prochain but France présent (watch/playable)", d.recommendedMarkets.some((m) => m.marketName.includes("Prochain but France")));
  check("Over 2.5 + BTTS résolus (pas recommandés)", d.alreadyResolvedMarkets.some((m) => m.marketName.includes("Over 2.5")) && d.alreadyResolvedMarkets.some((m) => m.marketName.includes("BTTS")));
  check("pas d'Over en recommandé", !d.recommendedMarkets.some((m) => /Over/.test(m.marketName)));
}

console.log("\n[S3] 0-0 70e sans tirs cadrés → AVOID over, NO BET");
{
  const f = nf({ elapsed: 70, homeGoals: 0, awayGoals: 0 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 0, ballPossession: 52 }, { shotsOnGoal: 0, ballPossession: 48 }),
    oddsSnapshot: unavailableComparison("x"), minute: 70, score: { home: 0, away: 0 }, favoriteSide: "home",
  });
  check("action NO_BET", d.action === "NO_BET", d.action);
  check("Over évité", d.avoidMarkets.some((m) => /Over/.test(m.marketName)));
  check("aucun PLAYABLE", d.action !== "PLAYABLE");
}

console.log("\n[S4] 0-1 outsider 15e → WAIT (attendre la réaction du favori)");
{
  const f = nf({ elapsed: 15, statusShort: "1H", homeGoals: 0, awayGoals: 1 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 1 }, { shotsOnGoal: 1 }),
    minute: 15, score: { home: 0, away: 1 }, favoriteSide: "home",
  });
  check("action WAIT", d.action === "WAIT", d.action);
}

console.log("\n[S5] favori 70% possession, 0 tir cadré → domination stérile, AVOID victoire live");
{
  const f = nf({ elapsed: 60, homeGoals: 0, awayGoals: 0 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 0, totalShots: 4, ballPossession: 72 }, { shotsOnGoal: 0, ballPossession: 28 }),
    minute: 60, score: { home: 0, away: 0 }, favoriteSide: "home",
  });
  check("action AVOID", d.action === "AVOID", d.action);
  check("victoire favori évitée (stérile)", d.avoidMarkets.some((m) => /Victoire France/.test(m.marketName) && m.reason.includes("stérile")));
}

console.log("\n[S6] carton rouge contre le favori dominant → INVALIDATED");
{
  const f = nf({ elapsed: 65, homeGoals: 0, awayGoals: 0 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 4, cornerKicks: 5, ballPossession: 60, redCards: 1 }, { shotsOnGoal: 1 }),
    minute: 65, score: { home: 0, away: 0 }, favoriteSide: "home",
  });
  check("action INVALIDATED", d.action === "INVALIDATED", d.action);
  check("marchés du favori invalidés", d.invalidatedMarkets.length > 0);
}

console.log("\n[S7] cote absente → jamais PLAYABLE");
{
  const f = nf({ elapsed: 55, homeGoals: 0, awayGoals: 0 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 5, cornerKicks: 6, ballPossession: 60 }, { shotsOnGoal: 1 }),
    oddsSnapshot: unavailableComparison("cotes live non disponibles"), minute: 55, score: { home: 0, away: 0 }, favoriteSide: "home",
  });
  check("jamais PLAYABLE sans cote", d.action !== "PLAYABLE", d.action);
  check("oddsAvailable=false", d.oddsAvailable === false);
}

console.log("\n[S8] cote compressée → WATCH/AVOID, pas PLAYABLE");
{
  const prev = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 2.5 }] });
  const cur = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t2", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 1.5 }] });
  const f = nf({ elapsed: 55, homeGoals: 1, awayGoals: 0 });
  const d = generateLiveBettingDecision({
    fixture: f, statistics: pair({ shotsOnGoal: 5, cornerKicks: 6, ballPossession: 60 }, { shotsOnGoal: 1 }),
    oddsSnapshot: compareOdds(prev, cur), minute: 55, score: { home: 1, away: 0 }, favoriteSide: "home",
  });
  check("WATCH ou AVOID (jamais PLAYABLE)", d.action === "WATCH" || d.action === "AVOID", d.action);
  check("prochain but évité (compressée)", d.avoidMarkets.some((m) => m.reason.includes("compressée")));
}

/* ============================== SÉLECTION DU MEILLEUR MARCHÉ ============================== */
console.log("\n[B1] selectBestMarketBySituation — jamais 'prochain but favori' par défaut");
{
  // France 3-1 90e → jamais next_goal_home.
  const a = selectBestMarketBySituation(evalInput({ fixture: nf({ elapsed: 90, homeGoals: 3, awayGoals: 1 }), home: { shotsOnGoal: 5 }, away: { shotsOnGoal: 3 }, favoriteSide: "home", event: { isGoal: true, isRedCard: false, side: "home" } }));
  check("3-1 90e: jamais next_goal_home", a.market !== "next_goal_home", a.market);
  check("3-1 90e: NO_BET ou avoid_chasing_goal", a.market === "no_market" || a.market === "avoid_chasing_goal", a.market);

  // France favori sans pression → pas de next_goal_home.
  const b = selectBestMarketBySituation(evalInput({ fixture: nf({ elapsed: 30, homeGoals: 0, awayGoals: 0 }), home: { shotsOnGoal: 0, ballPossession: 55 }, away: { shotsOnGoal: 0, ballPossession: 45 }, favoriteSide: "home" }));
  check("favori sans pression: pas next_goal_home", b.market !== "next_goal_home", b.market);

  // France 0-0 15e, 2 tirs cadrés + 2 corners → next_goal_home WATCH possible.
  const c = selectBestMarketBySituation(evalInput({ fixture: nf({ elapsed: 15, statusShort: "1H", homeGoals: 0, awayGoals: 0 }), home: { shotsOnGoal: 2, cornerKicks: 2, ballPossession: 58 }, away: { shotsOnGoal: 0 }, favoriteSide: "home" }));
  check("0-0 15e pression France: next_goal_home WATCH", c.market === "next_goal_home" && c.status === "watch", `${c.market}/${c.status}`);

  // Sénégal pousse à 1-0 France → next_goal_away ou BTTS WATCH.
  const e = selectBestMarketBySituation(evalInput({ fixture: nf({ elapsed: 55, homeGoals: 1, awayGoals: 0 }), home: { shotsOnGoal: 1 }, away: { shotsOnGoal: 3, cornerKicks: 4, ballPossession: 55 }, favoriteSide: "home" }));
  check("1-0 Sénégal pousse: next_goal_away ou btts", e.market === "next_goal_away" || e.market === "btts", e.market);

  // 2-2 70e pression → prochain but, pas over/btts (résolus).
  const g = selectBestMarketBySituation(evalInput({ fixture: nf({ elapsed: 70, homeGoals: 2, awayGoals: 2 }), home: { shotsOnGoal: 4, cornerKicks: 5, ballPossession: 57 }, away: { shotsOnGoal: 2 }, favoriteSide: "home" }));
  check("2-2 70e: best = prochain but", g.market === "next_goal_home" || g.market === "next_goal_away", g.market);
  const evG = evaluateMarketsBySituation(evalInput({ fixture: nf({ elapsed: 70, homeGoals: 2, awayGoals: 2 }), home: { shotsOnGoal: 4 }, away: { shotsOnGoal: 2 }, favoriteSide: "home" }));
  check("2-2 70e: over/btts résolus", evG.resolved.some((m) => m.key === "over_2_5") && evG.resolved.some((m) => m.key === "btts"));
}

/* ============================== MÉMOIRE DU MATCH ============================== */
console.log("\n[M] match-memory");
{
  const mem = createMatchMemory(900, { home: 0, away: 0 });
  check("start score mémorisé", mem.startScore?.home === 0 && mem.scoreTimeline.length === 1);
  const changed = recordScore(mem, 30, 1, 0);
  check("score change enregistré", changed && mem.scoreTimeline.length === 2);
  check("buts depuis watch", goalsSinceWatch(mem, 1, 0) === 1);
  updateMarketMemory(mem, { watch: ["Over 1.5", "Prochain but France"], resolved: ["Over 1.5"], avoid: [], invalidated: [] });
  check("Over 1.5 passe en mort, plus surveillé", mem.deadMarkets.includes("Over 1.5") && !mem.watchMarkets.includes("Over 1.5"));
  check("Prochain but France reste surveillé", mem.watchMarkets.includes("Prochain but France"));
}

/* ============================== CYCLE DE VIE / CALENDRIER ============================== */
console.log("\n[L] match-lifecycle");
{
  check("FT → finished", getMatchLifecycleStatus({ statusShort: "FT" }) === "finished");
  check("1H → live", getMatchLifecycleStatus({ statusShort: "1H" }) === "live");
  check("HT → halftime", getMatchLifecycleStatus({ statusShort: "HT" }) === "halftime");
  check("NS → not_started", getMatchLifecycleStatus({ statusShort: "NS" }) === "not_started");
  check("PST → cancelled", getMatchLifecycleStatus({ statusShort: "PST" }) === "cancelled");

  const FR = nf({ fixtureId: 900, statusShort: "FT", phase: "finished", homeGoals: 3, awayGoals: 1 });
  const IRQ = nf({ fixtureId: 901, homeName: "Iraq", awayName: "Norway", statusShort: "NS", phase: "scheduled", kickoffAt: "2026-06-16T22:00:00+00:00" });
  const ARG = nf({ fixtureId: 902, homeName: "Argentina", awayName: "Algeria", statusShort: "NS", phase: "scheduled", kickoffAt: "2026-06-17T19:00:00+00:00" });
  const split = splitByLifecycle([FR, IRQ, ARG]);
  check("split: 1 terminé, 2 à venir", split.finished.length === 1 && split.upcoming.length === 2);
}

(async () => {
  console.log("\n[L2] getNextActionableMatches");
  {
    const FR = nf({ fixtureId: 900, statusShort: "FT", phase: "finished" });
    const IRQ = nf({ fixtureId: 901, homeName: "Iraq", awayName: "Norway", statusShort: "NS", phase: "scheduled", kickoffAt: "2026-06-16T22:00:00+00:00" });
    const nm = await getNextActionableMatches(async () => [FR, IRQ]);
    check("nextMatch = Iraq vs Norway", nm.nextMatch?.fixtureId === 901, nm.nextMatch?.fixtureId);
  }

  /* ============================== ROUTAGE : match terminé + calendrier ============================== */
  console.log("\n[R] router — match terminé refuse, propose les suivants");
  const FR = nf({ fixtureId: 900, statusShort: "FT", phase: "finished", homeGoals: 3, awayGoals: 1 });
  const IRQ = nf({ fixtureId: 901, homeName: "Iraq", awayName: "Norway", statusShort: "NS", phase: "scheduled", kickoffAt: "2026-06-16T22:00:00+00:00" });
  const ARG = nf({ fixtureId: 902, homeName: "Argentina", awayName: "Algeria", statusShort: "NS", phase: "scheduled", kickoffAt: "2026-06-17T19:00:00+00:00" });
  const FIX = [FR, IRQ, ARG];
  const deps: RouterDeps = {
    resolve: async (t) => {
      if (/france|senegal/i.test(t)) return { ok: true, kind: "match", match: toResolved(FR, "high"), alternatives: [], reason: "" };
      if (/iraq|norway/i.test(t)) return { ok: true, kind: "match", match: toResolved(IRQ, "high"), alternatives: [], reason: "" };
      return { ok: false, kind: "not_found", match: null, alternatives: [], reason: "" };
    },
    preMatch: async (id) => `PRE:${id}`,
    fullPreMatch: async (id) => `FULL:${id}`,
    markets: async (id) => `MARKETS:${id}`,
    brief: async (id) => `BRIEF:${id}`,
    weather: async () => "WEATHER",
    betLive: async (_s, id) => `BETLIVE:${id}`,
    context: async () => "CTX",
    forcedLive: async (_s, id) => `LIVE:${id}`,
    overview: async () => ({ today: FIX, tomorrow: [], live: [] }),
    matchById: async (id) => { const f = FIX.find((x) => x.fixtureId === id); return f ? toResolved(f, "high") : null; },
    nextMatches: async () => { const s = splitByLifecycle(FIX); return { ...s, nextMatch: s.live[0] ?? s.upcoming[0] ?? null }; },
    fixtureById: async (id) => FIX.find((x) => x.fixtureId === id) ?? null,
  };
  const cfg = getBotConfig();
  const run = async (cmd: string): Promise<string> => {
    const sent: string[] = [];
    await routeCommand(cmd, { config: cfg, state: new BotState(), send: async (t: string) => void sent.push(t) }, deps);
    return sent.join("\n");
  };

  check("/watch france senegal (terminé) → refuse + propose", /surveillance live impossible/i.test(await run("/watch france senegal")));
  const watchOut = await run("/watch france senegal");
  check("/watch terminé propose Iraq/Norway", /Iraq/.test(watchOut) && /Norway/.test(watchOut));
  check("/bet_live france senegal (terminé) → refus + /postmatch", /pas de signal live/i.test(await run("/bet_live france senegal")) );
  check("/bet_live terminé mentionne /postmatch", /postmatch/i.test(await run("/bet_live france senegal")));

  const today = await run("/today");
  check("/today sépare terminés/live/à venir", /✅ Terminés/.test(today) && /⏳ À venir/.test(today));
  check("/today liste France 3-1 + Iraq vs Norway", /France 3-1 Senegal/.test(today) && /Iraq vs Norway/.test(today));

  check("/next → prochain match non terminé (Iraq vs Norway)", /Iraq vs Norway/.test(await run("/next")));
  check("/next_analysis → analyse le prochain (PRE:901)", (await run("/next_analysis")).includes("PRE:901"));
  check("/analyse france senegal (terminé) → post-match, pas 'à venir'", /terminé/i.test(await run("/analyse france senegal")) && /🏁/.test(await run("/analyse france senegal")));

  // /watch_next démarre une surveillance.
  {
    const state = new BotState();
    const sent: string[] = [];
    await routeCommand("/watch_next", { config: cfg, state, send: async (t: string) => void sent.push(t) }, deps);
    check("/watch_next démarre une surveillance", state.activeWatches().some((w) => w.fixtureId === 901));
  }

  /* ============================== POST-MATCH ============================== */
  console.log("\n[P] post-match + récit");
  {
    const mem = createMatchMemory(900, { home: 0, away: 0 });
    recordScore(mem, 90, 3, 1);
    const txt = composePostMatchSummary(FR, mem, "home");
    check("post-match: titre 🏁 terminé", txt.includes("🏁") && txt.includes("terminé"));
    check("post-match: 'Ce que le bot retient'", txt.includes("Ce que le bot retient"));
    check("post-match: favori validé", /validé son statut de favori/.test(txt));
    const story = composeMatchStory(FR, mem, "test");
    check("match_story: récit + score au lancement", story.includes("Récit du match") && story.includes("Score au lancement"));
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion(s) en échec (live-decision).`);
    process.exit(1);
  } else {
    console.log("\n✅ Tests live-decision OK.");
  }
})();
