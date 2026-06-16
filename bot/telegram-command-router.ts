/**
 * Routeur de commandes Telegram en langage naturel + callbacks (boutons inline).
 *
 * /analyse france senegal · /watch france senegal · /analyse demain · /today ·
 * /tomorrow · /matches · /status · /last · /sources · fixtureId numérique, etc.
 *
 * Dépendances injectables (tests sans réseau).
 */

import type { BotConfig } from "./config";
import type { BotState } from "./state";
import type { NormalizedFixture } from "@/types/match";
import { formatKickoff } from "@/lib/utils";
import { getFixtureById } from "@/lib/api-football";
import { normalizeFixture } from "@/lib/world-cup-filter";
import {
  resolveMatchFromText,
  toResolved,
  type ResolvedMatch,
  type ResolveResult,
} from "./match-resolver";
import { getMatchesOverview, getWorldCupFixturesCached } from "./schedule-service";
import {
  buildFullPreMatchAnalysis,
  buildPreMatchAnalysis,
  composeBrief,
  composeContextPlan,
  composeMarketsWatch,
  fetchPreMatchData,
} from "./prematch-analysis";
import { runForcedLiveAnalysis, runLiveBettingDecision } from "./commands";
import { composeWeatherReport, fetchWeather, getWeatherConfig } from "./weather-service";
import { formatWatchStarted, startWatchForMatch, stopWatchByFixture } from "./watch-manager";
import { winamaxButton, type InlineButton } from "./bookmaker-links";
import { buildAnalysisParts } from "./analysis-splitter";
import { sourceHealth } from "./scrapers/source-health";
import { buildOddsStatus, isLiveOddsExploitable, renderOddsStatusLines } from "./odds/odds-status";
import type { NormalizedOddsBoard } from "./odds/odds-normalizer";
import {
  getMatchLifecycleStatus,
  getNextActionableMatches,
  isFinished,
  type ActionableMatches,
} from "./match-lifecycle";
import { composeMatchStory, composePostMatchSummary } from "./postmatch-analysis";

export interface RouterCtx {
  config: BotConfig;
  state: BotState;
  send: (text: string, buttons?: InlineButton[][]) => Promise<void>;
  /** Envoi d'une analyse longue (découpée par section). Optionnel (worker). */
  sendAnalysis?: (analysis: string, buttons?: InlineButton[][]) => Promise<void>;
  log?: (line: string) => void;
}

export interface RouterDeps {
  resolve: (text: string) => Promise<ResolveResult>;
  preMatch: (fixtureId: number) => Promise<string>;
  fullPreMatch: (fixtureId: number) => Promise<string>;
  markets: (fixtureId: number) => Promise<string>;
  brief: (fixtureId: number) => Promise<string>;
  weather: (match: ResolvedMatch) => Promise<string>;
  betLive: (state: BotState, fixtureId: number) => Promise<string>;
  context: (fixtureId: number) => Promise<string>;
  forcedLive: (state: BotState, fixtureId: number) => Promise<string>;
  overview: () => Promise<{ today: NormalizedFixture[]; tomorrow: NormalizedFixture[]; live: NormalizedFixture[] }>;
  matchById: (fixtureId: number) => Promise<ResolvedMatch | null>;
  nextMatches: () => Promise<ActionableMatches>;
  fixtureById: (fixtureId: number) => Promise<NormalizedFixture | null>;
}

export function defaultRouterDeps(): RouterDeps {
  return {
    resolve: (t) => resolveMatchFromText(t),
    preMatch: async (id) => (await buildPreMatchAnalysis(id)).text,
    fullPreMatch: async (id) => (await buildFullPreMatchAnalysis(id)).text,
    markets: async (id) => composeMarketsWatch(await fetchPreMatchData(id)),
    brief: async (id) => composeBrief(await fetchPreMatchData(id)),
    weather: async (match) => {
      const config = getWeatherConfig();
      const location = match.venue || config.location;
      const weather = await fetchWeather(config, location);
      return composeWeatherReport(`${match.homeTeam} vs ${match.awayTeam}`, weather);
    },
    betLive: (state, id) => runLiveBettingDecision(state, id),
    context: async (id) => composeContextPlan(await fetchPreMatchData(id)),
    forcedLive: (state, id) => runForcedLiveAnalysis(state, id),
    overview: () => getMatchesOverview(),
    matchById: async (id) => {
      const all = await getWorldCupFixturesCached().catch(() => []);
      const f = all.find((x) => x.fixtureId === id);
      if (f) return toResolved(f, "high");
      const af = await getFixtureById(id).catch(() => null);
      return af ? toResolved(normalizeFixture(af), "high") : null;
    },
    nextMatches: () => getNextActionableMatches(),
    fixtureById: async (id) => {
      const all = await getWorldCupFixturesCached().catch(() => []);
      const f = all.find((x) => x.fixtureId === id);
      if (f) return f;
      const af = await getFixtureById(id).catch(() => null);
      return af ? normalizeFixture(af) : null;
    },
  };
}

