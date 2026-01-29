"use client";
import { useEffect, useState } from "react";
import PasskeyWallet, { PASSKEY_STORAGE_KEY } from "./passkey-wallet";

type GateState = "checking" | "allowed" | "blocked";

export default function PasskeyGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");

  const check = () => {
    if (typeof window === "undefined") return;
    const ok = !!localStorage.getItem(PASSKEY_STORAGE_KEY);
    setState(ok ? "allowed" : "blocked");
  };

  useEffect(() => {
    check();
    const handler = () => check();
    window.addEventListener("storage", handler);
    window.addEventListener("passkey-updated", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("passkey-updated", handler);
    };
  }, []);

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="dl-main" style={{ padding: 16 }}>
      <div className="dl-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="text-base font-semibold text-gray-900">需要 Passkey 登录</div>
        <div className="text-sm text-gray-600 mt-2 leading-relaxed">
          首次打开视为注册：创建 Passkey 即生成您的身份与钱包；更换设备请使用“找回已有钱包”。完成后自动解锁全站页面。
          （Passkey 仅在 HTTPS 或 localhost 可用）
        </div>
      </div>
      <PasskeyWallet />
    </div>
  );
}
