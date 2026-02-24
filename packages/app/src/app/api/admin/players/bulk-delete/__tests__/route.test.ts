import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockRemovePlayers, mockRecordAudit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRemovePlayers: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ removePlayers: mockRemovePlayers }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { POST } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/players/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/players/bulk-delete", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ ids: ["1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty ids", async () => {
    const res = await POST(makePost({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("deletes players and returns count", async () => {
    mockRemovePlayers.mockResolvedValue(3);
    const res = await POST(makePost({ ids: ["p1", "p2", "p3"] }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(3);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