/* ----------------------------- helpers UI ----------------------------- */

function statusEmoji(s: ResolvedMatch["status"]): string {
  return s === "live" ? "🔴" : s === "finished" ? "✅" : "⚪";
}

function matchLine(m: ResolvedMatch, i?: number): string {
  const idx = i !== undefined ? `${i}. ` : "";
  const extra = m.round ? ` · ${m.round}` : "";
  return `${idx}${statusEmoji(m.status)} ${m.homeTeam} vs ${m.awayTeam} — ${formatKickoff(m.date)}${extra}`;
}

function analysisButtons(fixtureId: number): InlineButton[][] {
  return [
    [
      { text: "🔴 Surveiller en live", callback_data: `w:${fixtureId}` },
      { text: "📊 Analyse live maintenant", callback_data: `l:${fixtureId}` },
      winamaxButton(fixtureId),
    ],
  ];
}

/** Envoie une analyse longue: découpée par section ("Partie i/N"), dans l'ordre. */
async function deliverAnalysis(ctx: RouterCtx, analysis: string, buttons: InlineButton[][]): Promise<void> {
  if (ctx.sendAnalysis) {
    await ctx.sendAnalysis(analysis, buttons);
    return;
  }
  const parts = buildAnalysisParts(analysis);
  ctx.log?.(`[TELEGRAM] analysis split parts=${parts.length}`);
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    await ctx.send(parts[i], isLast ? buttons : undefined);
    ctx.log?.(`[TELEGRAM] sent analysis part=${i + 1}/${parts.length}`);
  }
}

function matchActionRow(m: ResolvedMatch): InlineButton[] {
  return [
    { text: "📊 Analyser", callback_data: `a:${m.fixtureId}` },
    { text: "🔴 Surveiller", callback_data: `w:${m.fixtureId}` },
    winamaxButton(m.fixtureId),
  ];
}

async function sendMatchList(ctx: RouterCtx, title: string, matches: ResolvedMatch[]): Promise<void> {
  if (matches.length === 0) {
    await ctx.send(`${title}\n\nAucun match trouvé. Essaie /matches ou /tomorrow.`);
    return;
  }
  const body = [title, "", ...matches.map((m, i) => matchLine(m, i + 1))].join("\n");
  const buttons = matches.slice(0, 12).map((m) => matchActionRow(m));
  await ctx.send(body, buttons);
}

function helpText(): string {
  return [
    "🤖 CoteRadar Live — assistant Coupe du monde 2026.",
    "",
    "Langage naturel :",
    "/analyse france senegal   — analyse compacte orientée marchés",
    "/analyse_full france senegal — version longue détaillée",
    "/markets france senegal   — marchés à surveiller (classés)",
    "/brief france senegal     — résumé très court",
    "/weather france senegal   — météo du match",
    "/bet_live france senegal  — décision de paris live (action)",
    "/watch france senegal     — surveillance live (alertes compactes)",
    "/match_story france senegal — récit du match depuis le watch",
    "/postmatch france senegal — résumé post-match",
    "/next  /next_analysis  /watch_next — prochain match",
    "/live_radar               — classe les matchs du jour (🔥/🟡/✅)",
    "/today  /tomorrow  /matches — programme (terminés/live/à venir)",
    "/analyse_live france senegal — analyse live immédiate (/…_full = long)",
    "/context france senegal   — contexte + plan live",
    "/stop france senegal      — arrête une surveillance",
    "/status  /last  /last_full  /sources  /help",
    "",
    "Astuce : fonctionne aussi avec un fixtureId, « France - Sénégal », « argentine algerie », etc.",
    "⚠️ Analyse informative. Aucune issue garantie. Réservé aux majeurs. Jouez responsable.",
  ].join("\n");
}

