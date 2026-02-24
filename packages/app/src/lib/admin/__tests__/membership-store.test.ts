import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTierCount = vi.fn();
const mockTierFindMany = vi.fn();
const mockTierFindUnique = vi.fn();
const mockTierCreate = vi.fn();
const mockTierUpdate = vi.fn();
const mockTierDelete = vi.fn();
const mockMemberCount = vi.fn();
const mockMemberFindMany = vi.fn();
const mockMemberFindFirst = vi.fn();
const mockMemberCreate = vi.fn();
const mockMemberUpdate = vi.fn();
const mockMemberDelete = vi.fn();
const mockRequestCount = vi.fn();
const mockRequestFindMany = vi.fn();
const mockRequestCreate = vi.fn();
const mockRequestUpdate = vi.fn();
const mockRequestDelete = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    adminMembershipTier: {
      count: (...args: unknown[]) => mockTierCount(...args),
      findMany: (...args: unknown[]) => mockTierFindMany(...args),
      findUnique: (...args: unknown[]) => mockTierFindUnique(...args),
      create: (...args: unknown[]) => mockTierCreate(...args),
      update: (...args: unknown[]) => mockTierUpdate(...args),
      delete: (...args: unknown[]) => mockTierDelete(...args),
    },
    adminMember: {
      count: (...args: unknown[]) => mockMemberCount(...args),
      findMany: (...args: unknown[]) => mockMemberFindMany(...args),
      findFirst: (...args: unknown[]) => mockMemberFindFirst(...args),
      create: (...args: unknown[]) => mockMemberCreate(...args),
      update: (...args: unknown[]) => mockMemberUpdate(...args),
      delete: (...args: unknown[]) => mockMemberDelete(...args),
    },
    adminMembershipRequest: {
      count: (...args: unknown[]) => mockRequestCount(...args),
      findMany: (...args: unknown[]) => mockRequestFindMany(...args),
      create: (...args: unknown[]) => mockRequestCreate(...args),
      update: (...args: unknown[]) => mockRequestUpdate(...args),
      delete: (...args: unknown[]) => mockRequestDelete(...args),
    },
  },
  Prisma: {
    DbNull: "DbNull",
  },
  appendCursorWhere: vi.fn(),
  buildCursorPayload: vi.fn().mockReturnValue({ id: "x", createdAt: 0 }),
}));

import {
  queryMembershipTiers,
  queryMembershipTiersCursor,
  listActiveMembershipTiers,
  getMembershipTierById,
  addMembershipTier,
  updateMembershipTier,
  removeMembershipTier,
  queryMembers,
  queryMembersCursor,
  getMemberByAddress,
  addMember,
  updateMember,
  removeMember,
  queryMembershipRequests,
  queryMembershipRequestsCursor,
  addMembershipRequest,
  updateMembershipRequest,
  removeMembershipRequest,
} from "../membership-store";

beforeEach(() => {
  vi.clearAllMocks();
  delete (process.env as Record<string, unknown>).NEXT_PUBLIC_VISUAL_TEST;
  delete (process.env as Record<string, unknown>).VISUAL_TEST;
});

const now = new Date("2026-01-15T10:00:00Z");

const baseTierRow = {
  id: "TIER-1",
  name: "黄金会员",
  level: 1,
  badge: "gold",
  price: 99.9,
  durationDays: 30,
  minPoints: 100,
  status: "上架",
  perks: [{ label: "折扣", desc: "9折" }],
  createdAt: now,
  updatedAt: null,
};

const baseMemberRow = {
  id: "MEM-1",
  userAddress: "0xuser1",
  userName: "Alice",
  tierId: "TIER-1",
  tierName: "黄金会员",
  points: 200,
  status: "有效",
  expiresAt: new Date("2026-12-31"),
  note: "VIP",
  createdAt: now,
  updatedAt: null,
};

const baseRequestRow = {
  id: "REQ-1",
  userAddress: "0xuser1",
  userName: "Alice",
  contact: "alice@test.com",
  tierId: "TIER-1",
  tierName: "黄金会员",
  status: "待审核",
  note: null,
  meta: null,
  createdAt: now,
  updatedAt: null,
};

// ---- Membership Tiers ----

