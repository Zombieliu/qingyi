"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import PasskeyWallet, { PASSKEY_STORAGE_KEY } from "./passkey-wallet";

type GateState = "checking" | "allowed" | "blocked";

export default function PasskeyGate({ children }: { children: React.ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const hasPasskey = useSyncExternalStore<boolean>(
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
      if (typeof window === "undefined") return false;
      return !!localStorage.getItem(PASSKEY_STORAGE_KEY);
    },
    () => false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!active) return;
        setSessionOk(res.ok);
      } catch {
        if (!active) return;
        setSessionOk(false);
      } finally {
        if (active) setSessionReady(true);
      }
    };
    check();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hasPasskey]);

  const allowed = hasPasskey || sessionOk;
  const state: GateState = allowed ? "allowed" : sessionReady ? "blocked" : "checking";

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="dl-main" style={{ padding: 16 }}>
      <div className="dl-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="text-base font-semibold text-gray-900">需要登录</div>
        <div className="text-sm text-gray-600 mt-2 leading-relaxed">
          {sessionOk && !hasPasskey ? (
            <>
              检测到你可能更换了设备。请点击下方「找回已有账号」，系统会要求你验证两次指纹/面容来恢复账号。
            </>
          ) : (
            <>
              请选择登录、创建或找回已有账号完成验证。若更换设备，请使用「找回已有账号」。完成后自动解锁全站页面。
              （登录仅在 HTTPS 或 localhost 可用）
            </>
          )}
        </div>
      </div>
      <PasskeyWallet />
    </div>
  );
}
