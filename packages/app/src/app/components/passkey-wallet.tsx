"use client";
import { useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
  findCommonPublicKey,
} from "@mysten/sui/keypairs/passkey";
import { StateBlock } from "@/app/components/state-block";

export const PASSKEY_STORAGE_KEY = "qy_passkey_wallet_v3";

type StoredWallet = {
  address: string;
  publicKey: string; // base64
};

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...Array.from(bytes)));
const fromBase64 = (b64: string) =>
  new Uint8Array(atob(b64).split("").map((c) => c.charCodeAt(0)));

export default function PasskeyWallet() {
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [hasCredential, setHasCredential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAutomation = process.env.NEXT_PUBLIC_PASSKEY_AUTOMATION === "1";

  const providerOpts = useMemo<BrowserPasswordProviderOptions>(() => {
    const isApple =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
    return {
      rpName: "情谊电竞",
      rpId: typeof window !== "undefined" ? window.location.hostname : undefined,
      authenticatorSelection: isAutomation
        ? {
            authenticatorAttachment: "cross-platform",
            residentKey: "preferred",
            requireResidentKey: false,
            userVerification: "preferred",
          }
        : { authenticatorAttachment: isApple ? "cross-platform" : "platform", userVerification: "preferred" },
    };
  }, [isAutomation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (raw) {
      try {
        setWallet(JSON.parse(raw) as StoredWallet);
      } catch {
        /* ignore */
      }
    }
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
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(stored));
    setWallet(stored);
    setMsg(toast);
    window.dispatchEvent(new Event("passkey-updated"));
    setTimeout(() => setMsg(null), 3000);
  };

  const create = async () => {
    if (typeof window === "undefined") return;
    if (hasCredential) {
      setError("已检测到已有账号，请使用「找回已有账号」");
      return;
    }
    try {
      setBusy(true);
      setMsg(null);
      setError(null);
      const provider = new BrowserPasskeyProvider("情谊电竞", providerOpts);
      const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
      const publicKey = keypair.getPublicKey();
      const address = publicKey.toSuiAddress();
      const stored: StoredWallet = { address, publicKey: toBase64(publicKey.toRawBytes()) };
      persist(stored, "账号已创建");
    } catch (e) {
      setError((e as Error).message || "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    if (!wallet) return;
    try {
      setBusy(true);
      setError(null);
      setMsg(null);
      const provider = new BrowserPasskeyProvider("情谊电竞", providerOpts);
      const keypair = new PasskeyKeypair(fromBase64(wallet.publicKey), provider);
      // 简单校验签名
      const testMsg = new TextEncoder().encode("login-check");
      await keypair.signPersonalMessage(testMsg);
      setMsg("登录成功，可用于签名");
    } catch (e) {
      setError((e as Error).message || "登录失败");
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
      const provider = new BrowserPasskeyProvider("情谊电竞", providerOpts);
      const msg1 = new TextEncoder().encode("recover-1");
      const msg2 = new TextEncoder().encode("recover-2");
      const pks1 = await PasskeyKeypair.signAndRecover(provider, msg1);
      const pks2 = await PasskeyKeypair.signAndRecover(provider, msg2);
      const pk = findCommonPublicKey(pks1, pks2);
      const stored: StoredWallet = {
        address: pk.toSuiAddress(),
        publicKey: toBase64(pk.toRawBytes()),
      };
      persist(stored, "已找回账号");
    } catch (e) {
      setError((e as Error).message || "找回失败");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const reset = () => {
    localStorage.removeItem(PASSKEY_STORAGE_KEY);
    setWallet(null);
    window.dispatchEvent(new Event("passkey-updated"));
  };

  return (
    <div className="dl-card" style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-3">
        <KeyRound className="text-amber-500" />
        <div>
          <div className="text-sm font-semibold text-gray-900">账号验证</div>
          <div className="text-xs text-gray-500">用于安全登录与身份识别</div>
        </div>
      </div>
      {wallet ? (
        <div className="mt-3 space-y-2 text-xs text-gray-600">
          <div className="flex gap-2 mt-2">
            <button onClick={login} disabled={busy} className="lc-tab-btn" style={{ padding: "6px 10px" }}>
              {busy ? "校验中..." : "使用此账号"}
            </button>
            <button onClick={reset} className="lc-tab-btn" style={{ padding: "6px 10px" }}>
              清除本地缓存
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={create}
          disabled={busy || hasCredential}
          className="lc-tab-btn"
          style={{ marginTop: 8, padding: "10px 12px" }}
        >
          {busy ? "创建中..." : hasCredential ? "已有账号" : "创建账号"}
        </button>
      )}
      {!wallet && (
        <button
          onClick={recover}
          disabled={busy}
          className="lc-tab-btn"
          style={{ marginTop: 6, padding: "10px 12px", backgroundColor: "#f3f4f6", color: "#111827" }}
        >
          {busy ? "恢复中..." : "找回已有账号"}
        </button>
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
          <div className="auth-overlay-box">账号验证进行中，请完成系统弹窗…</div>
        </div>
      )}
    </div>
  );
}
