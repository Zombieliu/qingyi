import "server-only";

import { toNumber } from "@/lib/edge-db/client";
import { toEdgeDate } from "@/lib/edge-db/date-normalization";
import { scanEdgeTableRows } from "@/lib/edge-db/scan-utils";

type TimeValue = string | number | null | undefined;

type GrowthEventRow = {
  event: string;
  clientId: string | null;
  sessionId: string | null;
  userAddress: string | null;
  path: string | null;
  createdAt: TimeValue;
};

type RevenueOrderRow = {
  amount: string | number | null;
  currency: string;
  stage: string;
  item: string;
  source: string | null;
  serviceFee: string | number | null;
  createdAt: TimeValue;
};

type PerformanceOrderRow = {
  assignedTo: string | null;
  companionAddress: string | null;
  stage: string;
  amount: string | number | null;
  id: string;
};

type PerformanceReviewRow = {
  companionAddress: string;
  rating: string | number | null;
};

type PerformancePlayerRow = {
  id: string;
  name: string;
  address: string | null;
};

type DashboardTodayOrderRow = {
  amount: string | number | null;
  stage: string;
  serviceFee: string | number | null;
  createdAt: TimeValue;
  assignedTo: string | null;
  userAddress: string | null;
};

type DashboardYesterdayOrderRow = {
  amount: string | number | null;
  stage: string;
  serviceFee: string | number | null;
};

type DashboardWeekOrderRow = {
  amount: string | number | null;
  stage: string;
  serviceFee: string | number | null;
  createdAt: TimeValue;
  userAddress: string | null;
  assignedTo: string | null;
};

type DashboardPrevWeekOrderRow = {
  amount: string | number | null;
  stage: string;
};

type DashboardPlayerRow = {
  id: string;
  name: string;
};

type DashboardEventRow = {
  event: string;
  userAddress: string | null;
};

type StageRow = {
  stage: string | null;
};

export type AdminGrowthEventEdgeRead = {
  event: string;
  clientId: string | null;
  sessionId: string | null;
  userAddress: string | null;
  path: string | null;
  createdAt: Date;
};

export type AdminRevenueOrderEdgeRead = {
  amount: number;
  currency: string;
  stage: string;
  item: string;
  source: string | null;
  serviceFee: number | null;
  createdAt: Date;
};

export type AdminPerformanceSnapshotEdgeRead = {
  orders: Array<{
    assignedTo: string;
    companionAddress: string | null;
    stage: string;
    amount: number;
    id: string;
  }>;
  reviews: Array<{ companionAddress: string; rating: number }>;
  players: Array<{ id: string; name: string; address: string | null }>;
};

export type AdminDashboardSnapshotEdgeRead = {
  todayOrders: Array<{
    amount: number;
    stage: string;
    serviceFee: number | null;
    createdAt: Date;
    assignedTo: string | null;
    userAddress: string | null;
  }>;
  yesterdayOrders: Array<{ amount: number; stage: string; serviceFee: number | null }>;
  weekOrders: Array<{
    amount: number;
    stage: string;
    serviceFee: number | null;
    createdAt: Date;
    userAddress: string | null;
    assignedTo: string | null;
  }>;
  prevWeekOrders: Array<{ amount: number; stage: string }>;
  allPlayers: Array<{ id: string; name: string }>;
  stageDistribution: Array<{ stage: string; _count: number }>;
  todayEvents: Array<{ event: string; userAddress: string | null }>;
};

export async function listGrowthEventsSinceEdgeRead(
  since: Date
): Promise<AdminGrowthEventEdgeRead[]> {
  const rows = await scanEdgeTableRows<GrowthEventRow>({
    table: "GrowthEvent",
    baseParams: new URLSearchParams({
      select: "event,clientId,sessionId,userAddress,path,createdAt",
      createdAt: `gte.${since.toISOString()}`,
      order: "createdAt.asc",
    }),
  });

  return rows.map((row) => ({
    event: row.event,
    clientId: row.clientId,
    sessionId: row.sessionId,
    userAddress: row.userAddress,
    path: row.path,
    createdAt: toEdgeDate(row.createdAt),
  }));
}

export async function listRevenueOrdersSinceEdgeRead(
  since: Date
): Promise<AdminRevenueOrderEdgeRead[]> {
  const rows = await scanEdgeTableRows<RevenueOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select: "amount,currency,stage,item,source,serviceFee,createdAt",
      createdAt: `gte.${since.toISOString()}`,
      order: "createdAt.asc",
    }),
  });

  return rows.map((row) => ({
    amount: toNumber(row.amount),
    currency: row.currency,
    stage: row.stage,
    item: row.item,
    source: row.source,
    serviceFee: row.serviceFee == null ? null : toNumber(row.serviceFee),
    createdAt: toEdgeDate(row.createdAt),
  }));
}

