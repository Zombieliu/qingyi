import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddMember,
  mockQueryMembers,
  mockQueryMembersCursor,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddMember: vi.fn(),
  mockQueryMembers: vi.fn(),
  mockQueryMembersCursor: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addMember: mockAddMember,
  queryMembers: mockQueryMembers,
  queryMembersCursor: mockQueryMembersCursor,
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
  const url = new URL("http://localhost/api/admin/vip/members");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/vip/members", {
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

describe("GET /api/admin/vip/members", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("uses cursor-based pagination by default", async () => {
    mockQueryMembersCursor.mockResolvedValue({ items: [{ id: "m1" }], nextCursor: null });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQueryMembersCursor).toHaveBeenCalled();
    expect(json.items).toEqual([{ id: "m1" }]);
  });

  it("uses offset pagination when page param is present", async () => {
    mockQueryMembers.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "3", pageSize: "15" }));
    expect(mockQueryMembers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, pageSize: 15 })
    );
  });

  it("clamps pageSize between 5 and 200", async () => {
    mockQueryMembers.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1", pageSize: "2" }));
    expect(mockQueryMembers).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }));
  });

  it("falls back to safe pagination defaults for invalid numeric params", async () => {
    mockQueryMembers.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "abc", pageSize: "oops" }));
    expect(mockQueryMembers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });
});

// ─── POST ──────────────────────────────────────────────

describe("POST /api/admin/vip/members", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ userAddress: "0xabc" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when neither userAddress nor userName provided", async () => {
    const res = await POST(makePostRequest({ tierId: "t1" }));
    expect(res.status).toBe(400);
  });

  it("creates member with userAddress and returns 201", async () => {
    mockAddMember.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ userAddress: "0xabc", tierId: "t1" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.userAddress).toBe("0xabc");
    expect(json.status).toBe("待开通");
    expect(json.id).toMatch(/^MBR-/);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("creates member with userName and returns 201", async () => {
    mockAddMember.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ userName: "Alice" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.userName).toBe("Alice");
  });
});
