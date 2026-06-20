/**
 * GET/POST /api/matches/{fixtureId}/ai-analysis
 *
 * Reformulation IA OPTIONNELLE du conseil live calculé par le moteur maison.
 * - Si l'IA est désactivée (ENABLE_AI_ANALYSIS != true ou pas de clé): renvoie
 *   enabled=false et ai=null. Le SaaS fonctionne sans IA.
 * - L'IA ne décide pas: elle reformule l'analyse déjà calculée.
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadMatchDetail } from "@/lib/match-service";
import { generateAiAnalysis, getAiStatus } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const fixtureId = Number.parseInt(params.fixtureId, 10);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }

  const status = getAiStatus();
  const detail = await loadMatchDetail(fixtureId);

  if (!detail.fixture) {
    return NextResponse.json(
      { ok: false, error: "Match non trouvé en base. Lancez un sync d'abord." },
      { status: 404 }
    );
  }

  if (!detail.liveAdvice) {
    return NextResponse.json({
      ok: true,
      enabled: status.enabled,
      status,
      ai: null,
      note: "Aucun conseil live à reformuler. Lancez un sync live d'abord.",
    });
  }

  if (!status.enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      status,
      ai: null,
      note: "IA désactivée (ENABLE_AI_ANALYSIS=false ou clé absente). Le moteur maison reste actif.",
    });
  }

  const f = detail.fixture;
  const ai = await generateAiAnalysis(detail.liveAdvice, {
    fixtureLabel: `${f.home.name} vs ${f.away.name}`,
    minute: f.elapsed,
    scoreHome: f.homeGoals,
    scoreAway: f.awayGoals,
    oddsAvailable: detail.liveAdvice.dataQuality.hasOdds,
  });

  return NextResponse.json({
    ok: true,
    enabled: true,
    status,
    ai,
    note: ai ? null : "L'IA n'a pas renvoyé de résultat exploitable (le moteur maison reste la référence).",
  });
}

export const POST = GET;
