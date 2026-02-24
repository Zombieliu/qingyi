import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockIsKookEnabled, mockSendChannelMessage } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockIsKookEnabled: vi.fn(),
  mockSendChannelMessage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/services/kook-service", () => ({
  isKookEnabled: mockIsKookEnabled,
  sendChannelMessage: mockSendChannelMessage,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/kook", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/kook"));
    expect(res.status).toBe(401);
  });

  it("returns kook status", async () => {
    mockIsKookEnabled.mockReturnValue(true);
    process.env.KOOK_CHANNEL_ID = "ch12345678";
    const res = await GET(new Request("http://localhost/api/admin/kook"));
    const json = await res.json();
    expect(json.enabled).toBe(true);
    expect(json.channelId).toBe("***5678");
    delete process.env.KOOK_CHANNEL_ID;
  });

  it("returns null channelId when not configured", async () => {
    mockIsKookEnabled.mockReturnValue(false);
    delete process.env.KOOK_CHANNEL_ID;
    const res = await GET(new Request("http://localhost/api/admin/kook"));
    const json = await res.json();
    expect(json.enabled).toBe(false);
    expect(json.channelId).toBeNull();
  });
});

describe("POST /api/admin/kook", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(
      new Request("http://localhost/api/admin/kook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when kook not enabled", async () => {
    mockIsKookEnabled.mockReturnValue(false);
    const res = await POST(
      new Request("http://localhost/api/admin/kook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when sendChannelMessage throws", async () => {
    mockIsKookEnabled.mockReturnValue(true);
    mockSendChannelMessage.mockRejectedValue(new Error("network error"));
    const res = await POST(
      new Request("http://localhost/api/admin/kook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("send failed");
  });

  it("sends default message when no message provided", async () => {
    mockIsKookEnabled.mockReturnValue(true);
    mockSendChannelMessage.mockResolvedValue({ ok: true });
    const res = await POST(
      new Request("http://localhost/api/admin/kook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("sends message successfully", async () => {
    mockIsKookEnabled.mockReturnValue(true);
    mockSendChannelMessage.mockResolvedValue({ ok: true });
    const res = await POST(
      new Request("http://localhost/api/admin/kook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
