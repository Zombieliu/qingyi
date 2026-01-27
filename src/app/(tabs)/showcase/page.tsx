import { Diamond, Sparkles } from "lucide-react";

const cards = [
  { title: "赛事宣传页", desc: "模板加速，3分钟上线" },
  { title: "俱乐部展示", desc: "战队荣誉、成员、赛历" },
  { title: "陪玩橱窗", desc: "技能卡、语音样本、标签" },
];

export default function Showcase() {
  return (
    <>
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">展示</span>
          <span className="dl-chip">橱窗</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Sparkles size={16} />
          </span>
        </div>
      </header>

      <div className="dl-grid" style={{ gap: 12 }}>
        {cards.map((c) => (
          <div key={c.title} className="dl-card" style={{ padding: 14 }}>
            <div className="flex items-center gap-3">
              <span className="dl-grid-icon" style={{ color: "#7c3aed", width: 44, height: 44 }}>
                <Diamond size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{c.title}</div>
                <div className="text-xs text-gray-500 mt-1">{c.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
