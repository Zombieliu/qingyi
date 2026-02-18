"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search,
  MoreHorizontal,
  Sparkles,
  Gift,
  Crown,
  Headset,
  ShieldCheck,
  Clock3,
  ChevronRight,
  Users,
  BookOpen,
} from "lucide-react";
import { MotionCard, Stagger, StaggerItem } from "@/components/ui/motion";
import { StateBlock } from "@/app/components/state-block";

type HomePlayer = {
  id: string;
  name: string;
  role?: string;
};

type HomeNews = {
  id: string;
  title: string;
  tag: string;
};

const quickActions = [
  {
    label: "快速下单",
    desc: "30 秒开局",
    href: "/schedule",
    icon: Sparkles,
    tone: "primary",
  },
  {
    label: "首单优惠",
    desc: "满 99 减 10",
    href: "/schedule",
    icon: Gift,
    tone: "rose",
  },
  {
    label: "会员权益",
    desc: "专属加速",
    href: "/vip",
    icon: Crown,
    tone: "gold",
  },
  {
    label: "联系客服",
    desc: "实时工单",
    href: "/me/support",
    icon: Headset,
    tone: "teal",
  },
];

const packages = [
  {
    name: "绝密体验单",
    desc: "15 分钟上车",
    price: "¥88",
    tag: "首单推荐",
    eta: "极速",
    highlight: true,
  },
  {
    name: "绝密快单",
    desc: "10 分钟上车",
    price: "¥128",
    tag: "高胜率",
    eta: "热门",
  },
  {
    name: "机密单护",
    desc: "稳定护航",
    price: "¥30/小时",
    tag: "日常上分",
    eta: "常规",
  },
  {
    name: "机密双护",
    desc: "双人协同",
    price: "¥60/小时",
    tag: "效率提升",
    eta: "进阶",
  },
];

const assurances = [
  {
    title: "订单保障",
    desc: "押金与履约双重保障",
    icon: ShieldCheck,
  },
  {
    title: "进度可追踪",
    desc: "订单状态实时更新",
    icon: Clock3,
  },
  {
    title: "售后支持",
    desc: "工单 24 小时响应",
    icon: Headset,
  },
];

function getInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "QY";
  return trimmed.slice(0, 2);
}

