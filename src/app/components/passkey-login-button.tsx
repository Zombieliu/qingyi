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
    setHasWallet(!!localStorage.getItem(PASSKEY_STORAGE_KEY));
  }, []);

  const persist = (stored: StoredWallet, msg: string) => {
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event("passkey-updated"));
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
    router.push("/home");
  };

  const handle = async () => {
    try {
      setLoading(true);
      setToast(null);
      const provider = new BrowserPasskeyProvider("情谊电竞", providerOpts);

      if (hasWallet) {
        const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
        if (!raw) throw new Error("本地未找到 Passkey");
        const stored = JSON.parse(raw) as StoredWallet;
        const keypair = new PasskeyKeypair(fromBase64(stored.publicKey), provider);
        await keypair.signPersonalMessage(new TextEncoder().encode("login-check"));
        persist(stored, "已登录");
        return;
      }

      const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
      const publicKey = keypair.getPublicKey();
      const address = publicKey.toSuiAddress();
      persist({ address, publicKey: toBase64(publicKey.toRawBytes()) }, "Passkey 已创建并登录");
      setHasWallet(true);
    } catch (e) {
      setToast((e as Error).message || "Passkey 登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: 12 }}>
      <button className="login-btn" onClick={handle} disabled={loading}>
        {loading ? "处理中..." : hasWallet ? "使用 Passkey 一键登录" : "用 Passkey 注册并登录"}
      </button>
      {toast && <div className="mt-2 text-sm text-emerald-600">{toast}</div>}
    </div>
  );
}
