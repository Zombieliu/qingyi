import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";

type GlobalPrisma = typeof globalThis & { prisma?: PrismaClient };

const globalForPrisma = globalThis as GlobalPrisma;

const prismaDatasourceUrl = (() => {
  const rawUrl = process.env.DATABASE_POOL_URL || process.env.DATABASE_POOLED_URL || process.env.DATABASE_URL;
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    const params = url.searchParams;
    if (!params.has("connection_limit")) {
      const defaultLimit = process.env.NODE_ENV === "production" ? "1" : "10";
      params.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT || defaultLimit);
    }
    if (!params.has("pool_timeout")) {
      params.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT || "20");
    }
    url.search = params.toString();
    return url.toString();
  } catch {
    return rawUrl;
  }
})();

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    ...(prismaDatasourceUrl ? { datasources: { db: { url: prismaDatasourceUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma };
