import { listPlayersPublic } from "@/lib/admin-store";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const PLAYERS_CACHE_TTL_MS = 5000;
const PLAYERS_CACHE_CONTROL = "public, max-age=5, stale-while-revalidate=30";

type PublicPlayerPayload = Array<{
  id: string;
  name: string;
  role?: string;
  status: string;
}>;

export async function GET(req: Request) {
  const cacheKey = "api:players:available";
  const cached = getCache<PublicPlayerPayload>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) {
      return notModified(cached.etag, PLAYERS_CACHE_CONTROL);
    }
    return jsonWithEtag(cached.value, cached.etag, PLAYERS_CACHE_CONTROL);
  }

  const players = await listPlayersPublic();
  const available = players.filter((player) => {
    if (player.status !== "可接单") return false;
    const base = player.depositBase ?? 0;
    const locked = player.depositLocked ?? 0;
    return base <= 0 || locked >= base;
  });
  const payload: PublicPlayerPayload = available.map((player) => ({
    id: player.id,
    name: player.name,
    role: player.role,
    status: player.status,
  }));
  const etag = computeJsonEtag(payload);
  setCache(cacheKey, payload, PLAYERS_CACHE_TTL_MS, etag);
  return jsonWithEtag(payload, etag, PLAYERS_CACHE_CONTROL);
}
