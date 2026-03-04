import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getCompanionScheduleByAddressEdgeRead: vi.fn(),
  updateCompanionScheduleByAddressEdgeWrite: vi.fn(),
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
vi.mock("@/lib/edge-db/companion-schedule-store", () => ({
  getCompanionScheduleByAddressEdgeRead: mocks.getCompanionScheduleByAddressEdgeRead,
  updateCompanionScheduleByAddressEdgeWrite: mocks.updateCompanionScheduleByAddressEdgeWrite,
}));

import { GET, PUT } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/companion/schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/companion/schedule");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails for GET", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/companion/schedule?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns schedule slots", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCompanionScheduleByAddressEdgeRead.mockResolvedValue([
      { day: 1, start: "09:00", end: "17:00" },
    ]);
    const req = new Request(`http://localhost/api/companion/schedule?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slots).toHaveLength(1);
  });

  it("returns empty slots when no schedule", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCompanionScheduleByAddressEdgeRead.mockResolvedValue([]);
    const req = new Request(`http://localhost/api/companion/schedule?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slots).toEqual([]);
  });
});

describe("PUT /api/companion/schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid JSON body in PUT", async () => {
    const req = new Request("http://localhost/api/companion/schedule", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid schedule data", async () => {
    const req = new Request("http://localhost/api/companion/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS, slots: "bad" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails for PUT", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/companion/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: VALID_ADDRESS,
        slots: [{ day: 1, start: "09:00", end: "17:00" }],
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when player not found", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.updateCompanionScheduleByAddressEdgeWrite.mockResolvedValue(false);
    const req = new Request("http://localhost/api/companion/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: VALID_ADDRESS,
        slots: [{ day: 1, start: "09:00", end: "17:00" }],
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(404);
  });

  it("updates schedule successfully", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.updateCompanionScheduleByAddressEdgeWrite.mockResolvedValue(true);
    const slots = [{ day: 1, start: "09:00", end: "17:00" }];
    const req = new Request("http://localhost/api/companion/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS, slots }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.slots).toEqual(slots);
  });
});
