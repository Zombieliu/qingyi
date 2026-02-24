import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockListOrders,
  mockRemoveOrders,
  mockFetchChainOrdersAdmin,
  mockRecordAudit,
  mockComputeMissingChainCleanup,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockListOrders: vi.fn(),
  mockRemoveOrders: vi.fn(),
  mockFetchChainOrdersAdmin: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockComputeMissingChainCleanup: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  listOrders: mockListOrders,
  removeOrders: mockRemoveOrders,
}));
vi.mock("@/lib/chain/chain-admin", () => ({ fetchChainOrdersAdmin: mockFetchChainOrdersAdmin }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/chain/chain-missing-utils", () => ({
  computeMissingChainCleanup: mockComputeMissingChainCleanup,
}));

import { POST } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost() {
  return new Request("http://localhost/api/admin/chain/cleanup-missing", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/chain/cleanup-missing", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it("cleans up missing orders", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([]);
    mockListOrders.mockResolvedValue([]);
    mockComputeMissingChainCleanup.mockReturnValue({ ids: ["o1"], missing: [{ id: "o1" }] });
    mockRemoveOrders.mockResolvedValue(1);
    const res = await POST(makePost());
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(1);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    mockFetchChainOrdersAdmin.mockRejectedValue(new Error("fail"));
    const res = await POST(makePost());
    expect(res.status).toBe(500);
  });

  it("handles error without message", async () => {
    mockFetchChainOrdersAdmin.mockRejectedValue({});
    const res = await POST(makePost());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("cleanup failed");
  });

  it("handles zero missing orders", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([{ orderId: "1" }]);
    mockListOrders.mockResolvedValue([{ id: "1" }]);
    mockComputeMissingChainCleanup.mockReturnValue({ ids: [], missing: [] });
    mockRemoveOrders.mockResolvedValue(0);
    const res = await POST(makePost());
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(0);
    expect(json.candidates).toBe(0);
  });
});
