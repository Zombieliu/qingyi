import Link from "next/link";
import { notFound } from "next/navigation";
import { listPublicAnnouncements } from "@/lib/admin/admin-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const announcements = await listPublicAnnouncements();
  const item = announcements.find((a) => a.id === params.id);
  if (!item) {
    return { title: "公告不存在 | 情谊电竞", robots: { index: false, follow: false } };
  }
  const description = item.content ? item.content.slice(0, 120) : "情谊电竞公告更新。";
  return {
    title: `${item.title} | 情谊电竞`,
    description,
    alternates: { canonical: `/updates/${item.id}` },
    openGraph: {
      title: item.title,
      description,
      type: "article",
      url: `/updates/${item.id}`,
      images: [{ url: "/icon-192.png", width: 192, height: 192, alt: "情谊电竞" }],
    },
  };
}

export default async function UpdateDetailPage({ params }: { params: { id: string } }) {
  const announcements = await listPublicAnnouncements();
  const item = announcements.find((a) => a.id === params.id);
  if (!item) return notFound();

  const publishedTime = new Date(item.createdAt).toISOString();
  const updatedTime = new Date(item.updatedAt || item.createdAt).toISOString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    datePublished: publishedTime,
    dateModified: updatedTime,
    author: { "@type": "Organization", name: "情谊电竞" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px 64px" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Link href="/updates" style={{ fontSize: 14, color: "#0f172a" }}>
            返回公告列表
          </Link>
          <Link href="/" style={{ fontSize: 14, color: "#0f172a" }}>
            返回首页
          </Link>
        </header>

        <article
          style={{
            marginTop: 20,
            padding: 20,
            borderRadius: 16,
            background: "#fff",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              gap: 12,
              alignItems: "center",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            <span>{item.tag}</span>
            <span>{new Date(item.updatedAt || item.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
          <div style={{ marginTop: 14, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {item.content || "（无正文）"}
          </div>
        </article>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </div>
  );
}
