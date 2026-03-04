import { listActiveCouponsEdgeRead } from "@/lib/edge-db/user-read-store";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const CACHE_KEY = "api:coupons:active";
const CACHE_TTL_MS = 30_000;
const CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=60";

export async function GET(req: Request) {
  const cached = getCache<unknown>(CACHE_KEY);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const coupons = await listActiveCouponsEdgeRead();
  const etag = computeJsonEtag(coupons);
  setCache(CACHE_KEY, coupons, CACHE_TTL_MS, etag);
  return jsonWithEtag(coupons, etag, CACHE_CONTROL);
}
