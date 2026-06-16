/**
 * npm run worker:debug — diagnostic clair sans démarrer les boucles.
 */

import { getBotConfig } from "./config";
import { getMe } from "./telegram";
import { getAccountStatus } from "@/lib/api-football";
import { loadPersisted } from "./persistence";

async function main(): Promise<void> {
  const config = getBotConfig();

  const tg = config.telegramToken ? await getMe(config.telegramToken) : { ok: false, username: undefined };
  let api: { ok: boolean; plan: string | null } = { ok: false, plan: null };
  if (config.apiKey) {
    try {
      const s = await getAccountStatus();
      api = { ok: s.ok, plan: s.plan };
    } catch {
      api = { ok: false, plan: null };
    }
  }

  const persisted = loadPersisted(config.statePath);
  const w = persisted?.watches?.[0];
  const score = w?.lastFixture
    ? `${w.lastFixture.homeGoals ?? "?"}-${w.lastFixture.awayGoals ?? "?"}`
    : "—";

  const row = (k: string, v: string) => console.log(`${k.padEnd(30)}: ${v}`);
  console.log("===== CoteRadar Live — worker:debug =====");
  row("bot Telegram connecté", tg.ok ? `oui${tg.username ? ` (@${tg.username})` : ""}` : "non");
  row("chat id configuré", config.telegramChatId ? "oui" : "non");
  row("API-Football OK", api.ok ? `oui${api.plan ? ` (plan ${api.plan})` : ""}` : "non");
  row("watcher API enabled", config.enableApiMonitor ? "oui" : "non");
  row("watcher Winamax enabled", config.commentary.enabled ? "oui" : "non");
  row("poll API actuel", `${config.apiPollSeconds}s`);
  row("poll Winamax actuel", `${config.commentary.pollSeconds}s`);
  row("fixture surveillé", String(w?.fixtureId ?? config.defaultFixtureId ?? "—"));
  row("dernier score", score);
  row("dernière action", w?.lastAction ?? "—");
  row("dernier event commentaire", w?.lastCommentaryText ?? "—");
  row("dernière alerte envoyée", w?.lastAlertText ?? "—");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("worker:debug erreur:", (err as Error).message);
  process.exit(1);
});
