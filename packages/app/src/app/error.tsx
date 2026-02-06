"use client";

import Link from "next/link";

export default function ErrorPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>页面出错</div>
        <div style={{ marginTop: 8, color: "#64748b" }}>请稍后重试，或返回首页。</div>
        <div style={{ marginTop: 16 }}>
          <Link href="/" style={{ padding: "10px 14px", borderRadius: 10, background: "#0f172a", color: "#fff" }}>
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
