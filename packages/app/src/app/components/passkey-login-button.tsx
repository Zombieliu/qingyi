"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PasskeyKeypair,
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
} from "@mysten/sui/keypairs/passkey";
import { PASSKEY_STORAGE_KEY } from "./passkey-wallet";

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
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [overlay, setOverlay] = useState(false);

  const providerOpts = useMemo<BrowserPasswordProviderOptions>(
    () => ({
      rpName: "情谊电竞",
      rpId: typeof window !== "undefined" ? window.location.hostname : undefined,
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "preferred" },
    }),
    []
  );

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

  const persist = (stored: StoredWallet, msg: string) => {
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event("passkey-updated"));
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
    router.push("/home");
  };

  const createPasskey = async () => {
    const keypair = await PasskeyKeypair.getPasskeyInstance(new BrowserPasskeyProvider("情谊电竞", providerOpts));
    const publicKey = keypair.getPublicKey();
    const address = publicKey.toSuiAddress();
    persist({ address, publicKey: toBase64(publicKey.toRawBytes()) }, "账号已创建并登录");
    setHasWallet(true);
  };

  const handle = async () => {
    try {
      setLoading(true);
      setOverlay(true);
      setToast(null);
      const provider = new BrowserPasskeyProvider("情谊电竞", providerOpts);

      if (hasWallet) {
        const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
        if (!raw) throw new Error("本地未找到账号信息");
        const stored = JSON.parse(raw) as StoredWallet;
        try {
          const keypair = new PasskeyKeypair(fromBase64(stored.publicKey), provider);
          await keypair.signPersonalMessage(new TextEncoder().encode("login-check"));
          persist(stored, "已登录");
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
            localStorage.removeItem(PASSKEY_STORAGE_KEY);
            setHasWallet(false);
            await createPasskey();
            return;
          }
          throw e;
        }
      }

      await createPasskey();
    } catch (e) {
      setToast((e as Error).message || "登录失败");
    } finally {
      setLoading(false);
      setOverlay(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: 12 }}>
      <button className="login-btn" onClick={handle} disabled={loading}>
        {loading ? "处理中..." : hasWallet ? "一键登录" : "一键注册并登录"}
      </button>
      {toast && <div className="mt-2 text-sm text-emerald-600">{toast}</div>}
      {overlay && (
        <div className="auth-overlay">
          <div className="auth-overlay-box">验证中，请在系统弹窗中完成操作…</div>
        </div>
      )}
    </div>
  );
}
