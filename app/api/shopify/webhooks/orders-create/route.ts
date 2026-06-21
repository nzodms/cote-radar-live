import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { shopifyOrderPayloadSchema } from "@/schemas";
import { normalizeShopifyOrder } from "@/lib/shopify/normalize";
import { sampleShopifyOrder } from "@/lib/shopify/mockOrders";

export const dynamic = "force-dynamic";

function verifyHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Shopify "orders/create" webhook.
 *  - Verifies the HMAC signature when SHOPIFY_WEBHOOK_SECRET is set.
 *  - Without a secret it runs in clearly-marked insecure dev mode.
 *  - Normalizes the payload into the internal Order model.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  let devMode = false;

  if (secret) {
    if (!verifyHmac(raw, request.headers.get("x-shopify-hmac-sha256"), secret)) {
      return NextResponse.json({ ok: false, error: "Signature HMAC invalide" }, { status: 401 });
    }
  } else {
    devMode = true; // No secret configured — accept but flag as insecure.
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = shopifyOrderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload de commande Shopify invalide", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // In production: persist to DB / enqueue for processing. Here we normalize + echo.
  const order = normalizeShopifyOrder(parsed.data);

  return NextResponse.json({ ok: true, devMode, order }, { status: 201 });
}

/** GET returns a sample normalized order so the adapter is easy to test. */
export async function GET() {
  const order = normalizeShopifyOrder(sampleShopifyOrder());
  return NextResponse.json({ ok: true, sample: order });
}
