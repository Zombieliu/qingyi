import { describe, it, expect, vi, beforeEach } from "vitest";
import { notDeleted, softDelete, restore } from "../soft-delete";

describe("soft-delete utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  describe("notDeleted", () => {
    it("returns a where clause fragment filtering out deleted rows", () => {
      expect(notDeleted).toEqual({ deletedAt: null });
    });

    it("is a frozen-shape constant (no deletedAt value)", () => {
      expect(notDeleted.deletedAt).toBeNull();
    });
  });

  describe("softDelete", () => {
    it("returns an object with deletedAt set to current time", () => {
      const result = softDelete();
      expect(result).toEqual({ deletedAt: new Date("2025-06-01T12:00:00Z") });
    });

    it("returns a fresh Date on each call", () => {
      const a = softDelete();
      vi.advanceTimersByTime(1000);
      const b = softDelete();
      expect(b.deletedAt.getTime()).toBe(a.deletedAt.getTime() + 1000);
    });
  });

  describe("restore", () => {
    it("returns an object with deletedAt set to null", () => {
      expect(restore()).toEqual({ deletedAt: null });
    });
  });

  describe("integration pattern", () => {
    it("notDeleted can be spread into a Prisma-like where object", () => {
      const where = { status: "active", ...notDeleted };
      expect(where).toEqual({ status: "active", deletedAt: null });
    });

    it("softDelete result can be spread into a Prisma-like data object", () => {
      const data = { updatedAt: new Date(), ...softDelete() };
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.updatedAt).toBeInstanceOf(Date);
    });

    it("restore result can be spread into a Prisma-like data object", () => {
      const data = { updatedAt: new Date(), ...restore() };
      expect(data.deletedAt).toBeNull();
    });
  });
});
