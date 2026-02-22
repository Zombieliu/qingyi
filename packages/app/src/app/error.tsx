"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>页面出错</div>
        <div style={{ marginTop: 8, color: "#64748b" }}>
          {error.digest ? `错误代码：${error.digest}` : "请稍后重试，或返回首页。"}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={reset}
            className="dl-tab-btn primary"
            style={{ padding: "10px 14px", cursor: "pointer" }}
          >
            重试
          </button>
          <a href="/" className="dl-tab-btn" style={{ padding: "10px 14px" }}>
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}
