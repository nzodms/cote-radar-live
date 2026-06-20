/**
 * Gestion de la surveillance live d'un fixture (déclenché depuis l'UI).
 *
 *  POST /api/cron/watch-fixture/{id}?action=start  -> démarre la surveillance
 *  POST /api/cron/watch-fixture/{id}?action=stop   -> arrête la surveillance
 *  POST /api/cron/watch-fixture/{id}?action=tick   -> exécute UN tick (mode test)
 *  GET  /api/cron/watch-fixture/{id}               -> statut de surveillance
 */

import { type NextRequest, NextResponse } from "next/server";
import { getWatchStatus, runMonitorTick, startWatch, stopWatch } from "@/lib/live-monitor/scheduler";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const fixtureId = parseId(params.fixtureId);
  if (fixtureId === null) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }
  const action = (req.nextUrl.searchParams.get("action") ?? "start").toLowerCase();

  try {
    switch (action) {
      case "start":
        return NextResponse.json(await startWatch(fixtureId));
      case "stop":
        return NextResponse.json(await stopWatch(fixtureId));
      case "tick":
        return NextResponse.json(await runMonitorTick({ fixtureId, force: true }));
      case "status":
        return NextResponse.json(await getWatchStatus(fixtureId));
      default:
        return NextResponse.json({ ok: false, error: `Action inconnue: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(_req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const fixtureId = parseId(params.fixtureId);
  if (fixtureId === null) {
    return NextResponse.json({ ok: false, error: "fixtureId invalide." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getWatchStatus(fixtureId));
  } catch (err) {
    return jsonError(err);
  }
}
