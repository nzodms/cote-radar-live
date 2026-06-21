import { NextResponse } from "next/server";
import { getShopifyConfig, shopifyGraphQL, ShopifyError } from "@/lib/shopify/client";
import { RECENT_ORDERS_QUERY } from "@/lib/shopify/queries";
import { normalizeGraphOrder, normalizeGraphLineItems } from "@/lib/shopify/normalize";
import type { ShopifyGraphOrder } from "@/lib/shopify/types";
import { isDbConfigured } from "@/lib/db/prisma";
import { upsertShopifyOrders, type ShopifyOrderUpsert } from "@/lib/store/ordersDb";
import { ensureShop, recordRun } from "@/lib/store/syncDb";

export const dynamic = "force-dynamic";

const MAX_ORDERS = 25;

async function syncOrders() {
  const cfg = getShopifyConfig();
  if (!cfg.configured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Shopify non configuré. Ajoutez vos variables d'environnement." },
      { status: 200 },
    );
  }
  try {
    const data = await shopifyGraphQL<{ orders: { edges: { node: ShopifyGraphOrder }[] } }>(
      RECENT_ORDERS_QUERY,
      { first: MAX_ORDERS },
    );
    const nodes = data.orders.edges.map((e) => e.node);
    const orders = nodes.map(normalizeGraphOrder);

    let persisted = false;
    let imported = 0;
    let updated = 0;

    if (isDbConfigured()) {
      const shopId = await ensureShop(cfg.shop, cfg.apiVersion);
      const items: ShopifyOrderUpsert[] = nodes.map((node, i) => ({
        order: orders[i],
        shopifyOrderId: node.id,
        financialStatus: node.displayFinancialStatus ?? null,
        fulfillmentStatus: node.displayFulfillmentStatus ?? null,
        lineItems: normalizeGraphLineItems(node),
      }));
      const counts = await upsertShopifyOrders(items, shopId);
      imported = counts.imported;
      updated = counts.updated;
      await recordRun({ shopId, resource: "orders", imported, updated, total: orders.length });
      persisted = true;
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      persisted,
      count: orders.length,
      imported,
      updated,
      orders,
      shopDomain: cfg.shop,
      apiVersion: cfg.apiVersion,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const err = e as ShopifyError;
    if (isDbConfigured()) {
      try {
        const shopId = await ensureShop(cfg.shop, cfg.apiVersion);
        await recordRun({ shopId, resource: "orders", imported: 0, updated: 0, total: 0, error: err.message });
      } catch {
        /* best-effort logging */
      }
    }
    return NextResponse.json({ ok: false, configured: true, error: err.message, code: err.code }, { status: 502 });
  }
}

export async function GET() {
  return syncOrders();
}
export async function POST() {
  return syncOrders();
}
