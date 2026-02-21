import { requireAdmin } from "@/lib/admin/admin-auth";
import { prisma } from "@/lib/db";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";
import { formatDateISO } from "@/lib/shared/date-utils";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const CACHE_TTL_MS = 30_000;
const CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=60";

function clampDays(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(value)));
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = clampDays(Number(searchParams.get("days") || DEFAULT_DAYS));
  const cacheKey = `api:admin:analytics:trend:${days}`;
  const cached = getCache<unknown>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.growthEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { event: true, clientId: true, sessionId: true, userAddress: true, createdAt: true },
  });

  // Build daily buckets
  const dailyMap = new Map<
    string,
    { views: Set<string>; intents: Set<string>; orders: Set<string> }
  >();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const key = formatDateISO(d);
    dailyMap.set(key, { views: new Set(), intents: new Set(), orders: new Set() });
  }

  for (const row of rows) {
    const key = formatDateISO(row.createdAt);
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    const identity = row.clientId || row.sessionId || row.userAddress || "unknown";
    if (row.event === "page_view") bucket.views.add(identity);
    else if (row.event === "order_intent") bucket.intents.add(identity);
    else if (row.event === "order_create_success") bucket.orders.add(identity);
  }

  // Retention: users who placed an order and returned within the period
  const orderUsers = new Set<string>();
  const returnUsers = new Set<string>();
  const userFirstOrder = new Map<string, string>();
  for (const row of rows) {
    const identity = row.clientId || row.sessionId || row.userAddress || "unknown";
    if (row.event === "order_create_success") {
      const day = formatDateISO(row.createdAt);
      if (!userFirstOrder.has(identity) || day < userFirstOrder.get(identity)!) {
        userFirstOrder.set(identity, day);
      }
      orderUsers.add(identity);
    }
  }
  for (const row of rows) {
    const identity = row.clientId || row.sessionId || row.userAddress || "unknown";
    if (row.event === "page_view" && orderUsers.has(identity)) {
      const day = formatDateISO(row.createdAt);
      if (userFirstOrder.has(identity) && day > userFirstOrder.get(identity)!) {
        returnUsers.add(identity);
      }
    }
  }

  const trend = Array.from(dailyMap.entries()).map(([date, bucket]) => ({
    date,
    views: bucket.views.size,
    intents: bucket.intents.size,
    orders: bucket.orders.size,
  }));

  const payload = {
    rangeDays: days,
    trend,
    retention: {
      orderUsers: orderUsers.size,
      returnUsers: returnUsers.size,
      rate: orderUsers.size > 0 ? Math.round((returnUsers.size / orderUsers.size) * 1000) / 10 : 0,
    },
  };

  const etag = computeJsonEtag(payload);
  setCache(cacheKey, payload, CACHE_TTL_MS, etag);
  return jsonWithEtag(payload, etag, CACHE_CONTROL);
}
