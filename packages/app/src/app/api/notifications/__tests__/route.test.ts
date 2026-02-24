import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteAllNotifications: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }
    async json() {
      return this.body;
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/services/notification-service", () => ({
  getNotifications: mocks.getNotifications,
  getUnreadCount: mocks.getUnreadCount,
  markAsRead: mocks.markAsRead,
  markAllAsRead: mocks.markAllAsRead,
  deleteAllNotifications: mocks.deleteAllNotifications,
}));

import { GET, PATCH, DELETE } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("returns 400 when address is missing", async () => {
    const req = createMockRequest("http://localhost/api/notifications");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("address required");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest(`http://localhost/api/notifications?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns unread count when countOnly=1", async () => {
    mocks.getUnreadCount.mockResolvedValue(5);
    const req = createMockRequest(
      `http://localhost/api/notifications?address=${VALID_ADDRESS}&countOnly=1`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unread).toBe(5);
  });

  it("returns paginated notifications", async () => {
    const now = new Date();
    mocks.getNotifications.mockResolvedValue({
      items: [
        {
          id: "NTF-1",
          type: "order",
          title: "Test",
          body: "msg",
          orderId: "ORD-1",
          read: false,
          createdAt: now,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const req = createMockRequest(`http://localhost/api/notifications?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("NTF-1");
    expect(typeof body.items[0].createdAt).toBe("number");
  });

  it("respects page and pageSize params", async () => {
    mocks.getNotifications.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    const req = createMockRequest(
      `http://localhost/api/notifications?address=${VALID_ADDRESS}&page=2&pageSize=10`
    );
    await GET(req);
    expect(mocks.getNotifications).toHaveBeenCalledWith(VALID_ADDRESS, 2, 10);
  });
});

describe("PATCH /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("handles invalid JSON body in PATCH gracefully", async () => {
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when address is missing", async () => {
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails for PATCH", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ address: VALID_ADDRESS, id: "NTF-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("marks all as read", async () => {
    mocks.markAllAsRead.mockResolvedValue(3);
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ address: VALID_ADDRESS, all: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.marked).toBe(3);
  });

  it("marks single notification as read", async () => {
    mocks.markAsRead.mockResolvedValue(true);
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ address: VALID_ADDRESS, id: "NTF-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 404 when notification not found", async () => {
    mocks.markAsRead.mockResolvedValue(null);
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ address: VALID_ADDRESS, id: "NTF-999" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when neither id nor all provided", async () => {
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ address: VALID_ADDRESS }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id or all required");
  });
});

describe("DELETE /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("handles invalid JSON body in DELETE gracefully", async () => {
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "DELETE",
      body: "not-json",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when address is missing", async () => {
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "DELETE",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails for DELETE", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "DELETE",
      body: JSON.stringify({ address: VALID_ADDRESS }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("deletes all notifications successfully", async () => {
    mocks.deleteAllNotifications.mockResolvedValue(5);
    const req = createMockRequest("http://localhost/api/notifications", {
      method: "DELETE",
      body: JSON.stringify({ address: VALID_ADDRESS }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(5);
  });
});
