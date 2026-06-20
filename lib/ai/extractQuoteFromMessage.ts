import type { StockStatus } from "@/types";
import { CLAUDE_MODEL, getClaude, textFromMessage } from "./client";

export interface ExtractedQuote {
  productCost: number;
  shippingCost: number;
  totalCost: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  stockStatus: StockStatus;
  notes: string;
}

export interface ExtractQuoteResult extends ExtractedQuote {
  source: "ai" | "mock";
  confidence: number; // 0-1
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function detectStock(text: string): StockStatus {
  const t = text.toLowerCase();
  if (/(out of stock|rupture|épuisé|epuise|no stock|sold out)/.test(t)) return "out_of_stock";
  if (/(uncertain|incertain|peut[- ]?être|maybe|to confirm|à confirmer|not sure|need to check)/.test(t))
    return "uncertain";
  if (/(stock ok|in stock|en stock|stock confirmed|stock confirmé|available|disponible|yes stock|ok stock)/.test(t))
    return "confirmed";
  return "unknown";
}

/** Deterministic regex-based parser used when Claude is unavailable. */
export function mockExtract(text: string): ExtractedQuote {
  const product =
    parseNumber(text.match(/(?:product|produit|prix produit|unit price|unitaire|prix unitaire|price)[^\d]{0,14}(\d+[.,]?\d*)/i)?.[1]) ??
    parseNumber(text.match(/(\d+[.,]?\d*)\s*(?:€|eur|usd|\$)/i)?.[1]) ??
    0;

  const shipping =
    parseNumber(text.match(/(?:shipping|livraison|port|transport|delivery cost|frais de port)[^\d]{0,14}(\d+[.,]?\d*)/i)?.[1]) ??
    0;

  const rangeMatch = text.match(/(\d+)\s*(?:-|–|to|à|a)\s*(\d+)\s*(?:days?|jours?|j\b)/i);
  let deliveryMin = parseNumber(rangeMatch?.[1]) ?? 0;
  let deliveryMax = parseNumber(rangeMatch?.[2]) ?? 0;
  if (!rangeMatch) {
    const single = parseNumber(
      text.match(/(?:delivery|délai|delai|lead time|shipping time)[^\d]{0,14}(\d+)\s*(?:days?|jours?|j\b)?/i)?.[1],
    );
    if (single) {
      deliveryMin = single;
      deliveryMax = single;
    }
  }

  const totalMatch = parseNumber(text.match(/(?:total|all in|tout compris)[^\d]{0,14}(\d+[.,]?\d*)/i)?.[1]);
  const total = totalMatch ?? product + shipping;

  const stockStatus = detectStock(text);

  return {
    productCost: product,
    shippingCost: shipping,
    totalCost: total,
    deliveryMinDays: deliveryMin,
    deliveryMaxDays: deliveryMax,
    stockStatus,
    notes: text.trim().slice(0, 240),
  };
}

/**
 * Extract a structured quote from a free-text supplier reply.
 * Uses Claude (JSON mode via prompt) when configured, else a mock parser.
 */
export async function extractQuoteFromMessage(text: string): Promise<ExtractQuoteResult> {
  const claude = getClaude();
  if (!claude) {
    const parsed = mockExtract(text);
    const confidence = parsed.productCost > 0 && parsed.deliveryMaxDays > 0 ? 0.8 : 0.45;
    return { ...parsed, source: "mock", confidence };
  }

  const system =
    "Extract a supplier quote from the message. Return ONLY valid minified JSON with keys: productCost (number), shippingCost (number), totalCost (number), deliveryMinDays (number), deliveryMaxDays (number), stockStatus (one of: confirmed, uncertain, out_of_stock, unknown), notes (string). Use 0 when a value is missing. If only one delivery figure is given, set min=max.";

  try {
    const response = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: text }],
    });
    const raw = textFromMessage(response);
    const json = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      productCost: Number(json.productCost) || 0,
      shippingCost: Number(json.shippingCost) || 0,
      totalCost: Number(json.totalCost) || Number(json.productCost) + Number(json.shippingCost) || 0,
      deliveryMinDays: Number(json.deliveryMinDays) || 0,
      deliveryMaxDays: Number(json.deliveryMaxDays) || Number(json.deliveryMinDays) || 0,
      stockStatus: (["confirmed", "uncertain", "out_of_stock", "unknown"].includes(json.stockStatus)
        ? json.stockStatus
        : "unknown") as StockStatus,
      notes: String(json.notes ?? text).slice(0, 240),
      source: "ai",
      confidence: 0.95,
    };
  } catch {
    const parsed = mockExtract(text);
    return { ...parsed, source: "mock", confidence: 0.5 };
  }
}
