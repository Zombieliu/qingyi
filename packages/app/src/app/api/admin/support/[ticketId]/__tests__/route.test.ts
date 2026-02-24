import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockUpdateSupportTicket,
  mockRemoveSupportTicket,
  mockRecordAudit,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdateSupportTicket: vi.fn(),
  mockRemoveSupportTicket: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateSupportTicket: mockUpdateSupportTicket,
  removeSupportTicket: mockRemoveSupportTicket,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/services/notification-service", () => ({
  createNotification: mockCreateNotification,
}));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ ticketId: "tk-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/support/tk-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/support/tk-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockCreateNotification.mockResolvedValue(undefined);
});

describe("PATCH /api/admin/support/[ticketId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "已回复" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateSupportTicket.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: "已回复" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates ticket successfully", async () => {
    mockUpdateSupportTicket.mockResolvedValue({ id: "tk-1", status: "已回复" });
    const res = await PATCH(makePatch({ status: "已回复" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("sends notification when reply is provided", async () => {
    mockUpdateSupportTicket.mockResolvedValue({ id: "tk-1", status: "已回复", userAddress: "0x1" });
    await PATCH(makePatch({ reply: "已处理" }), ctx);
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/admin/support/tk-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("does not send notification when reply is missing", async () => {
    mockUpdateSupportTicket.mockResolvedValue({ id: "tk-1", status: "已回复", userAddress: "0x1" });
    await PATCH(makePatch({ status: "已回复" }), ctx);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("does not send notification when userAddress is missing", async () => {
    mockUpdateSupportTicket.mockResolvedValue({ id: "tk-1", status: "已回复" });
    await PATCH(makePatch({ reply: "已处理" }), ctx);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("truncates long reply in notification body", async () => {
    const longReply = "a".repeat(200);
    mockUpdateSupportTicket.mockResolvedValue({ id: "tk-1", status: "已回复", userAddress: "0x1" });
    await PATCH(makePatch({ reply: longReply }), ctx);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("…"),
      })
    );
  });

  it("handles notification failure gracefully", async () => {
    mockUpdateSupportTicket.mockResolvedValue({ id: "tk-1", status: "已回复", userAddress: "0x1" });
    mockCreateNotification.mockRejectedValue(new Error("notification error"));
    const res = await PATCH(makePatch({ reply: "已处理" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/support/[ticketId]", () => {
  it("returns 404 when not found", async () => {
    mockRemoveSupportTicket.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes ticket successfully", async () => {
    mockRemoveSupportTicket.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
