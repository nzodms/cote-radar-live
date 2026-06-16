/**
 * npm run simulate-critical-event
 * Simule "75' But Iran" (API) et prouve: impact CRITICAL -> alerte immédiate,
 * cooldown ignoré, doublon exact bloqué (même event id).
 */

import { getBotConfig } from "./config";
import { sendTelegramMessage } from "./telegram";
import { classifyApiEvent } from "./alert-classifier";
import { runLiveCycle } from "./live-engine";
import { createWatchState } from "./state";
import { formatLiveAlert } from "./format";
import type { NormalizedEvent, NormalizedFixture, NormalizedStatsPair, NormalizedTeamStats } from "@/types/match";

function team(p: Partial<NormalizedTeamStats>): NormalizedTeamStats {
  return { shotsOnGoal: null, shotsOffGoal: null, totalShots: null, blockedShots: null, shotsInsideBox: null, shotsOutsideBox: null, fouls: null, cornerKicks: null, offsides: null, ballPossession: null, yellowCards: null, redCards: null, goalkeeperSaves: null, totalPasses: null, passesAccurate: null, passesPercent: null, ...p };
}

const fixture: NormalizedFixture = {
  fixtureId: 1489378, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1",
  groupName: "Group A", home: { id: 1, name: "Iran", logo: null }, away: { id: 2, name: "New Zealand", logo: null },
  kickoffAt: "2026-06-16T01:00:00+00:00", statusShort: "2H", statusLong: "Seconde période", phase: "live",
  elapsed: 75, homeGoals: 3, awayGoals: 2, venueName: null, venueCity: null,
};
const statistics: NormalizedStatsPair = {
  home: team({ totalShots: 13, shotsOnGoal: 7, cornerKicks: 8, ballPossession: 60 }),
  away: team({ totalShots: 6, shotsOnGoal: 3, cornerKicks: 3, ballPossession: 40 }),
  hasData: true,
};
const goal: NormalizedEvent = {
  elapsed: 75, extra: null, teamId: 1, teamName: "Iran", playerName: "Taremi", assistName: null,
  type: "Goal", detail: "Normal Goal", comments: null,
};

async function main(): Promise<void> {
  const config = getBotConfig();
  console.log("=== simulate-critical-event : 75' But Iran ===\n");

  const cls = classifyApiEvent(goal);
  console.log(`Classification   : level=${cls.level} kind=${cls.kind}`);

  const scratch = createWatchState(fixture.fixtureId, "Iran vs New Zealand");
  // Un HIGH récent pour prouver que le CRITICAL ignore le cooldown.
  scratch.gate.markSent({ dedupId: "warmup", level: "HIGH", source: "api", kind: "shot_on_target", whatHappened: "", signature: `WATCH|next_goal_home|3-2` });

  const { advice, alerts } = runLiveCycle(
    { fixture, statistics, events: [goal], lineups: [], recentForm: { home: null, away: null }, h2h: null, previousSnapshots: [], commentary: [] },
    scratch,
    "api"
  );
  const alert = alerts.find((a) => a.kind === "goal");

  let ok = true;
  if (!alert) { ok = false; console.error("✗ aucune alerte but produite"); }
  else {
    console.log(`Alerte           : level=${alert.level} kind=${alert.kind} id=${alert.dedupId}`);
    const d1 = scratch.gate.decide(alert);
    console.log(`1er envoi        : send=${d1.send} (${d1.reason})  <- cooldown ignoré pour CRITICAL`);
    scratch.gate.markSent(alert);
    const d2 = scratch.gate.decide(alert);
    console.log(`2e envoi (même id): send=${d2.send} (${d2.reason})  <- doublon exact bloqué`);
    if (alert.level !== "CRITICAL") { ok = false; console.error("✗ niveau attendu CRITICAL"); }
    if (!d1.send) { ok = false; console.error("✗ CRITICAL non envoyé immédiatement"); }
    if (d2.send) { ok = false; console.error("✗ doublon exact non bloqué"); }

    const text = formatLiveAlert({
      fixture, advice, level: alert.level, source: "api", whatHappened: alert.whatHappened,
      fusion: { sources: ["API"], contradictions: [], confidence: "high" },
    });
    console.log(`\n--- ALERTE TELEGRAM CONSTRUITE ---\n${text}\n----------------------------------\n`);

    if (config.enableTelegram && config.telegramToken && config.telegramChatId) {
      const r = await sendTelegramMessage(config.telegramToken, config.telegramChatId, text);
      console.log(`Telegram         : sent=${r.ok}${r.error ? ` error=${r.error}` : ""}`);
    } else {
      console.log("Telegram         : non configuré (alerte affichée ci-dessus, non envoyée).");
    }
  }

  console.log(ok ? "\n✅ simulate-critical-event OK" : "\n❌ simulate-critical-event KO");
  process.exit(ok ? 0 : 1);
}

main();
