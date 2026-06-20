/**
 * GET /api/matches/{fixtureId}
 *
 * Retourne (depuis la base, sans appel API):
 *  - le match
 *  - le dernier snapshot de stats
 *  - les events
 *  - les compositions
 *  - la dernière analyse
 *  - l'historique des signaux
 *  - forme récente + H2H (si déjà synchronisés en contexte)
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadMatchDetail } from "@/lib/match-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const fixtureId = Number.parseInt(params.fixtureId, 10);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }

  try {
    const detail = await loadMatchDetail(fixtureId);
    if (!detail.fixture) {
      return NextResponse.json(
        { ok: false, error: "Match non trouvé en base. Lancez un sync d'abord." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
