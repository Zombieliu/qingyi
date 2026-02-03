 "use client";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import PasskeyLoginButton from "./components/passkey-login-button";
import { useSyncExternalStore } from "react";
import { PASSKEY_STORAGE_KEY } from "./components/passkey-wallet";

export default function RootPage() {
  const showHttpsTip = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return false;
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const secure = window.isSecureContext || window.location.protocol === "https:";
      return !(secure || isLocal);
    },
    () => false
  );

  const hasWallet = useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const handler = () => callback();
      window.addEventListener("passkey-updated", handler);
      window.addEventListener("storage", handler);
      return () => {
        window.removeEventListener("passkey-updated", handler);
        window.removeEventListener("storage", handler);
      };
    },
    () => {
      if (typeof window === "undefined") return false;
      return !!localStorage.getItem(PASSKEY_STORAGE_KEY);
    },
    () => false
  );

  return (
    <div className="login-shell">
      {showHttpsTip && (
        <div className="dl-card" style={{ padding: 12, marginBottom: 14, border: "1px solid #fecdd3", background: "#fff1f2" }}>
          <div className="flex items-center gap-2 text-sm text-rose-600">
            <AlertTriangle size={16} />
            <span>Passkey 仅在 HTTPS 或 localhost 下可用，请切换到安全域名再登录。</span>
          </div>
        </div>
      )}
      <div className="login-header">
        <div className="login-icon">
          <Image src="/icon-192.png" alt="情谊电竞" width={76} height={76} priority />
        </div>
        <div className="login-title">情谊电竞</div>
        <div className="login-sub">游戏不仅仅是游戏，陪玩可以走进生活，也能改变生活</div>
      </div>

      <div className="login-passkey">
        <ShieldCheck size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
        没账号？用 Passkey 一键注册/登录
      </div>
      <PasskeyLoginButton />
      <div style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}>
        {hasWallet ? (
          <Link href="/home" style={{ textDecoration: "underline" }}>
            已完成验证？进入主页
          </Link>
        ) : (
          <span style={{ color: "#6b7280" }}>请先完成 Passkey 登录</span>
        )}
      </div>
    </div>
  );
}
