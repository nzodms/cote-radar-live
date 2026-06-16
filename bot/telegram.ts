/**
 * Client minimal Telegram Bot API (sendMessage + long-polling getUpdates).
 * Texte brut (pas de parse_mode) pour éviter tout souci d'échappement.
 */

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number | string };
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

export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  for (const chunk of splitMessage(text)) {
    try {
      const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 120)}` };
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  return { ok: true };
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
