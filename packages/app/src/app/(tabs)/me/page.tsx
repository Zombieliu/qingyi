"use client";
import { t } from "@/lib/i18n/i18n-client";
import {
  Bell,
  Diamond,
  Gamepad2,
  Gift,
  Phone,
  ShieldCheck,
  User,
  Settings,
  Briefcase,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { GAME_PROFILE_KEY } from "@/lib/shared/constants";
import { useEffect, useState } from "react";
import SettingsPanel from "@/app/components/settings-panel";
import { useBalance } from "@/app/components/balance-provider";
import { useMantouBalance } from "@/app/components/mantou-provider";
import { LevelCard } from "@/app/components/level-card";
import { useUnreadCount } from "@/app/components/use-notifications";

const grid = [
  { label: "联系客服", icon: Phone, color: "#6366f1", href: "/me/support" },
  { label: "优惠卡券", icon: Diamond, color: "#f97316", href: "/me/coupons" },
  { label: "馒头提现", icon: Diamond, color: "#22c55e", href: "/me/mantou" },
  { label: t("ui.me.538"), icon: Gamepad2, color: "#0ea5e9", href: "/me/orders" },
  {
    label: t("ui.me.595"),
    icon: Gamepad2,
    color: "#6366f1",
    href: "/me/orders?filter=pending-start",
  },
  {
    label: t("ui.me.598"),
    icon: ShieldCheck,
    color: "#f59e0b",
    href: "/me/orders?filter=pending-confirm",
  },
  { label: t("ui.me.592"), icon: Phone, color: "#22c55e", href: "/me/invoice" },
  { label: "成为陪练", icon: User, color: "#d946ef", href: "/me/guardian" },
  { label: "陪练工作台", icon: Briefcase, color: "#0891b2", href: "/companion" },
  { label: "邀请返利", icon: Gift, color: "#ec4899", href: "/me/referral" },
  // 其他功能暂时隐藏
];

export default function Me() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balance } = useBalance();
  const { balance: mantouBalance } = useMantouBalance();
  const { count: unreadCount } = useUnreadCount();
  const [walletAddress, setWalletAddress] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { address?: string }).address || "" : "";
    } catch {
      return "";
    }
  });
  const [addrToast, setAddrToast] = useState<string | null>(null);
  const [gameProfile, setGameProfile] = useState<{ gameName: string; gameId: string } | null>(null);

  const goWallet = () => router.push("/wallet");
  const goSettings = () => router.push("/me?settings=1");
  const goGameSettings = () => router.push("/me/game-settings");
  const goMantou = () => router.push("/me/mantou");
  const closeSettings = () => router.push("/me");
  const copyAddress = async () => {
    const addr = walletAddress || "";
    if (!addr) {
      setAddrToast("auth.not_logged_in_no_address");
      setTimeout(() => setAddrToast(null), 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(addr);
      setAddrToast("clipboard.sui_address_copied");
    } catch {
      setAddrToast(`Sui 地址：${addr}`);
    } finally {
      setTimeout(() => setAddrToast(null), 3000);
    }
  };
  const logout = async () => {
    localStorage.removeItem(PASSKEY_STORAGE_KEY);
    window.dispatchEvent(new Event("passkey-updated"));
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // ignore
    }
    router.push("/");
  };

  const showSettings = searchParams?.get("settings") === "1";
  const profileKey = walletAddress || "local";

  useEffect(() => {
    const loadProfile = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = localStorage.getItem(GAME_PROFILE_KEY);
        if (!raw) {
          setGameProfile(null);
          return;
        }
        const parsed = JSON.parse(raw) as Record<string, { gameName: string; gameId: string }>;
        const profile = parsed[profileKey] || null;
        setGameProfile(profile && profile.gameName && profile.gameId ? profile : null);
      } catch {
        setGameProfile(null);
      }
    };

    const loadWallet = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
        setWalletAddress(raw ? (JSON.parse(raw) as { address?: string }).address || "" : "");
      } catch {
        setWalletAddress("");
      }
    };

    loadWallet();
    loadProfile();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === PASSKEY_STORAGE_KEY) {
        loadWallet();
      }
      if (event.key === GAME_PROFILE_KEY) {
        loadProfile();
      }
    };
    const handlePasskey = () => {
      loadWallet();
      loadProfile();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("passkey-updated", handlePasskey);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("passkey-updated", handlePasskey);
    };
  }, [profileKey]);

  if (showSettings) {
    return <SettingsPanel onBack={closeSettings} onLogout={logout} />;
  }

  return (
    <>
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">06:33</span>
          <span className="dl-chip dl-chip-soft">{t("ui.me.047")}</span>
        </div>
        <div className="dl-actions">
          <button
            className="dl-icon-circle"
            onClick={() => router.push("/me/notifications")}
            aria-label="消息中心"
            style={{ position: "relative" }}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#ef4444",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <button className="dl-icon-circle" onClick={copyAddress} aria-label={t("me.001")}>
            <ShieldCheck size={16} />
          </button>
          <button onClick={goSettings} className="dl-icon-circle" aria-label={t("me.002")}>
            <Settings size={16} />
          </button>
        </div>
      </header>
      {addrToast && <div className="ride-toast">{addrToast}</div>}

      <section className="dl-card dl-profile">
        <div className="dl-avatar" />
        <div className="dl-profile-info">
          <div className="dl-name-row">
            <div className="dl-name">{gameProfile?.gameName || t("ui.me.626")}</div>
            <span className="dl-chip">{t("ui.me.048")}</span>
          </div>
          <div className="dl-id">
            {gameProfile?.gameId ? `ID ${gameProfile.gameId}` : t("me.003")}
          </div>
        </div>
        <button className="dl-edit" onClick={goGameSettings} aria-label={t("me.004")}>
          编辑
        </button>
        <div className="dl-stats">
          {[
            { label: "钻石", value: balance, onClick: goWallet },
            { label: t("ui.me.622"), value: "0" },
            { label: "馒头", value: mantouBalance, onClick: goMantou },
          ].map((item) => (
            <button
              key={item.label}
              className="dl-stat"
              onClick={item.onClick}
              style={{
                cursor: item.onClick ? "pointer" : "default",
                background: "transparent",
                border: "none",
              }}
            >
              <div className="dl-stat-value">{item.value}</div>
              <div className="dl-stat-label">{item.label}</div>
            </button>
          ))}
        </div>
      </section>

      <LevelCard />

      <Link href="/vip" className="member-card">
        <div className="member-top">
          <div>
            <div className="member-grade">{t("ui.me.049")}</div>
            <div className="member-progress">{t("ui.me.050")}</div>
          </div>
          <span className="member-btn">{t("ui.me.051")}</span>
        </div>
        <div className="member-actions">
          {[
            { label: t("ui.me.625"), desc: t("ui.me.624") },
            { label: t("ui.me.599"), desc: t("ui.me.621") },
            { label: t("ui.me.570"), desc: t("ui.me.508") },
            { label: t("ui.me.536"), desc: t("ui.me.506") },
          ].map((item) => (
            <div key={item.label} className="member-item">
              <div className="member-item-label">{item.label}</div>
              <div className="member-item-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </Link>

      <section className="dl-card">
        <div className="dl-section-title">{t("ui.me.052")}</div>
        <div className="dl-grid">
          {grid.map((item) => (
            <Link key={item.label} href={item.href} className="dl-grid-item">
              <span className="dl-grid-icon" style={{ color: item.color }}>
                <item.icon size={20} />
              </span>
              <span className="dl-grid-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
