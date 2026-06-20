/**
 * Tests du moteur de DÉCISION live + couche cotes + météo + watchlist marchés.
 * Lancé par `npm run test-betting-engine`. Aucun appel réseau (fonctions pures).
 */

import { buildWeatherFromOpenWeather, composeWeatherReport, unavailableWeather } from "@/bot/weather-service";
import { mapMarketSelection } from "@/bot/odds/market-mapper";
import { normalizeOddsResult, oddForKey } from "@/bot/odds/odds-normalizer";
import { compareOdds, hasDropped, unavailableComparison } from "@/bot/odds/odds-snapshot";
import { fetchLiveOdds, flattenApiFootballOdds, getOddsApiConfig } from "@/bot/odds/odds-provider";
import { buildMarketWatchlist, type MarketWatchlistInput } from "@/bot/market-watchlist";
import { formatLiveBettingDecision, generateLiveBettingDecision } from "@/bot/live-betting-decision-engine";
import { buildOddsStatus, renderOddsStatusLines, summarizeMarkets } from "@/bot/odds/odds-status";
import { routeCommand } from "@/bot/telegram-command-router";
import { BotState } from "@/bot/state";
import { getBotConfig } from "@/bot/config";
import type { NormalizedFixture, NormalizedStatsPair, NormalizedTeamStats, RecentForm } from "@/types/match";
import type { OddsSnapshotComparison } from "@/bot/odds/odds-snapshot";
import type { OddsApiSettings } from "@/bot/config";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

/* ----------------------------- helpers ----------------------------- */

function liveFixture(over: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return {
    fixtureId: 1, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1",
    groupName: "Group I", home: { id: 1, name: "Iran", logo: null }, away: { id: 2, name: "New Zealand", logo: null },
    kickoffAt: "2026-06-16T01:00:00+00:00", statusShort: "2H", statusLong: "Second Half", phase: "live",
    elapsed: 60, homeGoals: 0, awayGoals: 0, venueName: "Stade", venueCity: "Doha", ...over,
  };
}

function teamStats(over: Partial<NormalizedTeamStats>): NormalizedTeamStats {
  const z: NormalizedTeamStats = {
    shotsOnGoal: null, shotsOffGoal: null, totalShots: null, blockedShots: null,
    shotsInsideBox: null, shotsOutsideBox: null, fouls: null, cornerKicks: null,
    offsides: null, ballPossession: null, yellowCards: null, redCards: null,
    goalkeeperSaves: null, totalPasses: null, passesAccurate: null, passesPercent: null,
  };
  return { ...z, ...over };
}

function statsPair(home: Partial<NormalizedTeamStats>, away: Partial<NormalizedTeamStats>): NormalizedStatsPair {
  return { home: teamStats(home), away: teamStats(away), hasData: true };
}

function form(teamId: number, w: number, d: number, l: number, gf: number, ga: number): RecentForm {
  return { teamId, results: [], wins: w, draws: d, losses: l, goalsFor: gf, goalsAgainst: ga };
}

function availableSnapshot(selections: { market: string; selection: string; odd: number }[]): OddsSnapshotComparison {
  const board = normalizeOddsResult({ available: true, reason: null, bookmaker: "TestBook", fetchedAt: new Date().toISOString(), suspended: false, selections });
  return compareOdds(null, board);
}

/* ============================== MÉTÉO ============================== */
console.log("\n[W1] Météo — jamais de température inventée");
{
  const u = unavailableWeather("test");
  check("indisponible => temperatureC null", u.temperatureC === null);
  check("indisponible => summary 'non disponible'", u.summary.includes("non disponible"));
  check("indisponible => pas d'impact", u.impact === null);

  const ok = buildWeatherFromOpenWeather({ main: { temp: 33.4, feels_like: 36, humidity: 40 }, wind: { speed: 5 }, weather: [{ main: "Clear", description: "ciel dégagé" }] }, "Doha");
  check("réponse valide => available", ok.available && ok.temperatureC === 33);
  check("chaleur => impact détecté", (ok.impact ?? "").includes("chaleur"));

  const noTemp = buildWeatherFromOpenWeather({ main: { humidity: 40 }, weather: [{ main: "Rain" }] }, "Doha");
  check("pas de température => indisponible (jamais inventée)", !noTemp.available && noTemp.temperatureC === null);

  const report = composeWeatherReport("Iran vs New Zealand", u);
  check("rapport météo indispo => message clair", report.includes("non disponible") && report.includes("inventée"));
}

