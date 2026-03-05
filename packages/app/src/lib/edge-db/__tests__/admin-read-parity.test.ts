import { beforeEach, describe, expect, it, vi } from "vitest";

type UnknownRecord = Record<string, unknown>;

function toEpoch(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

function comparePrimitive(a: unknown, b: unknown): number {
  if (a === b) return 0;

  const aEpoch = toEpoch(a);
  const bEpoch = toEpoch(b);
  if (Number.isFinite(aEpoch) && Number.isFinite(bEpoch)) {
    return aEpoch - bEpoch;
  }

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return String(a).localeCompare(String(b));
}

function matchesField(value: unknown, condition: unknown): boolean {
  if (
    condition &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    const input = condition as Record<string, unknown>;
    if ("contains" in input) {
      const keyword = input.contains;
      return typeof keyword === "string" && String(value ?? "").includes(keyword);
    }
    if ("notIn" in input) {
      const list = Array.isArray(input.notIn) ? input.notIn : [];
      return !list.includes(value);
    }
    if ("lt" in input) return comparePrimitive(value, input.lt) < 0;
    if ("lte" in input) return comparePrimitive(value, input.lte) <= 0;
    if ("gt" in input) return comparePrimitive(value, input.gt) > 0;
    if ("gte" in input) return comparePrimitive(value, input.gte) >= 0;
    if ("not" in input) return !matchesField(value, input.not);
    return Object.entries(input).every(([key, nested]) =>
      matchesField((value as UnknownRecord)?.[key], nested)
    );
  }

  if (condition instanceof Date) {
    return toEpoch(value) === condition.getTime();
  }

  return value === condition;
}

function matchesWhere(row: UnknownRecord, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  const input = where as Record<string, unknown>;
  for (const [key, condition] of Object.entries(input)) {
    if (key === "OR") {
      const options = Array.isArray(condition) ? condition : [];
      if (!options.some((item) => matchesWhere(row, item))) return false;
      continue;
    }
    if (key === "AND") {
      const conditions = Array.isArray(condition) ? condition : [condition];
      if (!conditions.every((item) => matchesWhere(row, item))) return false;
      continue;
    }
    if (!matchesField(row[key], condition)) return false;
  }
  return true;
}

function normalizeOrderBy(input: unknown): Array<Record<string, "asc" | "desc">> {
  if (!input) return [];
  if (Array.isArray(input)) return input as Array<Record<string, "asc" | "desc">>;
  return [input as Record<string, "asc" | "desc">];
}

function sortRows<T extends UnknownRecord>(rows: T[], orderBy: unknown): T[] {
  const orderList = normalizeOrderBy(orderBy);
  if (orderList.length === 0) return [...rows];

  const next = [...rows];
  next.sort((a, b) => {
    for (const rule of orderList) {
      const [field, direction] = Object.entries(rule)[0] || [];
      if (!field || !direction) continue;
      const compared = comparePrimitive(a[field], b[field]);
      if (compared !== 0) return direction === "desc" ? -compared : compared;
    }
    return 0;
  });
  return next;
}

function executeQuery<T extends UnknownRecord>(
  rows: T[],
  args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }
) {
  const filtered = rows.filter((row) => matchesWhere(row, args?.where));
  const sorted = sortRows(filtered, args?.orderBy);
  const start = Math.max(0, args?.skip ?? 0);
  const end = args?.take !== undefined ? start + Math.max(0, args.take) : undefined;
  return sorted.slice(start, end);
}

