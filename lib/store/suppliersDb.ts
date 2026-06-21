import type { Supplier as DbSupplier } from "@prisma/client";
import type { Supplier, SupplierLanguage } from "@/types";
import { getPrisma } from "@/lib/db/prisma";

function toSupplier(row: DbSupplier): Supplier {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    country: row.country,
    countryCode: row.countryCode,
    specialty: row.specialty,
    whatsappNumber: row.whatsappNumber,
    language: row.language as SupplierLanguage,
    reliabilityScore: row.reliabilityScore,
    performance90d: row.performance90d,
    averageDelayDays: row.averageDelayDays,
    averageCost: row.averageCost,
    totalOrders: row.totalOrders,
    totalPaid: row.totalPaid,
    incidents: row.incidents,
    tags: row.tags,
    notes: row.notes,
    preferred: row.preferred,
    blocked: row.blocked,
    online: row.online,
    createdAt: row.createdAt.toISOString(),
  };
}

function scalars(s: Supplier) {
  return {
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
  };
}

export async function getAllSuppliers(): Promise<Supplier[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const rows = await prisma.supplier.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toSupplier);
}

/** Upsert the provided suppliers and delete any not present (snapshot sync). */
export async function syncSuppliers(suppliers: Supplier[]): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  const keep = suppliers.map((s) => s.id);
  await prisma.$transaction([
    keep.length
      ? prisma.supplier.deleteMany({ where: { id: { notIn: keep } } })
      : prisma.supplier.deleteMany({}),
    ...suppliers.map((s) =>
      prisma.supplier.upsert({
        where: { id: s.id },
        create: { id: s.id, createdAt: new Date(s.createdAt), ...scalars(s) },
        update: scalars(s),
      }),
    ),
  ]);
}
