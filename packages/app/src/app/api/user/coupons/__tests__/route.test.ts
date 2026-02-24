import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getUserCoupons: vi.fn(),
  claimCoupon: vi.fn(),
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
vi.mock("@/lib/services/coupon-service", () => ({
  getUserCoupons: mocks.getUserCoupons,
  claimCoupon: mocks.claimCoupon,
}));

import { GET, POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/user/coupons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/user/coupons");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/user/coupons?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns coupons", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getUserCoupons.mockResolvedValue([{ id: "C-1", code: "SAVE10" }]);
    const req = new Request(`http://localhost/api/user/coupons?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coupons).toHaveLength(1);
  });

  it("passes status param to getUserCoupons", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getUserCoupons.mockResolvedValue([]);
    const req = new Request(
      `http://localhost/api/user/coupons?address=${VALID_ADDRESS}&status=used`
    );
    await GET(req);
    expect(mocks.getUserCoupons).toHaveBeenCalledWith(VALID_ADDRESS, "used");
  });

  it("defaults status to unused", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getUserCoupons.mockResolvedValue([]);
    const req = new Request(`http://localhost/api/user/coupons?address=${VALID_ADDRESS}`);
    await GET(req);
    expect(mocks.getUserCoupons).toHaveBeenCalledWith(VALID_ADDRESS, "unused");
  });
});

describe("POST /api/user/coupons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address or couponId is missing", async () => {
    const req = new Request("http://localhost/api/user/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/user/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS, couponId: "C-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("claims coupon successfully", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.claimCoupon.mockResolvedValue({ userCoupon: { id: "UC-1" } });
    const req = new Request("http://localhost/api/user/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS, couponId: "C-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 409 when already claimed", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.claimCoupon.mockResolvedValue({ error: "already_claimed" });
    const req = new Request("http://localhost/api/user/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS, couponId: "C-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 400 for other claim errors", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.claimCoupon.mockResolvedValue({ error: "coupon_expired" });
    const req = new Request("http://localhost/api/user/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: VALID_ADDRESS, couponId: "C-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handles invalid JSON body gracefully", async () => {
    const req = new Request("http://localhost/api/user/coupons", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
