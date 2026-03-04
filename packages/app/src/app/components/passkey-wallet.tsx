"use client";
import { t } from "@/lib/i18n/t";
import { useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
  findCommonPublicKey,
} from "@mysten/sui/keypairs/passkey";
import { StateBlock } from "@/app/components/state-block";
import { ensureUserSession } from "@/lib/auth/user-auth-client";
import {
  PASSKEY_STORAGE_KEY,
  PASSKEY_WALLETS_KEY,
  RP_NAME,
  toBase64,
  shortAddress,
  loadStoredWallet,
  saveStoredWallet,
  clearStoredWallet,
  loadWalletList,
  removeWalletFromList,
  getPasskeyProviderOptions,
  isMissingCredential,
  type StoredWallet,
} from "./passkey-wallet-utils";

// Re-export for backward compatibility
export {
  PASSKEY_STORAGE_KEY,
  PASSKEY_WALLETS_KEY,
  shortAddress,
  loadStoredWallet,
  saveStoredWallet,
  clearStoredWallet,
  loadWalletList,
  removeWalletFromList,
  getPasskeyProviderOptions,
  createPasskeyProvider,
  rememberWallet,
} from "./passkey-wallet-utils";
export type { StoredWallet } from "./passkey-wallet-utils";

export default function PasskeyWallet() {
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [hasCredential, setHasCredential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAutomation = process.env.NEXT_PUBLIC_PASSKEY_AUTOMATION === "1";

  const providerOpts = useMemo<BrowserPasswordProviderOptions>(
    () => getPasskeyProviderOptions(isAutomation),
    [isAutomation]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setWallet(loadStoredWallet());
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
        // ignore detection errors
      }
    };
    check();
    return () => controller.abort();
  }, []);

  const persist = (stored: StoredWallet, toast: string) => {
    const next = saveStoredWallet(stored);
    if (next) {
      setWallet(next);
      setWallets(loadWalletList());
    }
    setMsg(toast);
    setTimeout(() => setMsg(null), 3000);
  };

  const create = async () => {
    if (typeof window === "undefined") return;
    try {
      setBusy(true);
      setMsg(null);
      setError(null);
      const provider = new BrowserPasskeyProvider(RP_NAME, providerOpts);
      const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
      const publicKey = keypair.getPublicKey();
      const address = publicKey.toSuiAddress();
      const stored: StoredWallet = { address, publicKey: toBase64(publicKey.toRawBytes()) };
      persist(stored, t("comp.passkey_wallet.001"));
    } catch (e) {
      setError((e as Error).message || t("components.passkey_wallet.i165"));
    } finally {
      setBusy(false);
    }
  };

  const login = async (target?: StoredWallet | null) => {
    const nextWallet = target || wallet || loadStoredWallet();
    if (!nextWallet) {
      setError(t("comp.passkey_wallet.002"));
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setMsg(null);
      persist(nextWallet, t("comp.passkey_wallet.003"));
      await ensureUserSession(nextWallet.address);
    } catch (e) {
      if (isMissingCredential(e)) {
        setError(t("comp.passkey_wallet.004"));
      } else {
        setError((e as Error).message || t("components.passkey_wallet.i166"));
      }
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const recover = async () => {
    try {
      setBusy(true);
      setError(null);
      setMsg(null);
      const provider = new BrowserPasskeyProvider(RP_NAME, providerOpts);
      const msg1 = new TextEncoder().encode("recover-1");
      const msg2 = new TextEncoder().encode("recover-2");
      const pks1 = await PasskeyKeypair.signAndRecover(provider, msg1);
      const pks2 = await PasskeyKeypair.signAndRecover(provider, msg2);
      const pk = findCommonPublicKey(pks1, pks2);
      const stored: StoredWallet = {
        address: pk.toSuiAddress(),
        publicKey: toBase64(pk.toRawBytes()),
      };
      persist(stored, t("comp.passkey_wallet.005"));
    } catch (e) {
      setError((e as Error).message || t("components.passkey_wallet.i167"));
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const reset = async () => {
    clearStoredWallet();
    setWallet(null);
    setWallets(loadWalletList());
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  return (
    <div className="dl-card" style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-3">
        <KeyRound className="text-amber-500" />
        <div>
          <div className="text-sm font-semibold text-gray-900">{t("ui.passkey-wallet.497")}</div>
          <div className="text-xs text-gray-500">{t("ui.passkey-wallet.498")}</div>
        </div>
      </div>

      {wallets.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-gray-500">{t("ui.passkey-wallet.499")}</div>
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
                  onClick={() => login(item)}
                  disabled={busy}
                  className="lc-tab-btn"
                  style={{ padding: "6px 10px" }}
                >
                  使用
                </button>
                <button
                  onClick={() => removeWalletFromList(item.address)}
                  disabled={busy}
                  className="lc-tab-btn"
                  style={{ padding: "6px 10px", backgroundColor: "#f3f4f6", color: "#111827" }}
                >
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <button
          onClick={() => login()}
          disabled={busy}
          className="lc-tab-btn"
          style={{ padding: "10px 12px" }}
        >
          {busy ? t("ui.passkey-wallet.637") : t("comp.passkey_wallet.006")}
        </button>
        <button
          onClick={create}
          disabled={busy}
          className="lc-tab-btn"
          style={{ padding: "10px 12px" }}
        >
          {busy ? t("ui.passkey-wallet.546") : t("comp.passkey_wallet.007")}
        </button>
        <button
          onClick={recover}
          disabled={busy}
          className="lc-tab-btn"
          style={{ padding: "10px 12px", backgroundColor: "#f3f4f6", color: "#111827" }}
        >
          {busy ? t("components.passkey_wallet.i168") : t("comp.passkey_wallet.008")}
        </button>
      </div>

      {hasCredential && (
        <div className="mt-2 text-xs text-amber-600">
          检测到设备已有 Passkey，建议优先登录或找回。
        </div>
      )}

      {wallet && (
        <div className="mt-3 text-xs text-gray-500">
          当前账号：{shortAddress(wallet.address)}
          <button
            onClick={reset}
            className="lc-tab-btn"
            style={{
              marginLeft: 8,
              padding: "4px 8px",
              backgroundColor: "#f3f4f6",
              color: "#111827",
            }}
          >
            清除本地缓存
          </button>
        </div>
      )}

      {msg && (
        <div className="mt-3">
          <StateBlock tone="success" size="compact" title={msg} />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <StateBlock tone="danger" size="compact" title={error} />
        </div>
      )}
      {busy && (
        <div className="auth-overlay">
          <div className="auth-overlay-box">{t("ui.passkey-wallet.500")}</div>
        </div>
      )}
    </div>
  );
}
