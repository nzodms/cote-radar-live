import { NextResponse } from "next/server";
import { getShopifyConfig, shopifyGraphQL, ShopifyError } from "@/lib/shopify/client";
import { PRODUCTS_QUERY } from "@/lib/shopify/queries";
import { normalizeGraphProduct } from "@/lib/shopify/normalize";
import type { ShopifyGraphProduct } from "@/lib/shopify/types";
import { isDbConfigured } from "@/lib/db/prisma";
import { ensureShop, recordRun } from "@/lib/store/syncDb";

export const dynamic = "force-dynamic";

const MAX_PRODUCTS = 50;

async function syncProducts() {
  const cfg = getShopifyConfig();
  if (!cfg.configured) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Shopify non configuré. Ajoutez vos variables d'environnement." },
      { status: 200 },
    );
  }
  try {
    const data = await shopifyGraphQL<{ products: { edges: { node: ShopifyGraphProduct }[] } }>(
      PRODUCTS_QUERY,
      { first: MAX_PRODUCTS },
    );
    const products = data.products.edges.map((e) => normalizeGraphProduct(e.node));

    let persisted = false;
    if (isDbConfigured()) {
      const shopId = await ensureShop(cfg.shop, cfg.apiVersion);
      // Product rows are not modelled (no Product table); we log the run + count.
      await recordRun({ shopId, resource: "products", imported: products.length, updated: 0, total: products.length });
      persisted = true;
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      persisted,
      count: products.length,
      products,
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
  return syncProducts();
}
export async function POST() {
  return syncProducts();
}