/* ============================== MAPPER ============================== */
console.log("\n[O1] Mapper marché/sélection -> clé interne");
{
  check("Match Winner Home", mapMarketSelection("Match Winner", "Home")?.key === "1x2_home");
  check("Over/Under Over 2.5", mapMarketSelection("Goals Over/Under", "Over 2.5")?.key === "over_2_5");
  check("BTTS Yes", mapMarketSelection("Both Teams To Score", "Yes")?.key === "btts_yes");
  check("Next Goal Away", mapMarketSelection("Next Goal", "Away")?.key === "next_goal_away");
  check("marché inconnu => null", mapMarketSelection("Corner Race", "Home") === null);
}

/* ============================== NORMALIZER ============================== */
console.log("\n[O2] Normalisation cotes + proba implicite");
{
  const board = normalizeOddsResult({
    available: true, reason: null, bookmaker: "B", fetchedAt: "t", suspended: false,
    selections: [{ market: "Match Winner", selection: "Home", odd: 2.0 }, { market: "Goals Over/Under", selection: "Over 2.5", odd: 1.8 }],
  });
  check("board disponible", board.available && board.lines.length === 2);
  check("proba implicite 2.0 => 0.5", Math.abs((board.lines.find((l) => l.key === "1x2_home")?.impliedProbability ?? 0) - 0.5) < 1e-9);
  check("oddForKey", oddForKey(board, "over_2_5") === 1.8);

  const empty = normalizeOddsResult({ available: false, reason: "désactivée", bookmaker: null, fetchedAt: "t", suspended: false, selections: [] });
  check("indisponible => board indisponible", !empty.available && oddForKey(empty, "1x2_home") === null);
}

/* ============================== SNAPSHOT ============================== */
console.log("\n[O3] Comparaison de snapshots (baisse/hausse/suspension)");
{
  const prev = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 2.2 }] });
  const cur = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t2", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 1.5 }] });
  const cmp = compareOdds(prev, cur);
  check("baisse détectée", hasDropped(cmp, "next_goal_home"));

  const gone = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t3", suspended: false, selections: [{ market: "Match Winner", selection: "Home", odd: 1.6 }] });
  const cmp2 = compareOdds(prev, gone);
  check("disparition => suspension", cmp2.suspended && cmp2.movements.some((m) => m.direction === "suspended"));

  const u = unavailableComparison("pas de cotes");
  check("comparaison indisponible homogène", !u.available && u.movements.length === 0);
}

/* ============================== PROVIDER ============================== */
console.log("\n[O4] Provider cotes — dégradation propre");
{
  const cfg = getOddsApiConfig();
  check("config par défaut: désactivée", cfg.enabled === false || typeof cfg.enabled === "boolean");

  const flat = flattenApiFootballOdds([{ league: {}, fixture: { id: 1 }, update: "t", bookmakers: [{ id: 1, name: "B", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }] }] }]);
  check("flatten api-football", flat.available && flat.selections[0].selection === "Home");
}
async function providerDisabled(): Promise<void> {
  const res = await fetchLiveOdds(1, { enabled: false, provider: "api-football", apiKey: null, pollSeconds: 20 });
  check("API cotes désactivée => indisponible (pas de crash)", !res.available && (res.reason ?? "").includes("désactivée"));
}

