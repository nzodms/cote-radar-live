/**
 * Tests runtime du moteur Live Advice + fenêtres + validation source.
 * Lancer: npm run test   (utilise tsx)
 *
 * Couvre les 10 scénarios obligatoires du cahier des charges.
 */

import { generateLiveBettingAdvice, type GenerateLiveAdviceInput } from "@/lib/live-advice";
import { getLast5MinuteWindow } from "@/lib/live-window-analysis";
import { validateAgainstPrimary } from "@/lib/source-validation";
import type {
  NormalizedFixture,
  NormalizedStatsPair,
  NormalizedTeamStats,
  NormalizedEvent,
  RecentForm,
} from "@/types/match";
import type { StatsSnapshotPoint } from "@/types/live-advice";

const HOME_ID = 1; // Iran
const AWAY_ID = 2; // New Zealand

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

/* ---------------- builders ---------------- */

function team(p: Partial<NormalizedTeamStats>): NormalizedTeamStats {
  return {
    shotsOnGoal: null,
    shotsOffGoal: null,
    totalShots: null,
    blockedShots: null,
    shotsInsideBox: null,
    shotsOutsideBox: null,
    fouls: null,
    cornerKicks: null,
    offsides: null,
    ballPossession: null,
    yellowCards: null,
    redCards: null,
    goalkeeperSaves: null,
    totalPasses: null,
    passesAccurate: null,
    passesPercent: null,
    ...p,
  };
}

function stats(home: NormalizedTeamStats, away: NormalizedTeamStats, hasData = true): NormalizedStatsPair {
  return { home, away, hasData };
}

function fixture(p: Partial<NormalizedFixture>): NormalizedFixture {
  return {
    fixtureId: 1489378,
    leagueId: 1,
    leagueName: "World Cup",
    season: 2026,
    round: "Group Stage - 1",
    groupName: "Group A",
    home: { id: HOME_ID, name: "Iran", logo: null },
    away: { id: AWAY_ID, name: "New Zealand", logo: null },
    kickoffAt: "2026-06-16T01:00:00+00:00",
    statusShort: "1H",
    statusLong: "First Half",
    phase: "live",
    elapsed: 30,
    homeGoals: 0,
    awayGoals: 0,
    venueName: "Test",
    venueCity: "Doha",
    ...p,
  };
}

function form(teamId: number, w: number, d: number, l: number, gf: number, ga: number): RecentForm {
  return { teamId, results: [], wins: w, draws: d, losses: l, goalsFor: gf, goalsAgainst: ga };
}

function goal(elapsed: number, teamId: number, detail = "Normal Goal"): NormalizedEvent {
  return {
    elapsed,
    extra: null,
    teamId,
    teamName: teamId === HOME_ID ? "Iran" : "New Zealand",
    playerName: "Joueur",
    assistName: null,
    type: "Goal",
    detail,
    comments: null,
  };
}

function redCard(elapsed: number, teamId: number): NormalizedEvent {
  return {
    elapsed,
    extra: null,
    teamId,
    teamName: teamId === HOME_ID ? "Iran" : "New Zealand",
    playerName: "Joueur",
    assistName: null,
    type: "Card",
    detail: "Red Card",
    comments: null,
  };
}

const NO_ODDS = { available: false, message: "Cotes indisponibles sur le plan actuel." };

function advise(p: Partial<GenerateLiveAdviceInput>): ReturnType<typeof generateLiveBettingAdvice> {
  const input: GenerateLiveAdviceInput = {
    fixture: fixture({}),
    statistics: stats(team({}), team({}), false),
    events: [],
    lineups: [],
    recentForm: { home: null, away: null },
    h2h: null,
    odds: NO_ODDS,
    previousSnapshots: [],
    externalCommentaryEvents: [],
    freshnessSeconds: 30,
    ...p,
  };
  return generateLiveBettingAdvice(input);
}

// Favori = Iran (home) : forme nettement supérieure.
const FAV_HOME = { home: form(HOME_ID, 4, 1, 0, 10, 2), away: form(AWAY_ID, 0, 1, 4, 2, 10) };

/* ---------------- scénarios ---------------- */

console.log("\n[1] 4', 0-0, aucune statistique");
{
  const a = advise({ fixture: fixture({ elapsed: 4 }), statistics: stats(team({}), team({}), false) });
  check("action = WAIT", a.action === "WAIT", a.action);
  check("aucun marché en timing 'now'", a.recommendedMarkets.every((m) => m.timing !== "now"));
}

