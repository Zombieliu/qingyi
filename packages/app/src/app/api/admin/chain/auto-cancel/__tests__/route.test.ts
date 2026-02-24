import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockAutoCancelChainOrders, mockRecordAudit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAutoCancelChainOrders: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-auto-cancel", () => ({
  autoCancelChainOrders: mockAutoCancelChainOrders,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { POST } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown = {}) {
  return new Request("http://localhost/api/admin/chain/auto-cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/chain/auto-cancel", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it("runs auto cancel and returns result", async () => {
    mockAutoCancelChainOrders.mockResolvedValue({
      enabled: true,
      hours: 24,
      canceled: 2,
      candidates: 5,
    });
    const res = await POST(makePost());
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.canceled).toBe(2);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    mockAutoCancelChainOrders.mockRejectedValue(new Error("fail"));
    const res = await POST(makePost());
    expect(res.status).toBe(500);
  });

  it("passes dryRun and limit options", async () => {
    mockAutoCancelChainOrders.mockResolvedValue({
      enabled: true,
      hours: 24,
      canceled: 0,
      candidates: 0,
    });
    await POST(makePost({ dryRun: true, limit: 10 }));
    expect(mockAutoCancelChainOrders).toHaveBeenCalledWith({ dryRun: true, limit: 10 });
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/chain/auto-cancel", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handles error without message", async () => {
    mockAutoCancelChainOrders.mockRejectedValue({});
    const res = await POST(makePost());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("auto cancel failed");
  });
});
