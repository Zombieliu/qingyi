import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockQueryMembershipRequests,
  mockQueryMembershipRequestsCursor,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryMembershipRequests: vi.fn(),
  mockQueryMembershipRequestsCursor: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  queryMembershipRequests: mockQueryMembershipRequests,
  queryMembershipRequestsCursor: mockQueryMembershipRequestsCursor,
}));
vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/vip/requests");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

describe("GET /api/admin/vip/requests", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQueryMembershipRequestsCursor.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(makeGet());
    expect(mockQueryMembershipRequestsCursor).toHaveBeenCalled();
  });

  it("uses offset pagination when page is set", async () => {
    mockQueryMembershipRequests.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGet({ page: "1" }));
    expect(mockQueryMembershipRequests).toHaveBeenCalled();
  });
});