console.log("\n[2] Outsider (NZ) mène 0-1 tôt vs favori (Iran)");
{
  const a = advise({
    fixture: fixture({ elapsed: 10, homeGoals: 0, awayGoals: 1 }),
    statistics: stats(team({ totalShots: 2, shotsOnGoal: 1, ballPossession: 55 }), team({ totalShots: 2, shotsOnGoal: 1, ballPossession: 45 })),
    events: [goal(8, AWAY_ID)],
    recentForm: FAV_HOME,
  });
  check("action = WAIT", a.action === "WAIT", a.action);
  check("ne recommande PAS Iran vainqueur live", a.recommendedMarkets.every((m) => m.market !== "home_win_live"));
  check("Iran vainqueur live listé en 'à éviter'", a.avoidMarkets.some((m) => m.market === "home_win_live"));
}

console.log("\n[3] Favori (Iran) mené 0-1 mais réagit fort");
{
  const a = advise({
    fixture: fixture({ elapsed: 40, homeGoals: 0, awayGoals: 1 }),
    statistics: stats(
      team({ totalShots: 8, shotsOnGoal: 4, cornerKicks: 5, ballPossession: 60 }),
      team({ totalShots: 3, shotsOnGoal: 1, cornerKicks: 2, ballPossession: 40 })
    ),
    events: [goal(20, AWAY_ID)],
    recentForm: FAV_HOME,
  });
  check("action = WATCH ou SIGNAL", a.action === "WATCH" || a.action === "SIGNAL", a.action);
  check("recommande Iran prochain but", a.recommendedMarkets.some((m) => m.market === "next_goal_home"));
  check("ne pousse pas Iran vainqueur sec", a.recommendedMarkets.every((m) => m.market !== "home_win_live"));
}

console.log("\n[4] Favori (Iran) mené 0-1 SANS réaction");
{
  const a = advise({
    fixture: fixture({ elapsed: 60, homeGoals: 0, awayGoals: 1 }),
    statistics: stats(
      team({ totalShots: 2, shotsOnGoal: 0, cornerKicks: 1, ballPossession: 52 }),
      team({ totalShots: 5, shotsOnGoal: 2, cornerKicks: 3, ballPossession: 48 })
    ),
    events: [goal(20, AWAY_ID)],
    recentForm: FAV_HOME,
  });
  check("action = AVOID", a.action === "AVOID", a.action);
  check("Iran vainqueur live en 'à éviter'", a.avoidMarkets.some((m) => m.market === "home_win_live"));
}

console.log("\n[5] Domination stérile (Iran) 0-0 à 80'");
{
  const a = advise({
    fixture: fixture({ elapsed: 80, statusShort: "2H", homeGoals: 0, awayGoals: 0 }),
    statistics: stats(
      team({ totalShots: 9, shotsOnGoal: 0, cornerKicks: 8, ballPossession: 70 }),
      team({ totalShots: 3, shotsOnGoal: 1, cornerKicks: 1, ballPossession: 30 })
    ),
  });
  check("action = AVOID", a.action === "AVOID", a.action);
  check("risque domination stérile", a.risks.some((r) => r.type === "sterile_domination"));
  check("Iran vainqueur live en 'à éviter'", a.avoidMarkets.some((m) => m.market === "home_win_live"));
}

console.log("\n[6] Match ouvert, tirs des deux côtés (1-0)");
{
  const a = advise({
    fixture: fixture({ elapsed: 40, homeGoals: 1, awayGoals: 0 }),
    statistics: stats(
      team({ totalShots: 7, shotsOnGoal: 3, cornerKicks: 4, ballPossession: 52 }),
      team({ totalShots: 6, shotsOnGoal: 2, cornerKicks: 3, ballPossession: 48 })
    ),
    events: [goal(15, HOME_ID)],
  });
  check("over 1.5 à surveiller", a.recommendedMarkets.some((m) => m.market === "over_1_5"));
  check("BTTS à surveiller", a.recommendedMarkets.some((m) => m.market === "btts"));
  check("action = WATCH ou SIGNAL", a.action === "WATCH" || a.action === "SIGNAL", a.action);
}

