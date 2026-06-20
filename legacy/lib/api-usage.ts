/**
 * Suivi de la consommation API-Football.
 *
 * Le plan Free = 100 requêtes/jour. On veut:
 *  - un compteur local estimé (en mémoire process, reset au redémarrage)
 *  - des logs persistants dans Supabase (table api_usage_logs)
 *  - un calcul du quota restant + warnings quand on approche la limite
 *
 * Le compteur mémoire est une estimation (les fonctions serverless peuvent
 * être recyclées). La source de vérité reste la table api_usage_logs.
 */

import { getServiceSupabase, TABLES } from "./supabase";

export interface ApiUsageStats {
  /** Quota journalier configuré (Free = 100). */
  dailyQuota: number;
  /** Appels comptés aujourd'hui (depuis Supabase si dispo, sinon mémoire). */
  usedToday: number;
  /** Estimation mémoire (process courant). */
  memoryEstimate: number;
  remaining: number;
  /** Ratio 0-1. */
  ratio: number;
  /** true si on approche la limite (>= 80%). */
  nearLimit: boolean;
  /** true si la limite est atteinte/dépassée. */
  overLimit: boolean;
  /** Source réelle du compteur usedToday. */
  source: "supabase" | "memory";
}

export interface ApiCallLogInput {
  endpoint: string;
  fixtureId?: number | null;
  estimatedCost?: number;
  success: boolean;
  errorMessage?: string | null;
}

/** Compteur mémoire (réinitialisé chaque jour UTC). */
let memoryCounter = 0;
let memoryCounterDate = currentDateUTC();

function currentDateUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollMemoryCounterIfNewDay(): void {
  const today = currentDateUTC();
  if (today !== memoryCounterDate) {
    memoryCounterDate = today;
    memoryCounter = 0;
  }
}

export function getDailyQuota(): number {
  const raw = Number.parseInt(process.env.API_DAILY_QUOTA ?? "100", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

/** Incrémente le compteur mémoire et renvoie sa valeur. */
export function bumpMemoryCounter(cost = 1): number {
  rollMemoryCounterIfNewDay();
  memoryCounter += cost;
  return memoryCounter;
}

export function getMemoryCounter(): number {
  rollMemoryCounterIfNewDay();
  return memoryCounter;
}

/**
 * Enregistre un appel API dans Supabase (si configuré).
 * Ne lève jamais d'exception: un échec de log ne doit pas casser la requête.
 */
export async function logApiCall(input: ApiCallLogInput): Promise<void> {
  const cost = input.estimatedCost ?? 1;
  bumpMemoryCounter(cost);

  const supabase = getServiceSupabase();
  if (!supabase) return;

  try {
    await supabase.from(TABLES.apiUsageLogs).insert({
      endpoint: input.endpoint,
      fixture_id: input.fixtureId ?? null,
      estimated_cost: cost,
      success: input.success,
      error_message: input.errorMessage ?? null,
    });
  } catch (err) {
    // Log silencieux: on ne casse pas le flux pour un échec d'audit.
    console.warn("[api-usage] échec d'écriture du log:", (err as Error).message);
  }
}

/**
 * Compte les appels du jour (UTC) depuis Supabase.
 * Renvoie `null` si Supabase indisponible (=> fallback mémoire).
 */
async function countTodayFromSupabase(): Promise<number | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;

  const startOfDay = `${currentDateUTC()}T00:00:00.000Z`;
  try {
    const { count, error } = await supabase
      .from(TABLES.apiUsageLogs)
      .select("*", { count: "exact", head: true })
      .gte("called_at", startOfDay);
    if (error) {
      console.warn("[api-usage] échec du comptage Supabase:", error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.warn("[api-usage] exception au comptage:", (err as Error).message);
    return null;
  }
}

/** Calcule l'état de consommation complet (pour les badges/UI/settings). */
export async function getApiUsageStats(): Promise<ApiUsageStats> {
  const dailyQuota = getDailyQuota();
  const supabaseCount = await countTodayFromSupabase();
  const memoryEstimate = getMemoryCounter();

  const source: "supabase" | "memory" = supabaseCount === null ? "memory" : "supabase";
  const usedToday = supabaseCount === null ? memoryEstimate : Math.max(supabaseCount, memoryEstimate);

  const remaining = Math.max(0, dailyQuota - usedToday);
  const ratio = dailyQuota > 0 ? usedToday / dailyQuota : 0;

  return {
    dailyQuota,
    usedToday,
    memoryEstimate,
    remaining,
    ratio,
    nearLimit: ratio >= 0.8,
    overLimit: usedToday >= dailyQuota,
    source,
  };
}
