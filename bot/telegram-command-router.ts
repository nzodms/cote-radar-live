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
import { winamaxButton, winamaxSearchButton, type InlineButton } from "./bookmaker-links";
import { buildAnalysisParts } from "./analysis-splitter";
import { sourceHealth } from "./scrapers/source-health";

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
    "/watch france senegal     — surveillance live",
    "/analyse demain           — matchs de demain (boutons)",
    "/today  /tomorrow  /matches — programme",
    "/analyse_live france senegal — analyse live immédiate",
    "/context france senegal   — contexte + plan live",
    "/stop france senegal      — arrête une surveillance",
    "/status  /last  /sources  /help",
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
  const list = (which === "today" ? ov.today : ov.tomorrow).map((f) => toResolved(f, "high"));
  const title = which === "today" ? "📅 Matchs Coupe du monde — aujourd'hui" : "📅 Matchs Coupe du monde — demain";
  await sendMatchList(ctx, title, list);
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
    L.push(`• #${w.fixtureId} ${w.label} | score ${score} | action ${w.lastAction ?? "—"} | API il y a ${apiAgo} | alertes ${w.alertsSent}`);
  }
  if (watches.length === 0) L.push("(aucune surveillance active — lance /watch <match>)");
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
  const L = [
    "🔌 État des sources",
    `• API-Football : ${c.enableApiMonitor ? lbl("api", true, c.apiPollSeconds) : "disabled"}`,
    `• Commentary scraper : ${lbl("commentary", c.commentary.enabled, c.commentary.pollSeconds)}`,
    `• Market scraper : ${lbl("market", c.market.enabled, c.market.pollSeconds)}`,
    `• Lineup scraper : ${lbl("lineup", c.lineup.enabled, c.lineup.pollSeconds)}`,
    `• News scraper : ${lbl("news", c.news.enabled, c.news.pollSeconds)}`,
    `• Alt stats scraper : ${lbl("altStats", c.altStats.enabled, c.altStats.pollSeconds)}`,
    `• Météo : ${c.weather.enabled ? `${c.weather.apiKeyConfigured ? "OK" : "clé manquante"} (${c.weather.location ?? "lieu ?"})` : "disabled"}`,
    `• API cotes : ${c.oddsApi.enabled ? `${c.oddsApi.provider ?? "?"} (poll ${c.oddsApi.pollSeconds}s)` : "disabled — cotes live non disponibles"}`,
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