console.log("\n[7] Match fermé après 60' (0-0)");
{
  const a = advise({
    fixture: fixture({ elapsed: 65, statusShort: "2H", homeGoals: 0, awayGoals: 0 }),
    statistics: stats(
      team({ totalShots: 3, shotsOnGoal: 1, cornerKicks: 1, ballPossession: 51 }),
      team({ totalShots: 2, shotsOnGoal: 0, cornerKicks: 1, ballPossession: 49 })
    ),
  });
  check("action = AVOID", a.action === "AVOID", a.action);
  check("over 2.5 en 'à éviter'", a.avoidMarkets.some((m) => m.market === "over_2_5"));
  check("BTTS en 'à éviter'", a.avoidMarkets.some((m) => m.market === "btts"));
}

console.log("\n[8] Carton rouge récent");
{
  const a = advise({
    fixture: fixture({ elapsed: 50, statusShort: "2H", homeGoals: 0, awayGoals: 0 }),
    statistics: stats(
      team({ totalShots: 5, shotsOnGoal: 2, ballPossession: 55, redCards: 0 }),
      team({ totalShots: 3, shotsOnGoal: 1, ballPossession: 45, redCards: 1 })
    ),
    events: [redCard(49, AWAY_ID)],
  });
  check("action = INVALIDATED", a.action === "INVALIDATED", a.action);
  check("risque red_card", a.risks.some((r) => r.type === "red_card"));
}

console.log("\n[9] Cotes absentes : jamais de value confirmée");
{
  const a = advise({
    fixture: fixture({ elapsed: 40, homeGoals: 0, awayGoals: 1 }),
    statistics: stats(
      team({ totalShots: 8, shotsOnGoal: 4, cornerKicks: 5, ballPossession: 60 }),
      team({ totalShots: 3, shotsOnGoal: 1, cornerKicks: 2, ballPossession: 40 })
    ),
    events: [goal(20, AWAY_ID)],
    recentForm: FAV_HOME,
    odds: NO_ODDS,
  });
  check("dataQuality.hasOdds = false", a.dataQuality.hasOdds === false);
  const text = `${a.mainAdvice} ${a.finalVerdict}`.toLowerCase();
  check("mentionne cotes indisponibles / non confirmable", /cotes (live )?indisponibles|non confirmable|pas de value confirm/.test(text), text);
  check("aucun wording interdit", !/pari s[ûu]r|gain garanti|100 ?% gagnant|argent facile/.test(text));
}

console.log("\n[10] Source secondaire contradictoire");
{
  const result = validateAgainstPrimary(
    { scoreHome: 0, scoreAway: 0, elapsed: 30 },
    [
      { minute: 12, timeLabel: null, teamName: "Iran", playerName: null, eventType: "goal", rawTitle: "GOAL", rawDescription: "", normalizedImpact: "high" },
      { minute: 20, timeLabel: null, teamName: "Iran", playerName: null, eventType: "goal", rawTitle: "GOAL", rawDescription: "", normalizedImpact: "high" },
    ],
    20
  );
  check("source jugée incohérente (isValid=false)", result.isValid === false, result);
  check("avertissement de score présent", result.warnings.length > 0);
}

console.log("\n[11] Fenêtre 5 min : pression mesurée via deltas de snapshots");
{
  const snapshots: StatsSnapshotPoint[] = [
    { collectedAt: "2026-06-16T01:30:00Z", elapsed: 30, home: team({ totalShots: 4, shotsOnGoal: 1, cornerKicks: 2 }), away: team({ totalShots: 3, shotsOnGoal: 1, cornerKicks: 2 }) },
  ];
  const w = getLast5MinuteWindow({
    current: { elapsed: 35, home: team({ totalShots: 7, shotsOnGoal: 3, cornerKicks: 4 }), away: team({ totalShots: 3, shotsOnGoal: 1, cornerKicks: 2 }) },
    snapshots,
    events: [],
    homeId: HOME_ID,
    awayId: AWAY_ID,
    homeName: "Iran",
    awayName: "New Zealand",
  });
  check("fenêtre exploitable (hasData)", w.hasData === true);
  check("pression côté Iran (home)", w.pressureTeam === "home", w.pressureTeam);
  check("delta tirs cadrés home = 2", w.home.shotsOnTarget === 2, w.home.shotsOnTarget);
}

/* ---------------- résultat ---------------- */
if (failures > 0) {
  console.error(`\n❌ ${failures} assertion(s) en échec.`);
  process.exit(1);
} else {
  console.log("\n✅ Tous les tests passent.");
}
