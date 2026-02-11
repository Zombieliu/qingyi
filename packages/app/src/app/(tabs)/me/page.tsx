"use client";
import { Diamond, Gamepad2, Phone, ShieldCheck, User, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import { useEffect, useState } from "react";
import SettingsPanel from "@/app/components/settings-panel";
import { useBalance } from "@/app/components/balance-provider";
import { useMantouBalance } from "@/app/components/mantou-provider";

const grid = [
  { label: "联系客服", icon: Phone, color: "#6366f1", href: "/me/support" },
  { label: "优惠卡券", icon: Diamond, color: "#f97316", href: "/me/coupons" },
  { label: "馒头提现", icon: Diamond, color: "#22c55e", href: "/me/mantou" },
  { label: "全部订单", icon: Gamepad2, color: "#0ea5e9", href: "/me/orders" },
  { label: "待开始", icon: Gamepad2, color: "#6366f1", href: "/me/orders?filter=pending-start" },
  { label: "待确认", icon: ShieldCheck, color: "#f59e0b", href: "/me/orders?filter=pending-confirm" },
  { label: "开发票", icon: Phone, color: "#22c55e", href: "/me/invoice" },
  { label: "成为护航", icon: User, color: "#d946ef", href: "/me/guardian" },
  // 其他功能暂时隐藏
];

export default function Me() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balance } = useBalance();
  const { balance: mantouBalance } = useMantouBalance();
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
      setAddrToast("未登录，无法获取地址");
      setTimeout(() => setAddrToast(null), 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(addr);
      setAddrToast("已复制 Sui 地址");
    } catch {
      setAddrToast(`Sui 地址：${addr}`);
    } finally {
      setTimeout(() => setAddrToast(null), 3000);
    }
  };
  const logout = () => {
    localStorage.removeItem(PASSKEY_STORAGE_KEY);
    window.dispatchEvent(new Event("passkey-updated"));
    router.push("/");
  };

  const showSettings = searchParams?.get("settings") === "1";
  const profileKey = walletAddress || "local";

  useEffect(() => {
    const loadProfile = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = localStorage.getItem("qy_game_profile_v1");
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
      if (event.key === "qy_game_profile_v1") {
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
          <span className="dl-chip dl-chip-soft">实时</span>
        </div>
        <div className="dl-actions">
          <button className="dl-icon-circle" onClick={copyAddress} aria-label="复制 Sui 地址">
            <ShieldCheck size={16} />
          </button>
          <button onClick={goSettings} className="dl-icon-circle" aria-label="设置">
            <Settings size={16} />
          </button>
        </div>
      </header>
      {addrToast && <div className="ride-toast">{addrToast}</div>}

      <section className="dl-card dl-profile">
        <div className="dl-avatar" />
        <div className="dl-profile-info">
          <div className="dl-name-row">
            <div className="dl-name">{gameProfile?.gameName || "未设置游戏名"}</div>
            <span className="dl-chip">个人主页</span>
          </div>
          <div className="dl-id">
            {gameProfile?.gameId ? `ID ${gameProfile.gameId}` : "请先在游戏设置填写"}
          </div>
        </div>
        <button className="dl-edit" onClick={goGameSettings} aria-label="编辑游戏设置">
          编辑
        </button>
        <div className="dl-stats">
          {[
            { label: "钻石", value: balance, onClick: goWallet },
            { label: "星星", value: "0" },
            { label: "馒头", value: mantouBalance, onClick: goMantou },
          ].map((item) => (
            <button
              key={item.label}
              className="dl-stat"
              onClick={item.onClick}
              style={{ cursor: item.onClick ? "pointer" : "default", background: "transparent", border: "none" }}
            >
              <div className="dl-stat-value">{item.value}</div>
              <div className="dl-stat-label">{item.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="member-card">
        <div className="member-top">
          <div>
            <div className="member-grade">V8 会员</div>
            <div className="member-progress">还需 4236 里程值可保级至 V8</div>
          </div>
          <button className="member-btn">会员中心</button>
        </div>
        <div className="member-actions">
          {[
            { label: "月月领券", desc: "最高省270元" },
            { label: "快速响应+", desc: "无限次" },
            { label: "娱乐培", desc: "24小时/月" },
            { label: "免费升级", desc: "1次/月" },
          ].map((item) => (
            <div key={item.label} className="member-item">
              <div className="member-item-label">{item.label}</div>
              <div className="member-item-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dl-card">
        <div className="dl-section-title">更多功能</div>
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
