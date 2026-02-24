import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockListChainOrdersForAdmin,
  mockFetchChainOrdersAdmin,
  mockGetAutoCancelConfig,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockListChainOrdersForAdmin: vi.fn(),
  mockFetchChainOrdersAdmin: vi.fn(),
  mockGetAutoCancelConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  listChainOrdersForAdmin: mockListChainOrdersForAdmin,
}));
vi.mock("@/lib/chain/chain-admin", () => ({ fetchChainOrdersAdmin: mockFetchChainOrdersAdmin }));
vi.mock("@/lib/chain/chain-auto-cancel", () => ({ getAutoCancelConfig: mockGetAutoCancelConfig }));

import { GET } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetAutoCancelConfig.mockReturnValue({ enabled: true, hours: 24, max: 10 });
});

describe("GET /api/admin/chain/orders", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/chain/orders"));
    expect(res.status).toBe(401);
  });

  it("returns chain orders with local data", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([{ orderId: "1", status: 1 }]);
    mockListChainOrdersForAdmin.mockResolvedValue([{ id: "1", chainStatus: 1, meta: null }]);
    const res = await GET(new Request("http://localhost/api/admin/chain/orders"));
    const json = await res.json();
    expect(json.chainCount).toBe(1);
    expect(json.localCount).toBe(1);
    expect(json.autoCancel.enabled).toBe(true);
  });

  it("identifies missing local orders", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([
      { orderId: "1", status: 1 },
      { orderId: "2", status: 2 },
    ]);
    mockListChainOrdersForAdmin.mockResolvedValue([{ id: "1", chainStatus: 1, meta: null }]);
    const res = await GET(new Request("http://localhost/api/admin/chain/orders"));
    const json = await res.json();
    expect(json.missingLocal).toHaveLength(1);
    expect(json.missingLocal[0].orderId).toBe("2");
  });

  it("identifies missing chain orders (numeric IDs only)", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([]);
    mockListChainOrdersForAdmin.mockResolvedValue([
      { id: "123", chainStatus: 1, meta: null },
      { id: "ORD-abc", chainStatus: 1, meta: null },
    ]);
    const res = await GET(new Request("http://localhost/api/admin/chain/orders"));
    const json = await res.json();
    expect(json.missingChain).toHaveLength(1);
    expect(json.missingChain[0].id).toBe("123");
  });

  it("reads chainStatus from meta when chainStatus is null", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([{ orderId: "1", status: 2 }]);
    mockListChainOrdersForAdmin.mockResolvedValue([
      { id: "1", chainStatus: null, meta: { chain: { status: 1 } } },
    ]);
    const res = await GET(new Request("http://localhost/api/admin/chain/orders"));
    const json = await res.json();
    expect(json.chainOrders[0].localStatus).toBe(1);
    expect(json.chainOrders[0].effectiveStatus).toBe(2);
  });

  it("handles null meta gracefully", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([{ orderId: "1", status: 1 }]);
    mockListChainOrdersForAdmin.mockResolvedValue([{ id: "1", chainStatus: null, meta: null }]);
    const res = await GET(new Request("http://localhost/api/admin/chain/orders"));
    const json = await res.json();
    expect(json.chainOrders[0].localStatus).toBeNull();
  });
});
