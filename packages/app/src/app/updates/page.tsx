import Link from "next/link";
import { listPublicAnnouncements } from "@/lib/admin/admin-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "公告更新 | 情谊电竞",
  description: "情谊电竞最新公告与更新。",
};

export default async function UpdatesPage() {
  const announcements = await listPublicAnnouncements();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 64px" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>公告更新</div>
            <div style={{ marginTop: 6, color: "#64748b" }}>最新公告与版本更新</div>
          </div>
          <Link href="/" style={{ fontSize: 14, color: "#0f172a" }}>
            返回首页
          </Link>
        </header>

        {announcements.length === 0 ? (
          <div style={{ marginTop: 24, color: "#94a3b8" }}>暂无公告。</div>
        ) : (
          <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
            {announcements.map((item) => (
              <Link
                key={item.id}
                href={`/updates/${item.id}`}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                    {item.title}
                  </div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{item.tag}</span>
                </div>
                <div style={{ marginTop: 8, color: "#475569" }}>
                  {item.content ? item.content.slice(0, 120) : "（无正文）"}
                  {item.content && item.content.length > 120 ? "…" : ""}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                  {new Date(item.updatedAt || item.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
