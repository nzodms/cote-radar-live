/**
 * GET /api/settings/status — état de configuration (sans jamais renvoyer de secret).
 */

import { NextResponse } from "next/server";
import { hasApiKey } from "@/lib/api-football";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getApiUsageStats } from "@/lib/api-usage";
import { getWorldCupConfig } from "@/lib/world-cup-filter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const usage = await getApiUsageStats();
  const wc = getWorldCupConfig();
  const refreshInterval = Number.parseInt(process.env.API_REFRESH_INTERVAL_SECONDS ?? "120", 10);

  return NextResponse.json({
    ok: true,
    // Statut booléen uniquement — la clé n'est JAMAIS exposée.
    apiKeyPresent: hasApiKey(),
    supabaseConfigured: isSupabaseConfigured(),
    refreshIntervalSeconds: Number.isFinite(refreshInterval) ? refreshInterval : 120,
    safeFreePlan: (process.env.SAFE_FREE_PLAN ?? "true").toLowerCase() === "true",
    worldCup: wc,
    usage,
  });
}
