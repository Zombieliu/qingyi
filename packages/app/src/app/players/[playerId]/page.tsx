"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star, ThumbsUp } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { formatShortDateTime } from "@/lib/shared/date-utils";
import { useParams } from "next/navigation";

type ReviewData = {
  player: { id: string; name: string; role?: string; status: string };
  stats: {
    avgRating: number | null;
    totalReviews: number;
    ratingDistribution: number[];
    positiveRate: number;
    topTags: { tag: string; count: number }[];
  };
  reviews: {
    id: string;
    rating: number;
    content?: string;
    tags?: string[];
    createdAt: number;
  }[];
};

const STAR_LABELS = ["1星", "2星", "3星", "4星", "5星"];

export default function PlayerReviewsPage() {
  const params = useParams();
  const playerId = params.playerId as string;
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/players/${playerId}/reviews`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return (
      <div className="dl-main" style={{ padding: 16 }}>
        <StateBlock tone="loading" title="加载中..." />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dl-main" style={{ padding: 16 }}>
        <StateBlock tone="warning" title="陪练不存在" />
      </div>
    );
  }

  const { player, stats, reviews } = data;
  const maxDist = Math.max(...stats.ratingDistribution, 1);

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/home" className="dl-icon-circle" aria-label="返回">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{player.name}</span>
          <span className="dl-chip">{player.role || "陪练"}</span>
        </div>
      </header>

      {/* Rating summary */}
      <section className="dl-card" style={{ padding: 16 }}>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-500">{stats.avgRating ?? "—"}</div>
            <div className="flex items-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={12}
                  className={s <= (stats.avgRating || 0) ? "text-amber-400" : "text-gray-200"}
                  fill={s <= (stats.avgRating || 0) ? "currentColor" : "none"}
                />
              ))}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{stats.totalReviews} 条评价</div>
          </div>

          <div className="flex-1">
            {STAR_LABELS.map((label, i) => {
              const count = stats.ratingDistribution[i] || 0;
              const pct = (count / maxDist) * 100;
              return (
                <div key={label} className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-gray-400 w-6">{i + 1}星</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {stats.positiveRate > 0 && (
          <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
            <ThumbsUp size={12} />
            好评率 {stats.positiveRate}%
          </div>
        )}
      </section>

      {/* Tags */}
      {stats.topTags.length > 0 && (
        <section className="dl-card" style={{ padding: 16, marginTop: 12 }}>
          <div className="text-sm font-semibold text-gray-900 mb-2">评价标签</div>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map((t) => (
              <span key={t.tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600">
                {t.tag} <span className="text-blue-400">{t.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Reviews list */}
      <section style={{ marginTop: 12, marginBottom: 24 }}>
        {reviews.length === 0 ? (
          <div className="dl-card" style={{ padding: 16 }}>
            <StateBlock tone="empty" size="compact" title="暂无评价" />
          </div>
        ) : (
          <div className="grid gap-2">
            {reviews.map((review) => (
              <div key={review.id} className="dl-card" style={{ padding: 12 }}>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={10}
                      className={s <= review.rating ? "text-amber-400" : "text-gray-200"}
                      fill={s <= review.rating ? "currentColor" : "none"}
                    />
                  ))}
                  <span className="text-[10px] text-gray-400 ml-2">
                    {formatShortDateTime(review.createdAt)}
                  </span>
                </div>
                {review.content && (
                  <div className="text-xs text-gray-700 mt-1">{review.content}</div>
                )}
                {review.tags && review.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {review.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
