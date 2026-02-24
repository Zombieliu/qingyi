import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddMembershipTier,
  mockQueryMembershipTiers,
  mockQueryMembershipTiersCursor,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddMembershipTier: vi.fn(),
  mockQueryMembershipTiers: vi.fn(),
  mockQueryMembershipTiersCursor: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addMembershipTier: mockAddMembershipTier,
  queryMembershipTiers: mockQueryMembershipTiers,
  queryMembershipTiersCursor: mockQueryMembershipTiersCursor,
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
  const url = new URL("http://localhost/api/admin/vip/tiers");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/vip/tiers", {
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

// ─── GET ───────────────────────────────────────────────

describe("GET /api/admin/vip/tiers", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("uses cursor-based pagination by default", async () => {
    mockQueryMembershipTiersCursor.mockResolvedValue({ items: [{ id: "t1" }], nextCursor: null });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQueryMembershipTiersCursor).toHaveBeenCalled();
    expect(json.items).toEqual([{ id: "t1" }]);
  });

  it("uses offset pagination when page param is present", async () => {
    mockQueryMembershipTiers.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "2", pageSize: "10" }));
    expect(mockQueryMembershipTiers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 })
    );
  });

  it("clamps pageSize between 5 and 200", async () => {
    mockQueryMembershipTiers.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1", pageSize: "1" }));
    expect(mockQueryMembershipTiers).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }));
  });
});

// ─── POST ──────────────────────────────────────────────

describe("POST /api/admin/vip/tiers", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ name: "Gold", level: 1 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makePostRequest({ level: 1 }));
    expect(res.status).toBe(400);
  });

  it("creates tier and returns 201", async () => {
    mockAddMembershipTier.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ name: "Gold", level: 2, price: 99 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Gold");
    expect(json.level).toBe(2);
    expect(json.id).toMatch(/^TIER-/);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("normalizes string perks into structured array", async () => {
    mockAddMembershipTier.mockResolvedValue(undefined);
    const res = await POST(
      makePostRequest({ name: "VIP", level: 1, perks: "专属客服|24小时\n优先派单" })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.perks).toEqual([{ label: "专属客服", desc: "24小时" }, { label: "优先派单" }]);
  });
});
