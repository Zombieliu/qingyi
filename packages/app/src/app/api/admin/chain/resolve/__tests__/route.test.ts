import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockResolveDisputeAdmin, mockSyncChainOrder, mockRecordAudit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockResolveDisputeAdmin: vi.fn(),
    mockSyncChainOrder: vi.fn(),
    mockRecordAudit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-admin", () => ({ resolveDisputeAdmin: mockResolveDisputeAdmin }));
vi.mock("@/lib/chain/chain-sync", () => ({ syncChainOrder: mockSyncChainOrder }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { POST } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/chain/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/chain/resolve", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ orderId: "1", serviceRefundBps: 0, depositSlashBps: 0 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("resolves dispute successfully", async () => {
    mockResolveDisputeAdmin.mockResolvedValue({ digest: "d1", effects: {} });
    mockSyncChainOrder.mockResolvedValue(undefined);
    const res = await POST(
      makePost({ orderId: "1", serviceRefundBps: 5000, depositSlashBps: 3000 })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.digest).toBe("d1");
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    mockResolveDisputeAdmin.mockRejectedValue(new Error("fail"));
    const res = await POST(makePost({ orderId: "1", serviceRefundBps: 0, depositSlashBps: 0 }));
    expect(res.status).toBe(500);
  });

  it("handles error without message", async () => {
    mockResolveDisputeAdmin.mockRejectedValue({});
    const res = await POST(makePost({ orderId: "1", serviceRefundBps: 0, depositSlashBps: 0 }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("resolve failed");
  });
});
