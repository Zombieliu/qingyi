import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockRemoveAnnouncements, mockRecordAudit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRemoveAnnouncements: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ removeAnnouncements: mockRemoveAnnouncements }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/announcements/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/announcements/bulk-delete", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ ids: ["a1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when ids is missing", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is empty array", async () => {
    const res = await POST(makePost({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids contains empty string", async () => {
    const res = await POST(makePost({ ids: [""] }));
    expect(res.status).toBe(400);
  });

  it("deletes announcements and returns ok with count", async () => {
    mockRemoveAnnouncements.mockResolvedValue(2);
    const res = await POST(makePost({ ids: ["a1", "a2"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, count: 2 });
    expect(mockRemoveAnnouncements).toHaveBeenCalledWith(["a1", "a2"]);
  });

  it("records audit after deletion", async () => {
    mockRemoveAnnouncements.mockResolvedValue(1);
    await POST(makePost({ ids: ["a1"] }));
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.any(Request),
      authOk,
      "announcements.bulk_delete",
      "announcement",
      "a1",
      { count: 1, ids: ["a1"] }
    );
  });

  it("joins multiple ids with comma for audit target", async () => {
    mockRemoveAnnouncements.mockResolvedValue(3);
    await POST(makePost({ ids: ["a1", "a2", "a3"] }));
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.any(Request),
      authOk,
      "announcements.bulk_delete",
      "announcement",
      "a1,a2,a3",
      { count: 3, ids: ["a1", "a2", "a3"] }
    );
  });

  it("returns count 0 when no announcements matched", async () => {
    mockRemoveAnnouncements.mockResolvedValue(0);
    const res = await POST(makePost({ ids: ["nonexistent"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, count: 0 });
  });
});
