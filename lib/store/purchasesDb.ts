import type { Order, Supplier, SupplierQuote } from "@/types";
import { getPrisma } from "@/lib/db/prisma";

const toDate = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

/**
 * Purchases are derived from orders + selected supplier + quote. We persist them
 * so the data layer carries a real purchase ledger (reporting / future use).
 */
export async function syncPurchasesFromState(
  orders: Order[],
  suppliers: Supplier[],
  quotes: SupplierQuote[],
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;

  const supplierIds = new Set(suppliers.map((s) => s.id));
  const rows = orders
    .filter((o) => o.selectedSupplierId && supplierIds.has(o.selectedSupplierId))
    .map((o) => {
      const quote = quotes.find((q) => q.orderId === o.id && q.supplierId === o.selectedSupplierId);
      const amount = quote ? quote.totalCost * o.quantity : o.targetMaxCost * o.quantity;
      return {
        orderId: o.id,
        supplierId: o.selectedSupplierId!,
        amount,
        currency: o.currency,
        paymentStatus: o.paymentStatus,
        paymentDate: toDate(o.paymentDate),
        expectedTrackingDate: toDate(o.expectedTrackingDate),
        trackingNumber: o.trackingNumber,
        status: o.status,
      };
    });

  const keep = rows.map((r) => r.orderId);

  await prisma.$transaction([
    keep.length
      ? prisma.purchase.deleteMany({ where: { orderId: { notIn: keep } } })
      : prisma.purchase.deleteMany({}),
    ...rows.map((r) =>
      prisma.purchase.upsert({
        where: { orderId: r.orderId },
        create: r,
        update: {
          supplierId: r.supplierId,
          amount: r.amount,
          currency: r.currency,
          paymentStatus: r.paymentStatus,
          paymentDate: r.paymentDate,
          expectedTrackingDate: r.expectedTrackingDate,
          trackingNumber: r.trackingNumber,
          status: r.status,
        },
      }),
    ),
  ]);
}
