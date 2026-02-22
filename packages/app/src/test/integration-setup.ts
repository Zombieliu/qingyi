/**
 * Per-file integration test helper — connects to test schema, truncates between tests.
 */
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, beforeEach } from "vitest";

const TEST_SCHEMA = "test_integration";
const TEST_DATABASE_URL = `postgresql://qingyi:qingyi@localhost:5432/qingyi?schema=${TEST_SCHEMA}`;

let prisma: PrismaClient;

export function getTestPrisma() {
  return prisma;
}

export function setupIntegrationTests() {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = ${TEST_SCHEMA}
    `;
    for (const { tablename } of tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${TEST_SCHEMA}"."${tablename}" CASCADE`);
    }
  });

  return { getPrisma: () => prisma };
}
