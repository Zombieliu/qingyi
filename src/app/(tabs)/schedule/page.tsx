import { CalendarCheck, Clock3 } from "lucide-react";

const tasks = [
  { time: "今天 20:00", title: "三角洲行动 · 8人房", status: "待开始" },
  { time: "明天 19:30", title: "训练赛 · 端游", status: "候补" },
];

export default function Schedule() {
  return (
    <>
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">安排</span>
          <span className="dl-chip">日程</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <CalendarCheck size={16} />
          </span>
        </div>
      </header>

      <div className="space-y-3">
        {tasks.map((t) => (
          <div key={t.title} className="dl-card" style={{ padding: 14 }}>
            <div className="flex items-center gap-3">
              <span className="dl-grid-icon" style={{ color: "#0ea5e9", width: 44, height: 44 }}>
                <Clock3 size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{t.title}</div>
                <div className="text-xs text-gray-500 mt-1">{t.time} · {t.status}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
