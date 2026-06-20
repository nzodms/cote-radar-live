/**
 * Build a wa.me deep link with a prefilled message.
 * Pure + client-safe — used to "Préparer WhatsApp" when the Cloud API is off.
 */
export function createWhatsAppMessageLink(phone: string, message: string): string {
  const normalized = (phone || "").replace(/[^\d]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${text}`;
}
