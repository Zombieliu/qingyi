import { requireAdmin } from "@/lib/admin/admin-auth";
import { prisma } from "@/lib/db";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const ADMIN_ANALYTICS_CACHE_TTL_MS = 10_000;
const ADMIN_ANALYTICS_CACHE_CONTROL = "private, max-age=10, stale-while-revalidate=30";

function clampDays(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(value)));
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = clampDays(Number(searchParams.get("days") || DEFAULT_DAYS));
  const cacheKey = `api:admin:analytics:${days}`;
  const cached = getCache<{
    rangeDays: number;
    totalEvents: number;
    events: Array<{ event: string; count: number; unique: number }>;
    funnel: Array<{ step: string; unique: number; conversionFromPrev: number }>;
    topPaths: Array<{ path: string; count: number }>;
  }>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, ADMIN_ANALYTICS_CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, ADMIN_ANALYTICS_CACHE_CONTROL);
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.growthEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { event: true, clientId: true, sessionId: true, userAddress: true, path: true },
  });

  const uniqueByEvent = new Map<string, Set<string>>();
  const countsByEvent = new Map<string, number>();
  const pathCounts = new Map<string, number>();

  for (const row of rows) {
    const identity = row.clientId || row.sessionId || row.userAddress || row.path || "unknown";
    if (!uniqueByEvent.has(row.event)) uniqueByEvent.set(row.event, new Set());
    uniqueByEvent.get(row.event)!.add(identity);
    countsByEvent.set(row.event, (countsByEvent.get(row.event) || 0) + 1);
    if (row.path) {
      pathCounts.set(row.path, (pathCounts.get(row.path) || 0) + 1);
    }
  }

  const funnelSteps = ["page_view", "order_intent", "order_create_success"];
  const funnel = funnelSteps.map((step, index) => {
    const unique = uniqueByEvent.get(step)?.size || 0;
    const prevUnique = index === 0 ? unique : uniqueByEvent.get(funnelSteps[index - 1])?.size || 0;
    return {
      step,
      unique,
      conversionFromPrev: prevUnique > 0 ? Number((unique / prevUnique).toFixed(3)) : 0,
    };
  });

  const events = Array.from(countsByEvent.entries())
    .map(([event, count]) => ({
      event,
      count,
      unique: uniqueByEvent.get(event)?.size || 0,
    }))
    .sort((a, b) => b.count - a.count);

  const topPaths = Array.from(pathCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const payload = {
    rangeDays: days,
    totalEvents: rows.length,
    events,
    funnel,
    topPaths,
  };
  const etag = computeJsonEtag(payload);
  setCache(cacheKey, payload, ADMIN_ANALYTICS_CACHE_TTL_MS, etag);
  return jsonWithEtag(payload, etag, ADMIN_ANALYTICS_CACHE_CONTROL);
}
