/**
 * Client API-Football / API-SPORTS (v3).
 *
 * RÈGLES:
 *  - Appels SERVEUR UNIQUEMENT. La clé n'est jamais exposée côté client.
 *  - Chaque appel est loggé (table api_usage_logs + compteur mémoire).
 *  - Ne crash pas sur réponse vide: renvoie un tableau vide.
 *  - Retries (réseau / 5xx) avec backoff. Pas de retry sur erreur d'auth.
 *  - Timeout via AbortController.
 */

import type {
  AfEvent,
  AfFixture,
  AfLineup,
  AfOdds,
  AfTeamStatistics,
  ApiFootballEnvelope,
} from "@/types/api-football";
import { logApiCall } from "./api-usage";
import { sleep } from "./utils";

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

export class ApiFootballError extends Error {
  status?: number;
  apiErrors?: unknown;
  constructor(message: string, status?: number, apiErrors?: unknown) {
    super(message);
    this.name = "ApiFootballError";
    this.status = status;
    this.apiErrors = apiErrors;
  }
}

export class MissingApiKeyError extends ApiFootballError {
  constructor() {
    super("APISPORTS_KEY est absente. Renseignez-la dans .env.local (serveur uniquement).");
    this.name = "MissingApiKeyError";
  }
}

function getBaseUrl(): string {
  return (process.env.APISPORTS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function hasApiKey(): boolean {
  return Boolean(process.env.APISPORTS_KEY && process.env.APISPORTS_KEY.trim().length > 0);
}

/** true si l'objet `errors` de l'API contient une vraie erreur. */
function hasApiErrors(errors: ApiFootballEnvelope<unknown>["errors"]): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  return Object.keys(errors).length > 0;
}

function stringifyErrors(errors: ApiFootballEnvelope<unknown>["errors"]): string {
  try {
    if (Array.isArray(errors)) return errors.join("; ");
    return Object.entries(errors)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  } catch {
    return "erreur API inconnue";
  }
}

interface FetchOptions {
  fixtureId?: number | null;
}

/**
 * Fetch générique typé. Renvoie l'enveloppe complète.
 * Le `response` est garanti être un tableau (vide si pas de données).
 */
async function apiFetch<T>(
  endpoint: string,
  params: Record<string, string | number>,
  opts: FetchOptions = {}
): Promise<ApiFootballEnvelope<T[]>> {
  if (!hasApiKey()) {
    // On logge l'absence pour traçabilité, puis on lève une erreur claire.
    await logApiCall({
      endpoint,
      fixtureId: opts.fixtureId ?? null,
      success: false,
      errorMessage: "APISPORTS_KEY absente",
    });
    throw new MissingApiKeyError();
  }

  const base = getBaseUrl();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  const url = `${base}${endpoint}?${search.toString()}`;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "x-apisports-key": process.env.APISPORTS_KEY as string,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      // Erreurs d'authentification / quota: pas de retry.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        const body = await res.text();
        await logApiCall({
          endpoint,
          fixtureId: opts.fixtureId ?? null,
          success: false,
          errorMessage: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        });
        throw new ApiFootballError(
          `Erreur d'accès API (HTTP ${res.status}). Vérifiez la clé ou le quota.`,
          res.status,
          body
        );
      }

      // 5xx => on retente.
      if (res.status >= 500) {
        throw new ApiFootballError(`Erreur serveur API (HTTP ${res.status}).`, res.status);
      }

      const json = (await res.json()) as ApiFootballEnvelope<T[]>;

      // Réponse vide / malformée: on ne crash pas.
      if (!json || typeof json !== "object") {
        await logApiCall({
          endpoint,
          fixtureId: opts.fixtureId ?? null,
          success: true,
          errorMessage: "réponse vide",
        });
        return emptyEnvelope<T>(endpoint);
      }

      // Erreurs applicatives renvoyées dans le corps.
      if (hasApiErrors(json.errors)) {
        const msg = stringifyErrors(json.errors);
        await logApiCall({
          endpoint,
          fixtureId: opts.fixtureId ?? null,
          success: false,
          errorMessage: msg,
        });
        // Auth/quota: on remonte une vraie erreur.
        if (/key|token|quota|limit|subscription|plan/i.test(msg)) {
          throw new ApiFootballError(`API a renvoyé une erreur: ${msg}`, res.status, json.errors);
        }
        // Sinon on renvoie l'enveloppe (response peut être vide mais exploitable).
        return { ...json, response: Array.isArray(json.response) ? json.response : [] };
      }

      await logApiCall({
        endpoint,
        fixtureId: opts.fixtureId ?? null,
        success: true,
      });

      return { ...json, response: Array.isArray(json.response) ? json.response : [] };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;

      // Erreurs d'auth: on ne retente pas.
      if (err instanceof ApiFootballError && err.status && [401, 403, 429].includes(err.status)) {
        throw err;
      }
      if (err instanceof MissingApiKeyError) {
        throw err;
      }

      const isLast = attempt === MAX_RETRIES;
      if (isLast) {
        const message = err instanceof Error ? err.message : "erreur réseau inconnue";
        await logApiCall({
          endpoint,
          fixtureId: opts.fixtureId ?? null,
          success: false,
          errorMessage: `réseau/timeout: ${message}`,
        });
        throw new ApiFootballError(`Échec de l'appel API après ${MAX_RETRIES + 1} tentatives: ${message}`);
      }

      // Backoff exponentiel: 800ms, 1600ms...
      await sleep(800 * 2 ** attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiFootballError("Échec d'appel API inattendu.");
}

function emptyEnvelope<T>(endpoint: string): ApiFootballEnvelope<T[]> {
  return {
    get: endpoint,
    parameters: {},
    errors: [],
    results: 0,
    paging: { current: 1, total: 1 },
    response: [],
  };
}

/* ========================================================================
 *  Fonctions d'endpoint typées
 * ===================================================================== */

/** GET /fixtures?date=YYYY-MM-DD */
export async function getFixturesByDate(date: string): Promise<AfFixture[]> {
  const env = await apiFetch<AfFixture>("/fixtures", { date });
  return env.response;
}

/** GET /fixtures?league={id}&season={season} — toute la compétition en 1 appel. */
export async function getLeagueFixtures(leagueId: number, season: number): Promise<AfFixture[]> {
  const env = await apiFetch<AfFixture>("/fixtures", { league: leagueId, season });
  return env.response;
}

export interface StandingGroup {
  group: string;
  teams: string[];
}

/** GET /standings?league={id}&season={season} — groupes + équipes (best-effort). */
export async function getStandings(leagueId: number, season: number): Promise<StandingGroup[]> {
  const env = await apiFetch<Record<string, unknown>>("/standings", { league: leagueId, season });
  const first = (env.response as any[])?.[0];
  const standings = first?.league?.standings;
  if (!Array.isArray(standings)) return [];
  const out: StandingGroup[] = [];
  for (const grp of standings) {
    if (!Array.isArray(grp) || grp.length === 0) continue;
    const group = String(grp[0]?.group ?? "").trim();
    const teams = grp
      .map((r: any) => r?.team?.name)
      .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
    if (teams.length > 0) out.push({ group, teams });
  }
  return out;
}

/** GET /fixtures?id={fixtureId} */
export async function getFixtureById(fixtureId: number): Promise<AfFixture | null> {
  const env = await apiFetch<AfFixture>("/fixtures", { id: fixtureId }, { fixtureId });
  return env.response[0] ?? null;
}

/** GET /fixtures/statistics?fixture={fixtureId} */
export async function getFixtureStatistics(fixtureId: number): Promise<AfTeamStatistics[]> {
  const env = await apiFetch<AfTeamStatistics>(
    "/fixtures/statistics",
    { fixture: fixtureId },
    { fixtureId }
  );
  return env.response;
}

/** GET /fixtures/events?fixture={fixtureId} */
export async function getFixtureEvents(fixtureId: number): Promise<AfEvent[]> {
  const env = await apiFetch<AfEvent>("/fixtures/events", { fixture: fixtureId }, { fixtureId });
  return env.response;
}

/** GET /fixtures/lineups?fixture={fixtureId} */
export async function getFixtureLineups(fixtureId: number): Promise<AfLineup[]> {
  const env = await apiFetch<AfLineup>("/fixtures/lineups", { fixture: fixtureId }, { fixtureId });
  return env.response;
}

/** GET /fixtures/headtohead?h2h={teamId1}-{teamId2} */
export async function getHeadToHead(
  teamId1: number,
  teamId2: number,
  last = 10
): Promise<AfFixture[]> {
  const env = await apiFetch<AfFixture>("/fixtures/headtohead", {
    h2h: `${teamId1}-${teamId2}`,
    last,
  });
  return env.response;
}

/** GET /fixtures?team={teamId}&last=5 */
export async function getTeamLastFixtures(teamId: number, last = 5): Promise<AfFixture[]> {
  const env = await apiFetch<AfFixture>("/fixtures", { team: teamId, last });
  return env.response;
}

/** GET /odds?fixture={fixtureId} (souvent indisponible en plan Free). */
export async function getOdds(fixtureId: number): Promise<AfOdds[]> {
  const env = await apiFetch<AfOdds>("/odds", { fixture: fixtureId }, { fixtureId });
  return env.response;
}

export interface AccountStatus {
  ok: boolean;
  plan: string | null;
  active: boolean | null;
  requestsCurrent: number | null;
  requestsLimitDay: number | null;
  error?: string;
}

/**
 * GET /status — vérifie la clé et renvoie le quota RÉEL (current/limit_day).
 * `response` est un objet (pas un tableau): fetch dédié.
 * Ne consomme pas le quota côté API-Football pour le compteur "requests".
 */
export async function getAccountStatus(): Promise<AccountStatus> {
  if (!hasApiKey()) {
    throw new MissingApiKeyError();
  }
  const url = `${getBaseUrl()}/status`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "x-apisports-key": process.env.APISPORTS_KEY as string,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    await logApiCall({ endpoint: "/status", success: res.ok, estimatedCost: 0 });

    if (!res.ok) {
      return {
        ok: false,
        plan: null,
        active: null,
        requestsCurrent: null,
        requestsLimitDay: null,
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      response?: {
        subscription?: { plan?: string; active?: boolean };
        requests?: { current?: number; limit_day?: number };
      };
    };
    const r = json.response ?? {};
    return {
      ok: true,
      plan: r.subscription?.plan ?? null,
      active: r.subscription?.active ?? null,
      requestsCurrent: r.requests?.current ?? null,
      requestsLimitDay: r.requests?.limit_day ?? null,
    };
  } catch (err) {
    clearTimeout(timeout);
    await logApiCall({
      endpoint: "/status",
      success: false,
      estimatedCost: 0,
      errorMessage: (err as Error).message,
    });
    return {
      ok: false,
      plan: null,
      active: null,
      requestsCurrent: null,
      requestsLimitDay: null,
      error: (err as Error).message,
    };
  }
}
