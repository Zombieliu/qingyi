"use client";
import { StarRating } from "./star-rating";

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
