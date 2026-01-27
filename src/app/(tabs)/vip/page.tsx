import Link from "next/link";
import { ArrowLeft, Crown, Shield } from "lucide-react";

const perks = [
  { label: "贵族铭牌", desc: "坚韧白银专属" },
  { label: "隐蔽访问足迹", desc: "隐藏钻石浏览" },
  { label: "特邀隐身", desc: "冰紫遮蔽群聊" },
  { label: "隐身潮玩状态", desc: "乔治态度切换" },
  { label: "隐身进厅", desc: "荷姆红毯静默" },
  { label: "厅内防骚扰", desc: "屏蔽关键信号" },
  { label: "厅内防锁踢", desc: "幻灭系楼层盾" },
];

export default function Vip() {
  return (
    <div className="vip-screen">
      <header className="vip-top">
        <Link href="/me" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <span className="vip-title">财富等级</span>
        <Crown className="text-amber-300" size={18} />
      </header>

      <div className="vip-card">
        <div className="vip-rank">未解锁</div>
        <div className="vip-name">坚韧白银</div>
        <div className="vip-progress">0 套在传，距升级还需 20000 点东停值</div>
      </div>

      <div className="vip-perks-title">贵族特权</div>
      <div className="vip-perks-grid">
        {perks.map((perk) => (
          <div key={perk.label} className="vip-perk">
            <div className="vip-perk-icon">
              <Shield size={16} />
            </div>
            <div className="vip-perk-text">
              <div className="vip-perk-label">{perk.label}</div>
              <div className="vip-perk-desc">{perk.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
