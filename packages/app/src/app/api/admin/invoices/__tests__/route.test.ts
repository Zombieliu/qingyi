import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddInvoiceRequest,
  mockQueryInvoiceRequests,
  mockQueryInvoiceRequestsCursor,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddInvoiceRequest: vi.fn(),
  mockQueryInvoiceRequests: vi.fn(),
  mockQueryInvoiceRequestsCursor: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addInvoiceRequest: mockAddInvoiceRequest,
  queryInvoiceRequests: mockQueryInvoiceRequests,
  queryInvoiceRequestsCursor: mockQueryInvoiceRequestsCursor,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/invoices");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

describe("GET /api/admin/invoices", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQueryInvoiceRequestsCursor.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQueryInvoiceRequestsCursor).toHaveBeenCalled();
    expect(json.items).toEqual([]);
  });

  it("uses offset pagination when page param is set", async () => {
    mockQueryInvoiceRequests.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1" }));
    expect(mockQueryInvoiceRequests).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });

  it("passes status and q filters", async () => {
    mockQueryInvoiceRequestsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest({ status: "待审核", q: "invoice" }));
    expect(mockQueryInvoiceRequestsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ status: "待审核", q: "invoice" })
    );
  });
});

describe("POST /api/admin/invoices", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ title: "Invoice" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/admin/invoices", {
      method: "POST",
      body: "bad",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makePostRequest({ amount: 100 }));
    expect(res.status).toBe(400);
  });

  it("creates invoice with defaults and returns 201", async () => {
    mockAddInvoiceRequest.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ title: "Test Invoice" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.title).toBe("Test Invoice");
    expect(json.status).toBe("待审核");
    expect(json.id).toMatch(/^INV-/);
  });
});
