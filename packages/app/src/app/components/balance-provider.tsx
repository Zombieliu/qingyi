"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/qy-chain";
import { readCache, writeCache } from "./client-cache";

type BalanceContextValue = {
  balance: string;
  loading: boolean;
  refresh: () => Promise<string | null>;
};

const BalanceContext = createContext<BalanceContextValue>({
  balance: "0",
  loading: false,
  refresh: async () => null,
});

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  const cacheTtlMs = 60_000;

  const refresh = useCallback(async () => {
    const address = getCurrentAddress();
    if (!address) {
      setBalance("0");
      return null;
    }
    const cacheKey = `cache:balance:${address}`;
    const cached = readCache<string>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setBalance(cached.value);
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/ledger/balance?address=${address}`);
      const data = await res.json();
      if (data?.balance !== undefined) {
        const next = String(data.balance);
        setBalance(next);
        writeCache(cacheKey, next);
        return next;
      }
      return null;
    } catch {
      if (cached) return cached.value;
      return null;
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs]);

  useEffect(() => {
    refresh();
    const handler = () => {
      refresh();
    };
    window.addEventListener("passkey-updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("passkey-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  const value = useMemo(() => ({ balance, loading, refresh }), [balance, loading, refresh]);

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance() {
  return useContext(BalanceContext);
}
