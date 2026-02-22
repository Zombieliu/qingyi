import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma — hoisted to avoid TDZ
const mockPrisma = vi.hoisted(() => ({
  growthContact: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  growthTouchpoint: {
    create: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn(),
  },
  growthChannel: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  growthCampaign: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  growthAsset: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  growthFollowUp: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  growthAutomation: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("server-only", () => ({}));

import {
  findOrCreateContact,
  updateContactLifecycle,
  getContact,
  listContacts,
  assignContact,
  tagContact,
  scoreContact,
  recordTouchpoint,
  listChannels,
  createCampaign,
  getCampaign,
  listCampaigns,
  createAsset,
  getAssetByShortCode,
  incrementAssetClick,
  addFollowUp,
  getPendingFollowUps,
  getDashboardStats,
  getChannelPerformance,
  getAttributionPaths,
  listAutomations,
  createAutomation,
  toggleAutomation,
} from "../growth-os-service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Contact Management
// ============================================================

describe("findOrCreateContact", () => {
  it("returns existing contact by userAddress", async () => {
    const existing = { id: "c1", userAddress: "0xabc", lifecycle: "visitor" };
    mockPrisma.growthContact.findUnique.mockResolvedValue(existing);
    mockPrisma.growthContact.update.mockResolvedValue(existing);

    const result = await findOrCreateContact({ userAddress: "0xabc" });
    expect(result).toEqual(existing);
    expect(mockPrisma.growthContact.findUnique).toHaveBeenCalledWith({
      where: { userAddress: "0xabc" },
    });
    expect(mockPrisma.growthContact.update).toHaveBeenCalled();
  });

  it("creates new contact when not found", async () => {
    mockPrisma.growthContact.findUnique.mockResolvedValue(null);
    const created = { id: "c2", userAddress: "0xnew", lifecycle: "visitor" };
    mockPrisma.growthContact.create.mockResolvedValue(created);

    const result = await findOrCreateContact({ userAddress: "0xnew", source: "douyin" });
    expect(result).toEqual(created);
    expect(mockPrisma.growthContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userAddress: "0xnew",
        source: "douyin",
        lifecycle: "visitor",
      }),
    });
  });

  it("creates stranger when no userAddress", async () => {
    const created = { id: "c3", lifecycle: "stranger" };
    mockPrisma.growthContact.create.mockResolvedValue(created);

    const result = await findOrCreateContact({ phone: "13800138000" });
    expect(result).toEqual(created);
    expect(mockPrisma.growthContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lifecycle: "stranger" }),
    });
  });
});

describe("updateContactLifecycle", () => {
  it("updates lifecycle and extra fields", async () => {
    const updated = { id: "c1", lifecycle: "customer" };
    mockPrisma.growthContact.update.mockResolvedValue(updated);

    const result = await updateContactLifecycle("c1", "customer", {
      totalOrders: 3,
      totalSpent: 299,
    });
    expect(result).toEqual(updated);
    expect(mockPrisma.growthContact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({
        lifecycle: "customer",
        totalOrders: 3,
        totalSpent: 299,
      }),
    });
  });
});

describe("listContacts", () => {
  it("queries with filters", async () => {
    mockPrisma.growthContact.findMany.mockResolvedValue([]);
    mockPrisma.growthContact.count.mockResolvedValue(0);

    const result = await listContacts({ lifecycle: "lead", limit: 10 });
    expect(result).toEqual({ items: [], total: 0 });
    expect(mockPrisma.growthContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lifecycle: "lead" },
        take: 10,
      })
    );
  });

  it("supports search across fields", async () => {
    mockPrisma.growthContact.findMany.mockResolvedValue([]);
    mockPrisma.growthContact.count.mockResolvedValue(0);

    await listContacts({ search: "test" });
    expect(mockPrisma.growthContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ name: { contains: "test", mode: "insensitive" } }),
          ]),
        }),
      })
    );
  });
});

describe("assignContact", () => {
  it("updates assignedTo", async () => {
    mockPrisma.growthContact.update.mockResolvedValue({ id: "c1", assignedTo: "ops_01" });
    const result = await assignContact("c1", "ops_01");
    expect(result.assignedTo).toBe("ops_01");
  });
});

describe("tagContact", () => {
  it("updates tags array", async () => {
    mockPrisma.growthContact.update.mockResolvedValue({ id: "c1", tags: ["vip", "active"] });
    const result = await tagContact("c1", ["vip", "active"]);
    expect(result.tags).toEqual(["vip", "active"]);
  });
});

describe("scoreContact", () => {
  it("updates score", async () => {
    mockPrisma.growthContact.update.mockResolvedValue({ id: "c1", score: 85 });
    const result = await scoreContact("c1", 85);
    expect(result.score).toBe(85);
  });
});