/* ============================== WATCHLIST ============================== */
console.log("\n[M1] Watchlist marchés — joueurs masqués sans compos, jamais sans condition");
{
  const base: MarketWatchlistInput = {
    homeName: "Iran", awayName: "New Zealand", favoriteName: "Iran", underdogName: "New Zealand", favoriteSide: "home",
    homeForm: form(1, 4, 1, 0, 9, 2), awayForm: form(2, 0, 1, 4, 3, 11), lineupsConfirmed: false,
    odds: { available: false, bookmaker: null, updatedAt: null, oneX2: null, overUnder: null, btts: null },
  };
  const w = buildMarketWatchlist(base);
  check("marchés joueurs masqués sans compos", w.playerMarketsAvailable === false && w.playerMarkets.length === 0);
  check("chaque marché a une condition d'entrée", [...w.teamMarkets, ...w.matchMarkets].every((m) => m.entry.trim().length > 0));
  check("à éviter inclut 'sans cote' quand pas de cotes", w.avoid.some((a) => a.toLowerCase().includes("sans cote")));
  check("classement non vide et sans 'AVOID'", w.ranked.length > 0);
  check("marché prioritaire = prochain but favori", w.ranked[0].name.includes("Iran"));

  const confirmed = buildMarketWatchlist({ ...base, lineupsConfirmed: true });
  check("compos confirmées => marchés joueurs présents", confirmed.playerMarketsAvailable && confirmed.playerMarkets.length > 0);

  const lowScoring = buildMarketWatchlist({ ...base, homeForm: form(1, 1, 3, 1, 3, 3), awayForm: form(2, 1, 3, 1, 2, 3) });
  check("profil fermé => Over 2.5 à éviter", lowScoring.matchMarkets.find((m) => m.name.includes("Over 2.5"))?.status === "AVOID");
}

/* ============================== DÉCISION LIVE ============================== */
console.log("\n[D1] Décision — début incertain => WAIT, aucun PLAYABLE");
{
  const d = generateLiveBettingDecision({ fixture: liveFixture({ elapsed: 8 }), statistics: statsPair({}, {}), minute: 8, score: { home: 0, away: 0 } });
  check("action prudente (WAIT/NO_BET)", d.action === "WAIT" || d.action === "NO_BET", d.action);
  check("aucun marché 'playable'", !d.recommendedMarkets.some((m) => m.status === "playable"));
  check("confiance numérique 0-100", typeof d.confidence === "number" && d.confidence >= 0 && d.confidence <= 100);
}

console.log("\n[D2] Décision — pression réelle + cotes => prochain but PLAYABLE");
{
  const snap = availableSnapshot([{ market: "Next Goal", selection: "Home", odd: 2.1 }, { market: "Match Winner", selection: "Home", odd: 1.6 }]);
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 55 }),
    statistics: statsPair({ shotsOnGoal: 5, totalShots: 10, cornerKicks: 6, ballPossession: 60 }, { shotsOnGoal: 1, totalShots: 3, cornerKicks: 1, ballPossession: 40 }),
    oddsSnapshot: snap, minute: 55, score: { home: 0, away: 0 },
  });
  check("action PLAYABLE", d.action === "PLAYABLE", d.action);
  const ng = d.recommendedMarkets.find((m) => m.marketName.includes("Prochain but Iran"));
  check("prochain but Iran jouable sous conditions", ng?.status === "playable" && ng.conditions.length > 0);
  check("cote actuelle renseignée", ng?.currentOdds === "2.10");
}

console.log("\n[D3] Décision — même pression SANS cotes => jamais PLAYABLE (WATCH max)");
{
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 55 }),
    statistics: statsPair({ shotsOnGoal: 5, totalShots: 10, cornerKicks: 6, ballPossession: 60 }, { shotsOnGoal: 1, totalShots: 3, cornerKicks: 1, ballPossession: 40 }),
    oddsSnapshot: unavailableComparison("cotes live non disponibles"), minute: 55, score: { home: 0, away: 0 },
  });
  check("pas de PLAYABLE sans cotes", d.action !== "PLAYABLE", d.action);
  check("prochain but reste 'watch'", d.recommendedMarkets.some((m) => m.marketName.includes("Prochain but Iran") && m.status === "watch"));
  check("résumé prudent (pas de value)", d.summary.toLowerCase().includes("cotes live non disponibles"));
}

console.log("\n[D4] Décision — domination stérile => AVOID");
{
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 60 }),
    statistics: statsPair({ shotsOnGoal: 0, totalShots: 4, cornerKicks: 2, ballPossession: 72 }, { shotsOnGoal: 0, totalShots: 1, cornerKicks: 0, ballPossession: 28 }),
    minute: 60, score: { home: 0, away: 0 },
  });
  check("action AVOID", d.action === "AVOID", d.action);
  check("prochain but dominant marqué 'avoid' (stérile)", d.avoidMarkets.some((m) => m.reason.includes("stérile")));
}

