import { NextResponse } from "next/server";
import type { AIRules, Conversation, Order, Supplier, SupplierQuote } from "@/types";
import { isDbConfigured } from "@/lib/db/prisma";
import { getAllSuppliers, syncSuppliers } from "@/lib/store/suppliersDb";
import { getAllOrders, getAllQuotes, syncOrders, syncQuotes } from "@/lib/store/ordersDb";
import { getAllConversations, syncConversations } from "@/lib/store/conversationsDb";
import { getRules, saveRules, getShopMeta } from "@/lib/store/settingsDb";
import { syncPurchasesFromState } from "@/lib/store/purchasesDb";

export const dynamic = "force-dynamic";

/** Bootstrap: returns the full app state from the DB, or { mode: "demo" }. */
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ mode: "demo" });
  try {
    const [suppliers, orders, quotes, conversations, rules, shopMeta] = await Promise.all([
      getAllSuppliers(),
      getAllOrders(),
      getAllQuotes(),
      getAllConversations(),
      getRules(),
      getShopMeta(),
    ]);
    return NextResponse.json({
      mode: "db",
      suppliers,
      orders,
      quotes,
      conversations,
      rules,
      dataSource: shopMeta.dataSource,
      shopify: shopMeta.shopify,
      shopifyProducts: [],
    });
  } catch (e) {
    return NextResponse.json({ mode: "error", error: (e as Error).message }, { status: 500 });
  }
}

interface SnapshotBody {
  suppliers?: Supplier[];
  orders?: Order[];
  quotes?: SupplierQuote[];
  conversations?: Conversation[];
  rules?: AIRules;
}

/** Write-through: persists the client snapshot to the DB (upsert + prune). */
export async function PUT(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ ok: false, mode: "demo" });

  let body: SnapshotBody;
  try {
    body = (await request.json()) as SnapshotBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const suppliers = body.suppliers ?? [];
  const orders = body.orders ?? [];
  const quotes = body.quotes ?? [];
  const conversations = body.conversations ?? [];

  // Sanitize references so the snapshot is FK-consistent.
  const supplierIds = new Set(suppliers.map((s) => s.id));
  const orderIds = new Set(orders.map((o) => o.id));
  for (const o of orders) {
    if (o.selectedSupplierId && !supplierIds.has(o.selectedSupplierId)) o.selectedSupplierId = null;
    if (o.recommendedSupplierId && !supplierIds.has(o.recommendedSupplierId)) o.recommendedSupplierId = null;
  }
  const validQuotes = quotes.filter((q) => supplierIds.has(q.supplierId) && orderIds.has(q.orderId));
  const validConvs = conversations.filter((c) => supplierIds.has(c.supplierId) && orderIds.has(c.orderId));

  try {
    // Order matters for foreign keys: suppliers → orders → quotes → conversations.
    await syncSuppliers(suppliers);
    await syncOrders(orders);
    await syncQuotes(validQuotes);
    await syncConversations(validConvs);
    if (body.rules) await saveRules(body.rules);
    await syncPurchasesFromState(orders, suppliers, validQuotes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
