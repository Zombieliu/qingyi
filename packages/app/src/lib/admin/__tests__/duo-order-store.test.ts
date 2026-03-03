import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  duoOrder: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}));

vi.mock("../admin-store-utils", () => ({
  prisma: mockPrisma,
  Prisma: { DbNull: "DbNull" },
  appendCursorWhere: vi.fn(),
  buildCursorPayload: vi.fn(),
}));

vi.mock("@/lib/chain/chain-status", () => ({
  mapPaymentStatus: vi.fn((status: number) => {
    const map: Record<number, string> = {
      0: "未支付",
      1: "撮合费已付",
      2: "押金已锁定",
      3: "待结算",
      4: "争议中",
      5: "已结算",
      6: "已取消",
    };
    return map[status] ?? "未知";
  }),
}));

vi.mock("@/lib/shared/soft-delete", () => ({
  notDeleted: {},
}));

import { releaseDuoSlot } from "../duo-order-store";

function makeDuoOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "duo-1",
    user: "user1",
    userAddress: "0xUSER",
    companionAddressA: "0xCOMPA",
    companionAddressB: "0xCOMPB",
    item: "双陪订单",
    amount: 200,
    currency: "CNY",
    paymentStatus: "押金已锁定",
    stage: "进行中",
    note: null,
    assignedTo: null,
    source: "chain",
    chainDigest: "0xDEAD",
    chainStatus: 2,
    serviceFee: 100,
    depositPerCompanion: 50,
    teamStatus: 3,
    meta: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    ...overrides,
  };
}

describe("releaseDuoSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when order not found", async () => {
    mockPrisma.duoOrder.findUnique.mockResolvedValue(null);
    const result = await releaseDuoSlot("nonexistent", "A");
    expect(result).toBeNull();
  });

  it("releases slot A: READY(3) → B_DEPOSITED(2), status 2→1", async () => {
    const row = makeDuoOrderRow({ teamStatus: 3, chainStatus: 2 });
    mockPrisma.duoOrder.findUnique.mockResolvedValue(row);
    const updatedRow = makeDuoOrderRow({
      companionAddressA: null,
      teamStatus: 2,
      chainStatus: 1,
      stage: "已确认",
      paymentStatus: "服务费已付",
    });
    mockPrisma.duoOrder.update.mockResolvedValue(updatedRow);

    const result = await releaseDuoSlot("duo-1", "A");
    expect(result).not.toBeNull();

    const call = mockPrisma.duoOrder.update.mock.calls[0][0];
    expect(call.data.companionAddressA).toBeNull();
    expect(call.data.teamStatus).toBe(2);
    expect(call.data.chainStatus).toBe(1);
    expect(call.data.stage).toBe("已确认");
    expect(call.data.paymentStatus).toBe("服务费已付");
  });

  it("releases slot B: READY(3) → A_DEPOSITED(1), status 2→1", async () => {
    const row = makeDuoOrderRow({ teamStatus: 3, chainStatus: 2 });
    mockPrisma.duoOrder.findUnique.mockResolvedValue(row);
    const updatedRow = makeDuoOrderRow({
      companionAddressB: null,
      teamStatus: 1,
      chainStatus: 1,
      stage: "已确认",
      paymentStatus: "服务费已付",
    });
    mockPrisma.duoOrder.update.mockResolvedValue(updatedRow);

    const result = await releaseDuoSlot("duo-1", "B");
    expect(result).not.toBeNull();

    const call = mockPrisma.duoOrder.update.mock.calls[0][0];
    expect(call.data.companionAddressB).toBeNull();
    expect(call.data.teamStatus).toBe(1);
    expect(call.data.chainStatus).toBe(1);
  });

  it("releases slot A: A_DEPOSITED(1) → WAITING(0), no status change when chainStatus=1", async () => {
    const row = makeDuoOrderRow({ teamStatus: 1, chainStatus: 1 });
    mockPrisma.duoOrder.findUnique.mockResolvedValue(row);
    const updatedRow = makeDuoOrderRow({ companionAddressA: null, teamStatus: 0, chainStatus: 1 });
    mockPrisma.duoOrder.update.mockResolvedValue(updatedRow);

    await releaseDuoSlot("duo-1", "A");

    const call = mockPrisma.duoOrder.update.mock.calls[0][0];
    expect(call.data.companionAddressA).toBeNull();
    expect(call.data.teamStatus).toBe(0);
    expect(call.data.chainStatus).toBeUndefined(); // no rollback needed
  });

  it("releases slot B: B_DEPOSITED(2) → WAITING(0)", async () => {
    const row = makeDuoOrderRow({ teamStatus: 2, chainStatus: 1 });
    mockPrisma.duoOrder.findUnique.mockResolvedValue(row);
    const updatedRow = makeDuoOrderRow({ companionAddressB: null, teamStatus: 0, chainStatus: 1 });
    mockPrisma.duoOrder.update.mockResolvedValue(updatedRow);

    await releaseDuoSlot("duo-1", "B");

    const call = mockPrisma.duoOrder.update.mock.calls[0][0];
    expect(call.data.companionAddressB).toBeNull();
    expect(call.data.teamStatus).toBe(0);
  });

  it("does not change teamStatus when releasing slot A with teamStatus=0", async () => {
    const row = makeDuoOrderRow({ teamStatus: 0, chainStatus: 0 });
    mockPrisma.duoOrder.findUnique.mockResolvedValue(row);
    const updatedRow = makeDuoOrderRow({ companionAddressA: null, teamStatus: 0, chainStatus: 0 });
    mockPrisma.duoOrder.update.mockResolvedValue(updatedRow);

    await releaseDuoSlot("duo-1", "A");

    const call = mockPrisma.duoOrder.update.mock.calls[0][0];
    expect(call.data.companionAddressA).toBeNull();
    expect(call.data.teamStatus).toBeUndefined();
  });

  it("does not change teamStatus when releasing slot B with teamStatus=0", async () => {
    const row = makeDuoOrderRow({ teamStatus: 0, chainStatus: 0 });
    mockPrisma.duoOrder.findUnique.mockResolvedValue(row);
    const updatedRow = makeDuoOrderRow({ companionAddressB: null, teamStatus: 0, chainStatus: 0 });
    mockPrisma.duoOrder.update.mockResolvedValue(updatedRow);

    await releaseDuoSlot("duo-1", "B");

    const call = mockPrisma.duoOrder.update.mock.calls[0][0];
    expect(call.data.companionAddressB).toBeNull();
    expect(call.data.teamStatus).toBeUndefined();
  });
});
