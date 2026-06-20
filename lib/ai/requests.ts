import type { GenerateSupplierMessageInput, GenerateSupplierMessageResult } from "./generateSupplierMessage";
import type { ExtractQuoteResult } from "./extractQuoteFromMessage";
import { mockExtract } from "./extractQuoteFromMessage";

/** Client → /api/ai/generate-message (falls back to a local template on error). */
export async function requestSupplierMessage(
  input: GenerateSupplierMessageInput,
): Promise<GenerateSupplierMessageResult> {
  try {
    const res = await fetch("/api/ai/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as GenerateSupplierMessageResult;
  } catch {
    const greeting = input.supplierName ? `Bonjour ${input.supplierName},` : "Bonjour,";
    return {
      message: `${greeting}\n\nPouvez-vous me confirmer le prix, le stock et le délai de livraison pour ce produit ?\n\nProduit : ${input.productName}\nVariante : ${input.variant ?? "—"}\nQuantité : ${input.quantity ?? 1}\nDestination : ${input.country}\n\nMerci d'indiquer le prix produit, le prix livraison, le délai estimé et si le stock est confirmé.\n\nBien cordialement.`,
      source: "mock",
    };
  }
}

/** Client → /api/ai/extract-quote (falls back to the local parser on error). */
export async function requestQuoteExtraction(text: string): Promise<ExtractQuoteResult> {
  try {
    const res = await fetch("/api/ai/extract-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ExtractQuoteResult;
  } catch {
    const parsed = mockExtract(text);
    return { ...parsed, source: "mock", confidence: 0.5 };
  }
}