describe("queryMembershipTiers", () => {
  it("returns paginated tiers", async () => {
    mockTierCount.mockResolvedValue(15);
    mockTierFindMany.mockResolvedValue([baseTierRow]);

    const result = await queryMembershipTiers({ page: 1, pageSize: 10 });
    expect(result.total).toBe(15);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("黄金会员");
  });

  it("filters by status", async () => {
    mockTierCount.mockResolvedValue(5);
    mockTierFindMany.mockResolvedValue([]);

    await queryMembershipTiers({ page: 1, pageSize: 10, status: "上架" });
    expect(mockTierCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "上架" }) })
    );
  });

  it("ignores status filter for 全部", async () => {
    mockTierCount.mockResolvedValue(10);
    mockTierFindMany.mockResolvedValue([]);

    await queryMembershipTiers({ page: 1, pageSize: 10, status: "全部" });
    expect(mockTierCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ status: "全部" }) })
    );
  });

  it("filters by keyword", async () => {
    mockTierCount.mockResolvedValue(1);
    mockTierFindMany.mockResolvedValue([baseTierRow]);

    await queryMembershipTiers({ page: 1, pageSize: 10, q: "黄金" });
    expect(mockTierCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });
});

describe("queryMembershipTiersCursor", () => {
  it("returns items with nextCursor when hasMore", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...baseTierRow,
      id: `TIER-${i}`,
    }));
    mockTierFindMany.mockResolvedValue(rows);

    const result = await queryMembershipTiersCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns null nextCursor when no more", async () => {
    mockTierFindMany.mockResolvedValue([baseTierRow]);

    const result = await queryMembershipTiersCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("filters by keyword", async () => {
    mockTierFindMany.mockResolvedValue([]);

    await queryMembershipTiersCursor({ pageSize: 10, q: "黄金" });
    expect(mockTierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("filters by status", async () => {
    mockTierFindMany.mockResolvedValue([]);

    await queryMembershipTiersCursor({ pageSize: 10, status: "上架" });
    expect(mockTierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "上架" }) })
    );
  });

  it("does not filter status for 全部", async () => {
    mockTierFindMany.mockResolvedValue([]);

    await queryMembershipTiersCursor({ pageSize: 10, status: "全部" });
    const call = mockTierFindMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });
});

describe("listActiveMembershipTiers", () => {
  it("returns active tiers", async () => {
    mockTierFindMany.mockResolvedValue([baseTierRow]);

    const result = await listActiveMembershipTiers();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("上架");
  });

  it("returns empty array in visual test mode", async () => {
    process.env.NEXT_PUBLIC_VISUAL_TEST = "1";

    const result = await listActiveMembershipTiers();
    expect(result).toEqual([]);
    expect(mockTierFindMany).not.toHaveBeenCalled();
  });
});

