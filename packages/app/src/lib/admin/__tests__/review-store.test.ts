import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    orderReview: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
  Prisma: {},
}));

import { getReviewByOrderId, createReview, getReviewsByCompanion } from "../review-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");

const baseReviewRow = {
  id: "RV-1",
  orderId: "ORD-1",
  reviewerAddress: "0xreviewer",
  companionAddress: "0xcompanion",
  rating: 5,
  content: "很好的服务",
  tags: ["技术好", "态度好"],
  createdAt: now,
};

describe("getReviewByOrderId", () => {
  it("returns review when found", async () => {
    mockFindUnique.mockResolvedValue(baseReviewRow);

    const result = await getReviewByOrderId("ORD-1");
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ORD-1");
    expect(result!.rating).toBe(5);
    expect(result!.tags).toEqual(["技术好", "态度好"]);
  });

  it("returns null when not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getReviewByOrderId("ORD-999");
    expect(result).toBeNull();
  });

  it("maps null content to undefined", async () => {
    mockFindUnique.mockResolvedValue({ ...baseReviewRow, content: null });

    const result = await getReviewByOrderId("ORD-1");
    expect(result!.content).toBeUndefined();
  });

  it("maps non-array tags to undefined", async () => {
    mockFindUnique.mockResolvedValue({ ...baseReviewRow, tags: null });

    const result = await getReviewByOrderId("ORD-1");
    expect(result!.tags).toBeUndefined();
  });
});

describe("createReview", () => {
  it("creates a review", async () => {
    mockCreate.mockResolvedValue(baseReviewRow);

    const result = await createReview({
      orderId: "ORD-1",
      reviewerAddress: "0xreviewer",
      companionAddress: "0xcompanion",
      rating: 5,
      content: "很好的服务",
      tags: ["技术好", "态度好"],
    });

    expect(result.orderId).toBe("ORD-1");
    expect(result.rating).toBe(5);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("creates a review without optional content and tags", async () => {
    const rowNoOptional = { ...baseReviewRow, content: null, tags: [] };
    mockCreate.mockResolvedValue(rowNoOptional);

    const result = await createReview({
      orderId: "ORD-2",
      reviewerAddress: "0xreviewer",
      companionAddress: "0xcompanion",
      rating: 3,
    });

    expect(result.content).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("getReviewsByCompanion", () => {
  it("returns reviews with avgRating and total", async () => {
    mockFindMany.mockResolvedValue([
      { ...baseReviewRow, rating: 5 },
      { ...baseReviewRow, id: "RV-2", rating: 4 },
    ]);
    mockCount.mockResolvedValue(10);

    const result = await getReviewsByCompanion("0xcompanion");
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(10);
    expect(result.avgRating).toBe(4.5);
  });

  it("returns 0 avgRating when no reviews", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await getReviewsByCompanion("0xnobody");
    expect(result.items).toHaveLength(0);
    expect(result.avgRating).toBe(0);
    expect(result.total).toBe(0);
  });

  it("uses custom limit", async () => {
    mockFindMany.mockResolvedValue([baseReviewRow]);
    mockCount.mockResolvedValue(1);

    await getReviewsByCompanion("0xcompanion", 5);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });

  it("rounds avgRating to 1 decimal", async () => {
    mockFindMany.mockResolvedValue([
      { ...baseReviewRow, rating: 5 },
      { ...baseReviewRow, id: "RV-2", rating: 4 },
      { ...baseReviewRow, id: "RV-3", rating: 3 },
    ]);
    mockCount.mockResolvedValue(3);

    const result = await getReviewsByCompanion("0xcompanion");
    expect(result.avgRating).toBe(4);
  });

  it("maps tags as non-array to undefined", async () => {
    mockFindMany.mockResolvedValue([{ ...baseReviewRow, tags: "not-array" }]);
    mockCount.mockResolvedValue(1);

    const result = await getReviewsByCompanion("0xcompanion");
    expect(result.items[0].tags).toBeUndefined();
  });
});
