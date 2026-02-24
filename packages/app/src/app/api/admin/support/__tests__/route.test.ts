import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddSupportTicket,
  mockQuerySupportTickets,
  mockQuerySupportTicketsCursor,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddSupportTicket: vi.fn(),
  mockQuerySupportTickets: vi.fn(),
  mockQuerySupportTicketsCursor: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addSupportTicket: mockAddSupportTicket,
  querySupportTickets: mockQuerySupportTickets,
  querySupportTicketsCursor: mockQuerySupportTicketsCursor,
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
  const url = new URL("http://localhost/api/admin/support");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/support", {
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

describe("GET /api/admin/support", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("uses cursor pagination by default", async () => {
    mockQuerySupportTicketsCursor.mockResolvedValue({ items: [{ id: "t1" }], nextCursor: null });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQuerySupportTicketsCursor).toHaveBeenCalled();
    expect(json.items).toEqual([{ id: "t1" }]);
  });

  it("uses offset pagination when page param is set", async () => {
    mockQuerySupportTickets.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "2", pageSize: "10" }));
    expect(mockQuerySupportTickets).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 })
    );
  });

  it("passes status and q filters", async () => {
    mockQuerySupportTicketsCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest({ status: "待处理", q: "help" }));
    expect(mockQuerySupportTicketsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ status: "待处理", q: "help" })
    );
  });
});
describe("POST /api/admin/support", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ message: "help" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/admin/support", {
      method: "POST",
      body: "bad",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON");
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makePostRequest({ userName: "u1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("message required");
  });

  it("creates ticket with defaults and returns 201", async () => {
    mockAddSupportTicket.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ message: "Need help" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message).toBe("Need help");
    expect(json.status).toBe("待处理");
    expect(json.id).toMatch(/^SUP-/);
  });

  it("uses provided id when given", async () => {
    mockAddSupportTicket.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ id: "MY-TICKET", message: "help" }));
    const json = await res.json();
    expect(json.id).toBe("MY-TICKET");
  });

  it("calls addSupportTicket and recordAudit", async () => {
    mockAddSupportTicket.mockResolvedValue(undefined);
    await POST(makePostRequest({ message: "help", topic: "billing" }));
    expect(mockAddSupportTicket).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      authOk,
      "support.create",
      "support",
      expect.stringMatching(/^SUP-/),
      expect.objectContaining({ topic: "billing", status: "待处理" })
    );
  });
});
