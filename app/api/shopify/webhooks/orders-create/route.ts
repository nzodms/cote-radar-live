import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { shopifyOrderPayloadSchema } from "@/schemas";
import { normalizeShopifyOrder, type NormalizedLineItem } from "@/lib/shopify/normalize";
import { sampleShopifyOrder } from "@/lib/shopify/mockOrders";
import { getShopifyConfig } from "@/lib/shopify/client";
import { isDbConfigured } from "@/lib/db/prisma";
import { upsertShopifyOrders } from "@/lib/store/ordersDb";
import { ensureShop, recordRun } from "@/lib/store/syncDb";

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
 *  - Verifies the HMAC signature when SHOPIFY_WEBHOOK_SECRET is set (else dev mode).
 *  - Normalizes the payload and persists it (dedupe by Shopify id) when a DB is configured.
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

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = shopifyOrderPayloadSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload de commande Shopify invalide", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Deterministic id enables dedupe on webhook re-delivery.
  const order = { ...normalizeShopifyOrder(parsed.data), id: `shop_${parsed.data.id}` };

  let persisted = false;
  if (isDbConfigured()) {
    try {
      const cfg = getShopifyConfig();
      const shopId = cfg.shop ? await ensureShop(cfg.shop, cfg.apiVersion) : null;
      const lineItems: NormalizedLineItem[] = (parsed.data.line_items ?? []).map((li) => ({
        title: li.title,
        variantTitle: li.variant_title ?? null,
        sku: li.sku ?? null,
        quantity: li.quantity,
        price: parseFloat(li.price) || 0,
        image: li.image?.src ?? null,
        productId: null,
        variantId: null,
      }));
      const counts = await upsertShopifyOrders(
        [
          {
            order,
            shopifyOrderId: String(parsed.data.id),
            financialStatus: parsed.data.financial_status ?? null,
            fulfillmentStatus: parsed.data.fulfillment_status ?? null,
            lineItems,
          },
        ],
        shopId,
      );
      await recordRun({
        shopId,
        resource: "orders",
        imported: counts.imported,
        updated: counts.updated,
        total: counts.imported + counts.updated,
      });
      persisted = true;
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, devMode, persisted, order }, { status: 201 });
}

/** GET returns a sample normalized order so the adapter is easy to test. */
export async function GET() {
  const order = normalizeShopifyOrder(sampleShopifyOrder());
  return NextResponse.json({ ok: true, sample: order });
}
