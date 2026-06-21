import { PrismaClient } from "@prisma/client";

/** True when a database is configured. Drives DB vs demo mode. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Lazy Prisma singleton (avoids exhausting connections during dev hot-reload).
 * Returns null when no DATABASE_URL is set so callers can fall back to demo mode
 * without ever constructing a client.
 */
export function getPrisma(): PrismaClient | null {
  if (!isDbConfigured()) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
