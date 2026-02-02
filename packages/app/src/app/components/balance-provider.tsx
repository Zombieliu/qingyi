"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/qy-chain";

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

  const refresh = useCallback(async () => {
    const address = getCurrentAddress();
    if (!address) {
      setBalance("0");
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/ledger/balance?address=${address}`);
      const data = await res.json();
      if (data?.balance !== undefined) {
        const next = String(data.balance);
        setBalance(next);
        return next;
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

  const value = useMemo(() => ({ balance, loading, refresh }), [balance, loading, refresh]);

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance() {
  return useContext(BalanceContext);
}
