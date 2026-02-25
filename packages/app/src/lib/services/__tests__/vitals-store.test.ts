import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateMany = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    webVital: {
      createMany: (...args: unknown[]) => mockCreateMany(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { persistVitals, getVitalsTrend, getVitalsPageSummary } from "../vitals-store";

describe("vitals-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("persistVitals", () => {
    it("does nothing for empty array", async () => {
      await persistVitals([]);
      expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it("batch-inserts entries", async () => {
      mockCreateMany.mockResolvedValue({ count: 2 });
      await persistVitals([
        { name: "LCP", value: 2500, rating: "good", page: "/home", timestamp: 1700000000000 },
        { name: "CLS", value: 0.1, rating: "good", page: "/about" },
      ]);
      expect(mockCreateMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: "LCP", value: 2500, rating: "good", page: "/home" }),
          expect.objectContaining({ name: "CLS", value: 0.1, rating: "good", page: "/about" }),
        ]),
      });
    });

    it("uses provided timestamp for createdAt", async () => {
      mockCreateMany.mockResolvedValue({ count: 1 });
      const ts = 1700000000000;
      await persistVitals([{ name: "FCP", value: 1000, rating: "good", page: "/", timestamp: ts }]);
      const call = mockCreateMany.mock.calls[0][0];
      expect(call.data[0].createdAt).toEqual(new Date(ts));
    });
    it("defaults createdAt to now when no timestamp", async () => {
      mockCreateMany.mockResolvedValue({ count: 1 });
      const before = Date.now();
      await persistVitals([{ name: "FCP", value: 1000, rating: "good", page: "/" }]);
      const call = mockCreateMany.mock.calls[0][0];
      expect(call.data[0].createdAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe("getVitalsTrend", () => {
    it("returns daily buckets with percentiles", async () => {
      mockFindMany.mockResolvedValue([
        { value: 1000, rating: "good", createdAt: new Date("2025-01-01T10:00:00Z") },
        { value: 2000, rating: "good", createdAt: new Date("2025-01-01T14:00:00Z") },
        { value: 3000, rating: "needs-improvement", createdAt: new Date("2025-01-02T10:00:00Z") },
      ]);
      const result = await getVitalsTrend("LCP", 7);
      expect(result).toHaveLength(2);
      expect(result[0].day).toBe("2025-01-01");
      expect(result[0].count).toBe(2);
      expect(result[1].day).toBe("2025-01-02");
      expect(result[1].count).toBe(1);
    });

    it("returns empty array when no data", async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await getVitalsTrend("LCP", 7);
      expect(result).toEqual([]);
    });

    it("queries with correct date range", async () => {
      mockFindMany.mockResolvedValue([]);
      const before = Date.now();
      await getVitalsTrend("CLS", 30);
      const call = mockFindMany.mock.calls[0][0];
      expect(call.where.name).toBe("CLS");
      const since = call.where.createdAt.gte.getTime();
      expect(since).toBeLessThanOrEqual(before - 29 * 86400_000);
      expect(since).toBeGreaterThanOrEqual(before - 31 * 86400_000);
    });
  });

  describe("getVitalsPageSummary", () => {
    it("aggregates metrics by name for a page", async () => {
      mockFindMany.mockResolvedValue([
        { name: "LCP", value: 2500, rating: "good" },
        { name: "LCP", value: 4000, rating: "poor" },
        { name: "CLS", value: 0.1, rating: "good" },
      ]);
      const result = await getVitalsPageSummary("/home");
      expect(result).toHaveLength(2);
      const lcp = result.find((r) => r.name === "LCP");
      expect(lcp?.count).toBe(2);
      expect(lcp?.good).toBe(1);
      expect(lcp?.poor).toBe(1);
      const cls = result.find((r) => r.name === "CLS");
      expect(cls?.count).toBe(1);
      expect(cls?.good).toBe(1);
    });

    it("returns empty array when no data", async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await getVitalsPageSummary("/empty");
      expect(result).toEqual([]);
    });

    it("counts needs-improvement rating", async () => {
      mockFindMany.mockResolvedValue([{ name: "INP", value: 300, rating: "needs-improvement" }]);
      const result = await getVitalsPageSummary("/page");
      expect(result[0].needs_improvement).toBe(1);
    });

    it("queries with correct page filter", async () => {
      mockFindMany.mockResolvedValue([]);
      await getVitalsPageSummary("/test-page");
      const call = mockFindMany.mock.calls[0][0];
      expect(call.where.page).toBe("/test-page");
    });
  });
});
