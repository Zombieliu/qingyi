"use client";

import { atom, useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";

type MantouState = { balance: string; frozen: string; loading: boolean };

export const mantouAtom = atom<MantouState>({ balance: "0", frozen: "0", loading: false });

const CACHE_TTL_MS = 60_000;
const MIN_INTERVAL_MS = 10_000;
let lastFetchAt = 0;
let inflight: Promise<{ balance: string; frozen: string } | null> | null = null;

export const mantouRefreshAtom = atom(null, async (get, set, force: boolean = false) => {
  const address = getCurrentAddress();
  if (!address) {
    set(mantouAtom, { balance: "0", frozen: "0", loading: false });
    return null;
  }
  const cacheKey = `cache:mantou:${address}`;
  const cached = readCache<{ balance: string; frozen: string }>(cacheKey, CACHE_TTL_MS, true);
  if (cached) {
    set(mantouAtom, (prev) => ({
      ...prev,
      balance: cached.value.balance,
      frozen: cached.value.frozen,
    }));
  }
  const now = Date.now();
  const cacheFresh = cached?.fresh ?? false;
  const tooSoon = now - lastFetchAt < MIN_INTERVAL_MS;
  if (!force && (cacheFresh || tooSoon)) {
    return cached?.value ?? null;
  }
  if (inflight) return inflight;
  set(mantouAtom, (prev) => ({ ...prev, loading: true }));
  try {
    const task = (async () => {
      const res = await fetchWithUserAuth(`/api/mantou/balance?address=${address}`, {}, address);
      const data = await res.json();
      if (data?.balance !== undefined) {
        const nextBalance = String(data.balance ?? "0");
        const nextFrozen = String(data.frozen ?? "0");
        set(mantouAtom, { balance: nextBalance, frozen: nextFrozen, loading: false });
        writeCache(cacheKey, { balance: nextBalance, frozen: nextFrozen });
        return { balance: nextBalance, frozen: nextFrozen };
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
    set(mantouAtom, (prev) => ({ ...prev, loading: false }));
  }
});

export function useMantouBalance() {
  const [state] = useAtom(mantouAtom);
  const dispatch = useSetAtom(mantouRefreshAtom);
  const refresh = useCallback(
    (options?: { force?: boolean }) => dispatch(options?.force ?? false),
    [dispatch]
  );
  return { balance: state.balance, frozen: state.frozen, loading: state.loading, refresh };
}
