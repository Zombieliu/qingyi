import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddCoupon,
  mockQueryCoupons,
  mockQueryCouponsCursor,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddCoupon: vi.fn(),
  mockQueryCoupons: vi.fn(),
  mockQueryCouponsCursor: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addCoupon: mockAddCoupon,
  queryCoupons: mockQueryCoupons,
  queryCouponsCursor: mockQueryCouponsCursor,
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
  const url = new URL("http://localhost/api/admin/coupons");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/coupons", {
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

describe("GET /api/admin/coupons", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQueryCouponsCursor.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQueryCouponsCursor).toHaveBeenCalled();
    expect(json.items).toEqual([]);
  });

  it("uses offset pagination when page param is set without cursor", async () => {
    mockQueryCoupons.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1" }));
    expect(mockQueryCoupons).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });

  it("passes status and q filters", async () => {
    mockQueryCouponsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest({ status: "可用", q: "test" }));
    expect(mockQueryCouponsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ status: "可用", q: "test" })
    );
  });
});
describe("POST /api/admin/coupons", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ title: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/admin/coupons", {
      method: "POST",
      body: "bad",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makePostRequest({ discount: 10 }));
    expect(res.status).toBe(400);
  });

  it("creates coupon with defaults and returns 201", async () => {
    mockAddCoupon.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ title: "Summer Sale" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.title).toBe("Summer Sale");
    expect(json.status).toBe("可用");
    expect(json.id).toMatch(/^CPN-/);
  });

  it("parses date fields correctly", async () => {
    mockAddCoupon.mockResolvedValue(undefined);
    const res = await POST(
      makePostRequest({ title: "T", startsAt: "2025-01-01", expiresAt: 1735689600000 })
    );
    const json = await res.json();
    expect(typeof json.startsAt).toBe("number");
    expect(json.expiresAt).toBe(1735689600000);
  });

  it("calls addCoupon and recordAudit", async () => {
    mockAddCoupon.mockResolvedValue(undefined);
    await POST(makePostRequest({ title: "T" }));
    expect(mockAddCoupon).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      authOk,
      "coupons.create",
      "coupon",
      expect.stringMatching(/^CPN-/),
      expect.objectContaining({ title: "T", status: "可用" })
    );
  });
});
