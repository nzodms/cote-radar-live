import { CLAUDE_MODEL, getClaude, textFromMessage } from "./client";

export interface GenerateSupplierMessageInput {
  productName: string;
  variant?: string;
  quantity?: number;
  country: string;
  productImageUrl?: string;
  language?: "fr" | "en";
  supplierName?: string;
  targetMaxCost?: number;
}

export interface GenerateSupplierMessageResult {
  message: string;
  source: "ai" | "mock";
}

function mockMessage(input: GenerateSupplierMessageInput): string {
  const {
    productName,
    variant = "—",
    quantity = 1,
    country,
    supplierName,
    language = "fr",
  } = input;

  if (language === "en") {
    const greeting = supplierName ? `Hello ${supplierName},` : "Hello,";
    return [
      greeting,
      "",
      "Could you please quote this product and confirm price, stock and lead time?",
      "",
      `Product: ${productName}`,
      `Variant: ${variant}`,
      `Quantity: ${quantity}`,
      `Destination: ${country}`,
      "",
      "Please indicate the product price, the shipping price, the estimated delivery time and whether the stock is confirmed.",
      "",
      "Best regards.",
    ].join("\n");
  }

  const greeting = supplierName ? `Bonjour ${supplierName},` : "Bonjour,";
  return [
    greeting,
    "",
    "Pouvez-vous me confirmer le prix, le stock et le délai de livraison pour ce produit ?",
    "",
    `Produit : ${productName}`,
    `Variante : ${variant}`,
    `Quantité : ${quantity}`,
    `Destination : ${country}`,
    "",
    "Merci d'indiquer le prix produit, le prix livraison, le délai estimé et si le stock est confirmé.",
    "",
    "Bien cordialement.",
  ].join("\n");
}

/**
 * Generate a professional supplier sourcing message.
 * Uses Claude when configured; otherwise a clean deterministic template.
 */
export async function generateSupplierMessage(
  input: GenerateSupplierMessageInput,
): Promise<GenerateSupplierMessageResult> {
  const claude = getClaude();
  if (!claude) {
    return { message: mockMessage(input), source: "mock" };
  }

  const language = input.language ?? "fr";
  const system =
    language === "en"
      ? "You are a sourcing assistant for an e-commerce merchant. Write a short, professional WhatsApp message to a supplier asking to quote a product (price, shipping, lead time, stock). Be concise and polite. Return ONLY the message text, no preamble."
      : "Tu es l'assistant sourcing d'un marchand e-commerce. Rédige un message WhatsApp court et professionnel à un fournisseur pour demander un devis (prix produit, livraison, délai, stock). Sois concis et poli. Renvoie UNIQUEMENT le texte du message, sans préambule.";

  try {
    const response = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            product: input.productName,
            variant: input.variant,
            quantity: input.quantity ?? 1,
            destination: input.country,
            supplier: input.supplierName,
            targetMaxCost: input.targetMaxCost,
          }),
        },
      ],
    });
    const message = textFromMessage(response);
    return { message: message || mockMessage(input), source: "ai" };
  } catch {
    return { message: mockMessage(input), source: "mock" };
  }
}
