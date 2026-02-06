"use client";
import { useSyncExternalStore } from "react";
import PasskeyWallet, { PASSKEY_STORAGE_KEY } from "./passkey-wallet";

type GateState = "checking" | "allowed" | "blocked";

export default function PasskeyGate({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore<GateState>(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const handler = () => callback();
      window.addEventListener("storage", handler);
      window.addEventListener("passkey-updated", handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener("passkey-updated", handler);
      };
    },
    () => {
      if (typeof window === "undefined") return "checking";
      const ok = !!localStorage.getItem(PASSKEY_STORAGE_KEY);
      return ok ? "allowed" : "blocked";
    },
    () => "checking"
  );

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="dl-main" style={{ padding: 16 }}>
      <div className="dl-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="text-base font-semibold text-gray-900">需要登录</div>
        <div className="text-sm text-gray-600 mt-2 leading-relaxed">
          首次打开视为注册：创建账号即可完成身份验证；更换设备请使用“找回已有账号”。完成后自动解锁全站页面。
          （登录仅在 HTTPS 或 localhost 可用）
        </div>
      </div>
      <PasskeyWallet />
    </div>
  );
}