/* ----------------------------- flows ----------------------------- */

async function analyseFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) {
    await ctx.send("Usage : /analyse <équipe1> <équipe2>  (ex: /analyse france senegal)");
    return;
  }
  const res = await deps.resolve(query);
  ctx.log?.(`[RESOLVER] input="${query}" resolved=${res.ok} kind=${res.kind} fixtureId=${res.match?.fixtureId ?? "-"} confidence=${res.match?.confidence ?? "-"}`);

  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const m = res.match;
    // Match terminé : ne pas faire comme s'il était à venir → résumé post-match.
    if (m.status === "finished") {
      const fixture = await deps.fixtureById(m.fixtureId);
      const memory = ctx.state.get(m.fixtureId)?.memory ?? null;
      await ctx.send(`✅ ${m.homeTeam} vs ${m.awayTeam} est terminé — voici un résumé post-match (ou /postmatch ${m.homeTeam} ${m.awayTeam}).`);
      if (fixture) await ctx.send(composePostMatchSummary(fixture, memory, null));
      await sendNextProposals(ctx, deps, "Prochains matchs à analyser :");
      return;
    }
    await ctx.send(`⏳ Analyse complète — ${m.homeTeam} vs ${m.awayTeam} (#${m.fixtureId})…`);
    const text = await deps.preMatch(m.fixtureId);
    await deliverAnalysis(ctx, text, analysisButtons(m.fixtureId));
    return;
  }
  if (res.kind === "date") {
    await sendMatchList(ctx, `📅 Matchs du ${res.date} — choisis un match :`, res.alternatives);
    return;
  }
  if (res.kind === "ambiguous") {
    await sendMatchList(ctx, "Plusieurs matchs correspondent — précise :", res.alternatives);
    return;
  }
  await ctx.send(`Aucun match Coupe du monde trouvé pour « ${query} ». Essaie /today ou /matches.`);
}

async function analyseFullFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /analyse_full <équipe1> <équipe2>  (version longue détaillée)"));
  const res = await deps.resolve(query);
  ctx.log?.(`[RESOLVER] input="${query}" resolved=${res.ok} kind=${res.kind} fixtureId=${res.match?.fixtureId ?? "-"}`);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const m = res.match;
    await ctx.send(`⏳ Analyse complète (longue) — ${m.homeTeam} vs ${m.awayTeam} (#${m.fixtureId})…`);
    const text = await deps.fullPreMatch(m.fixtureId);
    await deliverAnalysis(ctx, text, analysisButtons(m.fixtureId));
    return;
  }
  if (res.kind === "date") return void (await sendMatchList(ctx, `📅 Matchs du ${res.date} — choisis un match :`, res.alternatives));
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Plusieurs matchs correspondent — précise :", res.alternatives));
  await ctx.send(`Aucun match Coupe du monde trouvé pour « ${query} ».`);
}