// ============================================================
// Touchpoint Tracking
// ============================================================

describe("recordTouchpoint", () => {
  it("creates touchpoint and updates contact lastSeenAt", async () => {
    const tp = { id: "tp1", contactId: "c1", channelCode: "douyin" };
    mockPrisma.growthTouchpoint.create.mockResolvedValue(tp);
    mockPrisma.growthContact.update.mockResolvedValue({});

    const result = await recordTouchpoint({
      contactId: "c1",
      channelCode: "douyin",
      touchType: "visit",
      utmSource: "douyin",
      utmMedium: "video",
    });
    expect(result).toEqual(tp);
    expect(mockPrisma.growthContact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    });
  });

  it("increments campaign stats when campaignId provided", async () => {
    mockPrisma.growthTouchpoint.create.mockResolvedValue({ id: "tp2" });
    mockPrisma.growthContact.update.mockResolvedValue({});
    mockPrisma.growthCampaign.update.mockResolvedValue({});

    await recordTouchpoint({
      contactId: "c1",
      channelCode: "douyin",
      campaignId: "camp1",
      touchType: "order",
      orderAmount: 99,
    });

    expect(mockPrisma.growthCampaign.update).toHaveBeenCalledWith({
      where: { id: "camp1" },
      data: expect.objectContaining({
        orders: { increment: 1 },
        revenue: { increment: 99 },
      }),
    });
  });

  it("increments leads for register touchType", async () => {
    mockPrisma.growthTouchpoint.create.mockResolvedValue({ id: "tp3" });
    mockPrisma.growthContact.update.mockResolvedValue({});
    mockPrisma.growthCampaign.update.mockResolvedValue({});

    await recordTouchpoint({
      contactId: "c1",
      channelCode: "wechat",
      campaignId: "camp2",
      touchType: "register",
    });

    expect(mockPrisma.growthCampaign.update).toHaveBeenCalledWith({
      where: { id: "camp2" },
      data: expect.objectContaining({ leads: { increment: 1 } }),
    });
  });
});

// ============================================================
// Channel & Campaign
// ============================================================

describe("listChannels", () => {
  it("returns active channels with campaigns", async () => {
    const channels = [{ id: "ch1", code: "douyin", name: "抖音", campaigns: [] }];
    mockPrisma.growthChannel.findMany.mockResolvedValue(channels);

    const result = await listChannels();
    expect(result).toEqual(channels);
    expect(mockPrisma.growthChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } })
    );
  });
});

describe("createCampaign", () => {
  it("creates campaign with all fields", async () => {
    const campaign = { id: "camp1", name: "Test Campaign" };
    mockPrisma.growthCampaign.create.mockResolvedValue(campaign);

    const result = await createCampaign({
      channelId: "ch1",
      name: "Test Campaign",
      budget: 5000,
    });
    expect(result).toEqual(campaign);
  });
});

describe("listCampaigns", () => {
  it("filters by channelId and status", async () => {
    mockPrisma.growthCampaign.findMany.mockResolvedValue([]);

    await listCampaigns({ channelId: "ch1", status: "active" });
    expect(mockPrisma.growthCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId: "ch1", status: "active" },
      })
    );
  });
});

// ============================================================
// Asset & Link
// ============================================================

describe("createAsset", () => {
  it("creates asset with auto-generated shortCode", async () => {
    mockPrisma.growthAsset.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await createAsset({
      campaignId: "camp1",
      type: "link",
      title: "Test Link",
    });
    expect(result.shortCode).toBeDefined();
    expect(result.shortCode).toHaveLength(8);
    expect(result.campaignId).toBe("camp1");
  });
});

describe("getAssetByShortCode", () => {
  it("finds asset by shortCode", async () => {
    const asset = { id: "a1", shortCode: "abc12345" };
    mockPrisma.growthAsset.findUnique.mockResolvedValue(asset);

    const result = await getAssetByShortCode("abc12345");
    expect(result).toEqual(asset);
  });
});

describe("incrementAssetClick", () => {
  it("increments click count", async () => {
    mockPrisma.growthAsset.update.mockResolvedValue({ clicks: 5 });

    const result = await incrementAssetClick("a1");
    expect(mockPrisma.growthAsset.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { clicks: { increment: 1 } },
    });
  });
});

// ============================================================
// Follow-up
// ============================================================

describe("addFollowUp", () => {
  it("creates follow-up record", async () => {
    const fu = { id: "fu1", contactId: "c1", action: "call" };
    mockPrisma.growthFollowUp.create.mockResolvedValue(fu);

    const result = await addFollowUp({
      contactId: "c1",
      action: "call",
      content: "Called, interested",
      result: "interested",
      operatorId: "ops_01",
    });
    expect(result).toEqual(fu);
  });
});

