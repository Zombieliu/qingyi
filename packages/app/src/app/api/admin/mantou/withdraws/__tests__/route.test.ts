import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockQueryMantouWithdraws,
  mockQueryMantouWithdrawsCursor,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryMantouWithdraws: vi.fn(),
  mockQueryMantouWithdrawsCursor: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  queryMantouWithdraws: mockQueryMantouWithdraws,
  queryMantouWithdrawsCursor: mockQueryMantouWithdrawsCursor,
}));

vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/mantou/withdraws");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}
beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

describe("GET /api/admin/mantou/withdraws", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("requires finance role", async () => {
    mockQueryMantouWithdrawsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest());
    expect(mockRequireAdmin).toHaveBeenCalledWith(expect.anything(), { role: "finance" });
  });

  it("uses cursor-based pagination by default", async () => {
    mockQueryMantouWithdrawsCursor.mockResolvedValue({
      items: [{ id: "w1" }],
      nextCursor: null,
    });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQueryMantouWithdrawsCursor).toHaveBeenCalled();
    expect(json.items).toEqual([{ id: "w1" }]);
  });

  it("uses offset pagination when page param is present", async () => {
    mockQueryMantouWithdraws.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "2", pageSize: "10" }));
    expect(mockQueryMantouWithdraws).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 })
    );
  });

  it("clamps pageSize between 5 and 200", async () => {
    mockQueryMantouWithdraws.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1", pageSize: "1" }));
    expect(mockQueryMantouWithdraws).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }));

    mockQueryMantouWithdraws.mockClear();
    await GET(makeGetRequest({ page: "1", pageSize: "999" }));
    expect(mockQueryMantouWithdraws).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 200 })
    );
  });

  it("passes status and address filters", async () => {
    mockQueryMantouWithdrawsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest({ status: "pending", address: "0xabc" }));
    expect(mockQueryMantouWithdrawsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", address: "0xabc" })
    );
  });

  it("forwards decoded cursor", async () => {
    const cursor = { createdAt: 5000, id: "w5" };
    mockDecodeCursorParam.mockReturnValue(cursor);
    mockQueryMantouWithdrawsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest({ cursor: "encoded" }));
    expect(mockQueryMantouWithdrawsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ cursor })
    );
  });

  it("encodes nextCursor in response", async () => {
    mockQueryMantouWithdrawsCursor.mockResolvedValue({
      items: [],
      nextCursor: { createdAt: 9000, id: "w9" },
    });
    mockEncodeCursorParam.mockReturnValue("encoded-next");
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.nextCursor).toBe("encoded-next");
  });
});
