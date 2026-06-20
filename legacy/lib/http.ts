/**
 * Helpers HTTP partagés par les routes API (gestion d'erreur uniforme + auth cron).
 */

import { NextResponse, type NextRequest } from "next/server";
import { ApiFootballError, MissingApiKeyError } from "./api-football";

/** Convertit une erreur en réponse JSON propre, sans jamais fuiter de secret. */
export function jsonError(err: unknown): NextResponse {
  if (err instanceof MissingApiKeyError) {
    return NextResponse.json(
      { ok: false, error: err.message, code: "MISSING_API_KEY" },
      { status: 500 }
    );
  }
  if (err instanceof ApiFootballError) {
    const status = err.status && [401, 403, 429].includes(err.status) ? err.status : 502;
    return NextResponse.json({ ok: false, error: err.message, code: "API_ERROR" }, { status });
  }
  const message = err instanceof Error ? err.message : "Erreur inconnue";
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

/**
 * Vérifie l'autorisation des routes cron.
 * - Si CRON_SECRET n'est pas défini: autorisé (outil privé en dev).
 * - Sinon: exige ?secret=, header x-cron-secret, ou Authorization: Bearer <secret>
 *   (compatible Vercel Cron).
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromHeader = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization");
  return fromQuery === secret || fromHeader === secret || auth === `Bearer ${secret}`;
}
