import { NextResponse } from "next/server";
import { testShopifyConnection } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";

/** Tests the configured Shopify connection (env-based). Never returns the token. */
export async function GET() {
  const status = await testShopifyConnection();
  return NextResponse.json(status, { status: status.ok || !status.configured ? 200 : 502 });
}
