"use client";

import Link from "next/link";
import { ArrowLeft, Star, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchOrderDetail } from "@/lib/services/order-service";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import type { LocalOrder } from "@/lib/services/order-store";
import { StateBlock } from "@/app/components/state-block";
import { formatFullDateTime } from "@/lib/shared/date-utils";

const REVIEW_TAG_OPTIONS = [
  "技术好",
  "态度好",
  "有耐心",
  "配合默契",
  "准时上线",
  "沟通顺畅",
  "带飞能力强",
  "氛围轻松",
];

type Review = {
  id: string;
  rating: number;
  content?: string;
  tags?: string[];
  createdAt: number;
};

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatFullDateTime(date);
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(i)}
          className="p-0.5"
          aria-label={`${i} 星`}
        >
          <Star
            size={22}
            className={i <= value ? "fill-amber-400 text-amber-400" : "text-slate-200"}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewDisplay({ review }: { review: Review }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StarRating value={review.rating} />
        <span className="text-xs text-slate-400">
          {new Date(review.createdAt).toLocaleDateString("zh-CN")}
        </span>
      </div>
      {review.tags && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {review.content && <p className="text-sm text-slate-600">{review.content}</p>}
    </div>
  );
}

function ReviewForm({
  orderId,
  onSubmitted,
}: {
  orderId: string;
  onSubmitted: (review: Review) => void;
}) {
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const address = getCurrentAddress();
      if (!address) throw new Error("请先登录");
      const body = JSON.stringify({
        address,
        rating,
        content: content.trim() || undefined,
        tags: tags.length ? tags : undefined,
      });
      const res = await fetchWithUserAuth(
        `/api/orders/${orderId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
        address
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "提交失败");
      }
      const data = await res.json();
      onSubmitted(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-500 mb-1">评分</div>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1.5">标签</div>
        <div className="flex flex-wrap gap-1.5">
          {REVIEW_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                tags.includes(tag)
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1">评价内容（选填）</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="分享你的体验..."
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-slate-400"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="w-full py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {submitting ? "提交中..." : "提交评价（+5 馒头）"}
      </button>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.orderId as string;
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchOrderDetail(orderId);
        setOrder(detail);
        // Fetch review
        const address = getCurrentAddress();
        if (address) {
          const res = await fetchWithUserAuth(
            `/api/orders/${orderId}/review?address=${address}`,
            {},
            address
          );
          if (res.ok) {
            setReview(await res.json());
          } else {
            setReview(null);
          }
        } else {
          setReview(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const isCompleted = order?.status?.includes("已完成") || order?.meta?.status === "已完成";
  const isOwner = order?.userAddress && order.userAddress === getCurrentAddress();
  const canReview = isCompleted && isOwner && review === null;

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me/orders" className="dl-icon-circle" aria-label="返回订单列表">
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">订单详情</span>
        </div>
      </header>

      {loading ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="loading" size="compact" title="加载中" />
        </section>
      ) : !order ? (
        <section className="dl-card" style={{ padding: 16 }}>
          <StateBlock tone="warning" title="订单不存在" description="该订单可能已被删除" />
        </section>
      ) : (
        <>
          {/* Order Info */}
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-gray-900">{order.item}</div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                {order.status}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">订单号</span>
                <span className="font-mono text-xs">{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">下单时间</span>
                <span>{formatTime(order.time)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">金额</span>
                <span className="font-semibold text-slate-900">¥{order.amount}</span>
              </div>
              {order.serviceFee != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">服务费</span>
                  <span>¥{order.serviceFee}</span>
                </div>
              )}
            </div>
            {order.driver && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
                <div className="text-xs text-slate-400 mb-1">陪练信息</div>
                <div>
                  {order.driver.name}
                  {order.driver.tier ? ` · ${order.driver.tier}` : ""}
                </div>
              </div>
            )}
          </section>

          {/* Review Section */}
          <section className="dl-card" style={{ padding: 16 }}>
            <div className="text-sm font-semibold text-gray-900 mb-3">
              {review ? "我的评价" : canReview ? "评价服务" : "评价"}
            </div>
            {review ? (
              <div>
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs mb-2">
                  <CheckCircle2 size={14} />
                  <span>已评价</span>
                </div>
                <ReviewDisplay review={review} />
              </div>
            ) : canReview ? (
              <ReviewForm orderId={orderId} onSubmitted={setReview} />
            ) : (
              <p className="text-xs text-slate-400">
                {!isCompleted ? "订单完成后可评价" : !isOwner ? "仅下单用户可评价" : ""}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
