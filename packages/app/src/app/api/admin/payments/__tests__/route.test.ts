import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockQueryPaymentEvents,
  mockQueryPaymentEventsCursor,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryPaymentEvents: vi.fn(),
  mockQueryPaymentEventsCursor: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  queryPaymentEvents: mockQueryPaymentEvents,
  queryPaymentEventsCursor: mockQueryPaymentEventsCursor,
}));
vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/payments");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

describe("GET /api/admin/payments", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQueryPaymentEventsCursor.mockResolvedValue({ items: [], nextCursor: null });
    const res = await GET(makeGet());
    expect(mockQueryPaymentEventsCursor).toHaveBeenCalled();
  });

  it("uses offset pagination when page is set", async () => {
    mockQueryPaymentEvents.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGet({ page: "1" }));
    expect(mockQueryPaymentEvents).toHaveBeenCalled();
  });

  it("falls back to safe pagination defaults for invalid numeric params", async () => {
    mockQueryPaymentEvents.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGet({ page: "abc", pageSize: "oops" }));
    expect(mockQueryPaymentEvents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 30 })
    );
  });
});
