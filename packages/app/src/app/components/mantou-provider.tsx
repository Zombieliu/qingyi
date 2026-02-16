"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getCurrentAddress } from "@/lib/qy-chain";
import { PASSKEY_STORAGE_KEY } from "./passkey-wallet";
import { readCache, writeCache } from "./client-cache";
import { fetchWithUserAuth } from "./user-auth-client";

type MantouContextValue = {
  balance: string;
  frozen: string;
  loading: boolean;
  refresh: (options?: { force?: boolean }) => Promise<{ balance: string; frozen: string } | null>;
};

const MantouContext = createContext<MantouContextValue>({
  balance: "0",
  frozen: "0",
  loading: false,
  refresh: async () => null,
});

export function MantouProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const [balance, setBalance] = useState("0");
  const [frozen, setFrozen] = useState("0");
  const [loading, setLoading] = useState(false);
  const cacheTtlMs = 60_000;
  const minIntervalMs = 10_000;
  const inflightRef = useRef<Promise<{ balance: string; frozen: string } | null> | null>(null);
  const lastFetchAtRef = useRef(0);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (isAdminRoute) return null;
    const force = options?.force ?? false;
    const address = getCurrentAddress();
    if (!address) {
      setBalance("0");
      setFrozen("0");
      return null;
    }
    const cacheKey = `cache:mantou:${address}`;
    const cached = readCache<{ balance: string; frozen: string }>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setBalance(cached.value.balance);
      setFrozen(cached.value.frozen);
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
        const res = await fetchWithUserAuth(`/api/mantou/balance?address=${address}`, {}, address);
        const data = await res.json();
        if (data?.balance !== undefined) {
          const nextBalance = String(data.balance ?? "0");
          const nextFrozen = String(data.frozen ?? "0");
          setBalance(nextBalance);
          setFrozen(nextFrozen);
          writeCache(cacheKey, { balance: nextBalance, frozen: nextFrozen });
          return { balance: nextBalance, frozen: nextFrozen };
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

  const value = useMemo(
    () => ({ balance, frozen, loading, refresh }),
    [balance, frozen, loading, refresh]
  );

  return <MantouContext.Provider value={value}>{children}</MantouContext.Provider>;
}

export function useMantouBalance() {
  return useContext(MantouContext);
}