function toIsoOrNull(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

const dates = {
  t1: new Date("2026-02-01T10:00:00.000Z"),
  t2: new Date("2026-02-02T10:00:00.000Z"),
  t3: new Date("2026-02-03T10:00:00.000Z"),
  t4: new Date("2026-02-04T10:00:00.000Z"),
};

const orderRows = [
  {
    id: "ORD-1",
    user: "Alice",
    userAddress: "0xA",
    companionAddress: "0xC1",
    item: "王者荣耀",
    amount: 100,
    currency: "CNY",
    paymentStatus: "已支付",
    stage: "待处理",
    note: null,
    assignedTo: "Player-A",
    source: "manual",
    chainDigest: null,
    chainStatus: null,
    serviceFee: 10,
    deposit: 30,
    meta: { source: "ops" },
    createdAt: dates.t4,
    updatedAt: null,
    deletedAt: null,
  },
  {
    id: "ORD-2",
    user: "Bob",
    userAddress: "0xB",
    companionAddress: null,
    item: "金铲铲",
    amount: 88,
    currency: "CNY",
    paymentStatus: "待支付",
    stage: "处理中",
    note: null,
    assignedTo: null,
    source: "chain",
    chainDigest: "0xabc",
    chainStatus: 2,
    serviceFee: 8,
    deposit: 20,
    meta: null,
    createdAt: dates.t3,
    updatedAt: null,
    deletedAt: null,
  },
  {
    id: "ORD-3",
    user: "Carol",
    userAddress: "0xC",
    companionAddress: "0xC2",
    item: "云顶",
    amount: 66,
    currency: "CNY",
    paymentStatus: "已支付",
    stage: "已完成",
    note: null,
    assignedTo: "Player-B",
    source: "manual",
    chainDigest: null,
    chainStatus: null,
    serviceFee: 6,
    deposit: 18,
    meta: null,
    createdAt: dates.t2,
    updatedAt: null,
    deletedAt: null,
  },
  {
    id: "ORD-DELETED",
    user: "Deleted",
    userAddress: "0xD",
    companionAddress: null,
    item: "已删除",
    amount: 50,
    currency: "CNY",
    paymentStatus: "已支付",
    stage: "待处理",
    note: null,
    assignedTo: null,
    source: "manual",
    chainDigest: null,
    chainStatus: null,
    serviceFee: null,
    deposit: null,
    meta: null,
    createdAt: dates.t1,
    updatedAt: null,
    deletedAt: dates.t4,
  },
];

const supportRows = [
  {
    id: "SUP-1",
    userName: "Alice",
    userAddress: "0xA",
    contact: "alice@test.dev",
    topic: "支付",
    message: "支付失败",
    status: "待处理",
    note: null,
    reply: null,
    meta: null,
    createdAt: dates.t4,
    updatedAt: null,
    deletedAt: null,
  },
  {
    id: "SUP-2",
    userName: "Bob",
    userAddress: "0xB",
    contact: "bob@test.dev",
    topic: "退款",
    message: "请退款",
    status: "处理中",
    note: null,
    reply: null,
    meta: null,
    createdAt: dates.t3,
    updatedAt: null,
    deletedAt: null,
  },
  {
    id: "SUP-DELETED",
    userName: "Deleted",
    userAddress: "0xD",
    contact: "deleted@test.dev",
    topic: "ignore",
    message: "ignore",
    status: "待处理",
    note: null,
    reply: null,
    meta: null,
    createdAt: dates.t2,
    updatedAt: null,
    deletedAt: dates.t4,
  },
];

const referralRows = [
  {
    id: "REF-1",
    inviterAddress: "0xA",
    inviteeAddress: "0xB",
    status: "pending",
    rewardInviter: 50,
    rewardInvitee: 30,
    triggerOrderId: null,
    createdAt: dates.t4,
    rewardedAt: null,
  },
  {
    id: "REF-2",
    inviterAddress: "0xA",
    inviteeAddress: "0xC",
    status: "rewarded",
    rewardInviter: 50,
    rewardInvitee: 30,
    triggerOrderId: "ORD-3",
    createdAt: dates.t3,
    rewardedAt: dates.t4,
  },
];

const memberRows = [
  {
    id: "MEM-1",
    userAddress: "0xA",
    userName: "Alice",
    tierId: "TIER-2",
    tierName: "黄金",
    points: 300,
    status: "有效",
    expiresAt: dates.t4,
    note: null,
    createdAt: dates.t4,
    updatedAt: null,
  },
  {
    id: "MEM-2",
    userAddress: "0xB",
    userName: "Bob",
    tierId: "TIER-1",
    tierName: "青铜",
    points: 100,
    status: "待开通",
    expiresAt: null,
    note: null,
    createdAt: dates.t3,
    updatedAt: null,
  },
];

const tierRows = [
  {
    id: "TIER-1",
    name: "青铜",
    level: 1,
    badge: "bronze",
    price: 19,
    durationDays: 30,
    minPoints: 50,
    status: "上架",
    perks: [{ label: "基础权益" }],
    createdAt: dates.t2,
    updatedAt: null,
  },
  {
    id: "TIER-2",
    name: "黄金",
    level: 2,
    badge: "gold",
    price: 99,
    durationDays: 30,
    minPoints: 300,
    status: "上架",
    perks: [{ label: "专属权益" }],
    createdAt: dates.t4,
    updatedAt: null,
  },
];

const paymentRows = [
  {
    id: "PAY-1",
    provider: "stripe",
    event: "payment_intent.succeeded",
    orderNo: "ORD-1",
    amount: 100,
    status: "succeeded",
    verified: true,
    createdAt: dates.t4,
    raw: { id: "evt1" },
  },
  {
    id: "PAY-2",
    provider: "stripe",
    event: "payment_intent.succeeded",
    orderNo: "ORD-2",
    amount: 88,
    status: "succeeded",
    verified: true,
    createdAt: dates.t3,
    raw: { id: "evt2" },
  },
];

const edgeRowsByTable = {
  AdminOrder: orderRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoOrNull(row.updatedAt),
    deletedAt: toIsoOrNull(row.deletedAt),
  })),
  AdminSupportTicket: supportRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoOrNull(row.updatedAt),
    deletedAt: toIsoOrNull(row.deletedAt),
  })),
  Referral: referralRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    rewardedAt: toIsoOrNull(row.rewardedAt),
  })),
  AdminMember: memberRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoOrNull(row.updatedAt),
    expiresAt: toIsoOrNull(row.expiresAt),
  })),
  AdminMembershipTier: tierRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoOrNull(row.updatedAt),
  })),
  AdminPaymentEvent: paymentRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  })),
} as const;

