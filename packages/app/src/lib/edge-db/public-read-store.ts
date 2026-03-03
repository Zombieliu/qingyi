import "server-only";

import { TZDate } from "@date-fns/tz";
import { startOfMonth, startOfWeek } from "date-fns";
import type {
  AdminAnnouncement,
  AdminMembershipTier,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardType,
} from "@/lib/admin/admin-types";
import { getCache, setCache } from "@/lib/server-cache";

type EdgeDbConfig = {
  baseUrl: string;
  apiKey: string;
};

type AnnouncementRow = {
  id: string;
  title: string;
  tag: string;
  content: string;
  status: string;
  createdAt: string | number | null;
  updatedAt: string | number | null;
};

type MembershipTierRow = {
  id: string;
  name: string;
  level: number | string;
  badge: string | null;
  price: string | number | null;
  durationDays: number | null;
  minPoints: number | null;
  status: string;
  perks: unknown;
  createdAt: string | number | null;
  updatedAt: string | number | null;
};

type SpendLeaderboardRow = {
  userAddress: string | null;
  total: string | number | null;
};

type CompanionLeaderboardRow = {
  companionAddress: string | null;
  count: string | number | null;
  total: string | number | null;
};

type ReferralLeaderboardRow = {
  inviterAddress: string | null;
  count: string | number | null;
};

const LEADERBOARD_CACHE_TTL_MS = 60_000;
const EDGE_DB_SCAN_PAGE_SIZE = 1_000;
const EDGE_DB_SCAN_MAX_ROWS = 20_000;

function getFirstEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getEdgeDbConfig(): EdgeDbConfig | null {
  const baseUrl = getFirstEnv("EDGE_DB_REST_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const apiKey = getFirstEnv(
    "EDGE_DB_REST_ANON_KEY",
    "EDGE_DB_REST_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: stripTrailingSlash(baseUrl), apiKey };
}

function getRestBaseUrl(config: EdgeDbConfig): string {
  if (config.baseUrl.endsWith("/rest/v1")) return config.baseUrl;
  return `${config.baseUrl}/rest/v1`;
}

function toEpochMs(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getPeriodStart(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;
  const now = new TZDate(Date.now(), "Asia/Shanghai");
  if (period === "month") {
    return startOfMonth(now);
  }
  return startOfWeek(now, { weekStartsOn: 1 });
}

async function fetchEdgeRows<T>(table: string, params: URLSearchParams): Promise<T[]> {
  const config = getEdgeDbConfig();
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config)}/${table}`);
  url.search = params.toString();

  const res = await fetch(url.toString(), {
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`edge_db_request_failed:${table}:${res.status}:${detail}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`edge_db_invalid_payload:${table}`);
  }

  return data as T[];
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

function mapAnnouncement(row: AnnouncementRow): AdminAnnouncement {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    content: row.content,
    status: row.status as AdminAnnouncement["status"],
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt),
  };
}

function mapTier(row: MembershipTierRow): AdminMembershipTier {
  return {
    id: row.id,
    name: row.name,
    level: toNumber(row.level),
    badge: row.badge ?? undefined,
    price: row.price != null ? toNumber(row.price) : undefined,
    durationDays: row.durationDays ?? undefined,
    minPoints: row.minPoints ?? undefined,
    status: row.status as AdminMembershipTier["status"],
    perks: row.perks as AdminMembershipTier["perks"],
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt),
  };
}

function finalizeLeaderboard(entries: LeaderboardEntry[], limit: number): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    const aExtra = a.extra ?? 0;
    const bExtra = b.extra ?? 0;
    if (bExtra !== aExtra) return bExtra - aExtra;
    return a.address.localeCompare(b.address);
  });

  return sorted.slice(0, limit).map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

function attachPeriodFilter(
  params: URLSearchParams,
  fieldName: string,
  periodStart: Date | null
): URLSearchParams {
  if (periodStart) {
    params.set(fieldName, `gte.${periodStart.toISOString()}`);
  }
  return params;
}

async function querySpendLeaderboard(
  limit: number,
  periodStart: Date | null
): Promise<LeaderboardEntry[]> {
  const params = attachPeriodFilter(
    new URLSearchParams({
      select: "userAddress,total:amount.sum()",
      stage: "eq.已完成",
      userAddress: "not.is.null",
      order: "total.desc",
      limit: String(limit),
    }),
    "createdAt",
    periodStart
  );

  const rows = await fetchEdgeRows<SpendLeaderboardRow>("AdminOrder", params);
  return rows
    .map((row, idx) => ({
      rank: idx + 1,
      address: toNonEmptyString(row.userAddress),
      value: toNumber(row.total),
    }))
    .filter((row) => row.address.length > 0);
}

async function queryCompanionLeaderboard(
  limit: number,
  periodStart: Date | null
): Promise<LeaderboardEntry[]> {
  const params = attachPeriodFilter(
    new URLSearchParams({
      select: "companionAddress,count:id.count(),total:amount.sum()",
      stage: "eq.已完成",
      companionAddress: "not.is.null",
      order: "count.desc",
      limit: String(limit),
    }),
    "createdAt",
    periodStart
  );

  const rows = await fetchEdgeRows<CompanionLeaderboardRow>("AdminOrder", params);
  return rows
    .map((row, idx) => ({
      rank: idx + 1,
      address: toNonEmptyString(row.companionAddress),
      value: toNumber(row.count),
      extra: toNumber(row.total),
    }))
    .filter((row) => row.address.length > 0);
}