describe("getMembershipTierById", () => {
  it("returns tier when found", async () => {
    mockTierFindUnique.mockResolvedValue(baseTierRow);

    const result = await getMembershipTierById("TIER-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("TIER-1");
  });

  it("returns null when not found", async () => {
    mockTierFindUnique.mockResolvedValue(null);

    const result = await getMembershipTierById("TIER-999");
    expect(result).toBeNull();
  });
});

describe("addMembershipTier", () => {
  it("creates a new tier", async () => {
    mockTierCreate.mockResolvedValue(baseTierRow);

    const result = await addMembershipTier({
      id: "TIER-1",
      name: "黄金会员",
      level: 1,
      badge: "gold",
      price: 99.9,
      durationDays: 30,
      minPoints: 100,
      status: "上架",
      perks: [{ label: "折扣", desc: "9折" }],
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("TIER-1");
    expect(result.price).toBe(99.9);
    expect(mockTierCreate).toHaveBeenCalledTimes(1);
  });

  it("handles tier with all null optional fields", async () => {
    mockTierCreate.mockResolvedValue({
      ...baseTierRow,
      badge: null,
      price: null,
      durationDays: null,
      minPoints: null,
      perks: null,
      updatedAt: null,
    });

    const result = await addMembershipTier({
      id: "TIER-2",
      name: "基础会员",
      level: 0,
      status: "上架",
      createdAt: now.getTime(),
    });

    expect(result.badge).toBeUndefined();
    expect(result.price).toBeUndefined();
    expect(result.durationDays).toBeUndefined();
    expect(result.minPoints).toBeUndefined();
    expect(result.perks).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  it("handles tier with updatedAt set", async () => {
    const updatedDate = new Date("2026-06-01");
    mockTierCreate.mockResolvedValue({ ...baseTierRow, updatedAt: updatedDate });

    const result = await addMembershipTier({
      id: "TIER-3",
      name: "更新会员",
      level: 2,
      status: "上架",
      createdAt: now.getTime(),
      updatedAt: updatedDate.getTime(),
    });

    expect(result.updatedAt).toBe(updatedDate.getTime());
  });
});

describe("updateMembershipTier", () => {
  it("updates tier and returns result", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, name: "白金会员" });

    const result = await updateMembershipTier("TIER-1", { name: "白金会员" });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("白金会员");
  });

  it("returns null on error", async () => {
    mockTierUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateMembershipTier("TIER-999", { name: "x" });
    expect(result).toBeNull();
  });

  it("handles numeric price update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, price: 199.9 });
    const result = await updateMembershipTier("TIER-1", { price: 199.9 });
    expect(result).not.toBeNull();
    expect(result!.price).toBe(199.9);
  });

  it("handles null price update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, price: null });
    const result = await updateMembershipTier("TIER-1", { price: null as unknown as undefined });
    expect(result).not.toBeNull();
  });

  it("handles numeric durationDays update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, durationDays: 60 });
    const result = await updateMembershipTier("TIER-1", { durationDays: 60 });
    expect(result).not.toBeNull();
  });

  it("handles null durationDays update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, durationDays: null });
    const result = await updateMembershipTier("TIER-1", {
      durationDays: null as unknown as undefined,
    });
    expect(result).not.toBeNull();
  });

  it("handles numeric minPoints update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, minPoints: 200 });
    const result = await updateMembershipTier("TIER-1", { minPoints: 200 });
    expect(result).not.toBeNull();
  });

  it("handles null minPoints update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, minPoints: null });
    const result = await updateMembershipTier("TIER-1", {
      minPoints: null as unknown as undefined,
    });
    expect(result).not.toBeNull();
  });

  it("handles perks update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, perks: [{ label: "新特权" }] });
    const result = await updateMembershipTier("TIER-1", { perks: [{ label: "新特权" }] });
    expect(result).not.toBeNull();
  });

  it("handles null perks update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, perks: null });
    const result = await updateMembershipTier("TIER-1", { perks: null as unknown as undefined });
    expect(result).not.toBeNull();
  });

  it("handles numeric level update", async () => {
    mockTierUpdate.mockResolvedValue({ ...baseTierRow, level: 3 });
    const result = await updateMembershipTier("TIER-1", { level: 3 });
    expect(result).not.toBeNull();
  });
});

describe("removeMembershipTier", () => {
  it("returns true on success", async () => {
    mockTierDelete.mockResolvedValue(baseTierRow);

    const result = await removeMembershipTier("TIER-1");
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    mockTierDelete.mockRejectedValue(new Error("not found"));

    const result = await removeMembershipTier("TIER-999");
    expect(result).toBe(false);
  });
});

// ---- Members ----

describe("queryMembers", () => {
  it("returns paginated members", async () => {
    mockMemberCount.mockResolvedValue(20);
    mockMemberFindMany.mockResolvedValue([baseMemberRow]);

    const result = await queryMembers({ page: 1, pageSize: 10 });
    expect(result.total).toBe(20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].userName).toBe("Alice");
  });

  it("filters by keyword", async () => {
    mockMemberCount.mockResolvedValue(1);
    mockMemberFindMany.mockResolvedValue([baseMemberRow]);

    await queryMembers({ page: 1, pageSize: 10, q: "Alice" });
    expect(mockMemberCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });
});

