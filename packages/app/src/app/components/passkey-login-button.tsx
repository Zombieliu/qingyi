"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
} from "@mysten/sui/keypairs/passkey";
import { PASSKEY_STORAGE_KEY } from "./passkey-wallet";
import { trackEvent } from "@/app/components/analytics";
import { useI18n } from "@/lib/i18n-client";

type StoredWallet = {
  address: string;
  publicKey: string;
};

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...Array.from(bytes)));
const fromBase64 = (b64: string) =>
  new Uint8Array(atob(b64).split("").map((c) => c.charCodeAt(0)));

export default function PasskeyLoginButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [overlay, setOverlay] = useState(false);

  const providerOpts = useMemo<BrowserPasswordProviderOptions>(() => {
    const isApple =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
    return {
      rpName: "情谊电竞",
      rpId: typeof window !== "undefined" ? window.location.hostname : undefined,
      authenticatorSelection: {
        authenticatorAttachment: isApple ? "cross-platform" : "platform",
        userVerification: "preferred",
      },
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setHasWallet(!!localStorage.getItem(PASSKEY_STORAGE_KEY));
    update();
    window.addEventListener("passkey-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("passkey-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const persist = (stored: StoredWallet, msg: string, meta?: { created?: boolean }) => {
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event("passkey-updated"));
    trackEvent("login_success", { method: "passkey", created: Boolean(meta?.created) });
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
    router.push("/home");
  };

  const createPasskey = async () => {
    const keypair = await PasskeyKeypair.getPasskeyInstance(new BrowserPasskeyProvider("情谊电竞", providerOpts));
    const publicKey = keypair.getPublicKey();
    const address = publicKey.toSuiAddress();
    trackEvent("passkey_created", { method: "passkey" });
    persist({ address, publicKey: toBase64(publicKey.toRawBytes()) }, t("passkey.success.create"), { created: true });
    setHasWallet(true);
  };

  const handle = async () => {
    let stage = "init";
    try {
      setLoading(true);
      setOverlay(true);
      setToast(null);
      trackEvent("login_click", { method: "passkey", hasWallet });
      const provider = new BrowserPasskeyProvider("情谊电竞", providerOpts);

      if (hasWallet) {
        stage = "signin";
        const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
        if (!raw) throw new Error("本地未找到账号信息");
        const stored = JSON.parse(raw) as StoredWallet;
        try {
          const keypair = new PasskeyKeypair(fromBase64(stored.publicKey), provider);
          await keypair.signPersonalMessage(new TextEncoder().encode("login-check"));
          persist(stored, t("passkey.success.login"));
          return;
        } catch (e) {
          const err = e as Error & { name?: string };
          const msg = err.message || "";
          const missing =
            err.name === "NotFoundError" ||
            msg.includes("No passkeys found") ||
            msg.includes("not found") ||
            msg.includes("No credentials");
          if (missing) {
            trackEvent("passkey_missing_recreate", { method: "passkey" });
            localStorage.removeItem(PASSKEY_STORAGE_KEY);
            setHasWallet(false);
            await createPasskey();
            return;
          }
          throw e;
        }
      }

      stage = "register";
      await createPasskey();
    } catch (e) {
      const message = (e as Error).message || t("passkey.error");
      trackEvent("login_failed", { method: "passkey", stage, message });
      setToast(message);
    } finally {
      setLoading(false);
      setOverlay(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: 12 }}>
      <button className="login-btn" onClick={handle} disabled={loading}>
        {loading ? t("passkey.processing") : hasWallet ? t("passkey.login") : t("passkey.register")}
      </button>
      {toast && <div className="mt-2 text-sm text-emerald-600">{toast}</div>}
      {overlay && (
        <div className="auth-overlay">
          <div className="auth-overlay-box">{t("passkey.overlay")}</div>
        </div>
      )}
    </div>
  );
}