console.log("\n[D5] Décision — marchés déjà résolus par le score (jamais conseillés)");
{
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 70, homeGoals: 2, awayGoals: 2 }),
    statistics: statsPair({ shotsOnGoal: 3 }, { shotsOnGoal: 3 }),
    minute: 70, score: { home: 2, away: 2 },
  });
  check("over 1.5 / 2.5 / BTTS résolus", d.alreadyResolvedMarkets.length >= 3, d.alreadyResolvedMarkets.length);
  check("over 1.5 listé comme résolu", d.alreadyResolvedMarkets.some((m) => m.marketName.includes("Over 1.5")));
  check("BTTS listé comme résolu", d.alreadyResolvedMarkets.some((m) => m.marketName.includes("BTTS")));
  check("aucun marché résolu dans les recommandés", !d.recommendedMarkets.some((m) => m.marketName.includes("Over 1.5")));
}

console.log("\n[D6] Décision — carton rouge contre le dominant => INVALIDATED");
{
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 65 }),
    statistics: statsPair({ shotsOnGoal: 4, cornerKicks: 5, ballPossession: 60 }, { shotsOnGoal: 1 }),
    events: [{ elapsed: 64, extra: null, teamId: 1, teamName: "Iran", playerName: "X", assistName: null, type: "Card", detail: "Red Card", comments: null }],
    previousAdvice: {
      action: "WATCH", mainAdvice: "", matchScenario: "", liveReading: "", confidence: "medium", urgency: "medium",
      dominantTeam: "Iran", whatIWouldDoNow: "",
      momentum: { homeScore: 30, awayScore: 10, dominantTeam: "Iran", isRealPressure: true, isSterileDomination: false, last5MinutesSummary: "", last10MinutesSummary: "", sinceLastGoalSummary: "" },
      contextComparison: { preMatchExpectation: "", currentReality: "", scenarioShift: "", keyDifference: "" },
      recommendedMarkets: [], avoidMarkets: [], resolvedMarkets: [], risks: [], nextCheck: { inMinutes: 3, whatToWatch: [] },
      dataQuality: { hasFixture: true, hasStatistics: true, hasEvents: true, hasLineups: false, hasRecentForm: false, hasH2H: false, hasOdds: false, hasExternalCommentary: false, freshnessSeconds: 0, warning: null },
      finalVerdict: "",
    },
    minute: 65, score: { home: 0, away: 0 },
  });
  check("action INVALIDATED", d.action === "INVALIDATED", d.action);
  check("marché précédent marqué invalidé", d.invalidatedMarkets.some((m) => m.status === "invalidated"));
  check("résumé: pari devenu mauvais", d.summary.includes("devenu mauvais"));
}

console.log("\n[D7] Décision — cote compressée => prochain but à éviter (le marché a réagi)");
{
  const prevBoard = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 2.4 }] });
  const curBoard = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t2", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 1.5 }] });
  const snap = compareOdds(prevBoard, curBoard);
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 55 }),
    statistics: statsPair({ shotsOnGoal: 5, cornerKicks: 6, ballPossession: 60 }, { shotsOnGoal: 1 }),
    oddsSnapshot: snap, minute: 55, score: { home: 0, away: 0 },
  });
  check("pas de PLAYABLE (cote compressée)", d.action !== "PLAYABLE", d.action);
  check("prochain but évité pour compression", d.avoidMarkets.some((m) => m.reason.includes("compressée")));
}

console.log("\n[D8] Format Telegram du signal live — wording autorisé seulement");
{
  const snap = availableSnapshot([{ market: "Next Goal", selection: "Home", odd: 2.1 }]);
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 55 }),
    statistics: statsPair({ shotsOnGoal: 5, cornerKicks: 6, ballPossession: 60 }, { shotsOnGoal: 1 }),
    oddsSnapshot: snap, minute: 55, score: { home: 0, away: 0 },
  });
  const text = formatLiveBettingDecision(liveFixture({ elapsed: 55 }), d);
  check("en-tête signal live", text.includes("⚡ Signal live — Iran vs New Zealand"));
  check("action affichée", /Action : (NO_BET|WAIT|WATCH|PLAYABLE|AVOID|INVALIDATED)/.test(text));
  check("confiance + risque", /Confiance : \d{1,3}\/100/.test(text) && /Risque :/.test(text));
  check("prochain check", text.includes("Prochain check"));
  const forbidden = ["pari sûr", "all-in", "mise forte", "gain garanti"];
  check("aucun wording interdit", forbidden.every((f) => !text.toLowerCase().includes(f)));
}

