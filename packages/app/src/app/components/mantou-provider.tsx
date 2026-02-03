"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/qy-chain";

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
  const [balance, setBalance] = useState("0");
  const [frozen, setFrozen] = useState("0");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const address = getCurrentAddress();
    if (!address) {
      setBalance("0");
      setFrozen("0");
      return null;
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
        return { balance: nextBalance, frozen: nextFrozen };
      }
      return null;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

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

  const value = useMemo(
    () => ({ balance, frozen, loading, refresh }),
    [balance, frozen, loading, refresh]
  );

  return <MantouContext.Provider value={value}>{children}</MantouContext.Provider>;
}

export function useMantouBalance() {
  return useContext(MantouContext);
}
