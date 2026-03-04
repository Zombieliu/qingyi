import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchEdgeRows: vi.fn(),
}));

vi.mock("@/lib/edge-db/client", () => ({
  fetchEdgeRows: mocks.fetchEdgeRows,
}));

import { scanEdgeTableRows } from "../scan-utils";

describe("edge db scan utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scans pages until a short batch is returned", async () => {
    mocks.fetchEdgeRows
      .mockResolvedValueOnce([{ id: "1" }, { id: "2" }])
      .mockResolvedValueOnce([{ id: "3" }]);

    const rows = await scanEdgeTableRows<{ id: string }>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({ select: "id" }),
      pageSize: 2,
      maxRows: 20,
    });

    expect(rows).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
    expect(mocks.fetchEdgeRows).toHaveBeenCalledTimes(2);

    const firstCall = mocks.fetchEdgeRows.mock.calls[0] as [
      string,
      URLSearchParams,
      "read" | "write",
    ];
    expect(firstCall[0]).toBe("AdminOrder");
    expect(firstCall[1].get("select")).toBe("id");
    expect(firstCall[1].get("limit")).toBe("2");
    expect(firstCall[1].get("offset")).toBe("0");
    expect(firstCall[2]).toBe("read");

    const secondCall = mocks.fetchEdgeRows.mock.calls[1] as [
      string,
      URLSearchParams,
      "read" | "write",
    ];
    expect(secondCall[1].get("offset")).toBe("2");
  });

  it("starts scanning from a caller-provided offset", async () => {
    mocks.fetchEdgeRows.mockResolvedValueOnce([]);

    await scanEdgeTableRows<{ id: string }>({
      table: "AdminAuditLog",
      baseParams: new URLSearchParams({ select: "id", order: "createdAt.desc" }),
      authMode: "write",
      startOffset: 125,
      pageSize: 50,
      maxRows: 1_000,
    });

    expect(mocks.fetchEdgeRows).toHaveBeenCalledTimes(1);
    const call = mocks.fetchEdgeRows.mock.calls[0] as [string, URLSearchParams, "read" | "write"];
    expect(call[0]).toBe("AdminAuditLog");
    expect(call[1].get("offset")).toBe("125");
    expect(call[1].get("limit")).toBe("50");
    expect(call[1].get("order")).toBe("createdAt.desc");
    expect(call[2]).toBe("write");
  });

  it("uses default scan values when invalid options are provided", async () => {
    mocks.fetchEdgeRows.mockResolvedValueOnce([]);

    await scanEdgeTableRows<{ id: string }>({
      table: "GrowthEvent",
      baseParams: new URLSearchParams({ select: "id" }),
      pageSize: 0,
      maxRows: Number.NaN,
      startOffset: -1,
    });

    const call = mocks.fetchEdgeRows.mock.calls[0] as [string, URLSearchParams, "read" | "write"];
    expect(call[1].get("limit")).toBe("1000");
    expect(call[1].get("offset")).toBe("0");
    expect(call[2]).toBe("read");
  });
});
