/**
 * GET /api/cron/sync-live/{fixtureId}?context=1
 *
 * - Récupère fixture + statistics + events (+ lineups si manquantes)
 * - Avec ?context=1 : ajoute forme récente (last 5), H2H et tentative de cotes
 * - Stocke les snapshots + génère un analysis_snapshot
 * - Logge chaque appel API
 * - Retourne un JSON clair (status, score, analyse, appels API, warnings)
 *
 * NOTE quota Free: par défaut ~3-4 appels (fixture/stats/events/lineups).
 * ?context=1 ajoute ~4 appels (forme x2, h2h, odds). À utiliser ponctuellement.
 */

import { type NextRequest, NextResponse } from "next/server";
import { syncLiveFixture } from "@/lib/match-service";
import { cronAuthorized, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { fixtureId: string } }) {
  if (!cronAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Non autorisé (CRON_SECRET requis)." },
      { status: 401 }
    );
  }

  const fixtureId = Number.parseInt(params.fixtureId, 10);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }

  const context = ["1", "true", "yes"].includes(
    (req.nextUrl.searchParams.get("context") ?? "").toLowerCase()
  );

  try {
    const result = await syncLiveFixture(fixtureId, { context });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = GET;
