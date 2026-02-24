import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockCancelOrderAdmin,
  mockFindChainOrder,
  mockSyncChainOrder,
  mockIsChainOrderCancelable,
  mockRecordAudit,
  mockEnv,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockCancelOrderAdmin: vi.fn(),
  mockFindChainOrder: vi.fn(),
  mockSyncChainOrder: vi.fn(),
  mockIsChainOrderCancelable: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockEnv: { SUI_NETWORK: "testnet" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-admin", () => ({ cancelOrderAdmin: mockCancelOrderAdmin }));
vi.mock("@/lib/chain/chain-sync", () => ({
  findChainOrder: mockFindChainOrder,
  syncChainOrder: mockSyncChainOrder,
}));
vi.mock("@/lib/chain/chain-order-utils", () => ({
  isChainOrderCancelable: mockIsChainOrderCancelable,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { POST } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/chain/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/chain/cancel", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ orderId: "123" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid orderId", async () => {
    const res = await POST(makePost({ orderId: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when chain order not found", async () => {
    mockFindChainOrder.mockResolvedValue(null);
    const res = await POST(makePost({ orderId: "123" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when order is not cancelable", async () => {
    mockFindChainOrder.mockResolvedValue({ status: 3 });
    mockIsChainOrderCancelable.mockReturnValue(false);
    const res = await POST(makePost({ orderId: "123" }));
    expect(res.status).toBe(400);
  });

  it("cancels order successfully", async () => {
    mockFindChainOrder.mockResolvedValue({ status: 0 });
    mockIsChainOrderCancelable.mockReturnValue(true);
    mockCancelOrderAdmin.mockResolvedValue({ digest: "d1", effects: {} });
    mockSyncChainOrder.mockResolvedValue(undefined);
    const res = await POST(makePost({ orderId: "123" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.digest).toBe("d1");
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 500 on cancel error", async () => {
    mockFindChainOrder.mockResolvedValue({ status: 0 });
    mockIsChainOrderCancelable.mockReturnValue(true);
    mockCancelOrderAdmin.mockRejectedValue(new Error("tx fail"));
    const res = await POST(makePost({ orderId: "123" }));
    expect(res.status).toBe(500);
  });
});
