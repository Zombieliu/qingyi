import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { getUserLevelProgress, onDailyCheckin } from "@/lib/services/growth-service";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const CACHE_TTL_MS = 10_000;
const CACHE_CONTROL = "private, max-age=10, stale-while-revalidate=30";

/**
 * GET /api/user/level?userAddress=xxx — 获取用户等级进度
 * POST /api/user/level/checkin — 每日签到
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userAddress = (searchParams.get("userAddress") || "").trim();
  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "level:read", address: userAddress });
  if (!auth.ok) return auth.response;

  const cacheKey = `api:user:level:${auth.address}`;
  const cached = getCache<unknown>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) return notModified(cached.etag, CACHE_CONTROL);
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const progress = await getUserLevelProgress(auth.address);
  const etag = computeJsonEtag(progress);
  setCache(cacheKey, progress, CACHE_TTL_MS, etag);
  return jsonWithEtag(progress, etag, CACHE_CONTROL);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { userAddress?: string };
  const address = (body.userAddress || "").trim();
  if (!address) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "level:checkin", address });
  if (!auth.ok) return auth.response;

  const result = await onDailyCheckin(auth.address);
  if (!result) {
    return NextResponse.json({ error: "checkin_failed" }, { status: 500 });
  }

  if ("alreadyCheckedIn" in result && result.alreadyCheckedIn) {
    return NextResponse.json(
      { ok: false, error: "already_checked_in", message: "今日已签到" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    points: result.points,
    earned: result.earned,
    upgraded: result.upgraded,
  });
}
