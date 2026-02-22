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

  it("uses meta.status for non-chain orders without displayStatus", () => {
    const result = normalizeOrder(makeServerOrder({ meta: { status: "自定义状态" } }) as never);
    expect(result.status).toBe("自定义状态");
  });

  it("prefers displayStatus over meta.status", () => {
    const result = normalizeOrder(
      makeServerOrder({
        displayStatus: "押金已锁定",
        meta: { status: "自定义状态" },
      }) as never
    );
    expect(result.status).toBe("押金已锁定");
  });

  it("uses displayStatus for chain orders", () => {
    const result = normalizeOrder(
      makeServerOrder({
        chainDigest: "0xabc",
        displayStatus: "押金已锁定",
        stage: "进行中",
        meta: { status: "自定义状态" },
      }) as never
    );
    expect(result.status).toBe("押金已锁定");
  });

  it("falls back to stage when no displayStatus for chain orders", () => {
    const result = normalizeOrder(
      makeServerOrder({
        chainDigest: "0xabc",
        stage: "进行中",
        meta: { status: "自定义状态" },
      }) as never
    );
    // Without displayStatus, falls back to meta.status then stage
    expect(result.status).toBe("自定义状态");
  });

  it("detects chain order via chainStatus with displayStatus", () => {
    const result = normalizeOrder(
      makeServerOrder({
        chainStatus: 3,
        displayStatus: "待结算",
        stage: "进行中",
        meta: { status: "自定义状态" },
      }) as never
    );
    expect(result.status).toBe("待结算");
  });

  it("detects chain order via meta.chain.status", () => {
    const result = normalizeOrder(
      makeServerOrder({
        stage: "已确认",
        meta: { chain: { status: 1 }, status: "自定义" },
      }) as never
    );
    // No displayStatus, falls back to meta.status
    expect(result.status).toBe("自定义");
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

// ─── fetchOrdersWithMeta (local mode) ───

describe("fetchOrdersWithMeta", () => {
  it("returns local orders when ORDER_SOURCE is local", async () => {
    const { loadOrders } = await import("../order-store");
    (loadOrders as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "o1", item: "test", status: "待处理" },
    ]);
    const { fetchOrdersWithMeta } = await import("../order-service");
    const result = await fetchOrdersWithMeta();
    expect(result.meta.fromCache).toBe(true);
    expect(result.items).toHaveLength(1);
  });
});

// ─── fetchOrderDetail (local mode) ───

describe("fetchOrderDetail", () => {
  it("returns null for empty orderId", async () => {
    const { fetchOrderDetail } = await import("../order-service");
    const result = await fetchOrderDetail("");
    expect(result).toBeNull();
  });

  it("returns order from local store", async () => {
    const { loadOrders } = await import("../order-store");
    (loadOrders as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "ORD-1", item: "test", status: "待处理" },
    ]);
    const { fetchOrderDetail } = await import("../order-service");
    const result = await fetchOrderDetail("ORD-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("ORD-1");
  });

  it("returns null when order not found locally", async () => {
    const { loadOrders } = await import("../order-store");
    (loadOrders as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const { fetchOrderDetail } = await import("../order-service");
    const result = await fetchOrderDetail("ORD-999");
    expect(result).toBeNull();
  });
});

// ─── createOrder (local mode) ───

describe("createOrder", () => {
  it("creates order locally", async () => {
    const { addOrder } = await import("../order-store");
    (addOrder as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const { createOrder } = await import("../order-service");
    const order = {
      id: "ORD-NEW",
      user: "user1",
      item: "陪玩",
      amount: 50,
      currency: "CNY",
      paymentStatus: "未支付",
      status: "待处理",
      time: Date.now(),
    };
    const result = await createOrder(order as Parameters<typeof createOrder>[0]);
    expect(result).not.toBeNull();
  });
});

// ─── deleteOrder (local mode) ───

describe("deleteOrder", () => {
  it("deletes order locally without throwing", async () => {
    const { removeOrder } = await import("../order-store");
    (removeOrder as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const { deleteOrder } = await import("../order-service");
    await expect(deleteOrder("ORD-1")).resolves.not.toThrow();
    expect(removeOrder).toHaveBeenCalledWith("ORD-1");
  });
});

// ─── fetchPublicOrders ───

describe("fetchPublicOrders", () => {
  it("returns local orders in local mode", async () => {
    const { loadOrders } = await import("../order-store");
    (loadOrders as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "PUB-1", item: "test", status: "待处理" },
    ]);
    const { fetchPublicOrders } = await import("../order-service");
    const result = await fetchPublicOrders();
    expect(result.items).toHaveLength(1);
  });
});

