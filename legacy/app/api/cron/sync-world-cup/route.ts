/**
 * GET /api/cron/sync-world-cup?date=YYYY-MM-DD
 *
 * - Récupère les fixtures du jour (API-Football)
 * - Filtre STRICT league.id = 1 / "World Cup"
 * - Upsert dans world_cup_matches
 * - Logge chaque appel API (via le client api-football)
 *
 * Déclenchable par: bouton Settings, Vercel Cron, ou manuellement.
 */

import { type NextRequest, NextResponse } from "next/server";
import { syncWorldCupMatches } from "@/lib/match-service";
import { cronAuthorized, jsonError } from "@/lib/http";
import { isValidDateParam, todayDateUTC } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Non autorisé (CRON_SECRET requis)." },
      { status: 401 }
    );
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = isValidDateParam(dateParam) ? dateParam : todayDateUTC();

  try {
    const result = await syncWorldCupMatches(date);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

// Permet aussi un POST (boutons UI) avec la même logique.
export const POST = GET;
