import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateAnnouncement, mockRemoveAnnouncement, mockRecordAudit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockUpdateAnnouncement: vi.fn(),
    mockRemoveAnnouncement: vi.fn(),
    mockRecordAudit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateAnnouncement: mockUpdateAnnouncement,
  removeAnnouncement: mockRemoveAnnouncement,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ announcementId: "ann-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/announcements/ann-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/announcements/ann-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/announcements/[announcementId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ title: "x" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateAnnouncement.mockResolvedValue(null);
    const res = await PATCH(makePatch({ title: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates announcement successfully", async () => {
    mockUpdateAnnouncement.mockResolvedValue({ id: "ann-1", title: "x" });
    const res = await PATCH(makePatch({ title: "x" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("updates all announcement fields", async () => {
    mockUpdateAnnouncement.mockResolvedValue({
      id: "ann-1",
      title: "t",
      tag: "info",
      content: "c",
      status: "published",
    });
    const res = await PATCH(
      makePatch({ title: "t", tag: "info", content: "c", status: "published" }),
      ctx
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("published");
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/announcements/ann-1", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when announcementId is empty", async () => {
    const emptyCtx = { params: Promise.resolve({ announcementId: "" }) };
    const res = await PATCH(makePatch({ title: "x" }), emptyCtx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing announcementId");
  });
});

describe("DELETE /api/admin/announcements/[announcementId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockRemoveAnnouncement.mockResolvedValue(null);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when announcementId is empty on DELETE", async () => {
    const emptyCtx = { params: Promise.resolve({ announcementId: "" }) };
    const res = await DELETE(makeDelete(), emptyCtx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing announcementId");
  });

  it("deletes announcement successfully", async () => {
    mockRemoveAnnouncement.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