export async function getPerformanceSnapshotEdgeRead(
  since: Date
): Promise<AdminPerformanceSnapshotEdgeRead> {
  const sinceIso = since.toISOString();

  const [ordersRows, reviewsRows, playersRows] = await Promise.all([
    scanEdgeTableRows<PerformanceOrderRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "assignedTo,companionAddress,stage,amount,id",
        createdAt: `gte.${sinceIso}`,
        assignedTo: "not.is.null",
      }),
    }),
    scanEdgeTableRows<PerformanceReviewRow>({
      table: "OrderReview",
      baseParams: new URLSearchParams({
        select: "companionAddress,rating",
        createdAt: `gte.${sinceIso}`,
      }),
    }),
    scanEdgeTableRows<PerformancePlayerRow>({
      table: "AdminPlayer",
      baseParams: new URLSearchParams({
        select: "id,name,address",
        status: "neq.停用",
      }),
    }),
  ]);

  return {
    orders: ordersRows
      .filter((row) => typeof row.assignedTo === "string" && row.assignedTo.length > 0)
      .map((row) => ({
        assignedTo: row.assignedTo as string,
        companionAddress: row.companionAddress,
        stage: row.stage,
        amount: toNumber(row.amount),
        id: row.id,
      })),
    reviews: reviewsRows.map((row) => ({
      companionAddress: row.companionAddress,
      rating: toNumber(row.rating),
    })),
    players: playersRows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
    })),
  };
}

export async function getDashboardSnapshotEdgeRead(args: {
  todayStart: Date;
  yesterdayStart: Date;
  weekAgo: Date;
  twoWeeksAgo: Date;
}): Promise<AdminDashboardSnapshotEdgeRead> {
  const todayIso = args.todayStart.toISOString();
  const yesterdayIso = args.yesterdayStart.toISOString();
  const weekAgoIso = args.weekAgo.toISOString();
  const twoWeeksAgoIso = args.twoWeeksAgo.toISOString();

  const [
    todayOrdersRows,
    yesterdayOrdersRows,
    weekOrdersRows,
    prevWeekOrdersRows,
    playersRows,
    stageRows,
    todayEventsRows,
  ] = await Promise.all([
    scanEdgeTableRows<DashboardTodayOrderRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "amount,stage,serviceFee,createdAt,assignedTo,userAddress",
        createdAt: `gte.${todayIso}`,
      }),
    }),
    scanEdgeTableRows<DashboardYesterdayOrderRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "amount,stage,serviceFee",
        createdAt: `gte.${yesterdayIso}`,
        "createdAt.lt": todayIso,
      }),
    }),
    scanEdgeTableRows<DashboardWeekOrderRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "amount,stage,serviceFee,createdAt,userAddress,assignedTo",
        createdAt: `gte.${weekAgoIso}`,
      }),
    }),
    scanEdgeTableRows<DashboardPrevWeekOrderRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "amount,stage",
        createdAt: `gte.${twoWeeksAgoIso}`,
        "createdAt.lt": weekAgoIso,
      }),
    }),
    scanEdgeTableRows<DashboardPlayerRow>({
      table: "AdminPlayer",
      baseParams: new URLSearchParams({
        select: "id,name",
        status: "neq.停用",
      }),
    }),
    scanEdgeTableRows<StageRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "stage",
      }),
    }),
    scanEdgeTableRows<DashboardEventRow>({
      table: "GrowthEvent",
      baseParams: new URLSearchParams({
        select: "event,userAddress",
        createdAt: `gte.${todayIso}`,
      }),
    }),
  ]);

  const stageCounts = new Map<string, number>();
  for (const row of stageRows) {
    const stage = row.stage || "unknown";
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }

  return {
    todayOrders: todayOrdersRows.map((row) => ({
      amount: toNumber(row.amount),
      stage: row.stage,
      serviceFee: row.serviceFee == null ? null : toNumber(row.serviceFee),
      createdAt: toEdgeDate(row.createdAt),
      assignedTo: row.assignedTo,
      userAddress: row.userAddress,
    })),
    yesterdayOrders: yesterdayOrdersRows.map((row) => ({
      amount: toNumber(row.amount),
      stage: row.stage,
      serviceFee: row.serviceFee == null ? null : toNumber(row.serviceFee),
    })),
    weekOrders: weekOrdersRows.map((row) => ({
      amount: toNumber(row.amount),
      stage: row.stage,
      serviceFee: row.serviceFee == null ? null : toNumber(row.serviceFee),
      createdAt: toEdgeDate(row.createdAt),
      userAddress: row.userAddress,
      assignedTo: row.assignedTo,
    })),
    prevWeekOrders: prevWeekOrdersRows.map((row) => ({
      amount: toNumber(row.amount),
      stage: row.stage,
    })),
    allPlayers: playersRows,
    stageDistribution: Array.from(stageCounts.entries()).map(([stage, count]) => ({
      stage,
      _count: count,
    })),
    todayEvents: todayEventsRows,
  };
}
