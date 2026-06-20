/**
 * GET /api/matches/{fixtureId}/analysis
 *
 * Retourne UNIQUEMENT la dernière analyse (lue depuis la base).
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadLatestAnalysis } from "@/lib/match-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const fixtureId = Number.parseInt(params.fixtureId, 10);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }

  try {
    const analysis = await loadLatestAnalysis(fixtureId);
    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: "Aucune analyse disponible. Lancez un sync live d'abord." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
