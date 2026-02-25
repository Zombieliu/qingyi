import "server-only";
import { prisma } from "@/lib/db";
import { CustomerTagLabels } from "@/lib/shared/messages";

export type CustomerTagType =
  | "difficult" // 事多/难伺候
  | "slow_pay" // 拖延付款
  | "rude" // 态度差
  | "no_show" // 放鸽子
  | "frequent_dispute" // 频繁争议
  | "vip_treat" // VIP 优待（正面标签）
  | "other";

export const TAG_LABELS: Record<CustomerTagType, string> = {
  difficult: CustomerTagLabels.difficult,
  slow_pay: CustomerTagLabels.slow_pay,
  rude: CustomerTagLabels.rude,
  no_show: CustomerTagLabels.no_show,
  frequent_dispute: CustomerTagLabels.frequent_dispute,
  vip_treat: CustomerTagLabels.vip_treat,
  other: CustomerTagLabels.other,
};

export const TAG_LABELS_EN: Record<CustomerTagType, string> = {
  difficult: "Difficult customer",
  slow_pay: "Slow to pay",
  rude: "Rude / impolite",
  no_show: "No-show / AFK",
  frequent_dispute: "Frequent disputes",
  vip_treat: "VIP treatment",
  other: "Other",
};

export type CustomerTagSummary = {
  userAddress: string;
  tags: Array<{
    id: string;
    tag: string;
    note: string | null;
    severity: number;
    reportedByRole: string;
    createdAt: Date;
  }>;
  maxSeverity: number;
  tagCount: number;
};

/** Get all active tags for a customer */
export async function getCustomerTags(userAddress: string): Promise<CustomerTagSummary> {
  const tags = await prisma.customerTag.findMany({
    where: { userAddress, active: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tag: true,
      note: true,
      severity: true,
      reportedByRole: true,
      createdAt: true,
    },
  });

  return {
    userAddress,
    tags,
    maxSeverity: tags.length > 0 ? Math.max(...tags.map((t) => t.severity)) : 0,
    tagCount: tags.length,
  };
}

/** Batch get tags for multiple customers (for order list views) */
export async function getCustomerTagsBatch(
  userAddresses: string[]
): Promise<Map<string, CustomerTagSummary>> {
  if (userAddresses.length === 0) return new Map();

  const tags = await prisma.customerTag.findMany({
    where: { userAddress: { in: userAddresses }, active: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAddress: true,
      tag: true,
      note: true,
      severity: true,
      reportedByRole: true,
      createdAt: true,
    },
  });

  const map = new Map<string, CustomerTagSummary>();
  for (const addr of userAddresses) {
    const userTags = tags.filter((t) => t.userAddress === addr);
    map.set(addr, {
      userAddress: addr,
      tags: userTags,
      maxSeverity: userTags.length > 0 ? Math.max(...userTags.map((t) => t.severity)) : 0,
      tagCount: userTags.length,
    });
  }
  return map;
}

/** Add a tag to a customer */
export async function addCustomerTag(params: {
  userAddress: string;
  tag: CustomerTagType;
  note?: string;
  severity?: number;
  reportedBy: string;
  reportedByRole?: string;
}) {
  return prisma.customerTag.create({
    data: {
      userAddress: params.userAddress,
      tag: params.tag,
      note: params.note || null,
      severity: params.severity ?? 1,
      reportedBy: params.reportedBy,
      reportedByRole: params.reportedByRole || "companion",
    },
  });
}

/** Deactivate a tag */
export async function removeCustomerTag(tagId: string) {
  return prisma.customerTag.update({
    where: { id: tagId },
    data: { active: false },
  });
}

/** List all tagged customers (admin view) */
export async function listTaggedCustomers(opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const grouped = await prisma.customerTag.groupBy({
    by: ["userAddress"],
    where: { active: true },
    _count: { id: true },
    _max: { severity: true },
    orderBy: { _max: { severity: "desc" } },
    take: limit,
    skip: offset,
  });

  return grouped.map((g) => ({
    userAddress: g.userAddress,
    tagCount: g._count.id,
    maxSeverity: g._max.severity ?? 0,
  }));
}