const { mockScanEdgeTableRows, mockPrisma } = vi.hoisted(() => ({
  mockScanEdgeTableRows: vi.fn(),
  mockPrisma: {
    adminOrder: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    adminSupportTicket: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    referral: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    adminMember: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    adminMembershipTier: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    adminPaymentEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/edge-db/scan-utils", () => ({
  scanEdgeTableRows: (...args: unknown[]) => mockScanEdgeTableRows(...args),
}));

vi.mock("@/lib/admin/admin-store-utils", () => ({
  prisma: mockPrisma,
  Prisma: { DbNull: null },
  appendCursorWhere: (where: { AND?: unknown }, cursor?: { createdAt: number; id: string }) => {
    if (!cursor) return;
    const cursorDate = new Date(cursor.createdAt);
    const condition = {
      OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursor.id } }],
    };
    if (!where.AND) {
      where.AND = [condition];
      return;
    }
    where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [where.AND, condition];
  },
  buildCursorPayload: (row: { id: string; createdAt: Date }) => ({
    id: row.id,
    createdAt: row.createdAt.getTime(),
  }),
}));
vi.mock("@/lib/env", () => ({
  env: {
    ADMIN_AUDIT_LOG_LIMIT: 100,
    ADMIN_PAYMENT_EVENT_LIMIT: 100,
  },
}));

import {
  queryOrders as queryOrdersLegacy,
  queryOrdersCursor as queryOrdersCursorLegacy,
} from "@/lib/admin/order-query-store";
import {
  querySupportTickets as querySupportLegacy,
  querySupportTicketsCursor as querySupportCursorLegacy,
} from "@/lib/admin/support-store";
import { queryReferrals as queryReferralsLegacy } from "@/lib/admin/referral-store";
import {
  queryMembers as queryMembersLegacy,
  queryMembersCursor as queryMembersCursorLegacy,
  queryMembershipTiers as queryTiersLegacy,
  queryMembershipTiersCursor as queryTiersCursorLegacy,
} from "@/lib/admin/membership-store";
import {
  queryPaymentEvents as queryPaymentsLegacy,
  queryPaymentEventsCursor as queryPaymentsCursorLegacy,
} from "@/lib/admin/audit-store";
import {
  queryOrdersEdgeRead,
  queryOrdersCursorEdgeRead,
  querySupportTicketsEdgeRead,
  querySupportTicketsCursorEdgeRead,
  queryReferralsEdgeRead,
  queryMembersEdgeRead,
  queryMembersCursorEdgeRead,
  queryMembershipTiersEdgeRead,
  queryMembershipTiersCursorEdgeRead,
  queryPaymentEventsEdgeRead,
  queryPaymentEventsCursorEdgeRead,
} from "../admin-read-store";

