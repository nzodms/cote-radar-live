/**
 * GET/POST /api/cron/live-monitor
 *
 * UN tick de surveillance: poll les sessions de watch "dues" (next_poll_at <= now).
 * À appeler par Vercel Cron / cron externe / manuellement. PAS de boucle infinie.
 *
 * Protégeable via CRON_SECRET (?secret= / x-cron-secret / Authorization: Bearer).
 */

import { type NextRequest, NextResponse } from "next/server";
import { runMonitorTick } from "@/lib/live-monitor/scheduler";
import { cronAuthorized, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Non autorisé (CRON_SECRET requis)." }, { status: 401 });
  }
  try {
    const result = await runMonitorTick();
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = GET;
