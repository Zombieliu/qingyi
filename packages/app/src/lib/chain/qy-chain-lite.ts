/**
 * Lightweight chain utilities that do NOT import @mysten/sui SDK.
 *
 * Use this module for getCurrentAddress, isChainOrdersEnabled, etc.
 * in components that don't need heavy chain operations.
 * This avoids pulling the 848KB SUI SDK into every page bundle.
 */
"use client";

/** Passkey wallet localStorage key (duplicated to avoid importing passkey-wallet.tsx which pulls SUI SDK) */
export const PASSKEY_STORAGE_KEY = "qy_passkey_wallet_v3";

const CHAIN_ORDERS_FLAG = process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1";
const VISUAL_TEST_FLAG = process.env.NEXT_PUBLIC_VISUAL_TEST === "1";

type StoredWallet = {
  address: string;
  publicKey: string;
};

export function isVisualTestMode(): boolean {
  if (VISUAL_TEST_FLAG) return true;
  if (typeof window === "undefined") return false;
  const flags = window as { __PW_VISUAL_TEST__?: boolean; __VISUAL_TEST__?: boolean };
  return Boolean(flags.__PW_VISUAL_TEST__ || flags.__VISUAL_TEST__);
}

export function getStoredWallet(): StoredWallet {
  if (typeof window === "undefined") {
    throw new Error("仅支持在浏览器端使用 Passkey");
  }
  const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
  if (!raw) {
    throw new Error("未找到 Passkey 钱包，请先登录");
  }
  let parsed: StoredWallet;
  try {
    parsed = JSON.parse(raw) as StoredWallet;
  } catch {
    throw new Error("Passkey 数据损坏，请重新登录");
  }
  if (!parsed.address || !parsed.publicKey) {
    throw new Error("Passkey 数据不完整，请重新登录");
  }
  return parsed;
}

export function getCurrentAddress(): string {
  try {
    return getStoredWallet().address;
  } catch {
    return "";
  }
}

export function isChainOrdersEnabled(): boolean {
  return CHAIN_ORDERS_FLAG || isVisualTestMode();
}

export function createChainOrderId(): string {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 1000);
  return String(now * 1000 + rand);
}

export type { StoredWallet };
