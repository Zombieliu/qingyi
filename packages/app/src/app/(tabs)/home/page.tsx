import type { Metadata } from "next";
import { listPlayersPublic, listPublicAnnouncements } from "@/lib/admin/admin-store";
import HomeContent from "./home-content";
import { t } from "@/lib/i18n/i18n-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "首页 | 情谊电竞",
  description: "三角洲行动陪玩平台，极速匹配高素质陪练，押金保障，订单全程可追踪。",
  openGraph: {
    title: "情谊电竞 - 三角洲行动陪玩",
    description: "极速匹配高素质陪练，押金保障，订单全程可追踪。",
  },
};

const fallbackNews = [
  { id: "guide", title: t("tabs.home.i013"), tag: t("tabs.home.i014") },
  { id: "safety", title: t("tabs.home.i015"), tag: t("tabs.home.i016") },
  { id: "event", title: t("tabs.home.i017"), tag: t("tabs.home.i018") },
];

export default async function Home() {
  const players = await listPlayersPublic();
  const announcements = await listPublicAnnouncements();
  const availablePlayers = players
    .filter((player) => {
      if (player.status !== t("tabs.home.i019")) return false;
      const base = player.depositBase ?? 0;
      const locked = player.depositLocked ?? 0;
      return base <= 0 || locked >= base;
    })
    .map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
    }));
  const news = announcements.length
    ? announcements.slice(0, 3).map((item) => ({ id: item.id, title: item.title, tag: item.tag }))
    : fallbackNews;

  return <HomeContent players={availablePlayers} news={news} />;
}