async function marketsFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /markets <équipe1> <équipe2>  (marchés à surveiller)"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const text = await deps.markets(res.match.fixtureId);
    await ctx.send(text, analysisButtons(res.match.fixtureId));
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function briefFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /brief <équipe1> <équipe2>  (résumé très court)"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const text = await deps.brief(res.match.fixtureId);
    await ctx.send(text, analysisButtons(res.match.fixtureId));
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function weatherFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /weather <équipe1> <équipe2>"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const text = await deps.weather(res.match);
    await ctx.send(text);
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function betLiveFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /bet_live <équipe1> <équipe2>  (décision de paris live)"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    if (res.match.status === "finished") {
      await ctx.send(`Match terminé — pas de signal live (${res.match.homeTeam} vs ${res.match.awayTeam}). Essaie /postmatch ${res.match.homeTeam} ${res.match.awayTeam}.`);
      await sendNextProposals(ctx, deps, "Prochains matchs :");
      return;
    }
    await ctx.send(`⏳ Signal live — ${res.match.homeTeam} vs ${res.match.awayTeam}…`);
    const text = await deps.betLive(ctx.state, res.match.fixtureId);
    await ctx.send(text, [[{ text: "🔴 Surveiller", callback_data: `w:${res.match.fixtureId}` }, winamaxButton(res.match.fixtureId)]]);
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match pour le signal live :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function liveFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /analyse_live <match>"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    await ctx.send(`⏳ Analyse live immédiate — ${res.match.homeTeam} vs ${res.match.awayTeam}…`);
    const text = await deps.forcedLive(ctx.state, res.match.fixtureId);
    await ctx.send(text, [[{ text: "🔴 Surveiller", callback_data: `w:${res.match.fixtureId}` }, winamaxButton(res.match.fixtureId)]]);
    return;
  }
  if (res.alternatives.length > 0) {
    await sendMatchList(ctx, "Précise le match pour l'analyse live :", res.alternatives);
    return;
  }
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function contextFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /context <match>"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const text = await deps.context(res.match.fixtureId);
    await ctx.send(text, [[{ text: "🔴 Surveiller", callback_data: `w:${res.match.fixtureId}` }, winamaxButton(res.match.fixtureId)]]);
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function watchFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /watch <match>  (ex: /watch france senegal)"));
  const res = await deps.resolve(query);
  ctx.log?.(`[RESOLVER] input="${query}" resolved=${res.ok} kind=${res.kind} fixtureId=${res.match?.fixtureId ?? "-"}`);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    if (res.match.status === "finished") {
      await ctx.send(`Match terminé — surveillance live impossible (${res.match.homeTeam} vs ${res.match.awayTeam}).`);
      await sendNextProposals(ctx, deps, "Prochains matchs à surveiller :");
      return;
    }
    await startWatchForFixture(ctx, deps, res.match);
    return;
  }
  if (res.alternatives.length > 0) {
    const body = ["Quel match surveiller ?", "", ...res.alternatives.map((m, i) => matchLine(m, i + 1))].join("\n");
    const buttons = res.alternatives.slice(0, 12).map((m) => [{ text: `🔴 Surveiller ${m.homeTeam}-${m.awayTeam}`, callback_data: `w:${m.fixtureId}` }]);
    await ctx.send(body, buttons);
    return;
  }
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function startWatchForFixture(ctx: RouterCtx, deps: RouterDeps, match: ResolvedMatch): Promise<void> {
  startWatchForMatch(ctx.state, ctx.config, match);
  const buttons: InlineButton[][] = [
    [
      { text: "📊 Analyse live maintenant", callback_data: `l:${match.fixtureId}` },
      { text: "⏹ Stop", callback_data: `s:${match.fixtureId}` },
      winamaxButton(match.fixtureId),
    ],
  ];
  await ctx.send(formatWatchStarted(ctx.config, match), buttons);
}

async function stopFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  if (!rest) {
    const active = ctx.state.activeWatches();
    if (active.length === 0) return void (await ctx.send("Aucune surveillance active."));
    const buttons = active.map((w) => [{ text: `⏹ Stop ${w.label}`, callback_data: `s:${w.fixtureId}` }]);
    await ctx.send("Quelle surveillance arrêter ?", buttons);
    return;
  }
  const res = await deps.resolve(rest);
  if (res.match) {
    const ok = stopWatchByFixture(ctx.state, res.match.fixtureId);
    await ctx.send(ok ? `🛑 Surveillance arrêtée — ${res.match.homeTeam} vs ${res.match.awayTeam}.` : "Aucune surveillance active pour ce match.");
    return;
  }
  await ctx.send(`Aucun match trouvé pour « ${rest} ».`);
}

