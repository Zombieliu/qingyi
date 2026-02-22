/**
 * Global setup for integration tests.
 * Creates test schema and tables via raw SQL (avoids prisma db push .env issues).
 */
import { PrismaClient } from "@prisma/client";

const TEST_SCHEMA = "test_integration";
const TEST_DATABASE_URL = `postgresql://qingyi:qingyi@localhost:5432/qingyi?schema=${TEST_SCHEMA}`;

export async function setup() {
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });
  await prisma.$connect();

  // Create schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);

  // Create tables matching Prisma schema (subset needed for integration tests)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."AdminOrder" (
      "id" TEXT PRIMARY KEY,
      "user" TEXT NOT NULL,
      "userAddress" TEXT,
      "companionAddress" TEXT,
      "item" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "currency" TEXT NOT NULL,
      "paymentStatus" TEXT NOT NULL,
      "stage" TEXT NOT NULL,
      "note" TEXT,
      "assignedTo" TEXT,
      "source" TEXT,
      "chainDigest" TEXT,
      "chainStatus" INTEGER,
      "serviceFee" DOUBLE PRECISION,
      "deposit" DOUBLE PRECISION,
      "meta" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."Notification" (
      "id" TEXT PRIMARY KEY,
      "userAddress" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "orderId" TEXT,
      "read" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."Referral" (
      "id" TEXT PRIMARY KEY,
      "inviterAddress" TEXT NOT NULL,
      "inviteeAddress" TEXT NOT NULL UNIQUE,
      "status" TEXT NOT NULL,
      "rewardInviter" INTEGER,
      "rewardInvitee" INTEGER,
      "triggerOrderId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "rewardedAt" TIMESTAMP(3)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."GrowthEvent" (
      "id" TEXT PRIMARY KEY,
      "event" TEXT NOT NULL,
      "clientId" TEXT,
      "sessionId" TEXT,
      "userAddress" TEXT,
      "path" TEXT,
      "referrer" TEXT,
      "ua" TEXT,
      "meta" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL
    )
  `);

  // Create indexes
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_notif_user_read" ON "${TEST_SCHEMA}"."Notification" ("userAddress", "read")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_notif_user_created" ON "${TEST_SCHEMA}"."Notification" ("userAddress", "createdAt")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_growth_event" ON "${TEST_SCHEMA}"."GrowthEvent" ("event")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_growth_user" ON "${TEST_SCHEMA}"."GrowthEvent" ("userAddress")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_referral_inviter" ON "${TEST_SCHEMA}"."Referral" ("inviterAddress")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_referral_status" ON "${TEST_SCHEMA}"."Referral" ("status")`
  );

  await prisma.$disconnect();
}

export async function teardown() {
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });
  await prisma.$connect();
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await prisma.$disconnect();
}
