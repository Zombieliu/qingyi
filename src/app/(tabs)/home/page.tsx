import Image from "next/image";
import { Heart, MoreHorizontal, Search, Star, Verified } from "lucide-react";

const tabs = ["达人"];
const subTabs = ["推荐"];

const creators = [
  {
    name: "limi-刘亦菲",
    tags: ["三角洲行动", "护航", "双排"],
    desc: "护航之王",
    price: "1330钻石",
    status: "空闲",
    orders: "14人付款",
    avatar: "https://placehold.co/64x64/8fb3ff/ffffff?text=A",
    verified: true,
  },
  {
    name: "limi-梗无（09的…",
    tags: ["三角洲行动", "护航"],
    desc: "实力护航",
    price: "1330钻石",
    status: "空闲",
    orders: "5人付款",
    avatar: "https://placehold.co/64x64/ffcf8f/ffffff?text=B",
    verified: true,
  },
  {
    name: "Limi-茗笙",
    tags: ["三角洲行动"],
    desc: "陪练",
    price: "1330钻石",
    status: "空闲",
    orders: "8人付款",
    avatar: "https://placehold.co/64x64/1f2937/ffffff?text=C",
    verified: false,
  },
];

export default function Home() {
  return (
    <div className="lc-screen">
      <header className="lc-topbar">
        <span className="lc-time">08:18</span>
        <span className="lc-title">情谊俱乐部</span>
        <MoreHorizontal className="text-slate-500" size={18} />
      </header>

      <div className="lc-search">
        <Search size={16} />
        <span className="text-sm text-slate-500">请输入搜索关键词</span>
      </div>

      <div className="lc-banner">
        <div className="lc-banner-img" />
      </div>

      <div className="lc-tabs">
        {tabs.map((t) => (
          <button key={t} className={`lc-tab-btn ${t === "达人" ? "is-active" : ""}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="lc-subtabs">
        {subTabs.map((t) => (
          <button key={t} className={`lc-subtab ${t === "推荐" ? "is-active" : ""}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="lc-list">
        {creators.map((c) => (
          <div key={c.name} className="lc-card">
            <div className="lc-avatar-wrap">
              <Image src={c.avatar} alt={c.name} fill sizes="64px" className="lc-avatar" />
            </div>
            <div className="lc-card-body">
              <div className="lc-row">
                <div className="lc-name">
                  {c.name}
                  {c.verified && <Verified size={14} className="text-amber-500" />}
                </div>
                <span className="lc-status">{c.status}</span>
              </div>
              <div className="lc-tags">
                {c.tags.map((t) => (
                  <span key={t} className="lc-tag">
                    {t}
                  </span>
                ))}
              </div>
              <div className="lc-desc">{c.desc}</div>
              <div className="lc-footer">
                <div className="lc-price">{c.price}</div>
                <div className="lc-meta">
                  <Heart size={14} className="text-rose-400" />
                  <span>{c.orders}</span>
                </div>
              </div>
            </div>
            <button className="lc-order">
              <Star size={14} /> 自助下单
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
