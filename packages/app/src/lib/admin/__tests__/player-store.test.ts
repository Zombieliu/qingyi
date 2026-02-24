import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  adminPlayer: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  adminOrder: {
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}));

vi.mock("../admin-store-utils", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("@/lib/shared/constants", () => ({
  DIAMOND_RATE: 10,
}));

import {
  listPlayers,
  getPlayerById,
  getCompanionEarnings,
  listPlayersPublic,
  getPlayerByAddress,
  updatePlayerStatusByAddress,
  addPlayer,
  updatePlayer,
  removePlayer,
  removePlayers,
} from "../player-store";

function makePlayerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "player-1",
    name: "TestPlayer",
    role: "代练",
    contact: "wechat123",
    address: "0xPLAYER",
    wechatQr: null,
    alipayQr: null,
    depositBase: 1000,
    depositLocked: 0,
    creditMultiplier: 2,
    status: "可接单",
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    ...overrides,
  };
}

describe("player-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listPlayers", () => {
    it("should return players with credit info", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow()]);
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      const result = await listPlayers();
      expect(result).toHaveLength(1);
      expect(result[0].creditLimit).toBeDefined();
      expect(result[0].usedCredit).toBe(0);
      expect(result[0].availableCredit).toBeDefined();
    });

    it("should calculate credit from depositBase and DIAMOND_RATE", async () => {
      // depositBase=1000, DIAMOND_RATE=10, multiplier=2 => creditLimit = (1000/10)*2 = 200
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow()]);
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      const result = await listPlayers();
      expect(result[0].creditLimit).toBe(200);
    });

    it("should subtract used credit from active orders", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow()]);
      mockPrisma.adminOrder.groupBy.mockResolvedValue([
        { assignedTo: "player-1", _sum: { amount: 50 } },
      ]);
      const result = await listPlayers();
      expect(result[0].usedCredit).toBe(50);
      expect(result[0].availableCredit).toBe(150);
    });

    it("should clamp creditMultiplier between 1 and 5", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow({ creditMultiplier: 10 })]);
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      const result = await listPlayers();
      expect(result[0].creditMultiplier).toBe(5);
    });
  });

  describe("getPlayerById", () => {
    it("should return mapped player when found", async () => {
      mockPrisma.adminPlayer.findUnique.mockResolvedValue(makePlayerRow());
      const result = await getPlayerById("player-1");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("TestPlayer");
    });

    it("should return null when not found", async () => {
      mockPrisma.adminPlayer.findUnique.mockResolvedValue(null);
      const result = await getPlayerById("nonexistent");
      expect(result).toBeNull();
    });

    it("should return null for empty id", async () => {
      const result = await getPlayerById("");
      expect(result).toBeNull();
    });
  });

  describe("getCompanionEarnings", () => {
    it("should return grouped earnings with player names", async () => {
      mockPrisma.adminOrder.groupBy.mockResolvedValue([
        {
          companionAddress: "0xPLAYER",
          _count: { id: 5 },
          _sum: { amount: 500, serviceFee: 50 },
          _max: { createdAt: new Date("2026-01-15") },
        },
      ]);
      mockPrisma.adminOrder.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _sum: { amount: 500, serviceFee: 50 },
      });
      mockPrisma.adminPlayer.findMany.mockResolvedValue([
        { address: "0xPLAYER", name: "TestPlayer" },
      ]);
      const result = await getCompanionEarnings();
      expect(result.totals.orderCount).toBe(5);
      expect(result.items[0].companionName).toBe("TestPlayer");
      expect(result.items[0].totalAmount).toBe(500);
    });

    it("should filter by from and to date range", async () => {
      const from = new Date("2026-01-01").getTime();
      const to = new Date("2026-01-31").getTime();
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      mockPrisma.adminOrder.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { amount: 0, serviceFee: 0 },
      });
      await getCompanionEarnings({ from, to });
      const groupByCall = mockPrisma.adminOrder.groupBy.mock.calls[0][0];
      expect(groupByCall.where.createdAt).toBeDefined();
      expect(groupByCall.where.createdAt.gte).toEqual(new Date(from));
      expect(groupByCall.where.createdAt.lte).toEqual(new Date(to));
    });

    it("should filter by from date only", async () => {
      const from = new Date("2026-01-01").getTime();
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      mockPrisma.adminOrder.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { amount: 0, serviceFee: 0 },
      });
      await getCompanionEarnings({ from });
      const groupByCall = mockPrisma.adminOrder.groupBy.mock.calls[0][0];
      expect(groupByCall.where.createdAt.gte).toEqual(new Date(from));
      expect(groupByCall.where.createdAt.lte).toBeUndefined();
    });

    it("should filter by to date only", async () => {
      const to = new Date("2026-01-31").getTime();
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      mockPrisma.adminOrder.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { amount: 0, serviceFee: 0 },
      });
      await getCompanionEarnings({ to });
      const groupByCall = mockPrisma.adminOrder.groupBy.mock.calls[0][0];
      expect(groupByCall.where.createdAt.lte).toEqual(new Date(to));
      expect(groupByCall.where.createdAt.gte).toBeUndefined();
    });

    it("should respect custom limit", async () => {
      mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
      mockPrisma.adminOrder.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { amount: 0, serviceFee: 0 },
      });
      await getCompanionEarnings({ limit: 10 });
      const groupByCall = mockPrisma.adminOrder.groupBy.mock.calls[0][0];
      expect(groupByCall.take).toBe(10);
    });

    it("should handle null lastCompletedAt", async () => {
      mockPrisma.adminOrder.groupBy.mockResolvedValue([
        {
          companionAddress: "0xPLAYER",
          _count: { id: 1 },
          _sum: { amount: 100, serviceFee: 10 },
          _max: { createdAt: null },
        },
      ]);
      mockPrisma.adminOrder.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _sum: { amount: 100, serviceFee: 10 },
      });
      mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
      const result = await getCompanionEarnings();
      expect(result.items[0].lastCompletedAt).toBeNull();
    });
  });

  describe("listPlayersPublic", () => {
    it("should return public fields only", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([
        { id: "p1", name: "A", role: "代练", status: "可接单", depositBase: 100, depositLocked: 0 },
      ]);
      const result = await listPlayersPublic();
      expect(result[0]).toEqual({
        id: "p1",
        name: "A",
        role: "代练",
        status: "可接单",
        depositBase: 100,
        depositLocked: 0,
      });
    });

    it("should handle null optional fields", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([
        {
          id: "p2",
          name: "B",
          role: null,
          status: "可接单",
          depositBase: null,
          depositLocked: null,
        },
      ]);
      const result = await listPlayersPublic();
      expect(result[0].role).toBeUndefined();
      expect(result[0].depositBase).toBeUndefined();
      expect(result[0].depositLocked).toBeUndefined();
    });
  });

  describe("getPlayerByAddress", () => {
    it("should return player when exactly one match", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow()]);
      const result = await getPlayerByAddress("0xPLAYER");
      expect(result.player).not.toBeNull();
      expect(result.conflict).toBe(false);
    });

    it("should return conflict when multiple matches", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([
        makePlayerRow(),
        makePlayerRow({ id: "p2" }),
      ]);
      const result = await getPlayerByAddress("0xPLAYER");
      expect(result.player).toBeNull();
      expect(result.conflict).toBe(true);
    });

    it("should return null player for empty address", async () => {
      const result = await getPlayerByAddress("");
      expect(result.player).toBeNull();
      expect(result.conflict).toBe(false);
    });

    it("should return null player when no match", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
      const result = await getPlayerByAddress("0xNONE");
      expect(result.player).toBeNull();
      expect(result.conflict).toBe(false);
    });
  });

  describe("updatePlayerStatusByAddress", () => {
    it("should update status and return player", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow()]);
      mockPrisma.adminPlayer.update.mockResolvedValue(makePlayerRow({ status: "忙碌" }));
      const result = await updatePlayerStatusByAddress("0xPLAYER", "忙碌");
      expect(result.player).not.toBeNull();
      expect(result.player!.status).toBe("忙碌");
    });

    it("should return null on update error", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([makePlayerRow()]);
      mockPrisma.adminPlayer.update.mockRejectedValue(new Error("fail"));
      const result = await updatePlayerStatusByAddress("0xPLAYER", "忙碌");
      expect(result.player).toBeNull();
    });

    it("should return null for empty address", async () => {
      const result = await updatePlayerStatusByAddress("", "忙碌");
      expect(result.player).toBeNull();
      expect(result.conflict).toBe(false);
    });

    it("should return null when no match", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
      const result = await updatePlayerStatusByAddress("0xNONE", "忙碌");
      expect(result.player).toBeNull();
      expect(result.conflict).toBe(false);
    });

    it("should return conflict when multiple matches", async () => {
      mockPrisma.adminPlayer.findMany.mockResolvedValue([
        makePlayerRow(),
        makePlayerRow({ id: "p2" }),
      ]);
      const result = await updatePlayerStatusByAddress("0xPLAYER", "忙碌");
      expect(result.player).toBeNull();
      expect(result.conflict).toBe(true);
    });
  });

  describe("addPlayer", () => {
    it("should create and return mapped player", async () => {
      mockPrisma.adminPlayer.create.mockResolvedValue(makePlayerRow());
      const player = {
        id: "player-1",
        name: "TestPlayer",
        status: "可接单" as const,
        createdAt: Date.now(),
      };
      const result = await addPlayer(player);
      expect(result.id).toBe("player-1");
    });

    it("should handle player with all null optional fields", async () => {
      mockPrisma.adminPlayer.create.mockResolvedValue(
        makePlayerRow({
          role: null,
          contact: null,
          address: null,
          wechatQr: null,
          alipayQr: null,
          depositBase: null,
          depositLocked: null,
          creditMultiplier: null,
          notes: null,
          updatedAt: null,
        })
      );
      const player = {
        id: "player-2",
        name: "MinimalPlayer",
        status: "可接单" as const,
        createdAt: Date.now(),
      };
      const result = await addPlayer(player);
      expect(result.role).toBeUndefined();
      expect(result.contact).toBeUndefined();
      expect(result.address).toBeUndefined();
      expect(result.wechatQr).toBeUndefined();
      expect(result.alipayQr).toBeUndefined();
      expect(result.depositBase).toBeUndefined();
      expect(result.depositLocked).toBeUndefined();
      expect(result.creditMultiplier).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });

    it("should handle player with updatedAt set", async () => {
      const updatedDate = new Date("2026-02-01");
      mockPrisma.adminPlayer.create.mockResolvedValue(makePlayerRow({ updatedAt: updatedDate }));
      const player = {
        id: "player-3",
        name: "UpdatedPlayer",
        status: "可接单" as const,
        createdAt: Date.now(),
        updatedAt: updatedDate.getTime(),
      };
      const result = await addPlayer(player);
      expect(result.updatedAt).toBe(updatedDate.getTime());
    });
  });

  describe("updatePlayer", () => {
    it("should update and return mapped player", async () => {
      mockPrisma.adminPlayer.update.mockResolvedValue(makePlayerRow({ name: "NewName" }));
      const result = await updatePlayer("player-1", { name: "NewName" });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("NewName");
    });

    it("should return null on error", async () => {
      mockPrisma.adminPlayer.update.mockRejectedValue(new Error("not found"));
      const result = await updatePlayer("nonexistent", { name: "X" });
      expect(result).toBeNull();
    });
  });

  describe("removePlayer", () => {
    it("should return true on success", async () => {
      mockPrisma.adminPlayer.delete.mockResolvedValue({});
      const result = await removePlayer("player-1");
      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      mockPrisma.adminPlayer.delete.mockRejectedValue(new Error("not found"));
      const result = await removePlayer("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("removePlayers", () => {
    it("should delete multiple and return count", async () => {
      mockPrisma.adminPlayer.deleteMany.mockResolvedValue({ count: 3 });
      const result = await removePlayers(["p1", "p2", "p3"]);
      expect(result).toBe(3);
    });

    it("should return 0 for empty array", async () => {
      const result = await removePlayers([]);
      expect(result).toBe(0);
    });
  });
});
