import { listPublicAnnouncements } from "@/lib/admin/admin-store";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const CACHE_KEY = "api:announcements:public";
const CACHE_TTL_MS = 30_000;
const CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";

export async function GET(req: Request) {
  const cached = getCache<unknown>(CACHE_KEY);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const announcements = await listPublicAnnouncements();
  const etag = computeJsonEtag(announcements);
  setCache(CACHE_KEY, announcements, CACHE_TTL_MS, etag);
  return jsonWithEtag(announcements, etag, CACHE_CONTROL);
}
