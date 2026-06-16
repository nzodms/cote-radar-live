/**
 * Client minimal Telegram Bot API (sendMessage + long-polling getUpdates).
 * Texte brut (pas de parse_mode) pour éviter tout souci d'échappement.
 */

import type { InlineButton } from "./bookmaker-links";

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number | string };
    from?: { id: number; username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number | string } };
    from?: { id: number; username?: string };
  };
}

const TG_API = "https://api.telegram.org";

export function splitMessage(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const block of text.split("\n")) {
    if ((current + "\n" + block).length > max) {
      if (current) chunks.push(current);
      if (block.length > max) {
        // bloc trop long: découpage dur
        for (let i = 0; i < block.length; i += max) chunks.push(block.slice(i, i + max));
        current = "";
      } else {
        current = block;
      }
    } else {
      current = current ? `${current}\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function toInlineKeyboard(buttons: InlineButton[][]): unknown {
  return {
    inline_keyboard: buttons.map((row) =>
      row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.callback_data }))
    ),
  };
}

export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][]
): Promise<{ ok: boolean; error?: string }> {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
      disable_web_page_preview: true,
    };
    if (isLast && buttons && buttons.length > 0) body.reply_markup = toInlineKeyboard(buttons);
    try {
      const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status} ${errBody.slice(0, 120)}` };
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  return { ok: true };
}

export async function answerCallbackQuery(token: string, callbackId: string, text?: string): Promise<void> {
  try {
    await fetch(`${TG_API}/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, text: text ?? "" }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* best-effort */
  }
}

export async function getMe(token: string): Promise<{ ok: boolean; username?: string }> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return { ok: Boolean(json.ok), username: json.result?.username };
  } catch {
    return { ok: false };
  }
}

export async function getUpdates(token: string, offset: number, timeout = 30): Promise<TgUpdate[]> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/getUpdates?timeout=${timeout}&offset=${offset}`, {
      signal: AbortSignal.timeout((timeout + 10) * 1000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { ok: boolean; result?: TgUpdate[] };
    return json.ok && json.result ? json.result : [];
  } catch {
    return [];
  }
}
