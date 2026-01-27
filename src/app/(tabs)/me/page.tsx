import { Diamond, Gamepad2, Phone, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import PasskeyWallet from "@/app/components/passkey-wallet";

const grid = [
  { label: "联系客服", icon: Phone, color: "#6366f1" },
  // 其他功能暂时隐藏
];

export default function Me() {
  return (
    <>
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">06:33</span>
          <span className="dl-chip dl-chip-soft">实时</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <ShieldCheck size={16} />
          </span>
          <span className="dl-icon-circle">
            <User size={16} />
          </span>
        </div>
      </header>

      <section className="dl-card dl-profile">
        <div className="dl-avatar" />
        <div className="dl-profile-info">
          <div className="dl-name-row">
            <div className="dl-name">糕手玩玩</div>
            <span className="dl-chip">个人主页</span>
          </div>
          <div className="dl-id">ID 80443259</div>
        </div>
        <button className="dl-edit">编辑</button>
        <div className="dl-stats">
          {[
            { label: "动态", value: "0" },
            { label: "关注", value: "0" },
            { label: "粉丝", value: "0" },
          ].map((item) => (
            <div key={item.label} className="dl-stat">
              <div className="dl-stat-value">{item.value}</div>
              <div className="dl-stat-label">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <PasskeyWallet />

      <section className="dl-card">
        <div className="dl-section-title">我的钱包</div>
        <div className="dl-wallet">
          {[
            { label: "钻石", value: "0" },
            { label: "星星", value: "0" },
            { label: "库存卡", value: "0" },
          ].map((item) => (
            <div key={item.label} className="dl-wallet-item">
              <div className="dl-wallet-value">{item.value}</div>
              <div className="dl-wallet-label">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dl-quick">
        {[
          { label: "我的记录", icon: Gamepad2, bg: "linear-gradient(135deg, #ffd5ec 0%, #ffe8f5 100%)", color: "#c026d3", href: "/wallet" },
          { label: "会员中心", icon: Diamond, bg: "linear-gradient(135deg, #e5d9ff 0%, #f1ecff 100%)", color: "#7c3aed", href: "/vip" },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="dl-quick-card" style={{ background: item.bg }}>
            <span className="dl-quick-icon" style={{ color: item.color }}>
              <item.icon size={20} />
            </span>
            <div className="dl-quick-text">{item.label}</div>
          </Link>
        ))}
      </section>

      <section className="dl-card">
        <div className="dl-section-title">更多功能</div>
        <div className="dl-grid">
          {grid.map((item) => (
            <div key={item.label} className="dl-grid-item">
              <span className="dl-grid-icon" style={{ color: item.color }}>
                <item.icon size={20} />
              </span>
              <span className="dl-grid-label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
