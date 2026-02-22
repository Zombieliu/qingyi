"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { classifyChainError } from "@/lib/chain/chain-error";

export default function ScheduleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const info = classifyChainError(error);

  useEffect(() => {
    Sentry.captureException(error, { tags: { page: "schedule" } });
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{info.title}</div>
        <div style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>{info.message}</div>
        <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={reset}
            className="dl-tab-btn primary"
            style={{ padding: "10px 14px", cursor: "pointer" }}
            aria-label={info.action || "重试"}
          >
            {info.action || "重试"}
          </button>
        </div>
      </div>
    </div>
  );
}
