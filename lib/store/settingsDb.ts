import type { AIRules as DbAIRules, ShopConnection } from "@prisma/client";
import type { AIRules } from "@/types";
import type { DataSource, ShopifyMeta } from "@/lib/store/useStore";
import { getPrisma } from "@/lib/db/prisma";
import { SEED_RULES } from "@/lib/data/seed";

function toRules(row: DbAIRules): AIRules {
  return {
    minimumMarginPercent: row.minimumMarginPercent,
    maximumDeliveryDays: row.maximumDeliveryDays,
    manualValidationAbove: row.manualValidationAbove,
    autoReminderHours: row.autoReminderHours,
    preferConfirmedStock: row.preferConfirmedStock,
    excludeReliabilityBelow: row.excludeReliabilityBelow,
    preferredSupplierIds: row.preferredSupplierIds,
    blockedSupplierIds: row.blockedSupplierIds,
    allowedCountries: row.allowedCountries,
    weights: {
      price: row.weightPrice,
      delay: row.weightDelay,
      reliability: row.weightReliability,
      stock: row.weightStock,
      margin: row.weightMargin,
    },
  };
}

function toColumns(rules: AIRules) {
  return {
    minimumMarginPercent: rules.minimumMarginPercent,
    maximumDeliveryDays: rules.maximumDeliveryDays,
    manualValidationAbove: rules.manualValidationAbove,
    autoReminderHours: rules.autoReminderHours,
    preferConfirmedStock: rules.preferConfirmedStock,
    excludeReliabilityBelow: rules.excludeReliabilityBelow,
    preferredSupplierIds: rules.preferredSupplierIds,
    blockedSupplierIds: rules.blockedSupplierIds,
    allowedCountries: rules.allowedCountries,
    weightPrice: rules.weights.price,
    weightDelay: rules.weights.delay,
    weightReliability: rules.weights.reliability,
    weightStock: rules.weights.stock,
    weightMargin: rules.weights.margin,
  };
}

export async function getRules(): Promise<AIRules> {
  const prisma = getPrisma();
  if (!prisma) return SEED_RULES;
  const existing = await prisma.aIRules.findUnique({ where: { id: "default" } });
  if (existing) return toRules(existing);
  const created = await prisma.aIRules.create({ data: { id: "default", ...toColumns(SEED_RULES) } });
  return toRules(created);
}

export async function saveRules(rules: AIRules): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.aIRules.upsert({
    where: { id: "default" },
    create: { id: "default", ...toColumns(rules) },
    update: toColumns(rules),
  });
}

export async function getShopMeta(): Promise<{ dataSource: DataSource; shopify: ShopifyMeta }> {
  const prisma = getPrisma();
  const empty: ShopifyMeta = {
    shopDomain: null,
    apiVersion: null,
    lastSyncAt: null,
    ordersImported: 0,
    productsImported: 0,
    error: null,
  };
  if (!prisma) return { dataSource: "demo", shopify: empty };

  // "shopify" whenever real Shopify-linked orders are present (independent of
  // whether a ShopConnection row was recorded).
  const [conn, shopifyOrders] = await Promise.all([
    prisma.shopConnection.findFirst({ orderBy: { lastSyncAt: "desc" } }) as Promise<ShopConnection | null>,
    prisma.order.count({ where: { shopifyOrderId: { not: null } } }),
  ]);

  return {
    dataSource: shopifyOrders > 0 ? "shopify" : "demo",
    shopify: conn
      ? {
          shopDomain: conn.shopDomain,
          apiVersion: conn.apiVersion,
          lastSyncAt: conn.lastSyncAt ? conn.lastSyncAt.toISOString() : null,
          ordersImported: conn.ordersImported,
          productsImported: conn.productsImported,
          error: null,
        }
      : empty,
  };
}
