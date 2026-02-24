import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockGetCompanionEarnings } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetCompanionEarnings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ getCompanionEarnings: mockGetCompanionEarnings }));

import { GET } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/earnings");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/earnings", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns earnings data", async () => {
    mockGetCompanionEarnings.mockResolvedValue({ items: [], total: 0 });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items).toEqual([]);
  });

  it("passes date range params", async () => {
    mockGetCompanionEarnings.mockResolvedValue({ items: [] });
    await GET(makeGet({ from: "2025-01-01", to: "2025-01-31", limit: "10" }));
    expect(mockGetCompanionEarnings).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it("parses numeric timestamp date params", async () => {
    mockGetCompanionEarnings.mockResolvedValue({ items: [] });
    const ts = Date.now();
    await GET(makeGet({ from: String(ts) }));
    expect(mockGetCompanionEarnings).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Number) })
    );
  });

  it("ignores invalid date params", async () => {
    mockGetCompanionEarnings.mockResolvedValue({ items: [] });
    await GET(makeGet({ from: "not-a-date-at-all!!!" }));
    expect(mockGetCompanionEarnings).toHaveBeenCalledWith(
      expect.objectContaining({ from: undefined })
    );
  });

  it("parses ISO date string params", async () => {
    mockGetCompanionEarnings.mockResolvedValue({ items: [] });
    await GET(makeGet({ from: "2025-06-15T10:00:00Z" }));
    expect(mockGetCompanionEarnings).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Number) })
    );
  });
});