describe("edge-db admin read semantic parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanEdgeTableRows.mockImplementation(
      async <T>(args: { table: keyof typeof edgeRowsByTable }) => edgeRowsByTable[args.table] as T[]
    );
    mockPrisma.adminOrder.count.mockImplementation(
      async (args?: { where?: unknown }) => executeQuery(orderRows, args).length
    );
    mockPrisma.adminOrder.findMany.mockImplementation(
      async (args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }) =>
        executeQuery(orderRows, args)
    );
    mockPrisma.adminSupportTicket.count.mockImplementation(
      async (args?: { where?: unknown }) => executeQuery(supportRows, args).length
    );
    mockPrisma.adminSupportTicket.findMany.mockImplementation(
      async (args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }) =>
        executeQuery(supportRows, args)
    );
    mockPrisma.referral.count.mockImplementation(
      async (args?: { where?: unknown }) => executeQuery(referralRows, args).length
    );
    mockPrisma.referral.findMany.mockImplementation(
      async (args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }) =>
        executeQuery(referralRows, args)
    );
    mockPrisma.adminMember.count.mockImplementation(
      async (args?: { where?: unknown }) => executeQuery(memberRows, args).length
    );
    mockPrisma.adminMember.findMany.mockImplementation(
      async (args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }) =>
        executeQuery(memberRows, args)
    );
    mockPrisma.adminMembershipTier.count.mockImplementation(
      async (args?: { where?: unknown }) => executeQuery(tierRows, args).length
    );
    mockPrisma.adminMembershipTier.findMany.mockImplementation(
      async (args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }) =>
        executeQuery(tierRows, args)
    );
    mockPrisma.adminPaymentEvent.count.mockImplementation(
      async (args?: { where?: unknown }) => executeQuery(paymentRows, args).length
    );
    mockPrisma.adminPaymentEvent.findMany.mockImplementation(
      async (args?: { where?: unknown; orderBy?: unknown; skip?: number; take?: number }) =>
        executeQuery(paymentRows, args)
    );
  });

  it("keeps orders query semantics aligned (filter + pagination)", async () => {
    const params = { page: 1, pageSize: 2, stage: "待处理", q: "Alice" };
    const [legacy, edge] = await Promise.all([
      queryOrdersLegacy(params),
      queryOrdersEdgeRead(params),
    ]);
    expect(edge).toEqual(legacy);
  });

  it("keeps orders cursor semantics aligned", async () => {
    const params = { pageSize: 1, cursor: { createdAt: dates.t4.getTime(), id: "ORD-1" } };
    const [legacy, edge] = await Promise.all([
      queryOrdersCursorLegacy(params),
      queryOrdersCursorEdgeRead(params),
    ]);
    expect(edge).toEqual(legacy);
  });

  it("keeps support query semantics aligned", async () => {
    const params = { page: 1, pageSize: 5, status: "处理中", q: "退款" };
    const [legacy, edge] = await Promise.all([
      querySupportLegacy(params),
      querySupportTicketsEdgeRead(params),
    ]);
    expect(edge).toEqual(legacy);
  });

  it("keeps support cursor semantics aligned", async () => {
    const params = { pageSize: 1, q: "支付" };
    const [legacy, edge] = await Promise.all([
      querySupportCursorLegacy(params),
      querySupportTicketsCursorEdgeRead(params),
    ]);
    expect(edge).toEqual(legacy);
  });

  it("keeps referral query semantics aligned", async () => {
    const params = { page: 1, pageSize: 10, status: "rewarded", q: "ORD-3" };
    const [legacy, edge] = await Promise.all([
      queryReferralsLegacy(params),
      queryReferralsEdgeRead(params),
    ]);
    expect(edge).toEqual(legacy);
  });

  it("keeps members + tiers query semantics aligned", async () => {
    const memberParams = { page: 1, pageSize: 10, status: "有效", q: "Alice" };
    const memberCursorParams = { pageSize: 1, q: "Alice" };
    const tierParams = { page: 1, pageSize: 10, status: "上架", q: "黄金" };
    const tierCursorParams = { pageSize: 1, q: "TIER-2" };

    const [legacyMembers, edgeMembers, legacyMembersCursor, edgeMembersCursor] = await Promise.all([
      queryMembersLegacy(memberParams),
      queryMembersEdgeRead(memberParams),
      queryMembersCursorLegacy(memberCursorParams),
      queryMembersCursorEdgeRead(memberCursorParams),
    ]);
    expect(edgeMembers).toEqual(legacyMembers);
    expect(edgeMembersCursor).toEqual(legacyMembersCursor);

    const [legacyTiers, edgeTiers, legacyTiersCursor, edgeTiersCursor] = await Promise.all([
      queryTiersLegacy(tierParams),
      queryMembershipTiersEdgeRead(tierParams),
      queryTiersCursorLegacy(tierCursorParams),
      queryMembershipTiersCursorEdgeRead(tierCursorParams),
    ]);
    expect(edgeTiers).toEqual(legacyTiers);
    expect(edgeTiersCursor).toEqual(legacyTiersCursor);
  });

  it("keeps payment event query semantics aligned", async () => {
    const pageParams = { page: 1, pageSize: 10 };
    const cursorParams = { pageSize: 1 };
    const [legacy, edge, legacyCursor, edgeCursor] = await Promise.all([
      queryPaymentsLegacy(pageParams),
      queryPaymentEventsEdgeRead(pageParams),
      queryPaymentsCursorLegacy(cursorParams),
      queryPaymentEventsCursorEdgeRead(cursorParams),
    ]);
    expect(edge).toEqual(legacy);
    expect(edgeCursor).toEqual(legacyCursor);
  });
});