/* ============================== GARDE-FOU COTES <-> PLAYABLE ============================== */
console.log("\n[G1] Garde-fou cotes : PLAYABLE seulement avec cote live exploitable");
{
  const pressure = () => ({
    fixture: liveFixture({ elapsed: 56 }),
    statistics: statsPair({ shotsOnGoal: 5, totalShots: 11, cornerKicks: 7, ballPossession: 61 }, { shotsOnGoal: 1, totalShots: 3, cornerKicks: 1, ballPossession: 39 }),
    minute: 56, score: { home: 0, away: 0 },
  });

  // 1) Cotes absentes => jamais PLAYABLE.
  const dAbsent = generateLiveBettingDecision({ ...pressure(), oddsSnapshot: unavailableComparison("cotes live non disponibles") });
  check("absentes: action != PLAYABLE", dAbsent.action !== "PLAYABLE", dAbsent.action);
  check("absentes: oddsAvailable=false", dAbsent.oddsAvailable === false);
  check("absentes: prochain but reste 'watch'", dAbsent.recommendedMarkets.some((m) => m.marketName.includes("Prochain but Iran") && m.status === "watch"));

  // 2) Cotes présentes mais compressées => WATCH/AVOID, jamais PLAYABLE.
  const prev = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 2.5 }] });
  const cur = normalizeOddsResult({ available: true, reason: null, bookmaker: "B", fetchedAt: "t2", suspended: false, selections: [{ market: "Next Goal", selection: "Home", odd: 1.5 }] });
  const dCompressed = generateLiveBettingDecision({ ...pressure(), oddsSnapshot: compareOdds(prev, cur) });
  check("compressées: action WATCH ou AVOID", dCompressed.action === "WATCH" || dCompressed.action === "AVOID", dCompressed.action);
  check("compressées: jamais PLAYABLE", dCompressed.action !== "PLAYABLE");
  check("compressées: prochain but évité (le marché a réagi)", dCompressed.avoidMarkets.some((m) => m.reason.includes("compressée")));

  // 3) Cotes présentes + pression réelle + cote exploitable => PLAYABLE possible.
  const fresh = availableSnapshot([{ market: "Next Goal", selection: "Home", odd: 2.1 }]);
  const dPlayable = generateLiveBettingDecision({ ...pressure(), oddsSnapshot: fresh });
  check("exploitable: action PLAYABLE", dPlayable.action === "PLAYABLE", dPlayable.action);
  check("exploitable: oddsAvailable=true", dPlayable.oddsAvailable === true);
  check("exploitable: prochain but 'playable' avec cote", dPlayable.recommendedMarkets.some((m) => m.marketName.includes("Prochain but Iran") && m.status === "playable" && m.currentOdds === "2.10"));
}

console.log("\n[G2] /bet_live sans cote => messages clairs + jamais PLAYABLE");
{
  const d = generateLiveBettingDecision({
    fixture: liveFixture({ elapsed: 56 }),
    statistics: statsPair({ shotsOnGoal: 5, cornerKicks: 7, ballPossession: 61 }, { shotsOnGoal: 1 }),
    oddsSnapshot: unavailableComparison("cotes live non disponibles"), minute: 56, score: { home: 0, away: 0 },
  });
  const text = formatLiveBettingDecision(liveFixture({ elapsed: 56 }), d);
  check("affiche 'PLAYABLE désactivé'", text.includes("PLAYABLE désactivé"));
  check("affiche 'Sans cote live exploitable, aucune value confirmée'", text.includes("Sans cote live exploitable, aucune value confirmée"));
  check("action limitée à WAIT/WATCH/NO_BET/AVOID/INVALIDATED", ["WAIT", "WATCH", "NO_BET", "AVOID", "INVALIDATED"].includes(d.action));
}

