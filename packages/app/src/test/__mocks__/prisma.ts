/**
 * Prisma client mock factory for unit tests.
 * Usage: vi.mock("@/lib/db", () => ({ prisma: createMockPrisma() }))
 */
import { vi } from "vitest";

type MockModel = {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

function createMockModel(): MockModel {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createMockPrisma() {
  return {
    adminOrder: createMockModel(),
    adminPlayer: createMockModel(),
    adminSession: createMockModel(),
    userSession: createMockModel(),
    notification: createMockModel(),
    referral: createMockModel(),
    growthEvent: createMockModel(),
    userCoupon: createMockModel(),
    miniProgramAccount: createMockModel(),
    chainEventCursor: createMockModel(),
    adminAuditLog: createMockModel(),
    announcement: createMockModel(),
    guardian: createMockModel(),
    invoice: createMockModel(),
    ledgerEntry: createMockModel(),
    mantouAccount: createMockModel(),
    mantouTransaction: createMockModel(),
    mantouWithdraw: createMockModel(),
    membership: createMockModel(),
    membershipTier: createMockModel(),
    redeemCode: createMockModel(),
    redeemRecord: createMockModel(),
    review: createMockModel(),
    supportTicket: createMockModel(),
    supportReply: createMockModel(),
    pushSubscription: createMockModel(),
    dispute: createMockModel(),
    disputeCase: createMockModel(),
    customerTag: createMockModel(),
    webVital: createMockModel(),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(createMockPrisma())),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