async function listFlow(ctx: RouterCtx, deps: RouterDeps, which: "today" | "tomorrow"): Promise<void> {
  const ov = await deps.overview();
  if (which === "tomorrow") {
    await sendMatchList(ctx, "📅 Matchs Coupe du monde — demain", ov.tomorrow.map((f) => toResolved(f, "high")));
    return;
  }
  // /today : séparation claire Terminés / Live / À venir.
  const today = ov.today;
  const finished = today.filter((f) => isFinished(f));
  const live = today.filter((f) => getMatchLifecycleStatus(f) === "live" || getMatchLifecycleStatus(f) === "halftime");
  const upcoming = today.filter((f) => getMatchLifecycleStatus(f) === "not_started");
  if (today.length === 0 && ov.live.length === 0) {
    await ctx.send("📅 Aucun match Coupe du monde aujourd'hui. Essaie /tomorrow ou /next.");
    return;
  }
  const L: string[] = ["📅 Matchs Coupe du monde — aujourd'hui"];
  if (finished.length) L.push("", "✅ Terminés", ...finished.map((f) => `- ${f.home.name} ${f.homeGoals ?? 0}-${f.awayGoals ?? 0} ${f.away.name}`));
  if (live.length) L.push("", "🔴 Live", ...live.map((f) => `- ${f.home.name} ${f.homeGoals ?? 0}-${f.awayGoals ?? 0} ${f.away.name} (${f.elapsed ?? 0}e)`));
  if (upcoming.length) L.push("", "⏳ À venir", ...upcoming.map((f) => `- ${f.home.name} vs ${f.away.name} — ${formatKickoff(f.kickoffAt)}`));
  const buttons = [...live, ...upcoming].slice(0, 12).map((f) => matchActionRow(toResolved(f, "high")));
  await ctx.send(L.join("\n"), buttons.length ? buttons : undefined);
}

async function matchesFlow(ctx: RouterCtx, deps: RouterDeps): Promise<void> {
  const ov = await deps.overview();
  const live = ov.live.map((f) => toResolved(f, "high"));
  const today = ov.today.map((f) => toResolved(f, "high"));
  const tomorrow = ov.tomorrow.map((f) => toResolved(f, "high"));
  const lines: string[] = ["📅 Programme Coupe du monde"];
  if (live.length) lines.push("", "🔴 En live :", ...live.map((m) => matchLine(m)));
  lines.push("", "Aujourd'hui :", ...(today.length ? today.map((m) => matchLine(m)) : ["(aucun)"]));
  lines.push("", "Demain :", ...(tomorrow.length ? tomorrow.map((m) => matchLine(m)) : ["(aucun)"]));
  const buttons = [...live, ...today, ...tomorrow].slice(0, 12).map((m) => matchActionRow(m));
  await ctx.send(lines.join("\n"), buttons.length ? buttons : undefined);
}

/* ----------------------------- Calendrier / cycle de vie ----------------------------- */

function nextMatchRows(matches: NormalizedFixture[]): InlineButton[][] {
  return matches.slice(0, 3).map((f) => [
    { text: `📊 Analyser ${f.home.name}-${f.away.name}`, callback_data: `a:${f.fixtureId}` },
    { text: "🔴 Surveiller", callback_data: `w:${f.fixtureId}` },
    winamaxButton(f.fixtureId),
  ]);
}

async function sendNextProposals(ctx: RouterCtx, deps: RouterDeps, intro: string): Promise<void> {
  const nm = await deps.nextMatches();
  const candidates = [...nm.live, ...nm.upcoming];
  if (candidates.length === 0) {
    await ctx.send(`${intro}\n\nAucun prochain match Coupe du monde trouvé.`);
    return;
  }
  const body = [intro, "", ...candidates.slice(0, 5).map((f, i) => matchLine(toResolved(f, "high"), i + 1))].join("\n");
  await ctx.send(body, nextMatchRows(candidates));
}

async function nextFlow(ctx: RouterCtx, deps: RouterDeps): Promise<void> {
  const nm = await deps.nextMatches();
  if (!nm.nextMatch) return void (await ctx.send("Aucun prochain match Coupe du monde non terminé."));
  const m = toResolved(nm.nextMatch, "high");
  await ctx.send(`⏭ Prochain match : ${matchLine(m)}`, [matchActionRow(m)]);
}

async function nextAnalysisFlow(ctx: RouterCtx, deps: RouterDeps): Promise<void> {
  const nm = await deps.nextMatches();
  if (!nm.nextMatch) return void (await ctx.send("Aucun prochain match à analyser."));
  const m = toResolved(nm.nextMatch, "high");
  await ctx.send(`⏳ Analyse du prochain match — ${m.homeTeam} vs ${m.awayTeam}…`);
  const text = await deps.preMatch(m.fixtureId);
  await deliverAnalysis(ctx, text, analysisButtons(m.fixtureId));
}

