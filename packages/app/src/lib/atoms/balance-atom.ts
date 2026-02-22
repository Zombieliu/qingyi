"use client";

import { atom, useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { readCache, writeCache } from "@/lib/shared/client-cache";

type BalanceState = { balance: string; loading: boolean };

export const balanceAtom = atom<BalanceState>({ balance: "0", loading: false });

const CACHE_TTL_MS = 60_000;
const MIN_INTERVAL_MS = 10_000;
let lastFetchAt = 0;
let inflight: Promise<string | null> | null = null;

export const balanceRefreshAtom = atom(null, async (get, set, force: boolean = false) => {
  const address = getCurrentAddress();
  if (!address) {
    set(balanceAtom, { balance: "0", loading: false });
    return null;
  }
  const cacheKey = `cache:balance:${address}`;
  const cached = readCache<string>(cacheKey, CACHE_TTL_MS, true);
  if (cached) {
    set(balanceAtom, (prev) => ({ ...prev, balance: cached.value }));
  }
  const now = Date.now();
  const cacheFresh = cached?.fresh ?? false;
  const tooSoon = now - lastFetchAt < MIN_INTERVAL_MS;
  if (!force && (cacheFresh || tooSoon)) {
    return cached?.value ?? null;
  }
  if (inflight) return inflight;
  set(balanceAtom, (prev) => ({ ...prev, loading: true }));
  try {
    const task = (async () => {
      const res = await fetch(`/api/ledger/balance?address=${address}`);
      const data = await res.json();
      if (data?.balance !== undefined) {
        const next = String(data.balance);
        set(balanceAtom, { balance: next, loading: false });
        writeCache(cacheKey, next);
        return next;
      }
      return null;
    })();
    inflight = task;
    return await task;
  } catch {
    if (cached) return cached.value;
    return null;
  } finally {
    inflight = null;
    lastFetchAt = Date.now();
    set(balanceAtom, (prev) => ({ ...prev, loading: false }));
  }
});

export function useBalance() {
  const [state] = useAtom(balanceAtom);
  const dispatch = useSetAtom(balanceRefreshAtom);
  const refresh = useCallback(
    (options?: { force?: boolean }) => dispatch(options?.force ?? false),
    [dispatch]
  );
  return { balance: state.balance, loading: state.loading, refresh };
}