describe("getPendingFollowUps", () => {
  it("returns overdue follow-ups", async () => {
    mockPrisma.growthFollowUp.findMany.mockResolvedValue([]);

    const result = await getPendingFollowUps("ops_01");
    expect(mockPrisma.growthFollowUp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          nextFollowAt: { lte: expect.any(Date) },
          operatorId: "ops_01",
        }),
      })
    );
  });
});

// ============================================================
// Dashboard Analytics
// ============================================================

describe("getDashboardStats", () => {
  it("aggregates all dashboard metrics", async () => {
    mockPrisma.growthContact.count
      .mockResolvedValueOnce(100) // totalContacts
      .mockResolvedValueOnce(15) // newContacts
      .mockResolvedValueOnce(5); // recentConversions
    mockPrisma.growthTouchpoint.count.mockResolvedValue(500);
    mockPrisma.growthTouchpoint.groupBy.mockResolvedValue([
      { channelCode: "douyin", _count: { id: 200 } },
      { channelCode: "wechat", _count: { id: 100 } },
    ]);
    mockPrisma.growthContact.groupBy.mockResolvedValue([
      { lifecycle: "stranger", _count: { id: 40 } },
      { lifecycle: "customer", _count: { id: 30 } },
    ]);

    const result = await getDashboardStats(7);
    expect(result.totalContacts).toBe(100);
    expect(result.newContacts).toBe(15);
    expect(result.totalTouchpoints).toBe(500);
    expect(result.recentConversions).toBe(5);
    expect(result.channelBreakdown).toHaveLength(2);
    expect(result.lifecycle.stranger).toBe(40);
    expect(result.lifecycle.customer).toBe(30);
  });
});

describe("getChannelPerformance", () => {
  it("returns channel metrics with conversion rates", async () => {
    mockPrisma.growthChannel.findMany.mockResolvedValue([
      { code: "douyin", name: "抖音", icon: "🎵", color: "#000", monthlyBudget: 1000 },
    ]);
    mockPrisma.growthTouchpoint.groupBy.mockResolvedValue([
      {
        channelCode: "douyin",
        touchType: "visit",
        _count: { id: 100 },
        _sum: { orderAmount: null },
      },
      { channelCode: "douyin", touchType: "order", _count: { id: 5 }, _sum: { orderAmount: 500 } },
    ]);

    const result = await getChannelPerformance(30);
    expect(result).toHaveLength(1);
    expect(result[0].visits).toBe(100);
    expect(result[0].orders).toBe(5);
    expect(result[0].revenue).toBe(500);
    expect(result[0].conversionRate).toBe("5.0");
    expect(result[0].cpa).toBe("200");
  });
});

describe("getAttributionPaths", () => {
  it("returns converted contacts with touchpoint paths", async () => {
    mockPrisma.growthContact.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Test User",
        convertedAt: new Date(),
        totalSpent: 99,
        touchpoints: [
          { channelCode: "douyin", touchType: "visit", createdAt: new Date(), utmCampaign: null },
          { channelCode: "direct", touchType: "order", createdAt: new Date(), utmCampaign: null },
        ],
      },
    ]);

    const result = await getAttributionPaths(10);
    expect(result).toHaveLength(1);
    expect(result[0].path).toHaveLength(2);
    expect(result[0].path[0].channel).toBe("douyin");
    expect(result[0].path[1].type).toBe("order");
  });
});

// ============================================================
// Automation
// ============================================================

describe("listAutomations", () => {
  it("returns all automations ordered by priority", async () => {
    mockPrisma.growthAutomation.findMany.mockResolvedValue([]);
    const result = await listAutomations();
    expect(mockPrisma.growthAutomation.findMany).toHaveBeenCalledWith({
      orderBy: { priority: "desc" },
    });
  });
});

describe("createAutomation", () => {
  it("creates automation rule", async () => {
    const rule = { id: "auto1", name: "Test Rule" };
    mockPrisma.growthAutomation.create.mockResolvedValue(rule);

    const result = await createAutomation({
      name: "Test Rule",
      trigger: { event: "visit", count: 3 },
      action: { action: "tag", value: "high_intent" },
    });
    expect(result).toEqual(rule);
  });
});

describe("toggleAutomation", () => {
  it("toggles active state", async () => {
    mockPrisma.growthAutomation.update.mockResolvedValue({ id: "auto1", active: false });

    await toggleAutomation("auto1", false);
    expect(mockPrisma.growthAutomation.update).toHaveBeenCalledWith({
      where: { id: "auto1" },
      data: { active: false },
    });
  });
});
