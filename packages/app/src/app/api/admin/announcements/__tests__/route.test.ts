import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockListAnnouncements, mockAddAnnouncement, mockRecordAudit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockListAnnouncements: vi.fn(),
    mockAddAnnouncement: vi.fn(),
    mockRecordAudit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  listAnnouncements: mockListAnnouncements,
  addAnnouncement: mockAddAnnouncement,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet() {
  return new Request("http://localhost/api/admin/announcements");
}

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/announcements", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns announcements list", async () => {
    mockListAnnouncements.mockResolvedValue([{ id: "a1" }]);
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json).toEqual([{ id: "a1" }]);
  });
});

describe("POST /api/admin/announcements", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ title: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("creates announcement and returns 201", async () => {
    mockAddAnnouncement.mockResolvedValue(undefined);
    const res = await POST(makePost({ title: "Hello" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.title).toBe("Hello");
    expect(json.id).toMatch(/^ANN-/);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
