import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/lib/env";

type GlobalPrisma = typeof globalThis & { prisma?: PrismaClient };

const globalForPrisma = globalThis as GlobalPrisma;

const prismaDatasourceUrl = (() => {
  const rawUrl = env.DATABASE_POOL_URL || env.DATABASE_POOLED_URL || env.DATABASE_URL;
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    const params = url.searchParams;
    if (!params.has("connection_limit")) {
      const defaultLimit = process.env.NODE_ENV === "production" ? "1" : "10";
      params.set("connection_limit", String(env.PRISMA_CONNECTION_LIMIT || defaultLimit));
    }
    if (!params.has("pool_timeout")) {
      params.set("pool_timeout", String(env.PRISMA_POOL_TIMEOUT));
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
