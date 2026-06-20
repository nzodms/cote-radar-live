import { createWhatsAppMessageLink } from "./createWhatsAppMessageLink";
import type { WhatsAppSendInput, WhatsAppSendResult } from "./types";

/** True when WhatsApp Cloud API credentials are configured (server-side). */
export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );
}

/**
 * Official-ready WhatsApp send abstraction.
 *
 * V1 behaviour:
 *  - If Cloud API credentials exist → adapter stub posts to the Graph API.
 *  - Otherwise → returns a wa.me link the merchant opens to send manually.
 *
 * The internal SupplierPilot inbox "demo send" is handled in the store; this
 * function is the outbound transport layer and is safe to call from the server.
 */
export async function sendWhatsAppMessage(
  input: WhatsAppSendInput,
): Promise<WhatsAppSendResult> {
  if (isWhatsAppCloudConfigured()) {
    try {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
      const token = process.env.WHATSAPP_ACCESS_TOKEN!;
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: input.to.replace(/[^\d]/g, ""),
            type: "text",
            text: { body: input.message },
          }),
        },
      );
      if (!res.ok) throw new Error(`Cloud API ${res.status}`);
      const data = (await res.json()) as { messages?: { id: string }[] };
      return {
        channel: "cloud_api",
        ok: true,
        messageId: data.messages?.[0]?.id,
        detail: "Message envoyé via WhatsApp Cloud API.",
      };
    } catch (err) {
      // Fall through to wa.me link on transport failure.
      return {
        channel: "wa_link",
        ok: false,
        link: createWhatsAppMessageLink(input.to, input.message),
        detail: `Échec Cloud API (${(err as Error).message}). Lien wa.me généré en repli.`,
      };
    }
  }

  return {
    channel: "wa_link",
    ok: true,
    link: createWhatsAppMessageLink(input.to, input.message),
    detail: "Lien WhatsApp prêt (Cloud API non configurée).",
  };
}
