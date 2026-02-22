"use client";
import { t } from "@/lib/i18n/i18n-client";

import type { LocalOrder } from "@/lib/services/order-store";

// --- Types ---

export type RideItem = {
  name: string;
  desc: string;
  eta: string;
  price: string;
  old?: string;
  tag?: string;
  bold?: boolean;
  info?: string;
  base?: number;
};

export type RideSection = {
  title: string;
  badge?: string;
  highlight?: boolean;
  items: RideItem[];
};

export type Mode = "select" | "notifying" | "await-user-pay" | "enroute" | "pending-settlement";

export type PublicPlayer = {
  id: string;
  name: string;
  role?: string;
  status: "可接单" | "忙碌" | "停用";
  wechatQr?: string;
  alipayQr?: string;
};

export type GameProfile = {
  gameName: string;
  gameId: string;
  updatedAt: number;
  userAddress?: string;
};

type StoredProfiles = Record<string, GameProfile>;

// --- Constants ---

export const FIRST_ORDER_STORAGE_KEY = "qy_first_order_discount_used_v1";
export const FIRST_ORDER_DISCOUNT = { minSpend: 99, amount: 10, label: "首单满99减10" };
export const PLAYER_SECTION_TITLE = "可接陪练";
export const MATCH_RATE = 0.15;

// --- Static data ---

export const sections: RideSection[] = [
  {
    title: "推荐单",
    highlight: true,
    items: [
      {
        name: "绝密体验单",
        desc: "15分钟上车",
        eta: "15分钟",
        price: "880钻石",
        old: "1280钻石",
        tag: "已优惠400",
        bold: true,
        info: "保1000W",
        base: 88,
      },
      {
        name: "绝密快单",
        desc: "10分钟上车",
        eta: "10分钟",
        price: "1280钻石",
        old: "1580钻石",
        info: "保1000W",
        base: 128,
      },
    ],
  },
  {
    title: "特价单",
    items: [
      {
        name: "机密大坝",
        desc: "单护/双护随机",
        eta: "5分钟",
        price: "280钻石",
        tag: "保1880",
        base: 28,
      },
      {
        name: "机密航天",
        desc: "单护/双护随机",
        eta: "7分钟",
        price: "380钻石",
        tag: "保2880",
        base: 38,
      },
    ],
  },
  {
    title: "小时单",
    items: [
      { name: "机密单护", desc: "稳定陪练", eta: "7分钟", price: "300钻石", base: 30 },
      { name: "机密双护", desc: "双人协同", eta: "8分钟", price: "600钻石", base: 60 },
      { name: "绝密单护", desc: "高强度陪练", eta: "10分钟", price: "500钻石", base: 50 },
      { name: "绝密双护", desc: "双核保障", eta: "11分钟", price: "1000钻石", base: 100 },
    ],
  },
  {
    title: "趣味单",
    items: [
      { name: "摸油", desc: "保证带油出局", eta: "9分钟", price: "5880钻石", base: 588 },
      { name: "摸心", desc: "保证摸到心", eta: "12分钟", price: "12880钻石", base: 1288 },
    ],
  },
];

// --- Helpers ---

export function readDiscountUsage(address: string) {
  if (typeof window === "undefined") return false;
  const key = address || "guest";
  const raw = window.localStorage.getItem(FIRST_ORDER_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(parsed[key]);
  } catch {
    return false;
  }
}

export function markDiscountUsage(address: string) {
  if (typeof window === "undefined") return;
  const key = address || "guest";
  const raw = window.localStorage.getItem(FIRST_ORDER_STORAGE_KEY);
  const next: Record<string, boolean> = {};
  if (raw) {
    try {
      Object.assign(next, JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // ignore
    }
  }
  next[key] = true;
  window.localStorage.setItem(FIRST_ORDER_STORAGE_KEY, JSON.stringify(next));
}

import { GAME_PROFILE_KEY } from "@/lib/shared/constants";

export function loadGameProfile(address: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GAME_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfiles;
    return parsed[address] || parsed.local || null;
  } catch {
    return null;
  }
}

export function deriveMode(list: LocalOrder[]): Mode {
  const latest = list.find((o) => !o.status.includes("取消") && !o.status.includes("完成")) || null;
  if (!latest) return "select";
  const chainStatus = (latest.meta as { chain?: { status?: number } } | undefined)?.chain?.status;
  if (typeof chainStatus === "number") {
    if (chainStatus === 3) return "pending-settlement";
    if (chainStatus >= 2) return "enroute";
  }
  if (latest.status.includes("待结算") || latest.status.includes("已完成待结算")) {
    return "pending-settlement";
  }
  if (latest.driver) {
    const paymentMode = (latest.meta as { paymentMode?: string } | undefined)?.paymentMode;
    const treatedPaid = Boolean(latest.playerPaid || paymentMode === "diamond_escrow");
    return treatedPaid ? "enroute" : "await-user-pay";
  }
  return "notifying";
}

export function statusLabel(status: number) {
  switch (status) {
    case 0:
      return t("schedule.schedule_data.001");
    case 1:
      return t("schedule.schedule_data.002");
    case 2:
      return t("schedule.schedule_data.003");
    case 3:
      return t("schedule.schedule_data.004");
    case 4:
      return t("schedule.schedule_data.005");
    case 5:
      return t("schedule.schedule_data.006");
    case 6:
      return t("schedule.schedule_data.007");
    default:
      return `未知状态(${status})`;
  }
}

export function formatAmount(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return (num / 100).toFixed(2);
}

export function formatTime(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "-";
  return new Date(num).toLocaleString();
}

export function shortDigest(digest?: string | null) {
  if (!digest) return "";
  if (digest.length <= 12) return digest;
  return `${digest.slice(0, 6)}...${digest.slice(-4)}`;
}

import { ShieldCheck, Loader2 } from "lucide-react";

export function Step({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className={`ride-step ${done ? "is-done" : ""}`}>
      <div className="ride-step-icon">
        {done ? <ShieldCheck size={16} /> : <Loader2 size={16} className="spin" />}
      </div>
      <div className="ride-step-text">{label}</div>
    </div>
  );
}
