import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock("../../db", () => ({
  prisma: {
    chainEventCursor: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
    },
  },
}));

import {
  getChainEventCursor,
  updateChainEventCursor,
  CHAIN_EVENT_CURSOR_ID,
} from "../chain-event-cursor";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CHAIN_EVENT_CURSOR_ID", () => {
  it("has the default value", () => {
    expect(CHAIN_EVENT_CURSOR_ID).toBe("chain-orders");
  });
});

describe("getChainEventCursor", () => {
  it("returns null when no row found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getChainEventCursor();
    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "chain-orders" } });
  });

  it("returns cursor state when row exists with valid cursor", async () => {
    const now = new Date();
    mockFindUnique.mockResolvedValue({
      id: "chain-orders",
      cursor: { txDigest: "abc", eventSeq: "0" },
      lastEventAt: now,
      updatedAt: now,
    });
    const result = await getChainEventCursor();
    expect(result).not.toBeNull();
    expect(result!.id).toBe("chain-orders");
    expect(result!.cursor).toEqual({ txDigest: "abc", eventSeq: "0" });
    expect(result!.lastEventAt).toBe(now);
  });

  it("returns null cursor when stored cursor is invalid", async () => {
    mockFindUnique.mockResolvedValue({
      id: "chain-orders",
      cursor: { invalid: true },
      lastEventAt: null,
      updatedAt: null,
    });
    const result = await getChainEventCursor();
    expect(result!.cursor).toBeNull();
  });

  it("returns null cursor when stored cursor is null", async () => {
    mockFindUnique.mockResolvedValue({
      id: "chain-orders",
      cursor: null,
      lastEventAt: null,
      updatedAt: null,
    });
    const result = await getChainEventCursor();
    expect(result!.cursor).toBeNull();
  });

  it("returns null cursor when stored cursor is a primitive (not object)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "chain-orders",
      cursor: "not-an-object",
      lastEventAt: null,
      updatedAt: null,
    });
    const result = await getChainEventCursor();
    expect(result!.cursor).toBeNull();
  });

  it("returns null cursor when stored cursor has wrong shape", async () => {
    mockFindUnique.mockResolvedValue({
      id: "chain-orders",
      cursor: { txDigest: 123, eventSeq: "0" }, // txDigest is not string
      lastEventAt: null,
      updatedAt: null,
    });
    const result = await getChainEventCursor();
    expect(result!.cursor).toBeNull();
  });

  it("accepts custom id", async () => {
    mockFindUnique.mockResolvedValue(null);
    await getChainEventCursor("custom-id");
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "custom-id" } });
  });
});

describe("updateChainEventCursor", () => {
  it("upserts cursor with default id", async () => {
    const cursor = { txDigest: "d1", eventSeq: "0" };
    mockUpsert.mockResolvedValue({ id: "chain-orders", cursor });
    await updateChainEventCursor({ cursor });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where.id).toBe("chain-orders");
    expect(call.create.id).toBe("chain-orders");
    expect(call.create.cursor).toEqual(cursor);
  });

  it("uses custom id when provided", async () => {
    const cursor = { txDigest: "d2", eventSeq: "1" };
    mockUpsert.mockResolvedValue({ id: "custom", cursor });
    await updateChainEventCursor({ id: "custom", cursor });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where.id).toBe("custom");
  });

  it("sets lastEventAt when lastEventMs is provided", async () => {
    const cursor = { txDigest: "d3", eventSeq: "2" };
    const lastEventMs = 1700000000000;
    mockUpsert.mockResolvedValue({ id: "chain-orders", cursor });
    await updateChainEventCursor({ cursor, lastEventMs });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.lastEventAt).toEqual(new Date(lastEventMs));
    expect(call.update.lastEventAt).toEqual(new Date(lastEventMs));
  });

  it("sets lastEventAt to null when lastEventMs is not provided", async () => {
    const cursor = { txDigest: "d4", eventSeq: "3" };
    mockUpsert.mockResolvedValue({ id: "chain-orders", cursor });
    await updateChainEventCursor({ cursor });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.lastEventAt).toBeNull();
    expect(call.update.lastEventAt).toBeNull();
  });
});
