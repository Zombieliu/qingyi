"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
  findCommonPublicKey,
} from "@mysten/sui/keypairs/passkey";
import {
  PASSKEY_STORAGE_KEY,
  PASSKEY_WALLETS_KEY,
  type StoredWallet,
  getPasskeyProviderOptions,
  loadStoredWallet,
  loadWalletList,
  removeWalletFromList,
  saveStoredWallet,
  shortAddress,
} from "./passkey-wallet";
import { trackEvent } from "@/lib/services/analytics";
import { useI18n, t } from "@/lib/i18n/i18n-client";
import { ensureUserSession } from "@/lib/auth/user-auth-client";

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)));
const fromBase64 = (b64: string) =>
  new Uint8Array(
    atob(b64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

function isMissingCredential(error: unknown) {
  const err = error as Error & { name?: string };
  const msg = err.message || "";
  return (
    err.name === "NotFoundError" ||
    msg.includes("No passkeys found") ||
    msg.includes("not found") ||
    msg.includes("No credentials")
  );
}

export default function PasskeyLoginButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [currentWallet, setCurrentWallet] = useState<StoredWallet | null>(null);
  const [hasCredential, setHasCredential] = useState(false);
  const isAutomation = process.env.NEXT_PUBLIC_PASSKEY_AUTOMATION === "1";

  const providerOpts = useMemo<BrowserPasswordProviderOptions>(
    () => getPasskeyProviderOptions(isAutomation),
    [isAutomation]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setCurrentWallet(loadStoredWallet());
      setWallets(loadWalletList());
    };
    sync();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PASSKEY_STORAGE_KEY || event.key === PASSKEY_WALLETS_KEY) {
        sync();
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("passkey-updated", sync);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("passkey-updated", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    const check = async () => {
      try {
        if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return;
        const available = await window.PublicKeyCredential.isConditionalMediationAvailable();
        if (controller.signal.aborted) return;
        setHasCredential(Boolean(available));
      } catch {
        // ignore
      }
    };
    check();
    return () => controller.abort();
  }, []);

  const persist = async (
    stored: StoredWallet,
    msg: string,
    meta?: { created?: boolean; recovered?: boolean }
  ) => {
    const next = saveStoredWallet(stored);
    if (!next) return;
    trackEvent("login_success", {
      method: "passkey",
      created: Boolean(meta?.created),
      recovered: Boolean(meta?.recovered),
    });
    try {
      await ensureUserSession(next.address);
    } catch {
      // ignore
    }
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
    router.push("/home");
  };

  const loginWithWallet = async (stored?: StoredWallet | null) => {
    const target = stored || currentWallet || loadStoredWallet();
    if (!target) {
      setToast(t("passkey.error.nowallet"));
      return;
    }
    const stage = "signin";
    try {
      setLoading(true);
      setOverlay(true);
      setToast(null);
      trackEvent("login_click", { method: "passkey", stage });
      const provider = new BrowserPasskeyProvider(t("comp.passkey_login_button.001"), providerOpts);
      const keypair = new PasskeyKeypair(fromBase64(target.publicKey), provider);
      await keypair.signPersonalMessage(new TextEncoder().encode("login-check"));
      await persist(target, t("passkey.success.login"));
    } catch (e) {
      const message = isMissingCredential(e)
        ? t("passkey.error.missing")
        : (e as Error).message || t("passkey.error");
      trackEvent("login_failed", { method: "passkey", stage, message });
      setToast(message);
    } finally {
      setLoading(false);
      setOverlay(false);
    }
  };

  const createPasskey = async () => {
    const stage = "register";
    try {
      setLoading(true);
      setOverlay(true);
      setToast(null);
      trackEvent("passkey_created", { method: "passkey" });
      const provider = new BrowserPasskeyProvider(t("comp.passkey_login_button.002"), providerOpts);
      const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
      const publicKey = keypair.getPublicKey();
      const address = publicKey.toSuiAddress();
      const publicKeyB64 = toBase64(publicKey.toRawBytes());
      await persist({ address, publicKey: publicKeyB64 }, t("passkey.success.create"), {
        created: true,
      });
    } catch (e) {
      const message = (e as Error).message || t("passkey.error");
      trackEvent("login_failed", { method: "passkey", stage, message });
      setToast(message);
    } finally {
      setLoading(false);
      setOverlay(false);
    }
  };

  const recoverPasskey = async () => {
    const stage = "recover";
    try {
      setLoading(true);
      setOverlay(true);
      setToast(null);
      const provider = new BrowserPasskeyProvider(t("comp.passkey_login_button.003"), providerOpts);
      const msg1 = new TextEncoder().encode("recover-1");
      const msg2 = new TextEncoder().encode("recover-2");
      const pks1 = await PasskeyKeypair.signAndRecover(provider, msg1);
      const pks2 = await PasskeyKeypair.signAndRecover(provider, msg2);
      const pk = findCommonPublicKey(pks1, pks2);
      const publicKeyRaw = pk.toRawBytes();
      const stored: StoredWallet = {
        address: pk.toSuiAddress(),
        publicKey: toBase64(publicKeyRaw),
      };
      await persist(stored, t("passkey.success.recover"), { recovered: true });
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
      {wallets.length > 0 && (
        <div className="dl-card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="text-xs text-gray-500" style={{ marginBottom: 8 }}>
            {t("passkey.recent")}
          </div>
          <div className="space-y-2">
            {wallets.map((item) => (
              <div
                key={item.address}
                className="flex items-center justify-between gap-3 text-xs text-gray-600"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {item.label || shortAddress(item.address)}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleDateString("zh-CN") : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="lc-tab-btn"
                    style={{ padding: "6px 10px" }}
                    onClick={() => loginWithWallet(item)}
                    disabled={loading}
                  >
                    {t("passkey.use")}
                  </button>
                  <button
                    className="lc-tab-btn"
                    style={{ padding: "6px 10px", backgroundColor: "#f3f4f6", color: "#111827" }}
                    onClick={() => removeWalletFromList(item.address)}
                    disabled={loading}
                  >
                    {t("passkey.remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="login-btn" onClick={() => loginWithWallet()} disabled={loading}>
        {loading ? t("passkey.processing") : t("passkey.login")}
      </button>
      <div className="mt-3 space-y-2">
        <button
          className="lc-tab-btn"
          onClick={createPasskey}
          disabled={loading}
          style={{ padding: "10px 12px" }}
        >
          {t("passkey.register")}
        </button>
        <button
          className="lc-tab-btn"
          onClick={recoverPasskey}
          disabled={loading}
          style={{ padding: "10px 12px", backgroundColor: "#f3f4f6", color: "#111827" }}
        >
          {t("passkey.recover")}
        </button>
      </div>

      {hasCredential && <div className="login-check">{t("passkey.hint")}</div>}
      {toast && <div className="mt-2 text-sm text-emerald-600">{toast}</div>}
      {overlay && (
        <div className="auth-overlay">
          <div className="auth-overlay-box">{t("passkey.overlay")}</div>
        </div>
      )}
    </div>
  );
}
