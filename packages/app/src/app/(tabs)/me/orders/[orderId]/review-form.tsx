"use client";
import { t } from "@/lib/i18n/t";
import { useState } from "react";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { StarRating } from "./star-rating";
import type { Review } from "./review-display";

const REVIEW_TAG_OPTIONS = [
  t("tabs.me.orders.i059"),
  t("tabs.me.orders.i060"),
  t("tabs.me.orders.i061"),
  t("tabs.me.orders.i062"),
  t("tabs.me.orders.i063"),
  t("tabs.me.orders.i064"),
  t("tabs.me.orders.i065"),
  t("tabs.me.orders.i066"),
];

export function ReviewForm({
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
      setError(err instanceof Error ? err.message : t("me.orders.001"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-500 mb-1">{t("ui.orderId.118")}</div>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1.5">{t("ui.orderId.119")}</div>
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
        <div className="text-xs text-slate-500 mb-1">{t("ui.orderId.120")}</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={t("me.orders.002")}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-slate-400"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="w-full py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {submitting ? t("ui.orderId.609") : t("me.orders.003")}
      </button>
    </div>
  );
}
