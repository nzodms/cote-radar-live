import { NextResponse } from "next/server";
import { z } from "zod";
import { extractQuoteFromMessage } from "@/lib/ai/extractQuoteFromMessage";

const schema = z.object({ text: z.string().min(1) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing text" }, { status: 422 });
  }

  const result = await extractQuoteFromMessage(parsed.data.text);
  return NextResponse.json(result);
}