// ─── Server mode tests ───

describe("server mode functions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
  });

  it("fetchOrderDetail returns null when no address", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const mod = await import("../order-service");
    const result = await mod.fetchOrderDetail("ORD-1");
    expect(result).toBeNull();
  });

  it("fetchOrderDetail fetches from API with address", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => makeServerOrder({ id: "ORD-1" }),
    });
    const { getCurrentAddress } = await import("@/lib/chain/qy-chain");
    (getCurrentAddress as ReturnType<typeof vi.fn>).mockReturnValue("0xabc");
    const mod = await import("../order-service");
    const result = await mod.fetchOrderDetail("ORD-1", "0xabc");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("ORD-1");
  });

  it("fetchOrderDetail returns null on API error", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });
    const mod = await import("../order-service");
    const result = await mod.fetchOrderDetail("ORD-1", "0xabc");
    expect(result).toBeNull();
  });

  it("createOrder calls API in server mode", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => makeServerOrder({ id: "ORD-NEW" }),
    });
    const { getCurrentAddress } = await import("@/lib/chain/qy-chain");
    (getCurrentAddress as ReturnType<typeof vi.fn>).mockReturnValue("0xabc");
    const mod = await import("../order-service");
    const result = await mod.createOrder({
      id: "ORD-NEW",
      user: "user1",
      item: "陪玩",
      amount: 50,
      currency: "CNY",
      paymentStatus: "未支付",
      status: "待处理",
      time: Date.now(),
    } as Parameters<typeof mod.createOrder>[0]);
    expect(result).not.toBeNull();
  });

  it("patchOrder calls API in server mode", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => makeServerOrder({ id: "ORD-1", stage: "已确认" }),
    });
    const { getCurrentAddress } = await import("@/lib/chain/qy-chain");
    (getCurrentAddress as ReturnType<typeof vi.fn>).mockReturnValue("0xabc");
    const mod = await import("../order-service");
    const result = await mod.patchOrder("ORD-1", { stage: "已确认" }, "0xabc");
    expect(result).not.toBeNull();
  });

  it("patchOrder throws on API failure", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "fail" }),
    });
    const { getCurrentAddress } = await import("@/lib/chain/qy-chain");
    (getCurrentAddress as ReturnType<typeof vi.fn>).mockReturnValue("0xabc");
    const mod = await import("../order-service");
    await expect(
      mod.patchOrder("ORD-1", { stage: "已确认" } as Parameters<typeof mod.patchOrder>[1], "0xabc")
    ).rejects.toThrow();
  });

  it("deleteOrder calls API in server mode", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const { getCurrentAddress } = await import("@/lib/chain/qy-chain");
    (getCurrentAddress as ReturnType<typeof vi.fn>).mockReturnValue("0xabc");
    const mod = await import("../order-service");
    await expect(mod.deleteOrder("ORD-1", "0xabc")).resolves.not.toThrow();
  });

  it("syncChainOrder calls API", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ORDER_SOURCE", "server");
    const { fetchWithUserAuth } = await import("@/lib/auth/user-auth-client");
    (fetchWithUserAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const { getCurrentAddress } = await import("@/lib/chain/qy-chain");
    (getCurrentAddress as ReturnType<typeof vi.fn>).mockReturnValue("0xabc");
    const mod = await import("../order-service");
    await expect(mod.syncChainOrder("ORD-1", "0xabc", "digest")).resolves.not.toThrow();
  });
});
