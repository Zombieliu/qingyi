import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockChainOrderLogger, mockEnv } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockChainOrderLogger: { getLogs: vi.fn(), clearLogs: vi.fn() },
  mockEnv: { CHAIN_ORDER_DEBUG: "1" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-order-logger", () => ({ chainOrderLogger: mockChainOrderLogger }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { GET, DELETE } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/chain/logs");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockChainOrderLogger.getLogs.mockReturnValue([]);
});

describe("GET /api/admin/chain/logs", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns logs with filters", async () => {
    mockChainOrderLogger.getLogs.mockReturnValue([{ level: "error" }]);
    const res = await GET(makeGet({ level: "error", limit: "50" }));
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(json.filters.level).toBe("error");
  });

  it("returns logs without filters", async () => {
    mockChainOrderLogger.getLogs.mockReturnValue([{ level: "info" }, { level: "warn" }]);
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.count).toBe(2);
    expect(json.filters.level).toBe("all");
    expect(json.filters.operation).toBe("all");
    expect(json.filters.limit).toBe(100);
  });

  it("passes operation filter", async () => {
    mockChainOrderLogger.getLogs.mockReturnValue([]);
    await GET(makeGet({ operation: "findChainOrder" }));
    expect(mockChainOrderLogger.getLogs).toHaveBeenCalledWith({
      level: undefined,
      operation: "findChainOrder",
      limit: 100,
    });
  });

  it("includes debugEnabled flag", async () => {
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.debugEnabled).toBe(true);
  });
});

describe("DELETE /api/admin/chain/logs", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(
      new Request("http://localhost/api/admin/chain/logs", { method: "DELETE" })
    );
    expect(res.status).toBe(401);
  });

  it("clears logs", async () => {
    mockChainOrderLogger.getLogs.mockReturnValueOnce([{ level: "info" }]).mockReturnValueOnce([]);
    const res = await DELETE(
      new Request("http://localhost/api/admin/chain/logs", { method: "DELETE" })
    );
    const json = await res.json();
    expect(json.message).toBe("日志已清空");
    expect(mockChainOrderLogger.clearLogs).toHaveBeenCalled();
  });
});
