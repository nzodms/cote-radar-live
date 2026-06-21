import type { Order as DbOrder, SupplierQuote as DbQuote } from "@prisma/client";
import type {
  Currency,
  Order,
  OrderStatus,
  PaymentStatus,
  StockStatus,
  SupplierQuote,
  TrackingStatus,
} from "@/types";
import { getPrisma } from "@/lib/db/prisma";
import type { NormalizedLineItem } from "@/lib/shopify/normalize";

const toIso = (d: Date | null) => (d ? d.toISOString() : null);
const toDate = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

// --------------------------------------------------------------------------- orders
function toOrder(row: DbOrder): Order {
  return {
    id: row.id,
    shopifyOrderNumber: row.shopifyOrderNumber,
    productName: row.productName,
    productImage: row.productImage,
    variant: row.variant,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    country: row.country,
    countryCode: row.countryCode,
    customerName: row.customerName,
    salePrice: row.salePrice,
    currency: row.currency as Currency,
    targetMaxCost: row.targetMaxCost,
    status: row.status as OrderStatus,
    selectedSupplierId: row.selectedSupplierId,
    recommendedSupplierId: row.recommendedSupplierId,
    paymentStatus: row.paymentStatus as PaymentStatus,
    trackingStatus: row.trackingStatus as TrackingStatus,
    trackingNumber: row.trackingNumber,
    paymentDate: toIso(row.paymentDate),
    expectedTrackingDate: toIso(row.expectedTrackingDate),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Workflow scalars persisted from the client snapshot (Shopify metadata preserved). */
function orderScalars(o: Order) {
  return {
    shopifyOrderNumber: o.shopifyOrderNumber,
    productName: o.productName,
    productImage: o.productImage,
    variant: o.variant,
    size: o.size,
    color: o.color,
    quantity: o.quantity,
    country: o.country,
    countryCode: o.countryCode,
    customerName: o.customerName,
    salePrice: o.salePrice,
    currency: o.currency,
    targetMaxCost: o.targetMaxCost,
    status: o.status,
    paymentStatus: o.paymentStatus,
    trackingStatus: o.trackingStatus,
    trackingNumber: o.trackingNumber,
    paymentDate: toDate(o.paymentDate),
    expectedTrackingDate: toDate(o.expectedTrackingDate),
    recommendedSupplierId: o.recommendedSupplierId,
    selectedSupplierId: o.selectedSupplierId,
  };
}

export async function getAllOrders(): Promise<Order[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const rows = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toOrder);
}

export async function syncOrders(orders: Order[]): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  const keep = orders.map((o) => o.id);
  await prisma.$transaction([
    keep.length ? prisma.order.deleteMany({ where: { id: { notIn: keep } } }) : prisma.order.deleteMany({}),
    ...orders.map((o) =>
      prisma.order.upsert({
        where: { id: o.id },
        create: { id: o.id, createdAt: new Date(o.createdAt), ...orderScalars(o) },
        update: orderScalars(o),
      }),
    ),
  ]);
}

// --------------------------------------------------------------------------- quotes
function toQuote(row: DbQuote): SupplierQuote {
  return {
    id: row.id,
    orderId: row.orderId,
    supplierId: row.supplierId,
    productCost: row.productCost,
    shippingCost: row.shippingCost,
    totalCost: row.totalCost,
    currency: row.currency as Currency,
    deliveryMinDays: row.deliveryMinDays,
    deliveryMaxDays: row.deliveryMaxDays,
    stockStatus: row.stockStatus as StockStatus,
    reliabilityScore: row.reliabilityScore,
    performance90d: row.performance90d,
    incidents: row.incidents,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function quoteScalars(q: SupplierQuote) {
  return {
    productCost: q.productCost,
    shippingCost: q.shippingCost,
    totalCost: q.totalCost,
    currency: q.currency,
    deliveryMinDays: q.deliveryMinDays,
    deliveryMaxDays: q.deliveryMaxDays,
    stockStatus: q.stockStatus,
    reliabilityScore: q.reliabilityScore,
    performance90d: q.performance90d,
    incidents: q.incidents,
    notes: q.notes,
  };
}

export async function getAllQuotes(): Promise<SupplierQuote[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const rows = await prisma.supplierQuote.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toQuote);
}

export async function syncQuotes(quotes: SupplierQuote[]): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  const keep = quotes.map((q) => q.id);
  // Delete first (handles re-extracted quotes that share orderId+supplierId with a new id).
  await prisma.$transaction([
    keep.length ? prisma.supplierQuote.deleteMany({ where: { id: { notIn: keep } } }) : prisma.supplierQuote.deleteMany({}),
    ...quotes.map((q) =>
      prisma.supplierQuote.upsert({
        where: { id: q.id },
        create: { id: q.id, orderId: q.orderId, supplierId: q.supplierId, createdAt: new Date(q.createdAt), ...quoteScalars(q) },
        update: quoteScalars(q),
      }),
    ),
  ]);
}

// ----------------------------------------------------------------- shopify upsert
export interface ShopifyOrderUpsert {
  order: Order;
  shopifyOrderId: string;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  lineItems: NormalizedLineItem[];
}

/** Upsert synced Shopify orders by stable id (dedupe), replacing their line items. */
export async function upsertShopifyOrders(
  items: ShopifyOrderUpsert[],
  shopId: string | null,
): Promise<{ imported: number; updated: number }> {
  const prisma = getPrisma();
  if (!prisma) return { imported: 0, updated: 0 };

  let imported = 0;
  let updated = 0;

  for (const { order, shopifyOrderId, financialStatus, fulfillmentStatus, lineItems } of items) {
    const existing = await prisma.order.findUnique({ where: { id: order.id }, select: { id: true } });
    if (existing) updated++;
    else imported++;

    await prisma.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        createdAt: new Date(order.createdAt),
        shopifyOrderId,
        financialStatus: financialStatus ?? null,
        fulfillmentStatus: fulfillmentStatus ?? null,
        shopId: shopId ?? undefined,
        ...orderScalars(order),
      },
      // Don't clobber the sourcing workflow on re-sync — refresh Shopify-side facts only.
      update: {
        shopifyOrderNumber: order.shopifyOrderNumber,
        productName: order.productName,
        productImage: order.productImage,
        variant: order.variant,
        size: order.size,
        color: order.color,
        quantity: order.quantity,
        country: order.country,
        countryCode: order.countryCode,
        customerName: order.customerName,
        salePrice: order.salePrice,
        currency: order.currency,
        shopifyOrderId,
        financialStatus: financialStatus ?? null,
        fulfillmentStatus: fulfillmentStatus ?? null,
        shopId: shopId ?? undefined,
      },
    });

    await prisma.orderLineItem.deleteMany({ where: { orderId: order.id } });
    if (lineItems.length) {
      await prisma.orderLineItem.createMany({
        data: lineItems.map((li) => ({
          orderId: order.id,
          title: li.title,
          variantTitle: li.variantTitle,
          sku: li.sku,
          quantity: li.quantity,
          price: li.price,
          image: li.image,
          productId: li.productId,
          variantId: li.variantId,
        })),
      });
    }
  }

  return { imported, updated };
}
