import { MessageCircle, Flame } from "lucide-react";
import { listPublicAnnouncements } from "@/lib/admin-store";

export const dynamic = "force-dynamic";

const fallbackArticles = [
  { id: "fallback-1", title: "三角洲行动版本更新", tag: "公告", content: "" },
  { id: "fallback-2", title: "陪玩安全须知", tag: "安全", content: "" },
  { id: "fallback-3", title: "周末赛事报名开启", tag: "赛事", content: "" },
];

export default async function News() {
  const announcements = await listPublicAnnouncements();
  const articles = announcements.length
    ? announcements.map((item) => ({
        id: item.id,
        title: item.title,
        tag: item.tag,
        content: item.content,
      }))
    : fallbackArticles;
  return (
    <>
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">资讯</span>
          <span className="dl-chip">动态</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <MessageCircle size={16} />
          </span>
        </div>
      </header>

      <div className="space-y-3">
        {articles.map((a, index) => (
          <div key={a.id ?? `${a.title}-${a.tag}-${index}`} className="dl-card" style={{ padding: 14 }}>
            <div className="flex items-center gap-3">
              <span className="dl-grid-icon" style={{ color: "#ef4444", width: 44, height: 44 }}>
                <Flame size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{a.title}</div>
                <div className="text-xs text-gray-500 mt-1">{a.tag}</div>
              </div>
            </div>
            {a.content ? (
              <div className="text-xs text-gray-500 mt-3 leading-relaxed">{a.content}</div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
