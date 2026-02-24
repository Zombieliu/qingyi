import { describe, it, expect } from "vitest";
import { buildCursorPayload, appendCursorWhere, type CursorPayload } from "../admin-store-utils";

vi.mock("@/lib/db", () => ({
  prisma: {},
}));

describe("admin-store-utils", () => {
  describe("buildCursorPayload", () => {
    it("builds cursor from row with id and createdAt", () => {
      const row = { id: "abc123", createdAt: new Date("2024-01-15T10:00:00Z") };
      const result = buildCursorPayload(row);
      expect(result).toEqual({
        id: "abc123",
        createdAt: new Date("2024-01-15T10:00:00Z").getTime(),
      });
    });

    it("returns numeric timestamp", () => {
      const row = { id: "x", createdAt: new Date(1700000000000) };
      const result = buildCursorPayload(row);
      expect(result.createdAt).toBe(1700000000000);
    });
  });

  describe("appendCursorWhere", () => {
    it("does nothing when cursor is undefined", () => {
      const where: { AND?: unknown } = {};
      appendCursorWhere(where, undefined);
      expect(where.AND).toBeUndefined();
    });

    it("adds AND condition when no existing AND", () => {
      const where: { AND?: unknown } = {};
      const cursor: CursorPayload = { createdAt: 1700000000000, id: "abc" };
      appendCursorWhere(where, cursor);
      expect(where.AND).toBeDefined();
      expect(Array.isArray(where.AND)).toBe(true);
      const conditions = where.AND as unknown[];
      expect(conditions).toHaveLength(1);
    });

    it("appends to existing AND array", () => {
      const existing = { status: "active" };
      const where: { AND?: unknown } = { AND: [existing] };
      const cursor: CursorPayload = { createdAt: 1700000000000, id: "abc" };
      appendCursorWhere(where, cursor);
      const conditions = where.AND as unknown[];
      expect(conditions).toHaveLength(2);
      expect(conditions[0]).toBe(existing);
    });

    it("wraps non-array AND into array", () => {
      const existing = { status: "active" };
      const where: { AND?: unknown } = { AND: existing };
      const cursor: CursorPayload = { createdAt: 1700000000000, id: "abc" };
      appendCursorWhere(where, cursor);
      const conditions = where.AND as unknown[];
      expect(conditions).toHaveLength(2);
      expect(conditions[0]).toBe(existing);
    });

    it("creates OR condition with lt date and same-date id comparison", () => {
      const where: { AND?: unknown } = {};
      const cursor: CursorPayload = { createdAt: 1700000000000, id: "abc" };
      appendCursorWhere(where, cursor);
      const conditions = where.AND as { OR: unknown[] }[];
      const orCondition = conditions[0].OR;
      expect(orCondition).toHaveLength(2);
    });
  });
});
