"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { page: "home" } });
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>加载失败</div>
        <div style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>
          订单池数据加载出错，请重试。
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={reset}
            className="dl-tab-btn primary"
            style={{ padding: "10px 14px", cursor: "pointer" }}
            aria-label="重试加载"
          >
            重试
          </button>
        </div>
      </div>
    </div>
  );
}
