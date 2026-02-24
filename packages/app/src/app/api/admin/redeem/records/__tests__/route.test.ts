import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockQueryRedeemRecords } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryRedeemRecords: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/redeem-store", () => ({ queryRedeemRecords: mockQueryRedeemRecords }));

import { GET } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/redeem/records");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/redeem/records", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns redeem records", async () => {
    mockQueryRedeemRecords.mockResolvedValue({ items: [], total: 0 });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.items).toEqual([]);
  });

  it("passes filter params", async () => {
    mockQueryRedeemRecords.mockResolvedValue({ items: [] });
    await GET(makeGet({ batchId: "b1", codeId: "c1", address: "0x1" }));
    expect(mockQueryRedeemRecords).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: "b1", codeId: "c1", address: "0x1" })
    );
  });
});
