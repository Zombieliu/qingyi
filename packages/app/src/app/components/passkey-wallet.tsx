"use client";
import { useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
  type PasskeyProvider,
  findCommonPublicKey,
} from "@mysten/sui/keypairs/passkey";
import { StateBlock } from "@/app/components/state-block";
import { ensureUserSession } from "@/lib/auth/user-auth-client";

export const PASSKEY_STORAGE_KEY = "qy_passkey_wallet_v3";
export const PASSKEY_WALLETS_KEY = "qy_passkey_wallets_v1";
const RP_NAME = "情谊电竞";

export type StoredWallet = {
  address: string;
  publicKey: string; // base64
  label?: string;
  createdAt?: number;
  lastUsedAt?: number;
};

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)));
const fromBase64 = (b64: string) =>
  new Uint8Array(
    atob(b64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

export function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function loadStoredWallet(): StoredWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWallet;
    if (!parsed?.address || !parsed?.publicKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredWallet(stored: StoredWallet): StoredWallet | null {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  const next: StoredWallet = {
    ...stored,
    createdAt: stored.createdAt || now,
    lastUsedAt: now,
  };
  localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(next));
  rememberWallet(next);
  window.dispatchEvent(new Event("passkey-updated"));
  return next;
}

export function clearStoredWallet() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PASSKEY_STORAGE_KEY);
  window.dispatchEvent(new Event("passkey-updated"));
}

export function loadWalletList(): StoredWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PASSKEY_WALLETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredWallet[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.address && item?.publicKey);
  } catch {
    return [];
  }
}

function saveWalletList(list: StoredWallet[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PASSKEY_WALLETS_KEY, JSON.stringify(list.slice(0, 5)));
}

export function rememberWallet(stored: StoredWallet) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const list = loadWalletList();
  const idx = list.findIndex((item) => item.address === stored.address);
  const nextItem: StoredWallet = {
    ...stored,
    createdAt: stored.createdAt || now,
    lastUsedAt: now,
  };
  let next = [...list];
  if (idx >= 0) {
    next[idx] = { ...list[idx], ...nextItem };
  } else {
    next = [nextItem, ...next];
  }
  next.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  saveWalletList(next);
}

export function removeWalletFromList(address: string) {
  if (typeof window === "undefined") return;
  const list = loadWalletList().filter((item) => item.address !== address);
  saveWalletList(list);
  window.dispatchEvent(new Event("passkey-updated"));
}

export function getPasskeyProviderOptions(isAutomation = false): BrowserPasswordProviderOptions {
  return {
    rp: {
      id: typeof window !== "undefined" ? window.location.hostname : undefined,
    },
    authenticatorSelection: {
      authenticatorAttachment: isAutomation ? "cross-platform" : "platform",
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "preferred",
    },
  };
}

export function createPasskeyProvider(isAutomation = false): PasskeyProvider {
  return new BrowserPasskeyProvider(RP_NAME, getPasskeyProviderOptions(isAutomation));
}

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

async function bootstrapSession(address: string) {
  try {
    await ensureUserSession(address);
  } catch {
    // ignore session bootstrap errors
  }
}

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

  const persist = async (stored: StoredWallet, toast: string) => {
    const next = saveStoredWallet(stored);
    if (next) {
      setWallet(next);
      setWallets(loadWalletList());
      await bootstrapSession(next.address);
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
      await persist(stored, "账号已创建");
    } catch (e) {
      setError((e as Error).message || "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const login = async (target?: StoredWallet | null) => {
    const nextWallet = target || wallet || loadStoredWallet();
    if (!nextWallet) {
      setError("未找到可登录账号，请先创建或找回");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setMsg(null);
      const provider = new BrowserPasskeyProvider(RP_NAME, providerOpts);
      const keypair = new PasskeyKeypair(fromBase64(nextWallet.publicKey), provider);
      const testMsg = new TextEncoder().encode("login-check");
      await keypair.signPersonalMessage(testMsg);
      await persist(nextWallet, "登录成功");
    } catch (e) {
      if (isMissingCredential(e)) {
        setError("此设备未找到该账号，请使用找回已有账号");
      } else {
        setError((e as Error).message || "登录失败");
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
      await persist(stored, "已找回账号");
    } catch (e) {
      setError((e as Error).message || "找回失败");
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
          <div className="text-sm font-semibold text-gray-900">账号验证</div>
          <div className="text-xs text-gray-500">用于安全登录与身份识别</div>
        </div>
      </div>

      {wallets.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-gray-500">最近账号</div>
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
          {busy ? "登录中..." : "登录已有账号"}
        </button>
        <button
          onClick={create}
          disabled={busy}
          className="lc-tab-btn"
          style={{ padding: "10px 12px" }}
        >
          {busy ? "创建中..." : "创建新账号"}
        </button>
        <button
          onClick={recover}
          disabled={busy}
          className="lc-tab-btn"
          style={{ padding: "10px 12px", backgroundColor: "#f3f4f6", color: "#111827" }}
        >
          {busy ? "找回中..." : "找回已有账号"}
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
          <div className="auth-overlay-box">账号验证进行中，请完成系统弹窗…</div>
        </div>
      )}
    </div>
  );
}
