/**
 * npm run get-chat-id — affiche les chat.id disponibles via getUpdates.
 * Ne log jamais le token complet (maskSecret).
 */

import { getBotConfig, maskSecret } from "./config";

interface TgChat {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
}

async function main(): Promise<void> {
  const config = getBotConfig();
  if (!config.telegramToken) {
    console.error("TELEGRAM_BOT_TOKEN manquant dans .env.");
    process.exit(1);
  }
  const link = config.telegramBotLink ?? "https://t.me/CoteRadar_bot";
  console.log(`[TELEGRAM] token=${maskSecret(config.telegramToken)} — lecture des updates…`);

  let updates: Array<{ message?: { chat?: TgChat }; my_chat_member?: { chat?: TgChat } }> = [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/getUpdates?limit=50`, {
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json()) as { ok: boolean; result?: typeof updates };
    if (!json.ok) {
      console.error("Réponse Telegram non OK. Vérifie le token.");
      process.exit(1);
    }
    updates = json.result ?? [];
  } catch (err) {
    console.error("Erreur réseau Telegram:", (err as Error).message);
    process.exit(1);
  }

  if (updates.length === 0) {
    console.log("\nAucun message reçu pour l'instant.");
    console.log(`1. Ouvre le bot : ${link}`);
    console.log("2. Envoie /start (ou un message)");
    console.log("3. Relance : npm run get-chat-id");
    process.exit(0);
  }

  const seen = new Set<string>();
  console.log("\nchat.id disponibles :");
  for (const u of updates) {
    const chat = u.message?.chat ?? u.my_chat_member?.chat;
    if (!chat) continue;
    const key = String(chat.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = chat.title ?? chat.username ?? chat.first_name ?? "";
    console.log(`  chat.id=${chat.id}  type=${chat.type ?? "?"}  ${name}`);
  }
  console.log("\n➡️  Copie le chat.id ci-dessus dans TELEGRAM_CHAT_ID de ton .env.");
  process.exit(0);
}

main();
