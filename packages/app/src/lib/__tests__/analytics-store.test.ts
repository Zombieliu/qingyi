import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    growthEvent: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { recordGrowthEvent, listGrowthEvents } from "../analytics-store";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordGrowthEvent", () => {
  const baseRow = {
    id: "test-uuid",
    event: "page_view",
    clientId: null,
    sessionId: null,
    userAddress: null,
    path: null,
    referrer: null,
    ua: null,
    meta: null,
    createdAt: new Date("2025-01-15T06:30:00Z"),
  };

  it("creates with all fields", async () => {
    const fullRow = {
      ...baseRow,
      clientId: "client-1",
      sessionId: "sess-1",
      userAddress: "0xabc",
      path: "/home",
      referrer: "https://google.com",
      ua: "Mozilla/5.0",
      meta: { source: "organic" },
    };
    mockCreate.mockResolvedValue(fullRow);

    const result = await recordGrowthEvent({
      event: "page_view",
      clientId: "client-1",
      sessionId: "sess-1",
      userAddress: "0xabc",
      path: "/home",
      referrer: "https://google.com",
      ua: "Mozilla/5.0",
      meta: { source: "organic" },
      createdAt: new Date("2025-01-15T06:30:00Z").getTime(),
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.event).toBe("page_view");
    expect(result.clientId).toBe("client-1");
    expect(result.path).toBe("/home");
    expect(result.meta).toEqual({ source: "organic" });
  });

  it("handles optional fields (null defaults)", async () => {
    mockCreate.mockResolvedValue(baseRow);

    const result = await recordGrowthEvent({ event: "page_view" });

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.data.clientId).toBeNull();
    expect(createArg.data.sessionId).toBeNull();
    expect(createArg.data.userAddress).toBeNull();
    expect(createArg.data.path).toBeNull();
    expect(createArg.data.referrer).toBeNull();
    expect(createArg.data.ua).toBeNull();

    // Mapped result converts null/falsy to undefined
    expect(result.clientId).toBeUndefined();
    expect(result.sessionId).toBeUndefined();
  });

  it("uses provided createdAt timestamp", async () => {
    const ts = 1705300200000; // 2025-01-15T06:30:00Z
    mockCreate.mockResolvedValue(baseRow);

    await recordGrowthEvent({ event: "page_view", createdAt: ts });

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.data.createdAt).toEqual(new Date(ts));
  });

  it("uses Date.now() when no createdAt provided", async () => {
    const now = Date.now();
    mockCreate.mockResolvedValue({ ...baseRow, createdAt: new Date(now) });

    await recordGrowthEvent({ event: "page_view" });

    const createArg = mockCreate.mock.calls[0][0];
    const createdAt = createArg.data.createdAt.getTime();
    // Should be within 1 second of now
    expect(Math.abs(createdAt - now)).toBeLessThan(1000);
  });

  it("returns mapped record with correct types", async () => {
    const row = {
      ...baseRow,
      clientId: "c1",
      path: "/test",
      meta: { key: "val" },
    };
    mockCreate.mockResolvedValue(row);

    const result = await recordGrowthEvent({
      event: "page_view",
      clientId: "c1",
      path: "/test",
      meta: { key: "val" },
    });

    expect(result.id).toBe("test-uuid");
    expect(result.event).toBe("page_view");
    expect(result.clientId).toBe("c1");
    expect(result.path).toBe("/test");
    expect(result.meta).toEqual({ key: "val" });
    expect(result.createdAt).toBe(new Date("2025-01-15T06:30:00Z").getTime());
  });
});

describe("listGrowthEvents", () => {
  it("queries with no filters", async () => {
    mockFindMany.mockResolvedValue([]);

    await listGrowthEvents({});

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {},
      select: {
        id: true,
        event: true,
        clientId: true,
        sessionId: true,
        userAddress: true,
        path: true,
        referrer: true,
        ua: true,
        meta: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("queries with since filter", async () => {
    const since = new Date("2025-01-01");
    mockFindMany.mockResolvedValue([]);

    await listGrowthEvents({ since });

    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.createdAt).toEqual({ gte: since });
  });

  it("queries with event filter", async () => {
    mockFindMany.mockResolvedValue([]);

    await listGrowthEvents({ event: "signup" });

    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.event).toBe("signup");
  });
});
