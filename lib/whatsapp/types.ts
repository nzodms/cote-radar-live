export type WhatsAppChannel = "cloud_api" | "wa_link" | "internal";

export interface WhatsAppSendInput {
  to: string; // E.164-ish phone number (digits)
  message: string;
  supplierId?: string;
  orderId?: string;
}

export interface WhatsAppSendResult {
  channel: WhatsAppChannel;
  ok: boolean;
  link?: string;
  messageId?: string;
  detail: string;
}
