/**
 * Server-only Claude client helper.
 * Imported exclusively from API routes so the API key never reaches the client.
 * When ANTHROPIC_API_KEY is absent, callers fall back to the deterministic mock.
 */
import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export function isAIEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getClaude(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Pull plain text out of a Claude message response. */
export function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
