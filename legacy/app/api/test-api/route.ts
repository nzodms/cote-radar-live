/**
 * GET /api/test-api — teste la clé API-Football via GET /status.
 * Renvoie le plan et le quota RÉEL (current/limit_day) sans exposer la clé.
 */

import { NextResponse } from "next/server";
import { getAccountStatus } from "@/lib/api-football";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getAccountStatus();
    return NextResponse.json({ ok: status.ok, status });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = GET;
