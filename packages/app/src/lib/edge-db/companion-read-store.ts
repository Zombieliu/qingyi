import "server-only";

import { fetchEdgeRows, toEpochMs, toNumber } from "@/lib/edge-db/client";

const EDGE_DB_SCAN_PAGE_SIZE = 1_000;
const EDGE_DB_SCAN_MAX_ROWS = 20_000;

const COMPANION_ACTIVE_STAGES = ["已支付", "进行中", "待结算"];
const COMPANION_COMPLETED_STAGES = ["已完成", "已取消", "已退款"];

const DUO_ACTIVE_STAGES = ["待处理", "已确认", "进行中"];
const DUO_COMPLETED_STAGES = ["已完成", "已取消"];

type CompanionOrderRow = {
  id: string;
  user: string;
  userAddress: string | null;
  item: string;
  amount: string | number | null;
  stage: string;
  serviceFee: string | number | null;
  chainStatus: number | null;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  note: string | null;
  meta: unknown;
};

type CompanionDuoOrderRow = {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddressA: string | null;
  companionAddressB: string | null;
  item: string;
  amount: string | number | null;
  stage: string;
  serviceFee: string | number | null;
  depositPerCompanion: string | number | null;
  teamStatus: number | null;
  chainStatus: number | null;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  note: string | null;
  meta: unknown;
};

type CompanionOrderMetricRow = {
  amount: string | number | null;
  serviceFee: string | number | null;
  createdAt: string | number | null;
};

type CompanionReviewMetricRow = {
  rating: string | number | null;
};

type CompanionPlayerRow = {
  id: string;
  name: string;
  status: string;
  role: string | null;
};

type ScanIdRow = { id: string };

type CompanionStatsAggregate = {
  _count: { id: number | null };
  _sum: { amount: number | null; serviceFee: number | null };
};

type CompanionTodayStatsAggregate = {
  _count: { id: number | null };
  _sum: { amount: number | null };
};

type CompanionReviewAggregate = {
  _avg: { rating: number | null };
  _count: { id: number | null };
};

export type CompanionOrderListItem = {
  id: string;
  user: string;
  userAddress: string | null;
  item: string;
  amount: number;
  stage: string;
  serviceFee: number | null;
  chainStatus: number | null;
  createdAt: number;
  updatedAt: number | null;
  note: string | null;
  meta: unknown;
};

export type CompanionDuoOrderListItem = {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddressA: string | null;
  companionAddressB: string | null;
  item: string;
  amount: number;
  stage: string;
  serviceFee: number | null;
  depositPerCompanion: number | null;
  teamStatus: number | null;
  chainStatus: number | null;
  createdAt: number;
  updatedAt: number | null;
  note: string | null;
  meta: unknown;
};

export type CompanionStatsSnapshot = {
  totalStats: CompanionStatsAggregate;
  monthStats: CompanionStatsAggregate;
  todayStats: CompanionTodayStatsAggregate;
  activeOrders: number;
  reviews: CompanionReviewAggregate;
  player: { id: string; name: string; status: string; role: string | null } | null;
};

function withStageFilter(
  params: URLSearchParams,
  status: string,
  activeStages: string[],
  completedStages: string[]
): URLSearchParams {
  if (status === "active") {
    params.set("stage", `in.(${activeStages.join(",")})`);
  } else if (status === "completed") {
    params.set("stage", `in.(${completedStages.join(",")})`);
  }
  return params;
}

