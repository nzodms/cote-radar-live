/**
 * Tests du bot multi-match dynamique: team-normalizer, match-resolver,
 * watch-manager, bookmaker-links, router (langage naturel), config sans FIXTURE_ID.
 * Lancé par `npm run test-multi-match`.
 */

import { apiTeamMentionedIn, normalizeText, sameTeam } from "@/bot/team-normalizer";
import { resolveMatchFromText, toResolved, type ResolvedMatch } from "@/bot/match-resolver";
import { startWatchForMatch, stopWatchByFixture } from "@/bot/watch-manager";
import { winamaxButton } from "@/bot/bookmaker-links";
import { routeCallback, routeCommand, type RouterDeps } from "@/bot/telegram-command-router";
import { BotState } from "@/bot/state";
import { applyPersisted } from "@/bot/persistence";
import { getBotConfig, type BotConfig } from "@/bot/config";
import type { NormalizedFixture } from "@/types/match";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

const TODAY = "2026-06-16";
const TOMORROW = "2026-06-17";

function fx(id: number, home: string, away: string, date: string, phase: NormalizedFixture["phase"] = "scheduled"): NormalizedFixture {
  return {
    fixtureId: id, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1", groupName: "Group A",
    home: { id: id * 10 + 1, name: home, logo: null }, away: { id: id * 10 + 2, name: away, logo: null },
    kickoffAt: `${date}T18:00:00+00:00`, statusShort: phase === "finished" ? "FT" : phase === "live" ? "2H" : "NS",
    statusLong: phase, phase, elapsed: phase === "live" ? 60 : null, homeGoals: phase === "scheduled" ? null : 1, awayGoals: phase === "scheduled" ? null : 0,
    venueName: "Stade", venueCity: "Ville",
  };
}

const FIXTURES: NormalizedFixture[] = [
  fx(66457006, "France", "Senegal", TODAY),
  fx(66457012, "Iraq", "Norway", TODAY),
  fx(66457018, "Argentina", "Algeria", TODAY),
  fx(66470001, "France", "Iraq", TOMORROW), // rend "france" ambigu
  fx(66460001, "Portugal", "Congo DR", TOMORROW),
  fx(66460002, "England", "Croatia", TOMORROW),
  fx(1489378, "Iran", "New Zealand", "2026-06-10", "finished"), // match test terminé
];

const resolverDeps = {
  fixtures: async () => FIXTURES,
  fixtureById: async (id: number) => FIXTURES.find((f) => f.fixtureId === id) ?? null,
  today: TODAY,
};

console.log("\n[N1] team-normalizer");
{
  check("normalizeText accents/tirets", normalizeText("France - Sénégal") === "france senegal", normalizeText("France - Sénégal"));
  check("France mentionnée dans 'france senegal'", apiTeamMentionedIn("france senegal", "France"));
  check("Senegal mentionné (accent)", apiTeamMentionedIn("France - Sénégal", "Senegal"));
  check("Argentina pas mentionnée", !apiTeamMentionedIn("france senegal", "Argentina"));
  check("alias 'algerie' -> Algeria", apiTeamMentionedIn("argentine algerie", "Algeria"));
  check("alias 'rd congo' -> Congo DR", apiTeamMentionedIn("rd congo portugal", "Congo DR"));
  check("sameTeam accent", sameTeam("Sénégal", "senegal"));
  check("sameTeam différent", !sameTeam("France", "Senegal"));
}

