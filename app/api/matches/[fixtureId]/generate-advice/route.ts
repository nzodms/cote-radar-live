/**
 * POST/GET /api/matches/{fixtureId}/generate-advice
 *
 * Génère le conseil live À PARTIR DES DONNÉES DÉJÀ EN BASE (aucun appel API):
 *  - charge match + dernières stats + events + lineups + snapshots précédents
 *  - appelle generateLiveBettingAdvice()
 *  - enregistre dans live_advice_snapshots
 *  - retourne le conseil complet + un bloc debug
 *
 * Utilisé par le bouton "Générer l'analyse maintenant" sur /matches/[fixtureId].
 */

import { type NextRequest, NextResponse } from "next/server";
import { generateAdviceFromStoredData } from "@/lib/match-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const fixtureId = Number.parseInt(params.fixtureId, 10);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }

  try {
    const result = await generateAdviceFromStoredData(fixtureId);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export const GET = POST;