async function scanEdgeRows<T>(table: string, baseParams: URLSearchParams): Promise<T[]> {
  const allRows: T[] = [];

  for (let offset = 0; offset < EDGE_DB_SCAN_MAX_ROWS; offset += EDGE_DB_SCAN_PAGE_SIZE) {
    const params = new URLSearchParams(baseParams);
    params.set("limit", String(EDGE_DB_SCAN_PAGE_SIZE));
    params.set("offset", String(offset));
    const rows = await fetchEdgeRows<T>(table, params);
    allRows.push(...rows);
    if (rows.length < EDGE_DB_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return allRows;
}

async function scanEdgeRowCount(table: string, baseParams: URLSearchParams): Promise<number> {
  let total = 0;

  for (let offset = 0; offset < EDGE_DB_SCAN_MAX_ROWS; offset += EDGE_DB_SCAN_PAGE_SIZE) {
    const params = new URLSearchParams(baseParams);
    params.set("select", "id");
    params.set("limit", String(EDGE_DB_SCAN_PAGE_SIZE));
    params.set("offset", String(offset));
    const rows = await fetchEdgeRows<ScanIdRow>(table, params);
    total += rows.length;
    if (rows.length < EDGE_DB_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return total;
}

function mapCompanionOrderRow(row: CompanionOrderRow): CompanionOrderListItem {
  return {
    id: row.id,
    user: row.user,
    userAddress: row.userAddress,
    item: row.item,
    amount: toNumber(row.amount),
    stage: row.stage,
    serviceFee: row.serviceFee == null ? null : toNumber(row.serviceFee),
    chainStatus: row.chainStatus,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt) ?? null,
    note: row.note,
    meta: row.meta,
  };
}

function mapCompanionDuoOrderRow(row: CompanionDuoOrderRow): CompanionDuoOrderListItem {
  return {
    id: row.id,
    user: row.user,
    userAddress: row.userAddress,
    companionAddressA: row.companionAddressA,
    companionAddressB: row.companionAddressB,
    item: row.item,
    amount: toNumber(row.amount),
    stage: row.stage,
    serviceFee: row.serviceFee == null ? null : toNumber(row.serviceFee),
    depositPerCompanion: row.depositPerCompanion == null ? null : toNumber(row.depositPerCompanion),
    teamStatus: row.teamStatus,
    chainStatus: row.chainStatus,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt) ?? null,
    note: row.note,
    meta: row.meta,
  };
}

function buildCompanionAggregate(
  count: number,
  amount: number,
  serviceFee: number
): CompanionStatsAggregate {
  return {
    _count: { id: count },
    _sum: {
      amount: count > 0 ? amount : null,
      serviceFee: count > 0 ? serviceFee : null,
    },
  };
}

function buildCompanionTodayAggregate(count: number, amount: number): CompanionTodayStatsAggregate {
  return {
    _count: { id: count },
    _sum: {
      amount: count > 0 ? amount : null,
    },
  };
}

export async function queryCompanionOrdersEdgeRead(args: {
  address: string;
  status: string;
  page: number;
  pageSize: number;
}): Promise<{ total: number; rows: CompanionOrderListItem[] }> {
  const baseParams = withStageFilter(
    new URLSearchParams({ companionAddress: `eq.${args.address}` }),
    args.status,
    COMPANION_ACTIVE_STAGES,
    COMPANION_COMPLETED_STAGES
  );

  const rowsParams = new URLSearchParams(baseParams);
  rowsParams.set(
    "select",
    "id,user,userAddress,item,amount,stage,serviceFee,chainStatus,createdAt,updatedAt,note,meta"
  );
  rowsParams.set("order", "createdAt.desc");
  rowsParams.set("offset", String((args.page - 1) * args.pageSize));
  rowsParams.set("limit", String(args.pageSize));

  const [total, rows] = await Promise.all([
    scanEdgeRowCount("AdminOrder", baseParams),
    fetchEdgeRows<CompanionOrderRow>("AdminOrder", rowsParams),
  ]);

  return {
    total,
    rows: rows.map(mapCompanionOrderRow),
  };
}

export async function queryCompanionDuoOrdersEdgeRead(args: {
  address: string;
  status: string;
  page: number;
  pageSize: number;
}): Promise<{ total: number; rows: CompanionDuoOrderListItem[] }> {
  const baseParams = withStageFilter(
    new URLSearchParams({
      or: `(companionAddressA.eq.${args.address},companionAddressB.eq.${args.address})`,
    }),
    args.status,
    DUO_ACTIVE_STAGES,
    DUO_COMPLETED_STAGES
  );

  const rowsParams = new URLSearchParams(baseParams);
  rowsParams.set(
    "select",
    "id,user,userAddress,companionAddressA,companionAddressB,item,amount,stage,serviceFee,depositPerCompanion,teamStatus,chainStatus,createdAt,updatedAt,note,meta"
  );
  rowsParams.set("order", "createdAt.desc");
  rowsParams.set("offset", String((args.page - 1) * args.pageSize));
  rowsParams.set("limit", String(args.pageSize));

  const [total, rows] = await Promise.all([
    scanEdgeRowCount("DuoOrder", baseParams),
    fetchEdgeRows<CompanionDuoOrderRow>("DuoOrder", rowsParams),
  ]);

  return {
    total,
    rows: rows.map(mapCompanionDuoOrderRow),
  };
}

export async function getCompanionStatsEdgeRead(
  address: string,
  now = new Date()
): Promise<CompanionStatsSnapshot> {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const [completedRows, activeOrders, reviewRows, players] = await Promise.all([
    scanEdgeRows<CompanionOrderMetricRow>(
      "AdminOrder",
      new URLSearchParams({
        select: "amount,serviceFee,createdAt",
        companionAddress: `eq.${address}`,
        stage: "eq.已完成",
      })
    ),
    scanEdgeRowCount(
      "AdminOrder",
      withStageFilter(
        new URLSearchParams({ companionAddress: `eq.${address}` }),
        "active",
        COMPANION_ACTIVE_STAGES,
        COMPANION_COMPLETED_STAGES
      )
    ),
    scanEdgeRows<CompanionReviewMetricRow>(
      "OrderReview",
      new URLSearchParams({
        select: "rating",
        companionAddress: `eq.${address}`,
      })
    ),
    fetchEdgeRows<CompanionPlayerRow>(
      "AdminPlayer",
      new URLSearchParams({
        select: "id,name,status,role",
        address: `eq.${address}`,
        limit: "1",
      })
    ),
  ]);

  let totalCount = 0;
  let totalRevenue = 0;
  let totalServiceFee = 0;
  let monthCount = 0;
  let monthRevenue = 0;
  let monthServiceFee = 0;
  let todayCount = 0;
  let todayRevenue = 0;

  for (const row of completedRows) {
    const createdAt = toEpochMs(row.createdAt) ?? 0;
    const amount = toNumber(row.amount);
    const serviceFee = row.serviceFee == null ? 0 : toNumber(row.serviceFee);

    totalCount += 1;
    totalRevenue += amount;
    totalServiceFee += serviceFee;

    if (createdAt >= monthStart) {
      monthCount += 1;
      monthRevenue += amount;
      monthServiceFee += serviceFee;
    }

    if (createdAt >= todayStart) {
      todayCount += 1;
      todayRevenue += amount;
    }
  }

  let reviewCount = 0;
  let reviewSum = 0;
  for (const row of reviewRows) {
    if (row.rating == null) continue;
    reviewCount += 1;
    reviewSum += toNumber(row.rating);
  }

  const reviewAvg = reviewCount > 0 ? reviewSum / reviewCount : null;

  const player = players.length
    ? {
        id: players[0].id,
        name: players[0].name,
        status: players[0].status,
        role: players[0].role,
      }
    : null;

  return {
    totalStats: buildCompanionAggregate(totalCount, totalRevenue, totalServiceFee),
    monthStats: buildCompanionAggregate(monthCount, monthRevenue, monthServiceFee),
    todayStats: buildCompanionTodayAggregate(todayCount, todayRevenue),
    activeOrders,
    reviews: {
      _avg: { rating: reviewAvg },
      _count: { id: reviewCount },
    },
    player,
  };
}
