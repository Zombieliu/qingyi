"use client";
import { Star } from "lucide-react";

export function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
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