async function watchNextFlow(ctx: RouterCtx, deps: RouterDeps): Promise<void> {
  const nm = await deps.nextMatches();
  if (!nm.nextMatch) return void (await ctx.send("Aucun prochain match à surveiller."));
  await startWatchForFixture(ctx, deps, toResolved(nm.nextMatch, "high"));
}

async function liveRadarFlow(ctx: RouterCtx, deps: RouterDeps): Promise<void> {
  const ov = await deps.overview();
  const live = ov.live;
  const finished = ov.today.filter((f) => isFinished(f));
  const upcoming = ov.today.filter((f) => getMatchLifecycleStatus(f) === "not_started");
  const hot = live.filter((f) => (f.homeGoals ?? 0) + (f.awayGoals ?? 0) > 0 || (f.elapsed ?? 0) >= 60);
  const warmLive = live.filter((f) => !hot.includes(f));
  const L: string[] = ["📡 Live radar — Coupe du monde (aujourd'hui)"];
  const block = (title: string, arr: NormalizedFixture[]) => {
    if (arr.length) L.push("", title, ...arr.map((f) => matchLine(toResolved(f, "high"))));
  };
  block("🔥 Matchs chauds :", hot);
  block("🟡 À surveiller :", [...warmLive, ...upcoming.slice(0, 4)]);
  block("✅ Terminés :", finished);
  if (live.length + upcoming.length + finished.length === 0) L.push("", "(aucun match aujourd'hui)");
  const buttons = [...hot, ...warmLive, ...upcoming].slice(0, 12).map((f) => matchActionRow(toResolved(f, "high")));
  await ctx.send(L.join("\n"), buttons.length ? buttons : undefined);
}

async function matchStoryFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /match_story <équipe1> <équipe2>"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const w = ctx.state.get(res.match.fixtureId);
    const fixture = w?.lastFixture ?? (await deps.fixtureById(res.match.fixtureId));
    if (!fixture) return void (await ctx.send("Match introuvable."));
    const nowReading = w?.lastAction ? `dernière lecture du bot : ${w.lastAction}` : null;
    await ctx.send(composeMatchStory(fixture, w?.memory ?? null, nowReading));
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function postMatchFlow(ctx: RouterCtx, deps: RouterDeps, rest: string): Promise<void> {
  const query = rest || (ctx.config.defaultFixtureId ? String(ctx.config.defaultFixtureId) : "");
  if (!query) return void (await ctx.send("Usage : /postmatch <équipe1> <équipe2>"));
  const res = await deps.resolve(query);
  if ((res.kind === "match" || res.kind === "fixtureId") && res.match) {
    const fixture = await deps.fixtureById(res.match.fixtureId);
    if (!fixture) return void (await ctx.send("Match introuvable."));
    const memory = ctx.state.get(res.match.fixtureId)?.memory ?? null;
    const buttons = nextMatchRows([...(await deps.nextMatches()).live, ...(await deps.nextMatches()).upcoming]);
    await ctx.send(composePostMatchSummary(fixture, memory, null), buttons.length ? buttons : undefined);
    return;
  }
  if (res.alternatives.length > 0) return void (await sendMatchList(ctx, "Précise le match :", res.alternatives));
  await ctx.send(`Aucun match trouvé pour « ${query} ».`);
}

async function lastFullFlow(ctx: RouterCtx, deps: RouterDeps): Promise<void> {
  const watches = [...ctx.state.watches.values()].filter((w) => w.lastFixture);
  if (watches.length === 0) return void (await ctx.send("Aucun match suivi. Lance /watch puis /last_full."));
  watches.sort((a, b) => b.lastApiPollAt - a.lastApiPollAt);
  const w = watches[0];
  const text = await deps.forcedLive(ctx.state, w.fixtureId);
  await ctx.send(text, [[{ text: "🔴 Surveiller", callback_data: `w:${w.fixtureId}` }, winamaxButton(w.fixtureId)]]);
}

/** Board de cotes le plus récent parmi les surveillances (pour /status, /sources). */
function latestOddsBoard(ctx: RouterCtx): { board: NormalizedOddsBoard | null; lastFetchAt: number } {
  let board: NormalizedOddsBoard | null = null;
  let lastFetchAt = 0;
  for (const w of ctx.state.watches.values()) {
    if (w.sensors.lastOddsPollAt > lastFetchAt) {
      lastFetchAt = w.sensors.lastOddsPollAt;
      board = w.sensors.lastOddsBoard;
    }
  }
  return { board, lastFetchAt };
}

