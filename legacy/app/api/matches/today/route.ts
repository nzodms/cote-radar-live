/**
 * GET /api/matches/today?date=YYYY-MM-DD
 *
 * Retourne UNIQUEMENT les matchs Coupe du monde (lus depuis la base) pour la
 * date donnée (ou aujourd'hui). Lecture base => ne consomme PAS le quota API.
 *
 * ?live=1 : ne renvoie que les matchs actuellement live.
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadLiveMatches, loadTodayMatches } from "@/lib/match-service";
import { isValidDateParam, todayDateUTC } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  const date = isValidDateParam(dateParam) ? dateParam : todayDateUTC();
  const liveOnly = ["1", "true", "yes"].includes(
    (req.nextUrl.searchParams.get("live") ?? "").toLowerCase()
  );

  try {
    const matches = liveOnly ? await loadLiveMatches() : await loadTodayMatches(date);
    return NextResponse.json({ ok: true, date, count: matches.length, matches });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
