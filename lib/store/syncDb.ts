import { getPrisma } from "@/lib/db/prisma";

/** Ensure a ShopConnection row exists for the domain; returns its id. */
export async function ensureShop(shopDomain: string, apiVersion: string): Promise<string | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  const conn = await prisma.shopConnection.upsert({
    where: { shopDomain },
    create: { id: shopDomain, shopDomain, apiVersion },
    update: { apiVersion },
  });
  return conn.id;
}

interface RecordRunInput {
  shopId: string | null;
  resource: "orders" | "products";
  imported: number;
  updated: number;
  total: number;
  error?: string | null;
}

/** Log a sync run and refresh the connection's counters. */
export async function recordRun({ shopId, resource, imported, updated, total, error = null }: RecordRunInput): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;

  const ops: Promise<unknown>[] = [
    prisma.syncRun.create({
      data: { resource, status: error ? "error" : "success", imported, updated, error, shopId: shopId ?? undefined },
    }),
  ];

  if (shopId) {
    ops.push(
      prisma.shopConnection.update({
        where: { id: shopId },
        data: {
          lastSyncAt: new Date(),
          ...(resource === "orders" ? { ordersImported: total } : { productsImported: total }),
        },
      }),
    );
  }

  await Promise.all(ops);
}
