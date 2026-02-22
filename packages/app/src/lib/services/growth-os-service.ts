import "server-only";
import { prisma } from "@/lib/db";

// ============================================================
// Contact Management
// ============================================================

export async function findOrCreateContact(params: {
  userAddress?: string;
  phone?: string;
  wechat?: string;
  name?: string;
  source?: string;
  ip?: string;
  userAgent?: string;
}) {
  // Try to find existing contact
  if (params.userAddress) {
    const existing = await prisma.growthContact.findUnique({
      where: { userAddress: params.userAddress },
    });
    if (existing) {
      await prisma.growthContact.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing;
    }
  }

  return prisma.growthContact.create({
    data: {
      userAddress: params.userAddress,
      phone: params.phone,
      wechat: params.wechat,
      name: params.name,
      source: params.source,
      lifecycle: params.userAddress ? "visitor" : "stranger",
    },
  });
}

export async function updateContactLifecycle(
  contactId: string,
  lifecycle: string,
  extra?: { totalOrders?: number; totalSpent?: number; convertedAt?: Date }
) {
  return prisma.growthContact.update({
    where: { id: contactId },
    data: {
      lifecycle,
      ...extra,
      lastSeenAt: new Date(),
    },
  });
}

export async function getContact(id: string) {
  return prisma.growthContact.findUnique({
    where: { id },
    include: {
      touchpoints: { orderBy: { createdAt: "desc" }, take: 50 },
      followUps: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export async function getContactByAddress(userAddress: string) {
  return prisma.growthContact.findUnique({
    where: { userAddress },
    include: {
      touchpoints: { orderBy: { createdAt: "desc" }, take: 20 },
      followUps: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

export async function listContacts(opts: {
  lifecycle?: string;
  source?: string;
  assignedTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}) {
  const where: Record<string, unknown> = {};
  if (opts.lifecycle) where.lifecycle = opts.lifecycle;
  if (opts.source) where.source = opts.source;
  if (opts.assignedTo) where.assignedTo = opts.assignedTo;
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: "insensitive" } },
      { phone: { contains: opts.search } },
      { wechat: { contains: opts.search } },
      { userAddress: { contains: opts.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.growthContact.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    }),
    prisma.growthContact.count({ where }),
  ]);

  return { items, total };
}

export async function assignContact(contactId: string, assignedTo: string) {
  return prisma.growthContact.update({
    where: { id: contactId },
    data: { assignedTo },
  });
}

export async function tagContact(contactId: string, tags: string[]) {
  return prisma.growthContact.update({
    where: { id: contactId },
    data: { tags },
  });
}

export async function scoreContact(contactId: string, score: number) {
  return prisma.growthContact.update({
    where: { id: contactId },
    data: { score },
  });
}

// ============================================================
// Touchpoint Tracking
// ============================================================

export async function recordTouchpoint(params: {
  contactId: string;
  channelCode: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  touchType?: string;
  landingPage?: string;
  referrer?: string;
  ip?: string;
  userAgent?: string;
  deviceType?: string;
  orderId?: string;
  orderAmount?: number;
}) {
  const tp = await prisma.growthTouchpoint.create({
    data: {
      contactId: params.contactId,
      channelCode: params.channelCode,
      campaignId: params.campaignId,
      utmSource: params.utmSource,
      utmMedium: params.utmMedium,
      utmCampaign: params.utmCampaign,
      utmContent: params.utmContent,
      utmTerm: params.utmTerm,
      touchType: params.touchType ?? "visit",
      landingPage: params.landingPage,
      referrer: params.referrer,
      ip: params.ip,
      userAgent: params.userAgent,
      deviceType: params.deviceType,
      orderId: params.orderId,
      orderAmount: params.orderAmount,
    },
  });

  // Update contact lastSeenAt
  await prisma.growthContact.update({
    where: { id: params.contactId },
    data: { lastSeenAt: new Date() },
  });

  // Update campaign stats if linked
  if (params.campaignId) {
    const field =
      params.touchType === "order"
        ? "orders"
        : params.touchType === "register"
          ? "leads"
          : "clicks";
    await prisma.growthCampaign.update({
      where: { id: params.campaignId },
      data: {
        [field]: { increment: 1 },
        ...(params.orderAmount ? { revenue: { increment: params.orderAmount } } : {}),
      },
    });
  }

  return tp;
}

// ============================================================
// Channel & Campaign Management
// ============================================================

export async function listChannels() {
  return prisma.growthChannel.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: {
      campaigns: {
        where: { status: "active" },
        select: { id: true, name: true, status: true },
      },
    },
  });
}

export async function createCampaign(params: {
  channelId: string;
  name: string;
  description?: string;
  budget?: number;
  targetKpi?: string;
  startsAt?: Date;
  endsAt?: Date;
  utmCampaign?: string;
  landingPage?: string;
}) {
  return prisma.growthCampaign.create({ data: params });
}

export async function updateCampaign(id: string, data: Record<string, unknown>) {
  return prisma.growthCampaign.update({ where: { id }, data });
}

export async function getCampaign(id: string) {
  return prisma.growthCampaign.findUnique({
    where: { id },
    include: {
      channel: true,
      assets: { orderBy: { createdAt: "desc" } },
      touchpoints: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
}

export async function listCampaigns(opts?: {
  channelId?: string;
  status?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (opts?.channelId) where.channelId = opts.channelId;
  if (opts?.status) where.status = opts.status;

  return prisma.growthCampaign.findMany({
    where,
    include: { channel: { select: { code: true, name: true, icon: true } } },
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 50,
  });
}

// ============================================================
// Asset & Link Management
// ============================================================

export async function createAsset(params: {
  campaignId: string;
  type: string;
  title?: string;
  url?: string;
  content?: string;
}) {
  const shortCode = generateShortCode();
  return prisma.growthAsset.create({
    data: { ...params, shortCode },
  });
}

export async function getAssetByShortCode(shortCode: string) {
  return prisma.growthAsset.findUnique({ where: { shortCode } });
}

export async function incrementAssetClick(id: string) {
  return prisma.growthAsset.update({
    where: { id },
    data: { clicks: { increment: 1 } },
  });
}

function generateShortCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ============================================================
// Follow-up
// ============================================================

export async function addFollowUp(params: {
  contactId: string;
  action: string;
  content?: string;
  result?: string;
  nextFollowAt?: Date;
  operatorId: string;
}) {
  return prisma.growthFollowUp.create({ data: params });
}

export async function getPendingFollowUps(operatorId?: string) {
  const where: Record<string, unknown> = {
    nextFollowAt: { lte: new Date() },
  };
  if (operatorId) where.operatorId = operatorId;

  return prisma.growthFollowUp.findMany({
    where,
    include: { contact: { select: { id: true, name: true, phone: true, lifecycle: true } } },
    orderBy: { nextFollowAt: "asc" },
    take: 50,
  });
}

// ============================================================
// Analytics & Dashboard
// ============================================================

export async function getDashboardStats(days: number = 7) {
  const since = new Date(Date.now() - days * 86400000);

  const [
    totalContacts,
    newContacts,
    totalTouchpoints,
    channelBreakdown,
    lifecycleCounts,
    recentConversions,
  ] = await Promise.all([
    prisma.growthContact.count(),
    prisma.growthContact.count({ where: { createdAt: { gte: since } } }),
    prisma.growthTouchpoint.count({ where: { createdAt: { gte: since } } }),
    prisma.growthTouchpoint.groupBy({
      by: ["channelCode"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.growthContact.groupBy({
      by: ["lifecycle"],
      _count: { id: true },
    }),
    prisma.growthContact.count({
      where: { convertedAt: { gte: since } },
    }),
  ]);

  return {
    totalContacts,
    newContacts,
    totalTouchpoints,
    recentConversions,
    channelBreakdown: channelBreakdown.map((c) => ({
      channel: c.channelCode,
      count: c._count.id,
    })),
    lifecycle: lifecycleCounts.reduce(
      (acc, c) => ({ ...acc, [c.lifecycle]: c._count.id }),
      {} as Record<string, number>
    ),
  };
}

export async function getChannelPerformance(days: number = 30) {
  const since = new Date(Date.now() - days * 86400000);

  const channels = await prisma.growthChannel.findMany({
    where: { active: true },
    select: { code: true, name: true, icon: true, color: true, monthlyBudget: true },
  });

  const touchpoints = await prisma.growthTouchpoint.groupBy({
    by: ["channelCode", "touchType"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
    _sum: { orderAmount: true },
  });

  return channels.map((ch) => {
    const chTps = touchpoints.filter((t) => t.channelCode === ch.code);
    const visits = chTps.find((t) => t.touchType === "visit")?._count.id ?? 0;
    const registers = chTps.find((t) => t.touchType === "register")?._count.id ?? 0;
    const orders = chTps.find((t) => t.touchType === "order")?._count.id ?? 0;
    const revenue = chTps.find((t) => t.touchType === "order")?._sum.orderAmount ?? 0;

    return {
      ...ch,
      visits,
      registers,
      orders,
      revenue,
      conversionRate: visits > 0 ? ((orders / visits) * 100).toFixed(1) : "0",
      cpa: ch.monthlyBudget && orders > 0 ? (ch.monthlyBudget / orders).toFixed(0) : null,
    };
  });
}

export async function getAttributionPaths(limit: number = 20) {
  // Get contacts who converted, with their touchpoint paths
  const converted = await prisma.growthContact.findMany({
    where: { convertedAt: { not: null } },
    orderBy: { convertedAt: "desc" },
    take: limit,
    include: {
      touchpoints: { orderBy: { createdAt: "asc" }, take: 10 },
    },
  });

  return converted.map((c) => ({
    contactId: c.id,
    name: c.name,
    convertedAt: c.convertedAt,
    totalSpent: c.totalSpent,
    path: c.touchpoints.map((tp) => ({
      channel: tp.channelCode,
      type: tp.touchType,
      time: tp.createdAt,
      campaign: tp.utmCampaign,
    })),
  }));
}

// ============================================================
// Automation
// ============================================================

export async function listAutomations() {
  return prisma.growthAutomation.findMany({
    orderBy: { priority: "desc" },
  });
}

export async function createAutomation(params: {
  name: string;
  description?: string;
  trigger: Record<string, unknown>;
  action: Record<string, unknown>;
  priority?: number;
}) {
  return prisma.growthAutomation.create({
    data: {
      name: params.name,
      description: params.description,
      trigger: params.trigger as object,
      action: params.action as object,
      priority: params.priority,
    },
  });
}

export async function toggleAutomation(id: string, active: boolean) {
  return prisma.growthAutomation.update({
    where: { id },
    data: { active },
  });
}
