/**
 * Couche IA OPTIONNELLE (désactivée par défaut).
 *
 * - Si ENABLE_AI_ANALYSIS != true OU pas de clé provider => renvoie null,
 *   et le SaaS continue de fonctionner avec le moteur maison.
 * - L'IA REFORMULE uniquement le conseil calculé. Elle ne décide pas.
 * - Appel SERVEUR uniquement (clé jamais exposée au client).
 */

import type { LiveBettingAdvice } from "@/types/live-advice";
import { AI_SYSTEM_PROMPT, buildAiUserPrompt, type AiPromptContext } from "./ai-prompts";

export interface AiAnalysisResult {
  executiveSummary: string;
  liveReading: string;
  recommendedActionExplanation: string;
  marketWatchlist: string[];
  riskWarnings: string[];
  invalidationConditions: string[];
  finalVerdict: string;
  meta?: { provider: string; model: string };
}

type Provider = "anthropic" | "openai";

export function getAiProvider(): Provider {
  const p = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  return p === "openai" ? "openai" : "anthropic";
}

function providerKey(provider: Provider): string | null {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || null;
  return process.env.OPENAI_API_KEY || null;
}

function defaultModel(provider: Provider): string {
  if (process.env.AI_MODEL && process.env.AI_MODEL.trim()) return process.env.AI_MODEL.trim();
  return provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o-mini";
}

export function isAiEnabled(): boolean {
  if ((process.env.ENABLE_AI_ANALYSIS ?? "false").toLowerCase() !== "true") return false;
  return Boolean(providerKey(getAiProvider()));
}

export interface AiStatus {
  enabled: boolean;
  provider: Provider;
  model: string;
  hasKey: boolean;
}

export function getAiStatus(): AiStatus {
  const provider = getAiProvider();
  return {
    enabled: isAiEnabled(),
    provider,
    model: defaultModel(provider),
    hasKey: Boolean(providerKey(provider)),
  };
}

/** Extrait un objet JSON d'une réponse texte (robuste aux fences ```json). */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function coerceResult(obj: Record<string, unknown> | null, provider: Provider, model: string): AiAnalysisResult | null {
  if (!obj) return null;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    executiveSummary: str(obj.executiveSummary),
    liveReading: str(obj.liveReading),
    recommendedActionExplanation: str(obj.recommendedActionExplanation),
    marketWatchlist: arr(obj.marketWatchlist),
    riskWarnings: arr(obj.riskWarnings),
    invalidationConditions: arr(obj.invalidationConditions),
    finalVerdict: str(obj.finalVerdict),
    meta: { provider, model },
  };
}

async function callAnthropic(model: string, system: string, user: string, key: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? []).map((c) => c.text ?? "").join("");
}

async function callOpenAI(model: string, system: string, user: string, key: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Génère une reformulation IA du conseil. Renvoie null si désactivé ou en échec
 * (le moteur maison reste la source de vérité).
 */
export async function generateAiAnalysis(
  advice: LiveBettingAdvice,
  ctx: AiPromptContext
): Promise<AiAnalysisResult | null> {
  if (!isAiEnabled()) return null;
  const provider = getAiProvider();
  const key = providerKey(provider);
  if (!key) return null;
  const model = defaultModel(provider);

  const user = buildAiUserPrompt(advice, ctx);
  try {
    const text =
      provider === "anthropic"
        ? await callAnthropic(model, AI_SYSTEM_PROMPT, user, key)
        : await callOpenAI(model, AI_SYSTEM_PROMPT, user, key);
    return coerceResult(extractJson(text), provider, model);
  } catch (err) {
    console.warn("[ai] échec génération IA:", (err as Error).message);
    return null;
  }
}
