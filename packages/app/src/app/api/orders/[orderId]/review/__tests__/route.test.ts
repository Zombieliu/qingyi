import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ADDRESS = `0x${"a".repeat(64)}`;

const mocks = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  getReviewByOrderId: vi.fn(),
  creditMantou: vi.fn(),
  requireUserAuth: vi.fn(),
  requireAdmin: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
  createOrderReviewEdgeWrite: vi.fn(),
  onReviewSubmitted: vi.fn(),
}));

vi.mock("@/lib/admin/admin-store", () => ({
  getOrderById: mocks.getOrderById,
  getReviewByOrderId: mocks.getReviewByOrderId,
  creditMantou: mocks.creditMantou,
}));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));
vi.mock("@/lib/edge-db/review-write-store", () => ({
  createOrderReviewEdgeWrite: mocks.createOrderReviewEdgeWrite,
}));
vi.mock("@/lib/services/growth-service", () => ({ onReviewSubmitted: mocks.onReviewSubmitted }));

import { GET, POST } from "../route";

function makeCtx(orderId = "ORD-1") {
  return { params: Promise.resolve({ orderId }) };
}

const completedOrder = {
  id: "ORD-1",
  stage: "已完成",
  userAddress: VALID_ADDRESS,
  companionAddress: `0x${"b".repeat(64)}`,
};

describe("/api/orders/[orderId]/review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((value: string) => value);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.getReviewByOrderId.mockResolvedValue(null);
    mocks.createOrderReviewEdgeWrite.mockResolvedValue({
      id: "RV-1",
      orderId: "ORD-1",
      reviewerAddress: VALID_ADDRESS,
      companionAddress: completedOrder.companionAddress,
      rating: 5,
      content: "great",
      tags: ["技术好"],
      createdAt: 1_700_000_000_000,
    });
    mocks.creditMantou.mockResolvedValue(undefined);
    mocks.onReviewSubmitted.mockResolvedValue(undefined);
  });

  it("GET returns 404 when review not found", async () => {
    mocks.getReviewByOrderId.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/orders/ORD-1/review"), makeCtx());
    expect(res.status).toBe(404);
  });

  it("GET returns review for admin", async () => {
    mocks.getReviewByOrderId.mockResolvedValue({ id: "RV-1" });
    const res = await GET(new Request("http://localhost/api/orders/ORD-1/review"), makeCtx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "RV-1" });
  });

  it("POST rejects invalid address", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad", rating: 5 },
      rawBody: "{}",
    });
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);

    const res = await POST(
      new Request("http://localhost/api/orders/ORD-1/review", { method: "POST" }),
      makeCtx()
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_address");
  });

  it("POST returns 409 when already reviewed", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.getReviewByOrderId.mockResolvedValue({ id: "RV-1" });

    const res = await POST(
      new Request("http://localhost/api/orders/ORD-1/review", { method: "POST" }),
      makeCtx()
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_reviewed");
  });

  it("POST creates review and rewards user", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5, content: " great ", tags: ["技术好"] },
      rawBody: "{}",
    });

    const res = await POST(
      new Request("http://localhost/api/orders/ORD-1/review", { method: "POST" }),
      makeCtx()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.id).toBe("RV-1");
    expect(body.rewarded).toBe(5);
    expect(mocks.createOrderReviewEdgeWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-1",
        reviewerAddress: VALID_ADDRESS,
        content: "great",
      })
    );
    expect(mocks.creditMantou).toHaveBeenCalled();
    expect(mocks.onReviewSubmitted).toHaveBeenCalled();
  });

  it("POST still succeeds when reward side-effects fail", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, rating: 5 },
      rawBody: "{}",
    });
    mocks.creditMantou.mockRejectedValue(new Error("mantou failed"));
    mocks.onReviewSubmitted.mockRejectedValue(new Error("growth failed"));

    const res = await POST(
      new Request("http://localhost/api/orders/ORD-1/review", { method: "POST" }),
      makeCtx()
    );
    expect(res.status).toBe(200);
  });
});
