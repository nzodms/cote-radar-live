/**
 * Clients Supabase.
 *
 * SÉCURITÉ:
 * - getServiceSupabase() utilise la SERVICE_ROLE_KEY => SERVEUR UNIQUEMENT.
 *   Ne JAMAIS importer ce module dans un composant client.
 * - L'app ne doit pas crasher si Supabase n'est pas configuré: les helpers
 *   renvoient `null` et le code appelant doit gérer ce cas proprement.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Client serveur avec privilèges service_role (bypass RLS).
 * Renvoie `null` si la configuration est absente (au lieu de crasher).
 */
export function getServiceSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (serviceClient) {
    return serviceClient;
  }
  serviceClient = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
  return serviceClient;
}

/** Noms de tables centralisés pour éviter les fautes de frappe. */
export const TABLES = {
  matches: "world_cup_matches",
  statsSnapshots: "match_statistics_snapshots",
  events: "match_events",
  lineups: "match_lineups",
  analysisSnapshots: "analysis_snapshots",
  apiUsageLogs: "api_usage_logs",
  affiliateClicks: "affiliate_clicks",
  liveAdviceSnapshots: "live_advice_snapshots",
  externalCommentary: "external_live_commentary_events",
  oddsSnapshots: "odds_snapshots",
  watchSessions: "live_watch_sessions",
} as const;
