import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const CACHE_TTL_MS = 30_000;
const CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";

/**
 * GET /api/players/:playerId/reviews — 陪练评价列表（公开）
 */
export async function GET(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;

  // Find player by id or address
  const player = await prisma.adminPlayer.findFirst({
    where: { OR: [{ id: playerId }, { address: playerId }] },
    select: { id: true, name: true, address: true, role: true, status: true },
  });

  if (!player || !player.address) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  const cacheKey = `api:player:reviews:${player.id}`;
  const cached = getCache<unknown>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) return notModified(cached.etag, CACHE_CONTROL);
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const [reviews, stats] = await Promise.all([
    prisma.orderReview.findMany({
      where: { companionAddress: player.address },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.orderReview.aggregate({
      where: { companionAddress: player.address },
      _avg: { rating: true },
      _count: { id: true },
    }),
  ]);

  // Tag stats
  const tagCounts: Record<string, number> = {};
  for (const review of reviews) {
    const tags = review.tags as string[] | null;
    if (tags) {
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  const ratingDist = [0, 0, 0, 0, 0]; // 1-5 star distribution
  for (const review of reviews) {
    if (review.rating >= 1 && review.rating <= 5) {
      ratingDist[review.rating - 1]++;
    }
  }

  const result = {
    player: {
      id: player.id,
      name: player.name,
      role: player.role,
      status: player.status,
    },
    stats: {
      avgRating: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : null,
      totalReviews: stats._count.id ?? 0,
      ratingDistribution: ratingDist,
      positiveRate:
        stats._count.id > 0
          ? Math.round(((ratingDist[3] + ratingDist[4]) / stats._count.id) * 100)
          : 0,
      topTags: Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count })),
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      content: r.content,
      tags: r.tags as string[] | null,
      createdAt: r.createdAt.getTime(),
    })),
  };

  const etag = computeJsonEtag(result);
  setCache(cacheKey, result, CACHE_TTL_MS, etag);
  return jsonWithEtag(result, etag, CACHE_CONTROL);
}
