import Image from "next/image";
import { Heart, MoreHorizontal, Search, Verified } from "lucide-react";
import OrderButton from "@/app/components/order-button";

const tabs = ["达人"];
const subTabs = ["推荐"];

const creators = [
  {
    name: "QY-羊杂",
    tags: ["魔王", "双子星"],
    desc: "护航之王",
    price: "1330钻石",
    status: "空闲",
    orders: "14人付款",
    avatar: "https://placehold.co/64x64/8fb3ff/ffffff?text=A",
    verified: true,
  },
  {
    name: "QY-勇士",
    tags: ["子龙", "双子星"],
    desc: "实力护航",
    price: "1330钻石",
    amount: 1330,
    status: "空闲",
    orders: "5人付款",
    avatar: "https://placehold.co/64x64/ffcf8f/ffffff?text=B",
    verified: true,
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
            <OrderButton user={c.name} item={c.desc || c.name} amount={c.amount ?? 1330} />
          </div>
        ))}
      </div>
    </div>
  );
}
