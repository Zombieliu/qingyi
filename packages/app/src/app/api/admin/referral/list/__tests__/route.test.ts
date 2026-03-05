import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockQueryReferrals } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryReferrals: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  queryReferrals: mockQueryReferrals,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/referral/list");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/referral/list", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns referrals with default pagination", async () => {
    const result = { items: [{ id: "r1" }], total: 1 };
    mockQueryReferrals.mockResolvedValue(result);
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockQueryReferrals).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: undefined,
      q: undefined,
    });
  });

  it("passes page, pageSize, status, q params", async () => {
    mockQueryReferrals.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "3", pageSize: "50", status: "active", q: "test" }));
    expect(mockQueryReferrals).toHaveBeenCalledWith({
      page: 3,
      pageSize: 50,
      status: "active",
      q: "test",
    });
  });

  it("clamps pageSize between 5 and 100", async () => {
    mockQueryReferrals.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1", pageSize: "1" }));
    expect(mockQueryReferrals).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }));

    mockQueryReferrals.mockClear();
    await GET(makeGetRequest({ page: "1", pageSize: "999" }));
    expect(mockQueryReferrals).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  it("ensures page is at least 1", async () => {
    mockQueryReferrals.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "-5" }));
    expect(mockQueryReferrals).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it("uses safe fallback pagination for invalid numeric params", async () => {
    mockQueryReferrals.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "abc", pageSize: "oops" }));
    expect(mockQueryReferrals).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });
});
