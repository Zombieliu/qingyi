import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

import {
  getCompanionStatsEdgeRead,
  queryCompanionDuoOrdersEdgeRead,
  queryCompanionOrdersEdgeRead,
} from "../companion-read-store";

const originalEnv = { ...process.env };

function setEdgeEnv() {
  process.env.EDGE_DB_REST_URL = "https://example.supabase.co";
  process.env.EDGE_DB_REST_ANON_KEY = "edge-anon-key";
}

describe("edge db companion read store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EDGE_DB_REST_URL;
    delete process.env.EDGE_DB_REST_ANON_KEY;
    delete process.env.EDGE_DB_REST_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("queries companion orders with status filter and maps timestamps", async () => {
    setEdgeEnv();
    const address = "0xabc";

    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const select = url.searchParams.get("select") || "";

      if (url.pathname.endsWith("/AdminOrder") && select === "id") {
        return {
          ok: true,
          json: async () => [{ id: "1" }, { id: "2" }],
        };
      }

      if (url.pathname.endsWith("/AdminOrder") && select.startsWith("id,user,userAddress")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "ORD-1",
              user: "user1",
              userAddress: "0x1",
              item: "item",
              amount: "100.50",
              stage: "进行中",
              serviceFee: "10.25",
              chainStatus: null,
              createdAt: "2026-03-01T12:00:00.000Z",
              updatedAt: null,
              note: null,
              meta: { source: "test" },
            },
          ],
        };
      }

      throw new Error(`unexpected url: ${url.toString()}`);
    });

    const result = await queryCompanionOrdersEdgeRead({
      address,
      status: "active",
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      {
        id: "ORD-1",
        user: "user1",
        userAddress: "0x1",
        item: "item",
        amount: 100.5,
        stage: "进行中",
        serviceFee: 10.25,
        chainStatus: null,
        createdAt: Date.parse("2026-03-01T12:00:00.000Z"),
        updatedAt: null,
        note: null,
        meta: { source: "test" },
      },
    ]);

    const urls = mocks.fetch.mock.calls.map(([input]) => new URL(String(input)));
    const countReq = urls.find((url) => url.searchParams.get("select") === "id");
    const rowsReq = urls.find(
      (url) => url.searchParams.get("select")?.startsWith("id,user") === true
    );

    expect(countReq?.searchParams.get("companionAddress")).toBe(`eq.${address}`);
    expect(countReq?.searchParams.get("stage")).toBe("in.(已支付,进行中,待结算)");
    expect(rowsReq?.searchParams.get("offset")).toBe("0");
    expect(rowsReq?.searchParams.get("limit")).toBe("20");
  });

  it("queries companion duo orders with OR filter and completed status", async () => {
    setEdgeEnv();
    const address = "0xdef";

    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const select = url.searchParams.get("select") || "";

      if (url.pathname.endsWith("/DuoOrder") && select === "id") {
        return {
          ok: true,
          json: async () => [{ id: "1" }, { id: "2" }, { id: "3" }],
        };
      }

      if (
        url.pathname.endsWith("/DuoOrder") &&
        select.startsWith("id,user,userAddress,companionAddressA")
      ) {
        return {
          ok: true,
          json: async () => [
            {
              id: "DUO-1",
              user: "user2",
              userAddress: "0x2",
              companionAddressA: address,
              companionAddressB: null,
              item: "duo-item",
              amount: "188",
              stage: "已完成",
              serviceFee: "18.8",
              depositPerCompanion: "50",
              teamStatus: 3,
              chainStatus: 1,
              createdAt: "2026-03-02T00:00:00.000Z",
              updatedAt: "2026-03-02T01:00:00.000Z",
              note: "done",
              meta: null,
            },
          ],
        };
      }

      throw new Error(`unexpected url: ${url.toString()}`);
    });

    const result = await queryCompanionDuoOrdersEdgeRead({
      address,
      status: "completed",
      page: 2,
      pageSize: 10,
    });

    expect(result.total).toBe(3);
    expect(result.rows[0]).toMatchObject({
      id: "DUO-1",
      amount: 188,
      serviceFee: 18.8,
      depositPerCompanion: 50,
      createdAt: Date.parse("2026-03-02T00:00:00.000Z"),
      updatedAt: Date.parse("2026-03-02T01:00:00.000Z"),
    });

    const urls = mocks.fetch.mock.calls.map(([input]) => new URL(String(input)));
    const countReq = urls.find((url) => url.searchParams.get("select") === "id");
    const rowsReq = urls.find(
      (url) =>
        url.searchParams.get("select")?.startsWith("id,user,userAddress,companionAddressA") === true
    );

    expect(countReq?.searchParams.get("or")).toBe(
      `(companionAddressA.eq.${address},companionAddressB.eq.${address})`
    );
    expect(countReq?.searchParams.get("stage")).toBe("in.(已完成,已取消)");
    expect(rowsReq?.searchParams.get("offset")).toBe("10");
    expect(rowsReq?.searchParams.get("limit")).toBe("10");
  });

  it("computes companion stats aggregates deterministically", async () => {
    setEdgeEnv();
    const address = "0x123";
    const now = new Date("2026-03-10T12:00:00.000Z");

    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop();
      const select = url.searchParams.get("select");

      if (table === "AdminOrder" && select === "amount,serviceFee,createdAt") {
        return {
          ok: true,
          json: async () => [
            {
              amount: "100",
              serviceFee: "10",
              createdAt: "2026-03-10T08:00:00.000Z",
            },
            {
              amount: "50",
              serviceFee: "5",
              createdAt: "2026-03-05T08:00:00.000Z",
            },
            {
              amount: "30",
              serviceFee: null,
              createdAt: "2026-02-20T08:00:00.000Z",
            },
          ],
        };
      }

      if (table === "AdminOrder" && select === "id") {
        return {
          ok: true,
          json: async () => [{ id: "A-1" }, { id: "A-2" }],
        };
      }

      if (table === "OrderReview" && select === "rating") {
        return {
          ok: true,
          json: async () => [{ rating: 5 }, { rating: 4 }, { rating: 3 }],
        };
      }

      if (table === "AdminPlayer" && select === "id,name,status,role") {
        return {
          ok: true,
          json: async () => [
            {
              id: "P-1",
              name: "Companion",
              status: "可接单",
              role: "陪练",
            },
          ],
        };
      }

      throw new Error(`unexpected url: ${url.toString()}`);
    });

    const stats = await getCompanionStatsEdgeRead(address, now);

    expect(stats.totalStats).toEqual({
      _count: { id: 3 },
      _sum: { amount: 180, serviceFee: 15 },
    });
    expect(stats.monthStats).toEqual({
      _count: { id: 2 },
      _sum: { amount: 150, serviceFee: 15 },
    });
    expect(stats.todayStats).toEqual({
      _count: { id: 1 },
      _sum: { amount: 100 },
    });
    expect(stats.activeOrders).toBe(2);
    expect(stats.reviews).toEqual({
      _avg: { rating: 4 },
      _count: { id: 3 },
    });
    expect(stats.player).toEqual({
      id: "P-1",
      name: "Companion",
      status: "可接单",
      role: "陪练",
    });

    const urls = mocks.fetch.mock.calls.map(([input]) => new URL(String(input)));
    const activeCountReq = urls.find(
      (url) =>
        url.pathname.endsWith("/AdminOrder") &&
        url.searchParams.get("select") === "id" &&
        url.searchParams.get("stage") === "in.(已支付,进行中,待结算)"
    );
    expect(activeCountReq?.searchParams.get("companionAddress")).toBe(`eq.${address}`);
  });
});
