/**
 * GET /api/usage — consommation API estimée (compteur local + logs Supabase).
 * Utilisé par le badge de consommation et la page Settings.
 */

import { NextResponse } from "next/server";
import { getApiUsageStats } from "@/lib/api-usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const usage = await getApiUsageStats();
    const refreshInterval = Number.parseInt(
      process.env.API_REFRESH_INTERVAL_SECONDS ?? "120",
      10
    );
    return NextResponse.json({
      ok: true,
      usage,
      refreshIntervalSeconds: Number.isFinite(refreshInterval) ? refreshInterval : 120,
      safeFreePlan: (process.env.SAFE_FREE_PLAN ?? "true").toLowerCase() === "true",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