async function queryReferralLeaderboard(
  limit: number,
  periodStart: Date | null
): Promise<LeaderboardEntry[]> {
  const params = attachPeriodFilter(
    new URLSearchParams({
      select: "inviterAddress,count:id.count()",
      status: "eq.rewarded",
      order: "count.desc",
      limit: String(limit),
    }),
    "rewardedAt",
    periodStart
  );

  const rows = await fetchEdgeRows<ReferralLeaderboardRow>("Referral", params);
  return rows
    .map((row, idx) => ({
      rank: idx + 1,
      address: toNonEmptyString(row.inviterAddress),
      value: toNumber(row.count),
    }))
    .filter((row) => row.address.length > 0);
}

async function scanSpendLeaderboard(
  limit: number,
  periodStart: Date | null
): Promise<LeaderboardEntry[]> {
  const params = attachPeriodFilter(
    new URLSearchParams({
      select: "userAddress,amount",
      stage: "eq.已完成",
      userAddress: "not.is.null",
      order: "createdAt.desc",
    }),
    "createdAt",
    periodStart
  );

  const rows = await scanEdgeRows<{ userAddress: string | null; amount: string | number | null }>(
    "AdminOrder",
    params
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.userAddress) continue;
    totals.set(row.userAddress, (totals.get(row.userAddress) || 0) + toNumber(row.amount));
  }

  return finalizeLeaderboard(
    [...totals.entries()].map(([address, value]) => ({ rank: 0, address, value })),
    limit
  );
}

async function scanCompanionLeaderboard(
  limit: number,
  periodStart: Date | null
): Promise<LeaderboardEntry[]> {
  const params = attachPeriodFilter(
    new URLSearchParams({
      select: "companionAddress,amount",
      stage: "eq.已完成",
      companionAddress: "not.is.null",
      order: "createdAt.desc",
    }),
    "createdAt",
    periodStart
  );

  const rows = await scanEdgeRows<{
    companionAddress: string | null;
    amount: string | number | null;
  }>("AdminOrder", params);
  const summary = new Map<string, { count: number; total: number }>();
  for (const row of rows) {
    if (!row.companionAddress) continue;
    const item = summary.get(row.companionAddress) || { count: 0, total: 0 };
    item.count += 1;
    item.total += toNumber(row.amount);
    summary.set(row.companionAddress, item);
  }

  return finalizeLeaderboard(
    [...summary.entries()].map(([address, value]) => ({
      rank: 0,
      address,
      value: value.count,
      extra: value.total,
    })),
    limit
  );
}

async function scanReferralLeaderboard(
  limit: number,
  periodStart: Date | null
): Promise<LeaderboardEntry[]> {
  const params = attachPeriodFilter(
    new URLSearchParams({
      select: "inviterAddress",
      status: "eq.rewarded",
      order: "createdAt.desc",
    }),
    "rewardedAt",
    periodStart
  );

  const rows = await scanEdgeRows<{ inviterAddress: string | null }>("Referral", params);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.inviterAddress) continue;
    counts.set(row.inviterAddress, (counts.get(row.inviterAddress) || 0) + 1);
  }

  return finalizeLeaderboard(
    [...counts.entries()].map(([address, value]) => ({ rank: 0, address, value })),
    limit
  );
}

export async function listPublicAnnouncementsEdgeRead(): Promise<AdminAnnouncement[]> {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return [];
  }
  const params = new URLSearchParams({
    select: "id,title,tag,content,status,createdAt,updatedAt",
    status: "eq.published",
    deletedAt: "is.null",
    order: "updatedAt.desc.nullslast,createdAt.desc",
  });
  const rows = await fetchEdgeRows<AnnouncementRow>("AdminAnnouncement", params);
  return rows.map(mapAnnouncement);
}

export async function listActiveMembershipTiersEdgeRead(): Promise<AdminMembershipTier[]> {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return [];
  }
  const params = new URLSearchParams({
    select: "id,name,level,badge,price,durationDays,minPoints,status,perks,createdAt,updatedAt",
    status: "eq.上架",
    order: "level.asc",
  });
  const rows = await fetchEdgeRows<MembershipTierRow>("AdminMembershipTier", params);
  return rows.map(mapTier);
}

export async function getLeaderboardEdgeRead(
  type: LeaderboardType,
  period: LeaderboardPeriod,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const cacheKey = `leaderboard:${type}:${period}`;
  const cached = getCache<LeaderboardEntry[]>(cacheKey);
  if (cached) {
    return cached.value;
  }

  const periodStart = getPeriodStart(period);
  let entries: LeaderboardEntry[] = [];

  if (type === "spend") {
    try {
      entries = await querySpendLeaderboard(limit, periodStart);
    } catch {
      entries = await scanSpendLeaderboard(limit, periodStart);
    }
  } else if (type === "companion") {
    try {
      entries = await queryCompanionLeaderboard(limit, periodStart);
    } catch {
      entries = await scanCompanionLeaderboard(limit, periodStart);
    }
  } else {
    try {
      entries = await queryReferralLeaderboard(limit, periodStart);
    } catch {
      entries = await scanReferralLeaderboard(limit, periodStart);
    }
  }

  setCache(cacheKey, entries, LEADERBOARD_CACHE_TTL_MS);
  return entries;
}