function statusFlow(ctx: RouterCtx): Promise<void> {
  const { state, config } = ctx;
  const watches = state.activeWatches();
  const L: string[] = [];
  L.push("📊 Statut du worker CoteRadar Live");
  L.push(`worker: alive · API monitor=${config.enableApiMonitor ? "on" : "off"} · Telegram=${config.enableTelegram ? "on" : "off"}`);
  L.push(`Quota API aujourd'hui : ${state.apiCallsUsedToday}/${config.maxApiCallsPerDay}`);
  const sh = (n: string) => sourceHealth.get(n)?.status ?? "n/a";
  L.push(`Sources : commentary=${sh("commentary")} · market=${sh("market")} · api=${sh("api")}`);
  L.push(`Matchs surveillés : ${watches.length}`);
  for (const w of watches) {
    const f = w.lastFixture;
    const score = f ? `${f.homeGoals ?? 0}-${f.awayGoals ?? 0}` : w.matchMeta ? "?" : "?";
    const apiAgo = w.lastApiPollAt ? `${Math.round((Date.now() - w.lastApiPollAt) / 1000)}s` : "—";
    const cotes = isLiveOddsExploitable(w.sensors.lastOddsBoard) ? "live" : "—";
    L.push(`• #${w.fixtureId} ${w.label} | score ${score} | action ${w.lastAction ?? "—"} | API il y a ${apiAgo} | cotes ${cotes} | alertes ${w.alertsSent}`);
  }
  if (watches.length === 0) L.push("(aucune surveillance active — lance /watch <match>)");

  const { board, lastFetchAt } = latestOddsBoard(ctx);
  L.push("");
  L.push(...renderOddsStatusLines(buildOddsStatus(config.oddsApi, board, lastFetchAt || null)));
  return ctx.send(L.join("\n"));
}

async function lastFlow(ctx: RouterCtx): Promise<void> {
  const withAnalysis = [...ctx.state.watches.values()].filter((w) => w.lastAnalysisText);
  if (withAnalysis.length === 0) return void (await ctx.send("Aucune analyse disponible. Lance /watch ou /analyse_live."));
  if (withAnalysis.length === 1) return void (await ctx.send(withAnalysis[0].lastAnalysisText as string));
  const buttons = withAnalysis.map((w) => [{ text: `📄 ${w.label}`, callback_data: `la:${w.fixtureId}` }]);
  await ctx.send("Plusieurs matchs — choisis la dernière analyse :", buttons);
}

function sourcesFlow(ctx: RouterCtx): Promise<void> {
  const c = ctx.config;
  const lbl = (name: string, enabled: boolean, poll: number) => {
    if (!enabled) return "disabled";
    const h = sourceHealth.get(name);
    return `${h?.status ?? "OK (en attente)"} (poll ${poll}s)`;
  };
  const { board, lastFetchAt } = latestOddsBoard(ctx);
  const L = [
    "🔌 État des sources",
    `• API-Football : ${c.enableApiMonitor ? lbl("api", true, c.apiPollSeconds) : "disabled"}`,
    `• Commentary scraper : ${lbl("commentary", c.commentary.enabled, c.commentary.pollSeconds)}`,
    `• Market scraper : ${lbl("market", c.market.enabled, c.market.pollSeconds)}`,
    `• Lineup scraper : ${lbl("lineup", c.lineup.enabled, c.lineup.pollSeconds)}`,
    `• News scraper : ${lbl("news", c.news.enabled, c.news.pollSeconds)}`,
    `• Alt stats scraper : ${lbl("altStats", c.altStats.enabled, c.altStats.pollSeconds)}`,
    `• Météo : ${c.weather.enabled ? `${c.weather.apiKeyConfigured ? "OK" : "clé manquante"} (${c.weather.location ?? "lieu ?"})` : "disabled"}`,
    "",
    ...renderOddsStatusLines(buildOddsStatus(c.oddsApi, board, lastFetchAt || null)),
    "",
    "API-Football reste la source principale. Sources secondaires seules = WATCH maximum.",
    "Sans API cotes : aucune value confirmée (WATCH/WAIT, jamais PLAYABLE fort).",
  ];
  return ctx.send(L.join("\n"));
}

