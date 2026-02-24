import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateInvoiceRequest, mockRemoveInvoiceRequest, mockRecordAudit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockUpdateInvoiceRequest: vi.fn(),
    mockRemoveInvoiceRequest: vi.fn(),
    mockRecordAudit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateInvoiceRequest: mockUpdateInvoiceRequest,
  removeInvoiceRequest: mockRemoveInvoiceRequest,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ invoiceId: "inv-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/invoices/inv-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/invoices/inv-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/invoices/[invoiceId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "已开票" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateInvoiceRequest.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: "已开票" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates invoice successfully", async () => {
    mockUpdateInvoiceRequest.mockResolvedValue({ id: "inv-1", status: "已开票" });
    const res = await PATCH(makePatch({ status: "已开票" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/invoices/inv-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("updates invoice with note", async () => {
    mockUpdateInvoiceRequest.mockResolvedValue({ id: "inv-1", status: "已开票" });
    const res = await PATCH(makePatch({ note: "test note" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/invoices/[invoiceId]", () => {
  it("returns 404 when not found", async () => {
    mockRemoveInvoiceRequest.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes invoice successfully", async () => {
    mockRemoveInvoiceRequest.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