export default function HomeContent({ players, news }: { players: HomePlayer[]; news: HomeNews[] }) {
  const [query, setQuery] = useState("");
  const keyword = query.trim();
  const normalized = keyword.toLowerCase();
  const hasQuery = normalized.length > 0;

  const filteredPackages = useMemo(() => {
    if (!hasQuery) return packages;
    return packages.filter((item) =>
      [item.name, item.desc, item.tag].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [hasQuery, normalized]);

  const filteredPlayers = useMemo(() => {
    if (!hasQuery) return players;
    return players.filter((player) =>
      [player.name, player.role || ""].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [hasQuery, normalized, players]);

  const displayPlayers = hasQuery ? filteredPlayers : players.slice(0, 6);
  const searchHint = hasQuery
    ? `找到 ${filteredPackages.length} 个套餐 / ${filteredPlayers.length} 位打手`
    : "";

  return (
    <div className="lc-screen">
      <header className="lc-topbar">
        <span className="lc-time">08:18</span>
        <span className="lc-title">情谊俱乐部</span>
        <MoreHorizontal className="text-slate-500" size={18} />
      </header>

      <div className="lc-search">
        <Search size={16} />
        <input
          className="lc-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入关键词搜索打手或套餐"
        />
      </div>
      {searchHint ? <div className="lc-search-hint">{searchHint}</div> : null}

      <div className="lc-banner">
        <div className="lc-banner-img" />
        <div className="lc-banner-content">
          <div className="lc-banner-title">新客首单立减</div>
          <div className="lc-banner-desc">满 99 减 10 · 30 秒极速开局</div>
          <Link href="/schedule" className="lc-banner-btn">
            立即下单
          </Link>
        </div>
      </div>

      <div className="lc-quick-grid">
        {quickActions.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="lc-quick-card" data-tone={item.tone}>
              <span className="lc-quick-icon">
                <Icon size={18} />
              </span>
              <div className="lc-quick-body">
                <div className="lc-quick-title">{item.label}</div>
                <div className="lc-quick-desc">{item.desc}</div>
              </div>
              <ChevronRight size={16} className="lc-quick-arrow" />
            </Link>
          );
        })}
      </div>

      <section className="lc-section">
        <div className="lc-section-head">
          <div>
            <div className="lc-section-title">{hasQuery ? "搜索套餐" : "推荐套餐"}</div>
            <div className="lc-section-sub">更快匹配，更高胜率</div>
          </div>
          <Link href="/schedule" className="lc-section-link">
            全部套餐
            <ChevronRight size={14} />
          </Link>
        </div>
        {filteredPackages.length === 0 ? (
          <StateBlock tone="empty" size="compact" title="未找到匹配套餐" description="试试其他关键词" />
        ) : (
          <Stagger className="lc-package-grid">
            {filteredPackages.map((item) => (
              <StaggerItem key={item.name}>
                <MotionCard className="lc-package-card" data-highlight={item.highlight ? "1" : undefined}>
                  <div className="lc-package-top">
                    <div>
                      <div className="lc-package-title">{item.name}</div>
                      <div className="lc-package-desc">{item.desc}</div>
                    </div>
                    <span className="lc-package-pill">{item.eta}</span>
                  </div>
                  <div className="lc-package-meta">
                    <div className="lc-package-price">{item.price}</div>
                    <span className="lc-package-tag">{item.tag}</span>
                  </div>
                  <Link href="/schedule" className="lc-package-btn">
                    去下单
                  </Link>
                </MotionCard>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      <section className="lc-section">
        <div className="lc-section-head">
          <div>
            <div className="lc-section-title">{hasQuery ? "搜索打手" : "可接打手"}</div>
            <div className="lc-section-sub">在线陪护，极速响应</div>
          </div>
          <Link href="/schedule" className="lc-section-link">
            去指定
            <ChevronRight size={14} />
          </Link>
        </div>
        {displayPlayers.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            align="center"
            title={hasQuery ? "未找到匹配打手" : "当前暂无可接打手"}
            description={hasQuery ? "换个关键词试试" : "请稍后刷新或前往套餐下单"}
          />
        ) : (
          <Stagger className="lc-player-grid">
            {displayPlayers.map((player) => {
              const target = `/schedule?playerId=${encodeURIComponent(player.id)}&playerName=${encodeURIComponent(
                player.name
              )}`;
              return (
                <StaggerItem key={player.id}>
                  <MotionCard className="lc-player-card">
                    <div className="lc-player-avatar">{getInitial(player.name)}</div>
                    <div className="lc-player-body">
                      <div className="lc-player-name">{player.name}</div>
                      <div className="lc-player-role">{player.role || "认证护航"}</div>
                    </div>
                    <div className="lc-player-actions">
                      <span className="lc-player-status">可接单</span>
                      <Link href={target} className="lc-player-btn">
                        去指定
                      </Link>
                    </div>
                  </MotionCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </section>

      <section className="lc-section">
        <div className="lc-section-head">
          <div>
            <div className="lc-section-title">服务保障</div>
            <div className="lc-section-sub">清晰规则，放心下单</div>
          </div>
        </div>
        <div className="lc-assurance-grid">
          {assurances.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="lc-assurance-card">
                <span className="lc-assurance-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <div className="lc-assurance-title">{item.title}</div>
                  <div className="lc-assurance-desc">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="lc-section">
        <div className="lc-section-head">
          <div>
            <div className="lc-section-title">最新动态</div>
            <div className="lc-section-sub">公告更新与新手指南</div>
          </div>
          <Link href="/news" className="lc-section-link">
            查看全部
            <ChevronRight size={14} />
          </Link>
        </div>
        <div className="lc-news-list">
          {news.map((item) => (
            <Link key={item.id} href="/news" className="lc-news-item">
              <span className="lc-news-tag">{item.tag}</span>
              <span className="lc-news-title">{item.title}</span>
              <ChevronRight size={16} className="lc-news-arrow" />
            </Link>
          ))}
        </div>
      </section>

      <section className="lc-section lc-footer-grid">
        <Link href="/me/guide" className="lc-footer-card">
          <span className="lc-footer-icon">
            <BookOpen size={18} />
          </span>
          <div>
            <div className="lc-footer-title">新手指南</div>
            <div className="lc-footer-desc">3 分钟掌握下单流程</div>
          </div>
        </Link>
        <Link href="/schedule" className="lc-footer-card">
          <span className="lc-footer-icon">
            <Users size={18} />
          </span>
          <div>
            <div className="lc-footer-title">护航匹配</div>
            <div className="lc-footer-desc">选择指定打手更安心</div>
          </div>
        </Link>
      </section>
    </div>
  );
}
