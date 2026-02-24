import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listE2eOrderIds: vi.fn(),
  removeOrders: vi.fn(),
  recordAudit: vi.fn(),
  parseBody: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  listE2eOrderIds: mocks.listE2eOrderIds,
  removeOrders: mocks.removeOrders,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST } from "../route";

const authOk = { ok: true, role: "ops" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

function makeReq(body: unknown = {}) {
  return new Request("http://localhost/api/admin/orders/cleanup-e2e", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/orders/cleanup-e2e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(authOk);
  });

  it("returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue(authFail);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mocks.parseBody.mockResolvedValue({
      success: false,
      response: Response.json({ error: "Invalid" }, { status: 400 }),
    });
    const res = await POST(makeReq("bad"));
    expect(res.status).toBe(400);
  });

  it("returns candidates count in dry run mode", async () => {
    mocks.parseBody.mockResolvedValue({ success: true, data: { dryRun: true } });
    mocks.listE2eOrderIds.mockResolvedValue(["e2e-1", "e2e-2", "e2e-3"]);
    const res = await POST(makeReq({ dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.candidates).toBe(3);
    expect(body.deleted).toBe(0);
    expect(mocks.removeOrders).not.toHaveBeenCalled();
  });

  it("deletes e2e orders and returns count", async () => {
    mocks.parseBody.mockResolvedValue({ success: true, data: {} });
    mocks.listE2eOrderIds.mockResolvedValue(["e2e-1", "e2e-2"]);
    mocks.removeOrders.mockResolvedValue(2);
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.candidates).toBe(2);
    expect(body.deleted).toBe(2);
  });

  it("records audit after deletion", async () => {
    mocks.parseBody.mockResolvedValue({ success: true, data: {} });
    mocks.listE2eOrderIds.mockResolvedValue(["e2e-1"]);
    mocks.removeOrders.mockResolvedValue(1);
    const req = makeReq();
    await POST(req);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      req,
      authOk,
      "orders.cleanup_e2e",
      "order",
      "e2e-1",
      { candidates: 1, deleted: 1 }
    );
  });

  it("does not record audit in dry run", async () => {
    mocks.parseBody.mockResolvedValue({ success: true, data: { dryRun: true } });
    mocks.listE2eOrderIds.mockResolvedValue(["e2e-1"]);
    await POST(makeReq({ dryRun: true }));
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("handles empty e2e order list", async () => {
    mocks.parseBody.mockResolvedValue({ success: true, data: {} });
    mocks.listE2eOrderIds.mockResolvedValue([]);
    mocks.removeOrders.mockResolvedValue(0);
    const res = await POST(makeReq());
    const body = await res.json();
    expect(body.candidates).toBe(0);
    expect(body.deleted).toBe(0);
  });

  it("requires ops role", async () => {
    mocks.parseBody.mockResolvedValue({ success: true, data: {} });
    mocks.listE2eOrderIds.mockResolvedValue([]);
    mocks.removeOrders.mockResolvedValue(0);
    await POST(makeReq());
    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.anything(), { role: "ops" });
  });
});
