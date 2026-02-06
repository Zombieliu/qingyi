import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>页面不存在</div>
        <div style={{ marginTop: 8, color: "#64748b" }}>访问的页面已被移除或暂不可用。</div>
        <div style={{ marginTop: 16 }}>
          <Link href="/" style={{ padding: "10px 14px", borderRadius: 10, background: "#0f172a", color: "#fff" }}>
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
