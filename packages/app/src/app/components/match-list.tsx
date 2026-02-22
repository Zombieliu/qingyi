import { t } from "@/lib/i18n/i18n-client";
import { LobbyCard } from "./lobby-card";

const lobbies = [
  {
    title: "夜枭小队",
    level: "SR 1600-1900",
    mode: "8 人战术房",
    slots: "6/8",
    voice: true,
    verified: true,
  },
  {
    title: "北湾进攻",
    level: "SR 1400+",
    mode: "排位 · 沙漠油田",
    slots: "4/5",
    voice: true,
  },
  {
    title: "新手训练房",
    level: "不限段位",
    mode: "教学陪练",
    slots: "3/4",
    voice: false,
    verified: true,
  },
];

export function MatchList() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-white/80">
        <div>
          <div className="text-sm uppercase tracking-[0.18em] text-cyan-100/60">Live Lobbies</div>
          <h2 className="text-xl font-semibold text-white">{t("ui.match-list.495")}</h2>
        </div>
        <button className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/50">
          发布房间
        </button>
      </div>
      <div className="space-y-3">
        {lobbies.map((lobby) => (
          <LobbyCard key={lobby.title} {...lobby} />
        ))}
      </div>
    </section>
  );
}
