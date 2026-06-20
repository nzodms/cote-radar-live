import { NextResponse } from "next/server";
import { shopifyOrderPayloadSchema } from "@/schemas";
import { normalizeShopifyOrder } from "@/lib/shopify/normalize";
import { sampleShopifyOrder } from "@/lib/shopify/mockOrders";

/**
 * Shopify "orders/create" webhook.
 *
 * V1: accepts a demo payload, normalizes it into the internal Order model and
 * returns it. A production implementation would also verify the HMAC signature
 * (SHOPIFY_WEBHOOK_SECRET) and persist the order to the database.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = shopifyOrderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid Shopify order payload", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // In production: persist to DB / enqueue. Here we just normalize + echo back.
  const order = normalizeShopifyOrder(parsed.data);

  return NextResponse.json({ ok: true, order }, { status: 201 });
}

/** Convenience: GET returns a sample normalized order for testing the adapter. */
export async function GET() {
  const order = normalizeShopifyOrder(sampleShopifyOrder());
  return NextResponse.json({ ok: true, sample: order });
}
