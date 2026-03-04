import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  trackCronCompleted: vi.fn(),
  trackCronFailed: vi.fn(),
  deleteGrowthEventsBeforeEdgeWrite: vi.fn(),
  deleteUserSessionsBeforeEdgeWrite: vi.fn(),
  deleteAdminSessionsBeforeEdgeWrite: vi.fn(),
  deleteNotificationsBeforeEdgeWrite: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
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

vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: mocks.isAuthorizedCron }));
vi.mock("@/lib/business-events", () => ({
  trackCronCompleted: mocks.trackCronCompleted,
  trackCronFailed: mocks.trackCronFailed,
}));
vi.mock("@/lib/edge-db/cron-maintenance-store", () => ({
  deleteGrowthEventsBeforeEdgeWrite: mocks.deleteGrowthEventsBeforeEdgeWrite,
  deleteUserSessionsBeforeEdgeWrite: mocks.deleteUserSessionsBeforeEdgeWrite,
  deleteAdminSessionsBeforeEdgeWrite: mocks.deleteAdminSessionsBeforeEdgeWrite,
  deleteNotificationsBeforeEdgeWrite: mocks.deleteNotificationsBeforeEdgeWrite,
}));

import { GET } from "../route";

describe("GET /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteGrowthEventsBeforeEdgeWrite.mockResolvedValue(0);
    mocks.deleteUserSessionsBeforeEdgeWrite.mockResolvedValue(0);
    mocks.deleteAdminSessionsBeforeEdgeWrite.mockResolvedValue(0);
    mocks.deleteNotificationsBeforeEdgeWrite.mockResolvedValue(0);
  });

  it("returns 401 when unauthorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const res = await GET(new Request("http://localhost/api/cron/cleanup"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns cleanup summary on success", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.deleteGrowthEventsBeforeEdgeWrite.mockResolvedValue(10);
    mocks.deleteUserSessionsBeforeEdgeWrite.mockResolvedValue(5);
    mocks.deleteAdminSessionsBeforeEdgeWrite.mockResolvedValue(3);
    mocks.deleteNotificationsBeforeEdgeWrite.mockResolvedValue(7);

    const res = await GET(new Request("http://localhost/api/cron/cleanup"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cleaned).toEqual({
      growthEvents: 10,
      userSessions: 5,
      adminSessions: 3,
      notifications: 7,
    });
    expect(mocks.trackCronCompleted).toHaveBeenCalled();
  });

  it("returns 500 when edge cleanup fails", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.deleteGrowthEventsBeforeEdgeWrite.mockRejectedValue(new Error("edge failure"));

    const res = await GET(new Request("http://localhost/api/cron/cleanup"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "cleanup_failed", message: "edge failure" });
    expect(mocks.trackCronFailed).toHaveBeenCalledWith("cleanup", "edge failure");
  });
});
