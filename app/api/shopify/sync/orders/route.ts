import { NextResponse } from "next/server";
import { getShopifyConfig, shopifyGraphQL, ShopifyError } from "@/lib/shopify/client";
import { RECENT_ORDERS_QUERY } from "@/lib/shopify/queries";
import { normalizeGraphOrder } from "@/lib/shopify/normalize";
import type { ShopifyGraphOrder } from "@/lib/shopify/types";

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
    const orders = data.orders.edges.map((e) => normalizeGraphOrder(e.node));
    return NextResponse.json({
      ok: true,
      configured: true,
      count: orders.length,
      orders,
      shopDomain: cfg.shop,
      apiVersion: cfg.apiVersion,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const err = e as ShopifyError;
    return NextResponse.json({ ok: false, configured: true, error: err.message, code: err.code }, { status: 502 });
  }
}

export async function GET() {
  return syncOrders();
}
export async function POST() {
  return syncOrders();
}