async function run(): Promise<void> {
  console.log("\n[N2] match-resolver");
  {
    const r1 = await resolveMatchFromText("france senegal", resolverDeps);
    check("'france senegal' -> match unique", r1.kind === "match" && r1.match?.fixtureId === 66457006, r1.kind);
    const r2 = await resolveMatchFromText("France - Sénégal vs", resolverDeps);
    check("'France - Sénégal' (séparateurs) résolu", r2.match?.fixtureId === 66457006);
    const r3 = await resolveMatchFromText("66457018", resolverDeps);
    check("fixtureId numérique", r3.kind === "fixtureId" && r3.match?.fixtureId === 66457018);
    const r4 = await resolveMatchFromText("demain", resolverDeps);
    check("'demain' -> date list", r4.kind === "date" && r4.date === TOMORROW && r4.alternatives.length === 3, r4.alternatives.length);
    const r5 = await resolveMatchFromText("france", resolverDeps);
    check("'france' seul -> ambigu (2 matchs)", r5.kind === "ambiguous" && r5.alternatives.length === 2, r5);
    const r6 = await resolveMatchFromText("japon coree", resolverDeps);
    check("inconnu -> not_found", r6.kind === "not_found");
    const r7 = await resolveMatchFromText("argentine algerie", resolverDeps);
    check("'argentine algerie' -> Argentina-Algeria", r7.match?.fixtureId === 66457018);
  }

  console.log("\n[N3] watch-manager multi-match (scopé par fixtureId)");
  {
    const state = new BotState();
    const config = getBotConfig();
    const m1 = toResolved(FIXTURES[0], "high"); // France-Senegal
    const m2 = toResolved(FIXTURES[2], "high"); // Argentina-Algeria
    startWatchForMatch(state, config, m1);
    startWatchForMatch(state, config, m2);
    check("2 watches actives", state.activeWatches().length === 2);
    check("watch scopé (France-Senegal)", state.get(66457006)?.label === "France vs Senegal");
    check("matchMeta enregistré", state.get(66457006)?.matchMeta?.awayTeam === "Senegal");
    stopWatchByFixture(state, 66457006);
    check("stop -> 1 watch active", state.activeWatches().length === 1);
  }

  console.log("\n[N4] bookmaker fallback ne bloque pas");
  {
    delete process.env.WINAMAX_MATCH_URL;
    const b = winamaxButton(66457006);
    check("fallback Winamax Foot", b.url?.includes("winamax.fr") === true && !b.callback_data, b);
    process.env.WINAMAX_MATCH_URL_66457006 = "https://example.com/match";
    check("URL directe par fixture", winamaxButton(66457006).url === "https://example.com/match");
    delete process.env.WINAMAX_MATCH_URL_66457006;
  }

  console.log("\n[N5] router langage naturel + boutons");
  {
    const config = getBotConfig();
    const state = new BotState();
    const sent: Array<{ text: string; buttons?: unknown }> = [];
    const deps: RouterDeps = {
      resolve: (t) => resolveMatchFromText(t, resolverDeps),
      preMatch: async (id) => `PREMATCH:${id}`,
      fullPreMatch: async (id) => `PREMATCH_FULL:${id}`,
      markets: async (id) => `MARKETS:${id}`,
      brief: async (id) => `BRIEF:${id}`,
      weather: async (m) => `WEATHER:${m.fixtureId}`,
      betLive: async (_s, id) => `BETLIVE:${id}`,
      context: async (id) => `CONTEXT:${id}`,
      forcedLive: async (_s, id) => `LIVE:${id}`,
      overview: async () => ({ today: FIXTURES.filter((f) => f.kickoffAt.startsWith(TODAY)), tomorrow: FIXTURES.filter((f) => f.kickoffAt.startsWith(TOMORROW)), live: [] }),
      matchById: async (id) => { const f = FIXTURES.find((x) => x.fixtureId === id); return f ? toResolved(f, "high") : null; },
      nextMatches: async () => ({ finished: [], live: [], upcoming: FIXTURES, nextMatch: FIXTURES[0] ?? null }),
      fixtureById: async (id) => FIXTURES.find((x) => x.fixtureId === id) ?? null,
    };
    const ctx = { config, state, send: async (text: string, buttons?: unknown) => void sent.push({ text, buttons }) };

    await routeCommand("/analyse france senegal", ctx, deps);
    check("/analyse france senegal -> analyse", sent.some((s) => s.text === "PREMATCH:66457006"));
    check("/analyse fournit des boutons", sent.some((s) => s.text === "PREMATCH:66457006" && Array.isArray(s.buttons)));

    sent.length = 0;
    await routeCommand("/watch france senegal", ctx, deps);
    check("/watch démarre la surveillance scopée", state.get(66457006)?.active === true);
    check("/watch confirme + boutons", sent.some((s) => s.text.includes("Surveillance lancée") && Array.isArray(s.buttons)));

    sent.length = 0;
    await routeCommand("/today", ctx, deps);
    check("/today liste les matchs du jour", sent.some((s) => s.text.includes("France vs Senegal") && Array.isArray(s.buttons)));

    sent.length = 0;
    await routeCommand("/tomorrow", ctx, deps);
    check("/tomorrow liste demain", sent.some((s) => s.text.includes("Portugal vs Congo DR")));

    sent.length = 0;
    await routeCommand("/analyse demain", ctx, deps);
    check("/analyse demain -> alternatives", sent.some((s) => Array.isArray(s.buttons) && s.text.includes("Matchs du") && s.text.includes("Portugal vs Congo DR")));

    sent.length = 0;
    await routeCommand("/analyse 66457018", ctx, deps);
    check("fixtureId numérique via router", sent.some((s) => s.text === "PREMATCH:66457018"));

    sent.length = 0;
    await routeCommand("/analyse france", ctx, deps);
    check("/analyse france -> ambigu (liste)", sent.some((s) => Array.isArray(s.buttons) && /correspondent|précise/i.test(s.text)));

    sent.length = 0;
    await routeCallback("w:66460001", ctx, deps);
    check("callback w: démarre la surveillance", state.get(66460001)?.active === true);
  }

  console.log("\n[N6] config sans FIXTURE_ID + persistance (Iran/NZ terminé ignoré)");
  {
    delete process.env.FIXTURE_ID;
    check("defaultFixtureId null sans FIXTURE_ID", getBotConfig().defaultFixtureId === null);
    process.env.FIXTURE_ID = "66457006";
    check("defaultFixtureId lu si présent", getBotConfig().defaultFixtureId === 66457006);
    delete process.env.FIXTURE_ID;

    const state = new BotState();
    applyPersisted(state, {
      version: 1, date: TODAY, apiCallsUsedToday: 0, lastApiPollAt: 0, lastWinamaxPollAt: 0,
      watches: [
        { fixtureId: 1489378, label: "Iran vs New Zealand", matchMeta: { homeTeam: "Iran", awayTeam: "New Zealand", status: "finished", date: "2026-06-10", venue: null, round: "" }, sourceUrls: { winamax: null }, lastFixture: null, lastAction: null, lastAdvice: null, lastCommentaryText: null, lastAlertText: null, seenWinamaxEventIds: [], seenApiEventIds: [], lastAlerts: [], alertsSent: 0 },
        { fixtureId: 66457006, label: "France vs Senegal", matchMeta: { homeTeam: "France", awayTeam: "Senegal", status: "not_started", date: TODAY, venue: null, round: "" }, sourceUrls: { winamax: null }, lastFixture: null, lastAction: null, lastAdvice: null, lastCommentaryText: null, lastAlertText: null, seenWinamaxEventIds: [], seenApiEventIds: [], lastAlerts: [], alertsSent: 0 },
      ],
    } as never);
    check("match terminé NON réactivé", state.get(1489378) === undefined || state.get(1489378)?.active !== true);
    check("match à venir réhydraté", state.get(66457006)?.active === true);
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion(s) en échec (multi-match).`);
    process.exit(1);
  } else {
    console.log("\n✅ Tests multi-match OK.");
  }
}

run();
