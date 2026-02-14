"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getCurrentAddress } from "@/lib/qy-chain";
import { PASSKEY_STORAGE_KEY } from "./passkey-wallet";
import { readCache, writeCache } from "./client-cache";

type BalanceContextValue = {
  balance: string;
  loading: boolean;
  refresh: (options?: { force?: boolean }) => Promise<string | null>;
};

const BalanceContext = createContext<BalanceContextValue>({
  balance: "0",
  loading: false,
  refresh: async () => null,
});

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  const cacheTtlMs = 60_000;
  const minIntervalMs = 10_000;
  const inflightRef = useRef<Promise<string | null> | null>(null);
  const lastFetchAtRef = useRef(0);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (isAdminRoute) return null;
    const force = options?.force ?? false;
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
    const now = Date.now();
    const cacheFresh = cached?.fresh ?? false;
    const tooSoon = now - lastFetchAtRef.current < minIntervalMs;
    if (!force && (cacheFresh || tooSoon)) {
      return cached?.value ?? null;
    }
    if (inflightRef.current) {
      return inflightRef.current;
    }
    setLoading(true);
    try {
      const task = (async () => {
        const res = await fetch(`/api/ledger/balance?address=${address}`);
        const data = await res.json();
        if (data?.balance !== undefined) {
          const next = String(data.balance);
          setBalance(next);
          writeCache(cacheKey, next);
          return next;
        }
        return null;
      })();
      inflightRef.current = task;
      return await task;
    } catch {
      if (cached) return cached.value;
      return null;
    } finally {
      inflightRef.current = null;
      lastFetchAtRef.current = Date.now();
      setLoading(false);
    }
  }, [cacheTtlMs, isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) return;
    refresh();
    const handlePasskey = () => {
      refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PASSKEY_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("passkey-updated", handlePasskey);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("passkey-updated", handlePasskey);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, isAdminRoute]);

  const value = useMemo(() => ({ balance, loading, refresh }), [balance, loading, refresh]);

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance() {
  return useContext(BalanceContext);
}
