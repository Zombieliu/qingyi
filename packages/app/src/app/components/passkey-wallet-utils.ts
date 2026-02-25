import { t } from "@/lib/i18n/t";
import {
  BrowserPasskeyProvider,
  type BrowserPasswordProviderOptions,
  type PasskeyProvider,
} from "@mysten/sui/keypairs/passkey";

export const PASSKEY_STORAGE_KEY = "qy_passkey_wallet_v3";
export const PASSKEY_WALLETS_KEY = "qy_passkey_wallets_v1";
export const RP_NAME = t("components.passkey_wallet.i164");

export type StoredWallet = {
  address: string;
  publicKey: string; // base64
  label?: string;
  createdAt?: number;
  lastUsedAt?: number;
};

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)));

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

export function isMissingCredential(error: unknown) {
  const err = error as Error & { name?: string };
  const msg = err.message || "";
  return (
    err.name === "NotFoundError" ||
    msg.includes("No passkeys found") ||
    msg.includes("not found") ||
    msg.includes("No credentials")
  );
}
