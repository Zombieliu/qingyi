"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#0f172a", color: "#e2e8f0" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>页面出错了</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>请刷新重试或稍后再来</div>
          </div>
        </div>
      </body>
    </html>
  );
}
