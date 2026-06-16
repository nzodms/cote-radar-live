/**
 * Configuration du worker Telegram (indépendant de Vercel).
 *
 * Charge .env / .env.local manuellement (pas de dépendance dotenv) puis expose
 * une config typée. Les valeurs absentes ne font pas planter le worker.
 */

import fs from "node:fs";
import path from "node:path";

function loadDotenv(file: string): boolean {
  try {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) return false;
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
      // Ne jamais écraser une variable déjà présente dans l'environnement.
      if (process.env[key] === undefined) process.env[key] = val;
    }
    return true;
  } catch {
    return false;
  }
}

// Charge l'environnement au premier import (worker uniquement, à l'exécution).
const envA = loadDotenv(".env");
const envB = loadDotenv(".env.local");
const ENV_FILE_LOADED = envA || envB;

/** Masque un secret pour les logs: ne JAMAIS afficher une clé complète. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "missing";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

/** Statut court d'un secret (sans le révéler). */
export function secretStatus(value: string | null | undefined): "configured" | "missing" {
  return value ? "configured" : "missing";
}

function int(v: string | undefined, d: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}
function bool(v: string | undefined, d: boolean): boolean {
  return v === undefined ? d : v.toLowerCase() === "true";
}

export interface ScraperConfig {
  enabled: boolean;
  url: string | null;
  pollSeconds: number;
}

export interface BotConfig {
  apiKey: string | null;
  telegramToken: string | null;
  telegramBotLink: string | null;
  telegramChatId: string | null;
  defaultFixtureId: number | null;
  matchLabel: string | null;
  apiPollSeconds: number;
  maxApiCallsPerDay: number;
  immediateAnalysisCooldownSeconds: number;
  minSecondsBetweenSimilarAlerts: number;
  nodeEnv: string;
  envFileLoaded: boolean;
  enableTelegram: boolean;
  enableApiMonitor: boolean;
  statePath: string;

  // Capteurs multi-sources
  commentary: ScraperConfig;
  market: ScraperConfig;
  lineup: ScraperConfig;
  news: { enabled: boolean; urls: string[]; pollSeconds: number };
  altStats: ScraperConfig;

  // Alias rétro-compat
  winamaxUrl: string | null;
  winamaxPollSeconds: number;
  enableWinamax: boolean;
}

export function getBotConfig(): BotConfig {
  const fid = Number.parseInt(process.env.FIXTURE_ID ?? "", 10);

  // Commentaires: nouveaux noms prioritaires, fallback sur les anciens (Winamax).
  // Défaut 5s = scraper ultra-réactif (point 1).
  const commentary: ScraperConfig = {
    enabled: bool(process.env.ENABLE_COMMENTARY_SCRAPER ?? process.env.ENABLE_WINAMAX_COMMENTARY_WATCHER, true),
    url: process.env.COMMENTARY_SOURCE_URL || process.env.WINAMAX_MATCH_URL || null,
    pollSeconds: int(process.env.COMMENTARY_POLL_INTERVAL_SECONDS ?? process.env.WINAMAX_POLL_INTERVAL_SECONDS, 5),
  };
  const market: ScraperConfig = {
    enabled: bool(process.env.ENABLE_MARKET_SCRAPER, true),
    url: process.env.MARKET_SOURCE_URL || null,
    pollSeconds: int(process.env.MARKET_POLL_INTERVAL_SECONDS, 10),
  };
  const lineup: ScraperConfig = {
    enabled: bool(process.env.ENABLE_LINEUP_INJURY_SCRAPER, true),
    url: process.env.LINEUP_SOURCE_URL || null,
    pollSeconds: int(process.env.LINEUP_POLL_INTERVAL_SECONDS, 300),
  };
  const news = {
    enabled: bool(process.env.ENABLE_NEWS_CONTEXT_SCRAPER, true),
    urls: (process.env.NEWS_CONTEXT_SOURCE_URLS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    pollSeconds: int(process.env.NEWS_CONTEXT_POLL_INTERVAL_SECONDS, 900),
  };
  const altStats: ScraperConfig = {
    enabled: bool(process.env.ENABLE_ALT_LIVE_STATS_SCRAPER, false),
    url: process.env.ALT_LIVE_STATS_SOURCE_URL || null,
    pollSeconds: int(process.env.ALT_LIVE_STATS_POLL_INTERVAL_SECONDS, 30),
  };

  return {
    apiKey: process.env.APISPORTS_KEY || null,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
    telegramBotLink: process.env.TELEGRAM_BOT_LINK || null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
    defaultFixtureId: Number.isFinite(fid) && fid > 0 ? fid : null,
    matchLabel: process.env.MATCH_LABEL || null,
    apiPollSeconds: int(process.env.API_POLL_INTERVAL_SECONDS, 30),
    maxApiCallsPerDay: int(process.env.MAX_API_CALLS_PER_DAY, 7500),
    immediateAnalysisCooldownSeconds: int(process.env.IMMEDIATE_ANALYSIS_COOLDOWN_SECONDS, 10),
    minSecondsBetweenSimilarAlerts: int(process.env.MIN_SECONDS_BETWEEN_SIMILAR_ALERTS, 120),
    nodeEnv: process.env.NODE_ENV || "development",
    envFileLoaded: ENV_FILE_LOADED,
    enableTelegram: bool(process.env.ENABLE_TELEGRAM_ALERTS, true),
    enableApiMonitor: bool(process.env.ENABLE_API_FOOTBALL_MONITOR, true),
    statePath: process.env.STATE_PATH || "data/state.json",
    commentary,
    market,
    lineup,
    news,
    altStats,
    winamaxUrl: commentary.url,
    winamaxPollSeconds: commentary.pollSeconds,
    enableWinamax: commentary.enabled,
  };
}

export interface ConfigValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valide la config. APISPORTS_KEY et (si alertes activées) TELEGRAM_BOT_TOKEN
 * sont requis. TELEGRAM_CHAT_ID est seulement requis si ENABLE_TELEGRAM_ALERTS=true,
 * mais traité comme avertissement (le worker tourne et guide vers get-chat-id).
 */
export function validateConfig(config: BotConfig): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.apiKey) errors.push("APISPORTS_KEY manquante.");
  if (config.enableTelegram && !config.telegramToken) {
    errors.push("TELEGRAM_BOT_TOKEN manquant (alertes Telegram activées).");
  }
  if (config.enableTelegram && !config.telegramChatId) {
    warnings.push("TELEGRAM_CHAT_ID manquant: lance `npm run get-chat-id` après avoir envoyé /start au bot.");
  }
  if (!config.envFileLoaded) {
    warnings.push("Aucun fichier .env chargé (variables lues depuis l'environnement).");
  }

  return { ok: errors.length === 0, errors, warnings };
}
