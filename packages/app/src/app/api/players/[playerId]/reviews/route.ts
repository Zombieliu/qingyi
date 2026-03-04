import { NextResponse } from "next/server";
import {
  getPlayerByIdOrAddressEdgeRead,
  getPlayerReviewStatsEdgeRead,
  listPlayerReviewsByAddressEdgeRead,
} from "@/lib/edge-db/user-read-store";
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
  const player = await getPlayerByIdOrAddressEdgeRead(playerId);

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
    listPlayerReviewsByAddressEdgeRead(player.address, 50),
    getPlayerReviewStatsEdgeRead(player.address),
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
      avgRating: stats.avgRating != null ? Math.round(stats.avgRating * 10) / 10 : null,
      totalReviews: stats.totalReviews,
      ratingDistribution: ratingDist,
      positiveRate:
        stats.totalReviews > 0
          ? Math.round(((ratingDist[3] + ratingDist[4]) / stats.totalReviews) * 100)
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
      tags: r.tags,
      createdAt: r.createdAt,
    })),
  };

  const etag = computeJsonEtag(result);
  setCache(cacheKey, result, CACHE_TTL_MS, etag);
  return jsonWithEtag(result, etag, CACHE_CONTROL);
}
