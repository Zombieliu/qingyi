"use client";

import { useState, useCallback } from "react";
import { useAutoToast } from "@/app/components/use-auto-toast";
import {
  type ChainOrder,
  fetchChainOrders,
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
} from "@/lib/chain/qy-chain";
import { classifyChainError } from "@/lib/chain/chain-error";

/**
 * Encapsulates chain-related state for the schedule page.
 * Reduces useState count in the parent component.
 */
export function useChainState() {
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useAutoToast(3000);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");
  const [chainUpdatedAt, setChainUpdatedAt] = useState<number | null>(null);
  const [chainSyncRetries, setChainSyncRetries] = useState<number | null>(null);
  const [chainSyncLastAttemptAt, setChainSyncLastAttemptAt] = useState<number | null>(null);
  const [chainSyncing, setChainSyncing] = useState(false);

  const loadChain = useCallback(async () => {
    if (!isChainOrdersEnabled()) return;
    const visualTest = isVisualTestMode();
    try {
      if (!visualTest) setChainLoading(true);
      setChainError(null);
      setChainAddress(getCurrentAddress());
      const list = await fetchChainOrders();
      setChainOrders(list);
      setChainUpdatedAt(Date.now());
    } catch (e) {
      setChainError(classifyChainError(e).message);
    } finally {
      if (!visualTest) setChainLoading(false);
    }
  }, []);

  return {
    chainOrders,
    setChainOrders,
    chainLoading,
    chainError,
    setChainError,
    chainToast,
    setChainToast,
    chainAction,
    setChainAction,
    chainAddress,
    setChainAddress,
    chainUpdatedAt,
    setChainUpdatedAt,
    chainSyncRetries,
    setChainSyncRetries,
    chainSyncLastAttemptAt,
    setChainSyncLastAttemptAt,
    chainSyncing,
    setChainSyncing,
    loadChain,
  };
}
