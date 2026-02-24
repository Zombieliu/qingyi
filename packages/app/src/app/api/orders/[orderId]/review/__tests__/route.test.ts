import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireUserAuth: vi.fn(),
  getOrderById: vi.fn(),
  getReviewByOrderId: vi.fn(),
  createReview: vi.fn(),
  creditMantou: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
  onReviewSubmitted: vi.fn(),
  REVIEW_TAG_OPTIONS: ["技术好", "态度好", "有耐心", "配合默契", "准时上线"],
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

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-store", () => ({
  getOrderById: mocks.getOrderById,
  getReviewByOrderId: mocks.getReviewByOrderId,
  createReview: mocks.createReview,
  creditMantou: mocks.creditMantou,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/admin/admin-types", () => ({
  REVIEW_TAG_OPTIONS: mocks.REVIEW_TAG_OPTIONS,
}));
vi.mock("@/lib/shared/api-validation", () => ({
  parseBodyRaw: mocks.parseBodyRaw,
}));
vi.mock("@/lib/services/growth-service", () => ({
  onReviewSubmitted: mocks.onReviewSubmitted,
}));

import { GET, POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);
const COMPANION_ADDRESS = "0x" + "b".repeat(64);

const completedOrder = {
  id: "ORD-001",
  user: "test",
  userAddress: VALID_ADDRESS,
  companionAddress: COMPANION_ADDRESS,
  stage: "已完成",
  amount: 100,
  createdAt: Date.now(),
};

const reviewData = {
  id: "REV-001",
  orderId: "ORD-001",
  reviewerAddress: VALID_ADDRESS,
  companionAddress: COMPANION_ADDRESS,
  rating: 5,
  content: "Great!",
  createdAt: Date.now(),
};

function makeCtx(orderId: string) {
  return { params: Promise.resolve({ orderId }) };
}

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("GET /api/orders/[orderId]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 404 when review not found", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-001/review");
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
  });

  it("returns review for admin", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(reviewData);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/orders/ORD-001/review");
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid address in GET", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(reviewData);
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq(`http://localhost/api/orders/ORD-001/review?address=bad`);
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_address");
  });

  it("returns review for user with address param", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(reviewData);
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq(`http://localhost/api/orders/ORD-001/review?address=${VALID_ADDRESS}`);
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns auth error when user auth fails in GET with address", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(reviewData);
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq(`http://localhost/api/orders/ORD-001/review?address=${VALID_ADDRESS}`);
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("returns admin auth error when no address param and admin fails", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(reviewData);
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/review");
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/orders/[orderId]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad", rating: 5 },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when order not found", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when order not completed", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue({ ...completedOrder, stage: "进行中" });
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("returns 409 when already reviewed", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.getReviewByOrderId.mockResolvedValue(reviewData);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid tags", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5, tags: ["invalid_tag"] },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_tags");
  });

  it("returns 403 when user is not the order owner", async () => {
    const otherAddress = "0x" + "c".repeat(64);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: otherAddress, rating: 5 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 400 when order has no companion", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue({ ...completedOrder, companionAddress: null });
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no_companion");
  });

  it("returns auth error when user auth fails in POST", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("creates review successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5, content: "Great!" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.getReviewByOrderId.mockResolvedValue(null);
    mocks.createReview.mockResolvedValue(reviewData);
    mocks.creditMantou.mockResolvedValue(undefined);
    mocks.onReviewSubmitted.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review).toBeDefined();
    expect(body.rewarded).toBe(5);
  });

  it("creates review without content (undefined trim branch)", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 4 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.getReviewByOrderId.mockResolvedValue(null);
    mocks.createReview.mockResolvedValue({ ...reviewData, content: undefined });
    mocks.creditMantou.mockResolvedValue(undefined);
    mocks.onReviewSubmitted.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ content: undefined })
    );
  });

  it("handles creditMantou failure gracefully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5, content: "Nice" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.getReviewByOrderId.mockResolvedValue(null);
    mocks.createReview.mockResolvedValue(reviewData);
    mocks.creditMantou.mockRejectedValue(new Error("mantou error"));
    mocks.onReviewSubmitted.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("handles onReviewSubmitted failure gracefully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5, content: "Nice" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.getReviewByOrderId.mockResolvedValue(null);
    mocks.createReview.mockResolvedValue(reviewData);
    mocks.creditMantou.mockResolvedValue(undefined);
    mocks.onReviewSubmitted.mockRejectedValue(new Error("growth error"));
    const req = makeReq("http://localhost/api/orders/ORD-001/review", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });
});
