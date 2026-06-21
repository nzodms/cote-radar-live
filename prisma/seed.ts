/**
 * Seeds the database with the SupplierPilot demo dataset.
 * Run with: npm run db:seed   (requires DATABASE_URL)
 *
 * Self-contained: imports only the demo data (type-only "@/“ imports are erased)
 * and writes via PrismaClient directly, so it runs cleanly under tsx.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import {
  SEED_SUPPLIERS,
  SEED_ORDERS,
  SEED_QUOTES,
  SEED_CONVERSATIONS,
  SEED_RULES,
} from "../lib/data/seed";

const prisma = new PrismaClient();
const d = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

async function main() {
  console.log("Clearing existing data…");
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.supplierQuote.deleteMany({});
  await prisma.orderLineItem.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.supplier.deleteMany({});

  console.log("Seeding AI rules…");
  await prisma.aIRules.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      minimumMarginPercent: SEED_RULES.minimumMarginPercent,
      maximumDeliveryDays: SEED_RULES.maximumDeliveryDays,
      manualValidationAbove: SEED_RULES.manualValidationAbove,
      autoReminderHours: SEED_RULES.autoReminderHours,
      preferConfirmedStock: SEED_RULES.preferConfirmedStock,
      excludeReliabilityBelow: SEED_RULES.excludeReliabilityBelow,
      preferredSupplierIds: SEED_RULES.preferredSupplierIds,
      blockedSupplierIds: SEED_RULES.blockedSupplierIds,
      allowedCountries: SEED_RULES.allowedCountries,
      weightPrice: SEED_RULES.weights.price,
      weightDelay: SEED_RULES.weights.delay,
      weightReliability: SEED_RULES.weights.reliability,
      weightStock: SEED_RULES.weights.stock,
      weightMargin: SEED_RULES.weights.margin,
    },
  });

  console.log(`Seeding ${SEED_SUPPLIERS.length} suppliers…`);
  await prisma.supplier.createMany({
    data: SEED_SUPPLIERS.map((s) => ({
      id: s.id,
      name: s.name,
      initials: s.initials,
      country: s.country,
      countryCode: s.countryCode,
      specialty: s.specialty,
      whatsappNumber: s.whatsappNumber,
      language: s.language,
      reliabilityScore: s.reliabilityScore,
      performance90d: s.performance90d,
      averageDelayDays: s.averageDelayDays,
      averageCost: s.averageCost,
      totalOrders: s.totalOrders,
      totalPaid: s.totalPaid,
      incidents: s.incidents,
      tags: s.tags,
      notes: s.notes,
      preferred: s.preferred,
      blocked: s.blocked,
      online: s.online,
      createdAt: new Date(s.createdAt),
    })),
  });

  console.log(`Seeding ${SEED_ORDERS.length} orders…`);
  await prisma.order.createMany({
    data: SEED_ORDERS.map((o) => ({
      id: o.id,
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
      selectedSupplierId: o.selectedSupplierId,
      recommendedSupplierId: o.recommendedSupplierId,
      paymentStatus: o.paymentStatus,
      trackingStatus: o.trackingStatus,
      trackingNumber: o.trackingNumber,
      paymentDate: d(o.paymentDate),
      expectedTrackingDate: d(o.expectedTrackingDate),
      createdAt: new Date(o.createdAt),
    })),
  });

  console.log(`Seeding ${SEED_QUOTES.length} quotes…`);
  await prisma.supplierQuote.createMany({
    data: SEED_QUOTES.map((q) => ({
      id: q.id,
      orderId: q.orderId,
      supplierId: q.supplierId,
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
      createdAt: new Date(q.createdAt),
    })),
  });

  console.log(`Seeding ${SEED_CONVERSATIONS.length} conversations…`);
  await prisma.conversation.createMany({
    data: SEED_CONVERSATIONS.map((c) => ({
      id: c.id,
      supplierId: c.supplierId,
      orderId: c.orderId,
      unreadCount: c.unreadCount,
      status: c.status,
      lastMessageAt: new Date(c.lastMessageAt),
    })),
  });

  const messages = SEED_CONVERSATIONS.flatMap((c) =>
    c.messages.map((m) => ({
      id: `${c.id}_${m.id}`,
      conversationId: c.id,
      senderType: m.senderType,
      content: m.content,
      channel: m.channel,
      status: m.status ?? null,
      attachments: m.attachments ? (m.attachments as unknown as Prisma.InputJsonValue) : undefined,
      quoteSnapshot: m.quote ? (m.quote as unknown as Prisma.InputJsonValue) : undefined,
      timestamp: new Date(m.timestamp),
    })),
  );
  console.log(`Seeding ${messages.length} messages…`);
  await prisma.message.createMany({ data: messages });

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
