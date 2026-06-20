/**
 * npm run test-telegram — envoie un message de test au TELEGRAM_CHAT_ID.
 * Ne log jamais le token complet (maskSecret).
 */

import { getBotConfig, maskSecret } from "./config";
import { sendTelegramMessage } from "./telegram";

async function main(): Promise<void> {
  const config = getBotConfig();
  if (!config.telegramToken) {
    console.error("TELEGRAM_BOT_TOKEN manquant dans .env.");
    process.exit(1);
  }
  if (!config.telegramChatId) {
    console.error("TELEGRAM_CHAT_ID manquant. Lance d'abord: npm run get-chat-id");
    process.exit(1);
  }
  console.log(`[TELEGRAM] token=${maskSecret(config.telegramToken)} chatId=${config.telegramChatId}`);
  const r = await sendTelegramMessage(config.telegramToken, config.telegramChatId, "✅ CoteRadar Live : test Telegram OK");
  console.log(`[TELEGRAM] sent=${r.ok}${r.error ? ` error=${r.error}` : ""}`);
  process.exit(r.ok ? 0 : 1);
}

main();