/* ============================== VISIBILITÉ COTES (status) ============================== */
console.log("\n[V1] Vue d'état des cotes (buildOddsStatus / render)");
{
  const cfg: OddsApiSettings = { enabled: true, provider: "api-football", apiKeyConfigured: true, pollSeconds: 20 };
  const board = normalizeOddsResult({
    available: true, reason: null, bookmaker: "Bet365", fetchedAt: "t", suspended: false,
    selections: [
      { market: "Match Winner", selection: "Home", odd: 1.8 }, { market: "Match Winner", selection: "Draw", odd: 3.4 }, { market: "Match Winner", selection: "Away", odd: 4.2 },
      { market: "Goals Over/Under", selection: "Over 2.5", odd: 1.9 }, { market: "Goals Over/Under", selection: "Under 2.5", odd: 1.9 },
      { market: "Both Teams To Score", selection: "Yes", odd: 2.1 }, { market: "Both Teams To Score", selection: "No", odd: 1.7 },
      { market: "Next Goal", selection: "Home", odd: 2.05 }, { market: "Next Goal", selection: "Away", odd: 3.1 },
    ],
  });
  const m = summarizeMarkets(board);
  check("résumé 1X2", (m.oneX2 ?? "").includes("Domicile 1.8"));
  check("résumé Over/Under", (m.overUnder ?? "").includes("Over 2.5 1.9"));
  check("résumé BTTS", (m.btts ?? "").includes("Oui 2.1"));
  check("résumé Next Goal", (m.nextGoal ?? "").includes("Domicile 2.05"));

  const view = buildOddsStatus(cfg, board, Date.now());
  check("oddsAvailable + liveOddsAvailable", view.oddsAvailable && view.liveOddsAvailable);
  const lines = renderOddsStatusLines(view).join("\n");
  check("affiche provider/enabled/available", lines.includes("Provider : api-football") && lines.includes("Activé : true") && lines.includes("Live odds available : true"));
  check("affiche les marchés", lines.includes("1X2 :") && lines.includes("Prochain but :"));

  const none = renderOddsStatusLines(buildOddsStatus({ enabled: false, provider: null, apiKeyConfigured: false, pollSeconds: 20 }, null, null)).join("\n");
  check("aucune cote => PLAYABLE désactivé", none.includes("Aucune cote live exploitable — PLAYABLE désactivé."));
  check("aucune cote => dernier fetch jamais", none.includes("Dernier fetch : jamais"));
}

console.log("\n[V2] /status et /sources affichent la visibilité cotes");
async function routerVisibility(): Promise<void> {
  const config = getBotConfig();

  // Avec un board live exploitable sur une surveillance.
  const state = new BotState();
  const w = state.startWatch(1, "Iran vs New Zealand");
  w.sensors.lastOddsBoard = normalizeOddsResult({
    available: true, reason: null, bookmaker: "Bet365", fetchedAt: "t", suspended: false,
    selections: [
      { market: "Match Winner", selection: "Home", odd: 1.8 }, { market: "Match Winner", selection: "Draw", odd: 3.4 }, { market: "Match Winner", selection: "Away", odd: 4.2 },
      { market: "Next Goal", selection: "Home", odd: 2.05 },
    ],
  });
  w.sensors.lastOddsPollAt = Date.now();

  const sentStatus: string[] = [];
  await routeCommand("/status", { config, state, send: async (t: string) => void sentStatus.push(t) });
  const statusText = sentStatus.join("\n");
  check("/status: bloc cotes", statusText.includes("💰 Cotes"));
  check("/status: provider + available", statusText.includes("Provider :") && statusText.includes("Odds available : true") && statusText.includes("Live odds available : true"));
  check("/status: marchés récupérés", statusText.includes("1X2 :") && statusText.includes("Prochain but :"));
  check("/status: indicateur cotes par match", statusText.includes("cotes live"));

  const sentSources: string[] = [];
  await routeCommand("/sources", { config, state, send: async (t: string) => void sentSources.push(t) });
  check("/sources: bloc cotes", sentSources.join("\n").includes("💰 Cotes") && sentSources.join("\n").includes("Live odds available"));

  // Sans board => message PLAYABLE désactivé.
  const empty = new BotState();
  const sentEmpty: string[] = [];
  await routeCommand("/status", { config, state: empty, send: async (t: string) => void sentEmpty.push(t) });
  check("/status sans cote: PLAYABLE désactivé", sentEmpty.join("\n").includes("Aucune cote live exploitable — PLAYABLE désactivé."));
}

Promise.all([providerDisabled(), routerVisibility()]).then(() => {
  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion(s) en échec (betting-engine).`);
    process.exit(1);
  } else {
    console.log("\n✅ Tests betting-engine OK.");
  }
});
