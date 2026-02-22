"use client";
import { t } from "@/lib/i18n/i18n-client";

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
import styles from "./home.module.css";

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
    numPrice: 88,
    tag: "首单推荐",
    eta: "极速",
    category: "推荐",
    highlight: true,
  },
  {
    name: "绝密快单",
    desc: "10 分钟上车",
    price: "¥128",
    numPrice: 128,
    tag: "高胜率",
    eta: "热门",
    category: "推荐",
  },
  {
    name: t("ui.home-content.628"),
    desc: t("ui.home-content.639"),
    price: "¥30/小时",
    numPrice: 30,
    tag: "日常上分",
    eta: "常规",
    category: "小时单",
  },
  {
    name: t("ui.home-content.630"),
    desc: t("ui.home-content.555"),
    price: "¥60/小时",
    numPrice: 60,
    tag: "效率提升",
    eta: "进阶",
    category: "小时单",
  },
];

const CATEGORIES = ["全部", "推荐", "小时单"] as const;

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

export default function HomeContent({
  players,
  news,
}: {
  players: HomePlayer[];
  news: HomeNews[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("全部");
  const [sortPrice, setSortPrice] = useState<"default" | "asc" | "desc">("default");
  const keyword = query.trim();
  const normalized = keyword.toLowerCase();
  const hasQuery = normalized.length > 0;

  const filteredPackages = useMemo(() => {
    let list = packages;
    if (hasQuery) {
      list = list.filter((item) =>
        [item.name, item.desc, item.tag].some((value) => value.toLowerCase().includes(normalized))
      );
    }
    if (category !== "全部") {
      list = list.filter((item) => item.category === category);
    }
    if (sortPrice === "asc") {
      list = [...list].sort((a, b) => a.numPrice - b.numPrice);
    } else if (sortPrice === "desc") {
      list = [...list].sort((a, b) => b.numPrice - a.numPrice);
    }
    return list;
  }, [hasQuery, normalized, category, sortPrice]);

  const filteredPlayers = useMemo(() => {
    if (!hasQuery) return players;
    return players.filter((player) =>
      [player.name, player.role || ""].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [hasQuery, normalized, players]);

  const displayPlayers = hasQuery ? filteredPlayers : players.slice(0, 6);
  const searchHint = hasQuery
    ? `找到 ${filteredPackages.length} 个套餐 / ${filteredPlayers.length} 位陪练`
    : "";

  return (
    <div className={styles["lc-screen"]}>
      <header className={styles["lc-topbar"]}>
        <span className={styles["lc-time"]}>08:18</span>
        <span className={styles["lc-title"]}>{t("ui.home-content.002")}</span>
        <MoreHorizontal className="text-slate-500" size={18} />
      </header>

      <div className={styles["lc-search"]}>
        <Search size={16} />
        <input
          className={styles["lc-search-input"]}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("home.home_content.002")}
        />
      </div>
      {searchHint ? <div className={styles["lc-search-hint"]}>{searchHint}</div> : null}

      <div className={styles["lc-banner"]}>
        <div className={styles["lc-banner-img"]} />
        <div className={styles["lc-banner-content"]}>
          <div className={styles["lc-banner-title"]}>{t("ui.home-content.003")}</div>
          <div className={styles["lc-banner-desc"]}>{t("ui.home-content.004")}</div>
          <Link href="/schedule" className={styles["lc-banner-btn"]}>
            立即下单
          </Link>
        </div>
      </div>

      <div className={styles["lc-quick-grid"]}>
        {quickActions.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={styles["lc-quick-card"]}
              data-tone={item.tone}
            >
              <span className={styles["lc-quick-icon"]}>
                <Icon size={18} />
              </span>
              <div className={styles["lc-quick-body"]}>
                <div className={styles["lc-quick-title"]}>{item.label}</div>
                <div className={styles["lc-quick-desc"]}>{item.desc}</div>
              </div>
              <ChevronRight size={16} className={styles["lc-quick-arrow"]} />
            </Link>
          );
        })}
      </div>

      <section className={styles["lc-section"]}>
        <div className={styles["lc-section-head"]}>
          <div>
            <div className={styles["lc-section-title"]}>
              {hasQuery ? "搜索套餐" : t("home.home_content.003")}
            </div>
            <div className={styles["lc-section-sub"]}>{t("ui.home-content.005")}</div>
          </div>
          <Link href="/schedule" className={styles["lc-section-link"]}>
            全部套餐
            <ChevronRight size={14} />
          </Link>
        </div>
        <div className={styles["lc-filter-bar"]}>
          <div className={styles["lc-filter-tabs"]}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`${styles["lc-filter-tab"]} ${category === cat ? styles["is-active"] : ""}`}
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                aria-label={`筛选分类：${cat}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <button
            className={styles["lc-filter-sort"]}
            onClick={() =>
              setSortPrice((prev) =>
                prev === "default" ? "asc" : prev === "asc" ? "desc" : "default"
              )
            }
            aria-label={`价格排序：${sortPrice === "asc" ? "升序" : sortPrice === "desc" ? "降序" : t("home.home_content.004")}`}
          >
            价格{sortPrice === "asc" ? "↑" : sortPrice === "desc" ? "↓" : ""}
          </button>
        </div>
        {filteredPackages.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("home.home_content.005")}
            description={t("home.home_content.006")}
          />
        ) : (
          <Stagger className={styles["lc-package-grid"]}>
            {filteredPackages.map((item) => (
              <StaggerItem key={item.name}>
                <MotionCard
                  className={styles["lc-package-card"]}
                  data-highlight={item.highlight ? "1" : undefined}
                >
                  <div className={styles["lc-package-top"]}>
                    <div>
                      <div className={styles["lc-package-title"]}>{item.name}</div>
                      <div className={styles["lc-package-desc"]}>{item.desc}</div>
                    </div>
                    <span className={styles["lc-package-pill"]}>{item.eta}</span>
                  </div>
                  <div className={styles["lc-package-meta"]}>
                    <div className={styles["lc-package-price"]}>{item.price}</div>
                    <span className={styles["lc-package-tag"]}>{item.tag}</span>
                  </div>
                  <Link href="/schedule" className={styles["lc-package-btn"]}>
                    去下单
                  </Link>
                </MotionCard>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      <section className={styles["lc-section"]}>
        <div className={styles["lc-section-head"]}>
          <div>
            <div className={styles["lc-section-title"]}>
              {hasQuery ? "搜索陪练" : t("home.home_content.007")}
            </div>
            <div className={styles["lc-section-sub"]}>{t("ui.home-content.006")}</div>
          </div>
          <Link href="/schedule" className={styles["lc-section-link"]}>
            去指定
            <ChevronRight size={14} />
          </Link>
        </div>
        {displayPlayers.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            align="center"
            title={hasQuery ? "未找到匹配陪练" : t("home.home_content.008")}
            description={hasQuery ? "换个关键词试试" : t("home.home_content.009")}
          />
        ) : (
          <Stagger className={styles["lc-player-grid"]}>
            {displayPlayers.map((player) => {
              const target = `/schedule?playerId=${encodeURIComponent(player.id)}&playerName=${encodeURIComponent(
                player.name
              )}`;
              return (
                <StaggerItem key={player.id}>
                  <MotionCard className={styles["lc-player-card"]}>
                    <div className={styles["lc-player-avatar"]}>{getInitial(player.name)}</div>
                    <div className={styles["lc-player-body"]}>
                      <div className={styles["lc-player-name"]}>{player.name}</div>
                      <div className={styles["lc-player-role"]}>{player.role || "认证陪练"}</div>
                    </div>
                    <div className={styles["lc-player-actions"]}>
                      <span className={styles["lc-player-status"]}>{t("ui.home-content.007")}</span>
                      <Link href={target} className={styles["lc-player-btn"]}>
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

      <section className={styles["lc-section"]}>
        <div className={styles["lc-section-head"]}>
          <div>
            <div className={styles["lc-section-title"]}>{t("ui.home-content.008")}</div>
            <div className={styles["lc-section-sub"]}>{t("ui.home-content.009")}</div>
          </div>
        </div>
        <div className={styles["lc-assurance-grid"]}>
          {assurances.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className={styles["lc-assurance-card"]}>
                <span className={styles["lc-assurance-icon"]}>
                  <Icon size={18} />
                </span>
                <div>
                  <div className={styles["lc-assurance-title"]}>{item.title}</div>
                  <div className={styles["lc-assurance-desc"]}>{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles["lc-section"]}>
        <div className={styles["lc-section-head"]}>
          <div>
            <div className={styles["lc-section-title"]}>{t("ui.home-content.010")}</div>
            <div className={styles["lc-section-sub"]}>{t("ui.home-content.011")}</div>
          </div>
          <Link href="/news" className={styles["lc-section-link"]}>
            查看全部
            <ChevronRight size={14} />
          </Link>
        </div>
        <div className={styles["lc-news-list"]}>
          {news.map((item) => (
            <Link key={item.id} href="/news" className={styles["lc-news-item"]}>
              <span className={styles["lc-news-tag"]}>{item.tag}</span>
              <span className={styles["lc-news-title"]}>{item.title}</span>
              <ChevronRight size={16} className={styles["lc-news-arrow"]} />
            </Link>
          ))}
        </div>
      </section>

      <section className={`${styles["lc-section"]} ${styles["lc-footer-grid"]}`}>
        <Link href="/me/guide" className={styles["lc-footer-card"]}>
          <span className={styles["lc-footer-icon"]}>
            <BookOpen size={18} />
          </span>
          <div>
            <div className={styles["lc-footer-title"]}>{t("ui.home-content.012")}</div>
            <div className={styles["lc-footer-desc"]}>{t("ui.home-content.013")}</div>
          </div>
        </Link>
        <Link href="/schedule" className={styles["lc-footer-card"]}>
          <span className={styles["lc-footer-icon"]}>
            <Users size={18} />
          </span>
          <div>
            <div className={styles["lc-footer-title"]}>{t("ui.home-content.014")}</div>
            <div className={styles["lc-footer-desc"]}>{t("ui.home-content.015")}</div>
          </div>
        </Link>
      </section>
    </div>
  );
}
