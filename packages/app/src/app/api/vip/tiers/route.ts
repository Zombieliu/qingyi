import { listActiveMembershipTiers } from "@/lib/admin/admin-store";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const CACHE_KEY = "api:vip:tiers:active";
const CACHE_TTL_MS = 60_000;
const CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=120";

export async function GET(req: Request) {
  const cached = getCache<unknown>(CACHE_KEY);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const tiers = await listActiveMembershipTiers();
  const etag = computeJsonEtag(tiers);
  setCache(CACHE_KEY, tiers, CACHE_TTL_MS, etag);
  return jsonWithEtag(tiers, etag, CACHE_CONTROL);
}
