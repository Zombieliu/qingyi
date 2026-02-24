import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockQueryAuditLogs,
  mockQueryAuditLogsCursor,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryAuditLogs: vi.fn(),
  mockQueryAuditLogsCursor: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  queryAuditLogs: mockQueryAuditLogs,
  queryAuditLogsCursor: mockQueryAuditLogsCursor,
}));
vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/audit");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

describe("GET /api/admin/audit", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQueryAuditLogsCursor.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(makeReq());
    const json = await res.json();
    expect(mockQueryAuditLogsCursor).toHaveBeenCalled();
    expect(json.items).toEqual([]);
  });

  it("uses offset pagination when page param is set without cursor", async () => {
    mockQueryAuditLogs.mockResolvedValue({ items: [], total: 0 });
    await GET(makeReq({ page: "2" }));
    expect(mockQueryAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("passes q filter", async () => {
    mockQueryAuditLogsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeReq({ q: "test" }));
    expect(mockQueryAuditLogsCursor).toHaveBeenCalledWith(expect.objectContaining({ q: "test" }));
  });
});
