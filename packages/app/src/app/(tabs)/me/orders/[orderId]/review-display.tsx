"use client";
import { t } from "@/lib/i18n/t";
import { useState } from "react";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { StarRating } from "./star-rating";

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

export type Review = {
  id: string;
  rating: number;
  content?: string;
  tags?: string[];
  createdAt: number;
};

export function ReviewDisplay({ review }: { review: Review }) {
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