/* ----------------------------- entrées ----------------------------- */

export async function routeCommand(rawText: string, ctx: RouterCtx, deps = defaultRouterDeps()): Promise<void> {
  const text = (rawText ?? "").trim();
  if (!text.startsWith("/")) {
    await ctx.send("Tape une commande, ex: /analyse france senegal — ou /help.");
    return;
  }
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@.+$/, "");
  const rest = text.slice(parts[0].length).trim();

  try {
    switch (cmd) {
      case "/start":
      case "/help":
        return void (await ctx.send(helpText()));
      case "/analyse":
      case "/analyse_match":
        return void (await analyseFlow(ctx, deps, rest));
      case "/analyse_full":
        return void (await analyseFullFlow(ctx, deps, rest));
      case "/markets":
      case "/marches":
        return void (await marketsFlow(ctx, deps, rest));
      case "/brief":
        return void (await briefFlow(ctx, deps, rest));
      case "/weather":
      case "/meteo":
        return void (await weatherFlow(ctx, deps, rest));
      case "/bet_live":
      case "/paris_live":
        return void (await betLiveFlow(ctx, deps, rest));
      case "/analyse_live":
        return void (await liveFlow(ctx, deps, rest));
      case "/analyse_live_full":
        return void (await liveFlow(ctx, deps, rest));
      case "/last_full":
        return void (await lastFullFlow(ctx, deps));
      case "/next":
        return void (await nextFlow(ctx, deps));
      case "/next_analysis":
        return void (await nextAnalysisFlow(ctx, deps));
      case "/watch_next":
        return void (await watchNextFlow(ctx, deps));
      case "/live_radar":
        return void (await liveRadarFlow(ctx, deps));
      case "/match_story":
        return void (await matchStoryFlow(ctx, deps, rest));
      case "/postmatch":
        return void (await postMatchFlow(ctx, deps, rest));
      case "/context":
        return void (await contextFlow(ctx, deps, rest));
      case "/watch":
        return void (await watchFlow(ctx, deps, rest));
      case "/stop":
        return void (await stopFlow(ctx, deps, rest));
      case "/today":
        return void (await listFlow(ctx, deps, "today"));
      case "/tomorrow":
        return void (await listFlow(ctx, deps, "tomorrow"));
      case "/matches":
        return void (await matchesFlow(ctx, deps));
      case "/status":
        return void (await statusFlow(ctx));
      case "/last":
        return void (await lastFlow(ctx));
      case "/sources":
        return void (await sourcesFlow(ctx));
      default:
        return void (await ctx.send("Commande inconnue. /help pour la liste."));
    }
  } catch (err) {
    await ctx.send(`⚠️ Erreur : ${(err as Error).message}`);
  }
}

export async function routeCallback(data: string, ctx: RouterCtx, deps = defaultRouterDeps()): Promise<void> {
  const m = (data ?? "").match(/^(a|w|s|l|la):(\d+)$/);
  if (!m) return;
  const action = m[1];
  const id = Number.parseInt(m[2], 10);
  try {
    if (action === "a") {
      const match = await deps.matchById(id);
      if (!match) return void (await ctx.send("Match introuvable."));
      const text = await deps.preMatch(id);
      await deliverAnalysis(ctx, text, analysisButtons(id));
    } else if (action === "w") {
      const match = await deps.matchById(id);
      if (!match) return void (await ctx.send("Match introuvable."));
      await startWatchForFixture(ctx, deps, match);
    } else if (action === "s") {
      const ok = stopWatchByFixture(ctx.state, id);
      await ctx.send(ok ? `🛑 Surveillance arrêtée (#${id}).` : "Aucune surveillance active.");
    } else if (action === "l") {
      const text = await deps.forcedLive(ctx.state, id);
      await ctx.send(text);
    } else if (action === "la") {
      const w = ctx.state.get(id);
      await ctx.send(w?.lastAnalysisText ?? "Aucune analyse pour ce match.");
    }
  } catch (err) {
    await ctx.send(`⚠️ Erreur : ${(err as Error).message}`);
  }
}
