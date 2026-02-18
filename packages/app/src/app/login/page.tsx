"use client";
import Image from "next/image";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import PasskeyLoginButton from "../components/passkey-login-button";
import { useSyncExternalStore } from "react";
import { PASSKEY_STORAGE_KEY } from "../components/passkey-wallet";
import TrackedLink from "../components/tracked-link";
import { useI18n } from "@/lib/i18n-client";

export default function LoginPage() {
  const { t } = useI18n();
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
            <span>{t("login.tip")}</span>
          </div>
        </div>
      )}
      <div className="login-header">
        <div className="login-icon">
          <Image src="/icon-192.png" alt={t("app.name")} width={76} height={76} priority />
        </div>
        <div className="login-title">{t("login.title")}</div>
        <div className="login-sub">{t("login.sub")}</div>
      </div>

      <div className="login-passkey">
        <ShieldCheck size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
        {t("login.passkey")}
      </div>
      <PasskeyLoginButton />
      {hasWallet && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <TrackedLink href="/home" event="login_enter_home" className="text-sm text-emerald-600">
            {t("login.enter")}
          </TrackedLink>
        </div>
      )}
      <div style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}>
        <span style={{ color: "#6b7280" }}>{t("login.need")}</span>
      </div>
    </div>
  );
}
