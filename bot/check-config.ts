/**
 * npm run check-config — vérifie la config (sans révéler les secrets).
 */

import { getBotConfig, secretStatus, validateConfig } from "./config";

function main(): void {
  const config = getBotConfig();

  console.log(`[CONFIG] .env loaded=${config.envFileLoaded}`);
  console.log(`[CONFIG] API-Football key=${secretStatus(config.apiKey)}`);
  console.log(`[CONFIG] Telegram token=${secretStatus(config.telegramToken)}`);
  console.log(`[CONFIG] Telegram chat id=${config.telegramChatId ? "configured" : "missing"}`);
  console.log(`[CONFIG] API poll=${config.apiPollSeconds}s`);
  console.log(`[CONFIG] Commentary poll=${config.commentary.pollSeconds}s`);
  console.log(`[CONFIG] Market poll=${config.market.pollSeconds}s`);
  console.log(`[CONFIG] Max API calls/day=${config.maxApiCallsPerDay}`);
  console.log(`[CONFIG] Telegram alerts=${config.enableTelegram}`);
  console.log(`[CONFIG] API monitor=${config.enableApiMonitor}`);
  console.log(`[CONFIG] Commentary scraper=${config.commentary.enabled}`);
  console.log(`[CONFIG] Market scraper=${config.market.enabled}`);

  const v = validateConfig(config);
  for (const w of v.warnings) console.log(`[CONFIG][warn] ${w}`);
  for (const e of v.errors) console.error(`[CONFIG][error] ${e}`);

  process.exit(v.ok ? 0 : 1);
}

main();