describe("queryMembersCursor", () => {
  it("returns cursor-based results", async () => {
    mockMemberFindMany.mockResolvedValue([baseMemberRow]);

    const result = await queryMembersCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("filters by keyword", async () => {
    mockMemberFindMany.mockResolvedValue([]);

    await queryMembersCursor({ pageSize: 10, q: "Alice" });
    expect(mockMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("filters by status", async () => {
    mockMemberFindMany.mockResolvedValue([]);

    await queryMembersCursor({ pageSize: 10, status: "有效" });
    expect(mockMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "有效" }) })
    );
  });

  it("does not filter status for 全部", async () => {
    mockMemberFindMany.mockResolvedValue([]);

    await queryMembersCursor({ pageSize: 10, status: "全部" });
    const call = mockMemberFindMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });
});

describe("getMemberByAddress", () => {
  it("returns member when found", async () => {
    mockMemberFindFirst.mockResolvedValue(baseMemberRow);

    const result = await getMemberByAddress("0xuser1");
    expect(result).not.toBeNull();
    expect(result!.userAddress).toBe("0xuser1");
  });

  it("returns null when not found", async () => {
    mockMemberFindFirst.mockResolvedValue(null);

    const result = await getMemberByAddress("0xnobody");
    expect(result).toBeNull();
  });

  it("returns null in visual test mode", async () => {
    process.env.VISUAL_TEST = "1";

    const result = await getMemberByAddress("0xuser1");
    expect(result).toBeNull();
    expect(mockMemberFindFirst).not.toHaveBeenCalled();
  });
});

describe("addMember", () => {
  it("creates a new member", async () => {
    mockMemberCreate.mockResolvedValue(baseMemberRow);

    const result = await addMember({
      id: "MEM-1",
      userAddress: "0xuser1",
      userName: "Alice",
      tierId: "TIER-1",
      tierName: "黄金会员",
      points: 200,
      status: "有效",
      expiresAt: new Date("2026-12-31").getTime(),
      note: "VIP",
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("MEM-1");
    expect(mockMemberCreate).toHaveBeenCalledTimes(1);
  });

  it("handles member with all null optional fields", async () => {
    mockMemberCreate.mockResolvedValue({
      ...baseMemberRow,
      userAddress: null,
      userName: null,
      tierId: null,
      tierName: null,
      points: null,
      expiresAt: null,
      note: null,
      updatedAt: null,
    });

    const result = await addMember({
      id: "MEM-2",
      status: "有效",
      createdAt: now.getTime(),
    });

    expect(result.userAddress).toBeUndefined();
    expect(result.userName).toBeUndefined();
    expect(result.tierId).toBeUndefined();
    expect(result.tierName).toBeUndefined();
    expect(result.points).toBeUndefined();
    expect(result.expiresAt).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });
});

describe("updateMember", () => {
  it("updates member and returns result", async () => {
    mockMemberUpdate.mockResolvedValue({ ...baseMemberRow, points: 300 });

    const result = await updateMember("MEM-1", { points: 300 });
    expect(result).not.toBeNull();
    expect(result!.points).toBe(300);
  });

  it("returns null on error", async () => {
    mockMemberUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateMember("MEM-999", { points: 0 });
    expect(result).toBeNull();
  });

  it("handles null points update", async () => {
    mockMemberUpdate.mockResolvedValue({ ...baseMemberRow, points: null });
    const result = await updateMember("MEM-1", { points: null as unknown as undefined });
    expect(result).not.toBeNull();
  });

  it("handles numeric expiresAt update", async () => {
    const date = new Date("2027-01-01");
    mockMemberUpdate.mockResolvedValue({ ...baseMemberRow, expiresAt: date });
    const result = await updateMember("MEM-1", { expiresAt: date.getTime() });
    expect(result).not.toBeNull();
  });

  it("handles null expiresAt update", async () => {
    mockMemberUpdate.mockResolvedValue({ ...baseMemberRow, expiresAt: null });
    const result = await updateMember("MEM-1", { expiresAt: null as unknown as undefined });
    expect(result).not.toBeNull();
  });
});

describe("removeMember", () => {
  it("returns true on success", async () => {
    mockMemberDelete.mockResolvedValue(baseMemberRow);
    expect(await removeMember("MEM-1")).toBe(true);
  });

  it("returns false on error", async () => {
    mockMemberDelete.mockRejectedValue(new Error("not found"));
    expect(await removeMember("MEM-999")).toBe(false);
  });
});

// ---- Membership Requests ----

describe("queryMembershipRequests", () => {
  it("returns paginated requests", async () => {
    mockRequestCount.mockResolvedValue(8);
    mockRequestFindMany.mockResolvedValue([baseRequestRow]);

    const result = await queryMembershipRequests({ page: 1, pageSize: 10 });
    expect(result.total).toBe(8);
    expect(result.items).toHaveLength(1);
  });

  it("filters by keyword", async () => {
    mockRequestCount.mockResolvedValue(1);
    mockRequestFindMany.mockResolvedValue([baseRequestRow]);

    await queryMembershipRequests({ page: 1, pageSize: 10, q: "Alice" });
    expect(mockRequestCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("filters by status", async () => {
    mockRequestCount.mockResolvedValue(0);
    mockRequestFindMany.mockResolvedValue([]);

    await queryMembershipRequests({ page: 1, pageSize: 10, status: "待审核" });
    expect(mockRequestCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "待审核" }) })
    );
  });

  it("does not filter status for 全部", async () => {
    mockRequestCount.mockResolvedValue(0);
    mockRequestFindMany.mockResolvedValue([]);

    await queryMembershipRequests({ page: 1, pageSize: 10, status: "全部" });
    const call = mockRequestCount.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });
});

describe("queryMembershipRequestsCursor", () => {
  it("returns cursor-based results", async () => {
    mockRequestFindMany.mockResolvedValue([baseRequestRow]);

    const result = await queryMembershipRequestsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("filters by keyword", async () => {
    mockRequestFindMany.mockResolvedValue([]);

    await queryMembershipRequestsCursor({ pageSize: 10, q: "Alice" });
    expect(mockRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("filters by status", async () => {
    mockRequestFindMany.mockResolvedValue([]);

    await queryMembershipRequestsCursor({ pageSize: 10, status: "待审核" });
    expect(mockRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "待审核" }) })
    );
  });

  it("does not filter status for 全部", async () => {
    mockRequestFindMany.mockResolvedValue([]);

    await queryMembershipRequestsCursor({ pageSize: 10, status: "全部" });
    const call = mockRequestFindMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });
});

describe("addMembershipRequest", () => {
  it("creates a new request", async () => {
    mockRequestCreate.mockResolvedValue(baseRequestRow);

    const result = await addMembershipRequest({
      id: "REQ-1",
      userAddress: "0xuser1",
      userName: "Alice",
      contact: "alice@test.com",
      tierId: "TIER-1",
      tierName: "黄金会员",
      status: "待审核",
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("REQ-1");
    expect(result.status).toBe("待审核");
  });

  it("handles request with all null optional fields", async () => {
    mockRequestCreate.mockResolvedValue({
      ...baseRequestRow,
      userAddress: null,
      userName: null,
      contact: null,
      tierId: null,
      tierName: null,
      note: null,
      meta: null,
      updatedAt: null,
    });

    const result = await addMembershipRequest({
      id: "REQ-2",
      status: "待审核",
      createdAt: now.getTime(),
    });

    expect(result.userAddress).toBeUndefined();
    expect(result.userName).toBeUndefined();
    expect(result.contact).toBeUndefined();
    expect(result.tierId).toBeUndefined();
    expect(result.tierName).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.meta).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  it("handles request with meta and updatedAt set", async () => {
    const updatedDate = new Date("2026-02-01");
    mockRequestCreate.mockResolvedValue({
      ...baseRequestRow,
      meta: { reason: "upgrade" },
      updatedAt: updatedDate,
    });

    const result = await addMembershipRequest({
      id: "REQ-3",
      status: "待审核",
      createdAt: now.getTime(),
      meta: { reason: "upgrade" },
      updatedAt: updatedDate.getTime(),
    });

    expect(result.meta).toEqual({ reason: "upgrade" });
    expect(result.updatedAt).toBe(updatedDate.getTime());
  });
});

describe("updateMembershipRequest", () => {
  it("updates request and returns result", async () => {
    mockRequestUpdate.mockResolvedValue({ ...baseRequestRow, status: "已通过" });

    const result = await updateMembershipRequest("REQ-1", { status: "已通过" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("已通过");
  });

  it("updates request with meta", async () => {
    mockRequestUpdate.mockResolvedValue({ ...baseRequestRow, meta: { approved: true } });

    const result = await updateMembershipRequest("REQ-1", { meta: { approved: true } });
    expect(result).not.toBeNull();
    expect(result!.meta).toEqual({ approved: true });
  });

  it("returns null on error", async () => {
    mockRequestUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateMembershipRequest("REQ-999", { status: "已拒绝" });
    expect(result).toBeNull();
  });
});

describe("removeMembershipRequest", () => {
  it("returns true on success", async () => {
    mockRequestDelete.mockResolvedValue(baseRequestRow);
    expect(await removeMembershipRequest("REQ-1")).toBe(true);
  });

  it("returns false on error", async () => {
    mockRequestDelete.mockRejectedValue(new Error("not found"));
    expect(await removeMembershipRequest("REQ-999")).toBe(false);
  });
});
