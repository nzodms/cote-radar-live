/**
 * npm run simulate-hot-event
 * Simule "72' Tir cadré Iran" (source secondaire) et prouve le pipeline:
 * parser -> shot_on_target -> HIGH -> immediateAnalysis -> alerte construite,
 * action plafonnée à WATCH (source secondaire seule, pas de SIGNAL fort).
 */

import { getBotConfig } from "./config";
import { sendTelegramMessage } from "./telegram";
import { parseCommentaryFeed } from "@/lib/commentary-parser";
import { classifyCommentaryEvent } from "./alert-classifier";
import { runLiveCycle } from "./live-engine";
import { createWatchState } from "./state";
import { formatLiveAlert } from "./format";
import type { NormalizedFixture, NormalizedStatsPair, NormalizedTeamStats } from "@/types/match";

function team(p: Partial<NormalizedTeamStats>): NormalizedTeamStats {
  return { shotsOnGoal: null, shotsOffGoal: null, totalShots: null, blockedShots: null, shotsInsideBox: null, shotsOutsideBox: null, fouls: null, cornerKicks: null, offsides: null, ballPossession: null, yellowCards: null, redCards: null, goalkeeperSaves: null, totalPasses: null, passesAccurate: null, passesPercent: null, ...p };
}

const fixture: NormalizedFixture = {
  fixtureId: 1489378, leagueId: 1, leagueName: "World Cup", season: 2026, round: "Group Stage - 1",
  groupName: "Group A", home: { id: 1, name: "Iran", logo: null }, away: { id: 2, name: "New Zealand", logo: null },
  kickoffAt: "2026-06-16T01:00:00+00:00", statusShort: "2H", statusLong: "Seconde période", phase: "live",
  elapsed: 72, homeGoals: 2, awayGoals: 2, venueName: null, venueCity: null,
};
const statistics: NormalizedStatsPair = {
  home: team({ totalShots: 11, shotsOnGoal: 6, cornerKicks: 7, ballPossession: 58 }),
  away: team({ totalShots: 6, shotsOnGoal: 3, cornerKicks: 3, ballPossession: 42 }),
  hasData: true,
};

async function main(): Promise<void> {
  const config = getBotConfig();
  console.log("=== simulate-hot-event : 72' Tir cadré Iran ===\n");

  const events = parseCommentaryFeed([{ title: "72' Tir cadré Iran", minuteHint: 72 }], "Iran", "New Zealand");
  const ev = events[0];
  const cls = classifyCommentaryEvent(ev);
  console.log(`Parser           : eventType=${ev.eventType} minute=${ev.minute} team=${ev.teamName}`);
  console.log(`Classification   : level=${cls.level} kind=${cls.kind}`);
  const immediateAnalysis = cls.level === "HIGH" || cls.level === "CRITICAL";
  console.log(`immediateAnalysis: ${immediateAnalysis}`);

  const scratch = createWatchState(fixture.fixtureId, "Iran vs New Zealand");
  scratch.commentary = events;
  const { advice, alerts } = runLiveCycle(
    { fixture, statistics, events: [], lineups: [], recentForm: { home: null, away: null }, h2h: null, previousSnapshots: [], commentary: events },
    scratch,
    "secondary"
  );
  const alert = alerts.find((a) => a.kind === "shot_on_target") ?? alerts[0];

  let ok = true;
  if (!alert) { ok = false; console.error("✗ aucune alerte produite"); }
  else {
    const text = formatLiveAlert({
      fixture, advice, level: alert.level, source: "secondary", whatHappened: alert.whatHappened,
      fusion: { sources: ["commentaires"], contradictions: [], confidence: "low" },
    });
    console.log(`\n--- ALERTE TELEGRAM CONSTRUITE ---\n${text}\n----------------------------------\n`);

    const actionLine = text.split("\n").find((l) => l.startsWith("Action")) ?? "";
    const capped = /Action : WATCH/.test(text);
    console.log(`Action affichée  : ${actionLine.replace("Action : ", "")}`);
    console.log(`Plafond WATCH    : ${capped ? "oui (source secondaire seule)" : "NON"}`);
    if (alert.level !== "HIGH") { ok = false; console.error(`✗ niveau attendu HIGH, obtenu ${alert.level}`); }
    if (!capped) { ok = false; console.error("✗ action non plafonnée à WATCH"); }

    if (config.enableTelegram && config.telegramToken && config.telegramChatId) {
      const r = await sendTelegramMessage(config.telegramToken, config.telegramChatId, text);
      console.log(`Telegram         : sent=${r.ok}${r.error ? ` error=${r.error}` : ""}`);
    } else {
      console.log("Telegram         : non configuré (alerte affichée ci-dessus, non envoyée).");
    }
  }

  console.log(ok ? "\n✅ simulate-hot-event OK" : "\n❌ simulate-hot-event KO");
  process.exit(ok ? 0 : 1);
}

main();
