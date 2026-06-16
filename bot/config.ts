/**
 * Configuration du worker Telegram (indépendant de Vercel).
 *
 * Charge .env / .env.local manuellement (pas de dépendance dotenv) puis expose
 * une config typée. Les valeurs absentes ne font pas planter le worker.
 */

import fs from "node:fs";
import path from "node:path";

function loadDotenv(file: string): void {
  try {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) return;
    const content = fs.readFileSync(p, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* silencieux */
  }
}

// Charge l'environnement au premier import (worker uniquement, à l'exécution).
loadDotenv(".env");
loadDotenv(".env.local");

function int(v: string | undefined, d: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}
function bool(v: string | undefined, d: boolean): boolean {
  return v === undefined ? d : v.toLowerCase() === "true";
}

export interface BotConfig {
  apiKey: string | null;
  telegramToken: string | null;
  telegramChatId: string | null;
  defaultFixtureId: number | null;
  matchLabel: string | null;
  winamaxUrl: string | null;
  apiPollSeconds: number;
  winamaxPollSeconds: number;
  maxApiCallsPerDay: number;
  enableTelegram: boolean;
  enableWinamax: boolean;
  enableApiMonitor: boolean;
}

export function getBotConfig(): BotConfig {
  const fid = Number.parseInt(process.env.FIXTURE_ID ?? "", 10);
  return {
    apiKey: process.env.APISPORTS_KEY || null,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
    defaultFixtureId: Number.isFinite(fid) && fid > 0 ? fid : null,
    matchLabel: process.env.MATCH_LABEL || null,
    winamaxUrl: process.env.WINAMAX_MATCH_URL || null,
    apiPollSeconds: int(process.env.API_POLL_INTERVAL_SECONDS, 30),
    winamaxPollSeconds: int(process.env.WINAMAX_POLL_INTERVAL_SECONDS, 10),
    maxApiCallsPerDay: int(process.env.MAX_API_CALLS_PER_DAY, 7500),
    enableTelegram: bool(process.env.ENABLE_TELEGRAM_ALERTS, true),
    enableWinamax: bool(process.env.ENABLE_WINAMAX_COMMENTARY_WATCHER, true),
    enableApiMonitor: bool(process.env.ENABLE_API_FOOTBALL_MONITOR, true),
  };
}
