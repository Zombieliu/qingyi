import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock client-side dependencies before import
vi.mock("../order-store", () => ({
  addOrder: vi.fn(),
  loadOrders: vi.fn(() => []),
  removeOrder: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock("@/lib/shared/client-cache", () => ({
  readCache: vi.fn(),
  writeCache: vi.fn(),
}));

vi.mock("@/lib/auth/user-auth-client", () => ({
  fetchWithUserAuth: vi.fn(),
}));

vi.mock("@/lib/chain/qy-chain", () => ({
  getCurrentAddress: vi.fn(() => ""),
  isChainOrdersEnabled: vi.fn(() => false),
}));

import { normalizeOrder, buildMeta } from "../order-service";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeServerOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    user: "user1",
    item: "陪玩服务",
    amount: 100,
    currency: "CNY",
    paymentStatus: "未支付",
    stage: "待处理",
    createdAt: 1700000000000,
    ...overrides,
  };
}

// ─── normalizeOrder ───

describe("normalizeOrder", () => {
  it("normalizes a basic server order", () => {
    const result = normalizeOrder(makeServerOrder() as never);
    expect(result.id).toBe("o1");
    expect(result.user).toBe("user1");
    expect(result.item).toBe("陪玩服务");
    expect(result.amount).toBe(100);
    expect(result.status).toBe("待处理");
    expect(result.time).toBe(new Date(1700000000000).toISOString());
  });

  it("uses meta.status for non-chain orders", () => {
    const result = normalizeOrder(makeServerOrder({ meta: { status: "自定义状态" } }) as never);
    expect(result.status).toBe("自定义状态");
  });

  it("ignores meta.status for chain orders (uses stage)", () => {
    const result = normalizeOrder(
      makeServerOrder({
        chainDigest: "0xabc",
        stage: "进行中",
        meta: { status: "自定义状态" },
      }) as never
    );
    expect(result.status).toBe("进行中");
  });

  it("detects chain order via chainStatus", () => {
    const result = normalizeOrder(
      makeServerOrder({
        chainStatus: 3,
        stage: "进行中",
        meta: { status: "自定义状态" },
      }) as never
    );
    expect(result.status).toBe("进行中");
  });

  it("detects chain order via meta.chain.status", () => {
    const result = normalizeOrder(
      makeServerOrder({
        stage: "已确认",
        meta: { chain: { status: 1 }, status: "自定义" },
      }) as never
    );
    expect(result.status).toBe("已确认");
  });

  it("uses meta.time when available", () => {
    const result = normalizeOrder(
      makeServerOrder({ meta: { time: "2024-01-01T00:00:00Z" } }) as never
    );
    expect(result.time).toBe("2024-01-01T00:00:00Z");
  });

  it("maps chainDigest from meta fallback", () => {
    const result = normalizeOrder(makeServerOrder({ meta: { chainDigest: "0xfoo" } }) as never);
    expect(result.chainDigest).toBe("0xfoo");
  });

  it("maps serviceFee from order field", () => {
    const result = normalizeOrder(makeServerOrder({ serviceFee: 50 }) as never);
    expect(result.serviceFee).toBe(50);
  });

  it("falls back serviceFee to meta", () => {
    const result = normalizeOrder(
      makeServerOrder({ serviceFee: null, meta: { serviceFee: 30 } }) as never
    );
    expect(result.serviceFee).toBe(30);
  });

  it("maps payment tracking fields from meta", () => {
    const result = normalizeOrder(
      makeServerOrder({
        meta: {
          serviceFeePaid: true,
          depositPaid: false,
          playerPaid: true,
          playerDue: 200,
        },
      }) as never
    );
    expect(result.serviceFeePaid).toBe(true);
    expect(result.depositPaid).toBe(false);
    expect(result.playerPaid).toBe(true);
    expect(result.playerDue).toBe(200);
  });

  it("maps driver from meta", () => {
    const driver = { name: "张三", car: "SUV", eta: "10min" };
    const result = normalizeOrder(makeServerOrder({ meta: { driver } }) as never);
    expect(result.driver).toEqual(driver);
  });

  it("defaults status to 待处理 when all empty", () => {
    const result = normalizeOrder(
      makeServerOrder({ stage: "", paymentStatus: "", meta: {} }) as never
    );
    expect(result.status).toBe("待处理");
  });

  it("converts null addresses to undefined", () => {
    const result = normalizeOrder(
      makeServerOrder({ userAddress: null, companionAddress: null }) as never
    );
    expect(result.userAddress).toBeUndefined();
    expect(result.companionAddress).toBeUndefined();
  });
});

// ─── buildMeta ───

describe("buildMeta", () => {
  it("builds meta from order fields", () => {
    const meta = buildMeta({
      status: "进行中",
      time: "2024-01-01T00:00:00Z",
      serviceFeePaid: true,
      depositPaid: false,
      playerPaid: true,
      playerDue: 100,
      chainDigest: "0xabc",
      serviceFee: 50,
    });
    expect(meta.status).toBe("进行中");
    expect(meta.time).toBe("2024-01-01T00:00:00Z");
    expect(meta.serviceFeePaid).toBe(true);
    expect(meta.depositPaid).toBe(false);
    expect(meta.playerPaid).toBe(true);
    expect(meta.playerDue).toBe(100);
    expect(meta.chainDigest).toBe("0xabc");
    expect(meta.serviceFee).toBe(50);
  });

  it("includes driver when present", () => {
    const driver = { name: "李四", car: "轿车", eta: "5min" };
    const meta = buildMeta({ driver });
    expect(meta.driver).toEqual(driver);
  });

  it("merges existing meta", () => {
    const meta = buildMeta({
      status: "待处理",
      meta: { custom: "value", extra: 42 },
    });
    expect(meta.status).toBe("待处理");
    expect(meta.custom).toBe("value");
    expect(meta.extra).toBe(42);
  });

  it("returns empty object for empty input", () => {
    const meta = buildMeta({});
    expect(Object.keys(meta).length).toBe(0);
  });

  it("skips undefined fields", () => {
    const meta = buildMeta({ status: "ok" });
    expect(meta).toEqual({ status: "ok" });
    expect("serviceFeePaid" in meta).toBe(false);
  });
});

// ─── ORDER_SOURCE ───

describe("ORDER_SOURCE resolution", () => {
  it("isServerOrderEnabled reflects ORDER_SOURCE", async () => {
    // Default: NEXT_PUBLIC_ORDER_SOURCE not set, CHAIN_ORDERS not "1"
    // So ORDER_SOURCE = "local", isServerOrderEnabled = false
    const { isServerOrderEnabled } = await import("../order-service");
    // In our test env, process.env.NEXT_PUBLIC_ORDER_SOURCE is not set
    // and NEXT_PUBLIC_CHAIN_ORDERS is not "1", so it should be "local"
    expect(isServerOrderEnabled()).toBe(false);
  });
});
