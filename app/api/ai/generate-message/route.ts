import { NextResponse } from "next/server";
import { generateMessageInputSchema } from "@/schemas";
import { generateSupplierMessage } from "@/lib/ai/generateSupplierMessage";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = generateMessageInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 422 });
  }

  const result = await generateSupplierMessage(parsed.data);
  return NextResponse.json(result);
}
