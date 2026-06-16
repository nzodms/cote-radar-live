/**
 * Envoi d'alertes WhatsApp (OPTIONNEL, désactivé par défaut).
 *
 * Provider-agnostique:
 *  - webhook : POST { text } vers WHATSAPP_WEBHOOK_URL (le plus simple).
 *  - twilio  : API Twilio WhatsApp.
 *  - meta    : Meta WhatsApp Cloud API.
 *
 * Appel SERVEUR uniquement. Si désactivé/non configuré: renvoie { sent:false }.
 */

export type WhatsAppProvider = "webhook" | "twilio" | "meta";

export interface WhatsAppResult {
  sent: boolean;
  provider: WhatsAppProvider | null;
  reason?: string;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const p = (process.env.WHATSAPP_PROVIDER ?? "webhook").toLowerCase();
  if (p === "twilio") return "twilio";
  if (p === "meta") return "meta";
  return "webhook";
}

export function isWhatsAppEnabled(): boolean {
  if ((process.env.ENABLE_WHATSAPP_ALERTS ?? "false").toLowerCase() !== "true") return false;
  const provider = getWhatsAppProvider();
  if (provider === "webhook") return Boolean(process.env.WHATSAPP_WEBHOOK_URL);
  if (provider === "twilio") {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM &&
        process.env.WHATSAPP_TO
    );
  }
  return Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_ID && process.env.WHATSAPP_TO);
}

export function getWhatsAppMinIntervalSeconds(): number {
  const n = Number.parseInt(process.env.WHATSAPP_ALERT_MIN_INTERVAL_SECONDS ?? "180", 10);
  return Number.isFinite(n) && n >= 0 ? n : 180;
}

export async function sendWhatsAppMessage(text: string): Promise<WhatsAppResult> {
  if (!isWhatsAppEnabled()) {
    return { sent: false, provider: null, reason: "WhatsApp désactivé ou non configuré." };
  }
  const provider = getWhatsAppProvider();
  try {
    if (provider === "webhook") return await sendViaWebhook(text);
    if (provider === "twilio") return await sendViaTwilio(text);
    return await sendViaMeta(text);
  } catch (err) {
    return { sent: false, provider, reason: (err as Error).message };
  }
}

async function sendViaWebhook(text: string): Promise<WhatsAppResult> {
  const url = process.env.WHATSAPP_WEBHOOK_URL as string;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, to: process.env.WHATSAPP_TO ?? null }),
  });
  if (!res.ok) return { sent: false, provider: "webhook", reason: `HTTP ${res.status}` };
  return { sent: true, provider: "webhook" };
}

async function sendViaTwilio(text: string): Promise<WhatsAppResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_WHATSAPP_FROM as string; // ex: whatsapp:+1415...
  const to = process.env.WHATSAPP_TO as string; // ex: whatsapp:+33...
  const body = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    Body: text,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) return { sent: false, provider: "twilio", reason: `HTTP ${res.status}` };
  return { sent: true, provider: "twilio" };
}

async function sendViaMeta(text: string): Promise<WhatsAppResult> {
  const token = process.env.META_WHATSAPP_TOKEN as string;
  const phoneId = process.env.META_WHATSAPP_PHONE_ID as string;
  const to = process.env.WHATSAPP_TO as string;
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) return { sent: false, provider: "meta", reason: `HTTP ${res.status}` };
  return { sent: true, provider: "meta" };
}
