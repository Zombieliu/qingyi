"use client";
import { t } from "@/lib/i18n/t";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type LocalOrder } from "@/lib/services/order-store";
import { fetchOrdersWithMeta, patchOrder } from "@/lib/services/order-service";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { DIAMOND_RATE } from "@/lib/shared/constants";
import { getLocalChainStatus, mergeChainStatus } from "@/lib/chain/chain-status";
import { useBackoffPoll } from "@/app/components/use-backoff-poll";
import { useOrderEvents } from "@/app/components/use-order-events";
import { useAutoToast } from "@/app/components/use-auto-toast";
import { useChainState } from "./use-chain-state";
import { getCurrentAddress, isChainOrdersEnabled } from "@/lib/chain/qy-chain";
import { resolveDisputePolicy } from "@/lib/risk-policy";
import { formatErrorMessage } from "@/lib/shared/error-utils";
import {
  type Mode,
  type PublicPlayer,
  PLAYER_SECTION_TITLE,
  MATCH_RATE,
  readDiscountUsage,
  deriveMode,
} from "./schedule-data";

export function useScheduleOrders() {
  const [toast, setToast] = useAutoToast(3000);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [mode, setMode] = useState<Mode>("select");
  const [diamondBalance, setDiamondBalance] = useState<string>("0");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceReady, setBalanceReady] = useState(false);
  const [vipTier, setVipTier] = useState<{ level?: number; name?: string } | null>(null);
  const [vipLoading, setVipLoading] = useState(false);
  const [firstOrderEligible, setFirstOrderEligible] = useState(false);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [userAddress, setUserAddress] = useState(() => getCurrentAddress());
  const cacheTtlMs = 60_000;
  const searchParams = useSearchParams();
  const requestedPlayerId = searchParams?.get("playerId")?.trim() || "";
  const requestedPlayerName = searchParams?.get("playerName")?.trim() || "";
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [prefillHint, setPrefillHint] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [active, setActive] = useState(t("schedule.001"));

  const chainState = useChainState();
  const { chainOrders, chainAddress, loadChain } = chainState;

  // ─── Data fetching hooks ───

  const refreshOrders = useCallback(
    async (addrOverride?: string, force = true) => {
      const result = await fetchOrdersWithMeta({ force });
      const list = result.items;
      const addr = addrOverride ?? userAddress ?? getCurrentAddress();
      const filtered = list.filter((order) => {
        if (!addr) return true;
        if (!order.userAddress) return false;
        return order.userAddress === addr;
      });
      setOrders(filtered);
      setMode(deriveMode(filtered));
      return !result.meta.error;
    },
    [userAddress]
  );

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const sync = () => {
      const addr = getCurrentAddress();
      setUserAddress(addr);
      refreshOrders(addr);
    };
    sync();
    window.addEventListener("passkey-updated", sync);
    return () => window.removeEventListener("passkey-updated", sync);
  }, [refreshOrders]);

  const { connected: sseConnected } = useOrderEvents({
    address: userAddress || "",
    enabled: Boolean(userAddress),
    onEvent: () => {
      refreshOrders(userAddress || getCurrentAddress(), true);
    },
  });

  // When in any active order mode, poll faster to pick up state changes promptly
  const isWaiting = mode !== "select";
  useBackoffPoll({
    enabled: !sseConnected,
    baseMs: isWaiting ? 8_000 : 60_000,
    maxMs: isWaiting ? 30_000 : 180_000,
    onPoll: async () => refreshOrders(userAddress || getCurrentAddress(), true),
  });

  useEffect(() => {
    const addr = userAddress || getCurrentAddress();
    const used = readDiscountUsage(addr);
    const eligibleList = addr ? orders.filter((order) => order.userAddress === addr) : orders;
    setFirstOrderEligible(!used && eligibleList.length === 0);
  }, [orders, userAddress]);

  const refreshVip = useCallback(async () => {
    const addr = getCurrentAddress();
    if (!addr) {
      setVipTier(null);
      return;
    }
    const vipCacheKey = `cache:vip:status:${addr}`;
    const cachedVip = readCache<{ tier?: { level?: number; name?: string } }>(
      vipCacheKey,
      cacheTtlMs,
      true
    );
    if (cachedVip?.value?.tier) {
      setVipTier({ level: cachedVip.value.tier.level, name: cachedVip.value.tier.name });
    }
    setVipLoading(true);
    try {
      const res = await fetchWithUserAuth(`/api/vip/status?userAddress=${addr}`, {}, addr, {
        silent: true,
      });
      const data = await res.json();
      if (data?.tier) {
        setVipTier({ level: data.tier.level, name: data.tier.name });
        writeCache(vipCacheKey, { tier: data.tier });
      } else {
        setVipTier(null);
        writeCache(vipCacheKey, { tier: null });
      }
    } catch {
      /* ignore */
    } finally {
      setVipLoading(false);
    }
  }, [cacheTtlMs]);

  useEffect(() => {
    refreshVip();
    const handle = () => {
      void refreshVip();
    };
    window.addEventListener("passkey-updated", handle);
    return () => window.removeEventListener("passkey-updated", handle);
  }, [refreshVip]);

  useEffect(() => {
    if (isChainOrdersEnabled()) loadChain();
  }, [loadChain]);

  const loadPlayers = async () => {
    setPlayersLoading(true);
    setPlayersError(null);
    const cacheKey = "cache:players:public";
    const cached = readCache<PublicPlayer[]>(cacheKey, cacheTtlMs, true);
    if (cached) setPlayers(Array.isArray(cached.value) ? cached.value : []);
    try {
      const res = await fetch("/api/players");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      const next = Array.isArray(data) ? data : [];
      setPlayers(next);
      writeCache(cacheKey, next);
    } catch (e) {
      setPlayersError(formatErrorMessage(e, t("schedule.003")));
    } finally {
      setPlayersLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    if (!requestedPlayerId || prefillApplied) return;
    if (playersLoading) return;
    if (players.length === 0) return;
    const match = players.find((player) => player.id === requestedPlayerId);
    if (match) {
      setSelectedPlayerId(match.id);
      setActive(PLAYER_SECTION_TITLE);
      setTimeout(() => {
        sectionRefs.current[PLAYER_SECTION_TITLE]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      setPrefillHint(null);
    } else {
      setPrefillHint(
        requestedPlayerName
          ? `指定陪练「${requestedPlayerName}」当前不可接，已切换为系统匹配`
          : t("tabs.schedule.i108")
      );
    }
    setPrefillApplied(true);
  }, [players, playersLoading, prefillApplied, requestedPlayerId, requestedPlayerName]);

  // ─── Derived state ───

  const currentOrder = useMemo(() => {
    return (
      orders.find(
        (o) =>
          !o.status.includes(t("tabs.schedule.i110")) && !o.status.includes(t("tabs.schedule.i111"))
      ) || null
    );
  }, [orders]);

  const chainCurrentOrder = useMemo(() => {
    const addr = chainAddress;
    const list = addr ? chainOrders.filter((o) => o.user === addr) : chainOrders;
    const activeList = list.filter((o) => o.status !== 6);
    return activeList.length > 0 ? activeList[0] : null;
  }, [chainOrders, chainAddress]);

  const localChainStatus = useMemo(() => getLocalChainStatus(currentOrder), [currentOrder]);
  const chainCurrentStatus = useMemo(() => {
    if (currentOrder && chainCurrentOrder && chainCurrentOrder.orderId !== currentOrder.id)
      return localChainStatus;
    return mergeChainStatus(localChainStatus, chainCurrentOrder?.status);
  }, [localChainStatus, chainCurrentOrder, currentOrder]);

  const chainCurrentDisplay = useMemo(() => {
    if (!chainCurrentOrder) return null;
    if (currentOrder && chainCurrentOrder.orderId === currentOrder.id) {
      const meta = (currentOrder.meta || {}) as { chain?: { disputeDeadline?: number | string } };
      const rawDeadline = meta.chain?.disputeDeadline;
      const localDeadline =
        typeof rawDeadline === "string" ? Number(rawDeadline) : Number(rawDeadline ?? 0);
      const mergedDeadline =
        Number.isFinite(localDeadline) && localDeadline > 0
          ? String(localDeadline)
          : chainCurrentOrder.disputeDeadline;
      if (typeof chainCurrentStatus === "number") {
        return {
          ...chainCurrentOrder,
          status: chainCurrentStatus,
          disputeDeadline: mergedDeadline,
        };
      }
      return { ...chainCurrentOrder, disputeDeadline: mergedDeadline };
    }
    return chainCurrentOrder;
  }, [chainCurrentOrder, currentOrder, chainCurrentStatus]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) || null,
    [players, selectedPlayerId]
  );

  const playerDue = useMemo(() => {
    if (!currentOrder) return 0;
    if (typeof currentOrder.playerDue === "number") return currentOrder.playerDue;
    const fee = currentOrder.serviceFee ?? Number((currentOrder.amount * MATCH_RATE).toFixed(2));
    return Math.max(Number((currentOrder.amount - fee).toFixed(2)), 0);
  }, [currentOrder]);

  const escrowFeeDisplay = currentOrder ? currentOrder.amount : 0;
  const isChainLocalOrder = (order?: LocalOrder | null) => {
    if (!order) return false;
    const meta = (order.meta || {}) as { chain?: { status?: number } };
    return (
      Boolean(order.chainDigest) ||
      order.chainStatus !== undefined ||
      meta.chain?.status !== undefined
    );
  };

  const chainStatusHint = useMemo(() => {
    if (!isChainOrdersEnabled()) return null;
    if (!currentOrder) return null;
    if (!currentOrder.chainDigest && currentOrder.chainStatus === undefined) return null;
    return `链上状态：${currentOrder.status}`;
  }, [currentOrder]);

  const diamondRate = DIAMOND_RATE;
  const disputePolicy = useMemo(() => resolveDisputePolicy(vipTier?.level), [vipTier]);

  const refreshBalance = useCallback(async () => {
    const addr = getCurrentAddress();
    if (!addr) return;
    const cacheKey = `cache:diamond-balance:${addr}`;
    const cached = readCache<string>(cacheKey, cacheTtlMs, true);
    if (cached) setDiamondBalance(cached.value);
    setBalanceLoading(true);
    setBalanceReady(false);
    try {
      const res = await fetch(`/api/ledger/balance?address=${addr}`);
      const data = await res.json();
      if (data?.balance !== undefined) {
        const next = String(data.balance);
        setDiamondBalance(next);
        writeCache(cacheKey, next);
        setBalanceReady(true);
      }
    } catch {
      /* ignore */
    } finally {
      setBalanceLoading(false);
    }
  }, [cacheTtlMs]);

  // ─── Chain order sync effect ───

  useEffect(() => {
    if (!chainCurrentOrder) return;
    if (!currentOrder || currentOrder.id !== chainCurrentOrder.orderId) return;
    const effectiveStatus = chainCurrentStatus ?? chainCurrentOrder.status;
    const patch: Partial<LocalOrder> = {};
    if (effectiveStatus >= 1) patch.serviceFeePaid = true;
    if (effectiveStatus >= 2) patch.depositPaid = true;
    if (Object.keys(patch).length > 0) {
      patchOrder(currentOrder.id, { ...patch, userAddress: getCurrentAddress() })
        .then(() => refreshOrders())
        .catch(() => {});
    }
  }, [chainCurrentOrder, chainCurrentStatus, currentOrder, refreshOrders]);

  return {
    toast,
    setToast,
    orders,
    mode,
    setMode,
    diamondBalance,
    balanceLoading,
    balanceReady,
    vipTier,
    vipLoading,
    firstOrderEligible,
    players,
    playersLoading,
    playersError,
    selectedPlayerId,
    setSelectedPlayerId,
    userAddress,
    prefillHint,
    setPrefillHint,
    sectionRefs,
    active,
    setActive,
    chainState,
    currentOrder,
    chainCurrentOrder,
    localChainStatus,
    chainCurrentStatus,
    chainCurrentDisplay,
    selectedPlayer,
    playerDue,
    escrowFeeDisplay,
    isChainLocalOrder,
    chainStatusHint,
    diamondRate,
    disputePolicy,
    refreshBalance,
    refreshVip,
    refreshOrders,
    loadPlayers,
    loadChain,
  };
}
