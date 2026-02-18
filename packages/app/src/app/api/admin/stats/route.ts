import { requireAdmin } from "@/lib/admin/admin-auth";
import { getAdminStats } from "@/lib/admin/admin-store";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const ADMIN_STATS_CACHE_TTL_MS = 3000;
const ADMIN_STATS_CACHE_CONTROL = "private, max-age=3, stale-while-revalidate=10";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const cacheKey = "api:admin:stats";
  const cached = getCache<Awaited<ReturnType<typeof getAdminStats>>>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, ADMIN_STATS_CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, ADMIN_STATS_CACHE_CONTROL);
  }
  const stats = await getAdminStats();
  const etag = computeJsonEtag(stats);
  setCache(cacheKey, stats, ADMIN_STATS_CACHE_TTL_MS, etag);
  return jsonWithEtag(stats, etag, ADMIN_STATS_CACHE_CONTROL);
}
