"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getCurrentAddress } from "@/lib/qy-chain";
import { readCache, writeCache } from "./client-cache";

type MantouContextValue = {
  balance: string;
  frozen: string;
  loading: boolean;
  refresh: () => Promise<{ balance: string; frozen: string } | null>;
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

  const refresh = useCallback(async () => {
    if (isAdminRoute) return null;
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
    setLoading(true);
    try {
      const res = await fetch(`/api/mantou/balance?address=${address}`);
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
    } catch {
      if (cached) return cached.value;
      return null;
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) return;
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
