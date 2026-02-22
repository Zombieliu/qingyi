"use client";
import { t } from "@/lib/i18n/i18n-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock3, QrCode } from "lucide-react";
import { type LocalOrder } from "@/lib/services/order-store";
import {
  createOrder,
  deleteOrder,
  fetchOrdersWithMeta,
  patchOrder,
  syncChainOrder,
} from "@/lib/services/order-service";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { trackEvent } from "@/lib/services/analytics";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { DIAMOND_RATE } from "@/lib/shared/constants";
import { getLocalChainStatus, mergeChainStatus } from "@/lib/chain/chain-status";
import { useBackoffPoll } from "@/app/components/use-backoff-poll";
import { useOrderEvents } from "@/app/components/use-order-events";
import {
  type ChainOrder,
  cancelOrderOnChain,
  createChainOrderId,
  createOrderOnChain,
  fetchChainOrders,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
} from "@/lib/chain/qy-chain";
import { resolveDisputePolicy } from "@/lib/risk-policy";
import { ConfirmDialog, PromptDialog } from "@/app/components/confirm-dialog";
import { extractErrorMessage, formatErrorMessage } from "@/lib/shared/error-utils";
import { classifyChainError } from "@/lib/chain/chain-error";
import {
  type Mode,
  type PublicPlayer,
  sections,
  FIRST_ORDER_DISCOUNT,
  PLAYER_SECTION_TITLE,
  MATCH_RATE,
  readDiscountUsage,
  markDiscountUsage,
  loadGameProfile,
  deriveMode,
  statusLabel,
} from "./schedule-data";
import { NotifyingView } from "./notifying-view";
import { AwaitUserPayView, EnrouteView, PendingSettlementView } from "./order-views";
import { ChainStatusPanel } from "./chain-status-panel";
import { FeeModal } from "./fee-modal";
import { DebugModal } from "./debug-modal";
import { PlayerList } from "./player-list";

export default function Schedule() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => ({}));
  const [active, setActive] = useState(t("schedule.001"));
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [mode, setMode] = useState<Mode>("select");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeChecked, setFeeChecked] = useState(false);
  const [diamondBalance, setDiamondBalance] = useState<string>("0");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceReady, setBalanceReady] = useState(false);
  const [vipTier, setVipTier] = useState<{ level?: number; name?: string } | null>(null);
  const [vipLoading, setVipLoading] = useState(false);
  const [firstOrderEligible, setFirstOrderEligible] = useState(false);
  const [locked, setLocked] = useState<{
    total: number;
    originalTotal: number;
    discount: number;
    service: number;
    player: number;
    items: string[];
  }>({ total: 0, originalTotal: 0, discount: 0, service: 0, player: 0, items: [] });
  const [calling, setCalling] = useState(false);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");
  const [chainUpdatedAt, setChainUpdatedAt] = useState<number | null>(null);
  const [chainSyncRetries, setChainSyncRetries] = useState<number | null>(null);
  const [chainSyncLastAttemptAt, setChainSyncLastAttemptAt] = useState<number | null>(null);
  const [chainSyncing, setChainSyncing] = useState(false);
  const redirectRef = useRef(false);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description?: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [promptAction, setPromptAction] = useState<{
    title: string;
    description?: string;
    placeholder?: string;
    confirmLabel?: string;
    action: (value: string) => Promise<void>;
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  const [userAddress, setUserAddress] = useState(() => getCurrentAddress());
  const cacheTtlMs = 60_000;
  const searchParams = useSearchParams();
  const requestedPlayerId = searchParams?.get("playerId")?.trim() || "";
  const requestedPlayerName = searchParams?.get("playerName")?.trim() || "";
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [prefillHint, setPrefillHint] = useState<string | null>(null);

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

  useBackoffPoll({
    enabled: true,
    baseMs: 60_000,
    maxMs: 180_000,
    onPoll: async () => refreshOrders(userAddress || getCurrentAddress(), true),
  });

  useOrderEvents({
    address: userAddress || "",
    enabled: Boolean(userAddress),
    onEvent: () => {
      refreshOrders(userAddress || getCurrentAddress(), true);
    },
  });

  useEffect(() => {
    const addr = userAddress || getCurrentAddress();
    const used = readDiscountUsage(addr);
    const eligibleList = addr ? orders.filter((order) => order.userAddress === addr) : orders;
    setFirstOrderEligible(!used && eligibleList.length === 0);
  }, [orders, userAddress]);

  const refreshVip = async () => {
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
      const res = await fetchWithUserAuth(`/api/vip/status?userAddress=${addr}`, {}, addr);
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
  };

  useEffect(() => {
    refreshVip();
    const handle = () => refreshVip();
    window.addEventListener("passkey-updated", handle);
    return () => window.removeEventListener("passkey-updated", handle);
  }, []);

  // ─── Chain order logic ───

  const fetchOrSyncChainOrder = async (orderId: string) => {
    const digest = (() => {
      const order = currentOrder;
      if (!order || order.id !== orderId) return undefined;
      const meta = (order.meta || {}) as { chainDigest?: string; lastChainDigest?: string };
      return order.chainDigest || meta.lastChainDigest || meta.chainDigest || undefined;
    })();
    let list = await fetchChainOrders();
    let found = list.find((order) => order.orderId === orderId) || null;
    if (found) {
      setChainOrders(list);
      return found;
    }
    try {
      const synced = await syncChainOrder(orderId, chainAddress || undefined, digest);
      list = await fetchChainOrders();
      setChainOrders(list);
      found = list.find((order) => order.orderId === orderId) || null;
      if (found) return found;
      if (synced?.order && typeof synced.chainStatus === "number") {
        const serviceFeeCny =
          typeof synced.order.serviceFee === "number" ? synced.order.serviceFee : 0;
        const depositCny = typeof synced.order.deposit === "number" ? synced.order.deposit : 0;
        return {
          orderId,
          user: synced.order.userAddress || "0x0",
          companion: synced.order.companionAddress || "0x0",
          ruleSetId: String(
            (synced.order.meta as { chain?: { ruleSetId?: string | number } } | undefined)?.chain
              ?.ruleSetId ?? "0"
          ),
          serviceFee: String(Math.round(serviceFeeCny * 100)),
          deposit: String(Math.round(depositCny * 100)),
          platformFeeBps: "0",
          status: synced.chainStatus,
          createdAt: String(synced.order.createdAt || Date.now()),
          finishAt: "0",
          disputeDeadline: String(
            (synced.order.meta as { chain?: { disputeDeadline?: string | number } } | undefined)
              ?.chain?.disputeDeadline ?? "0"
          ),
          vaultService: "0",
          vaultDeposit: "0",
          evidenceHash: "0x",
          disputeStatus: 0,
          resolvedBy: "0x0",
          resolvedAt: "0",
        } as ChainOrder;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      list = await fetchChainOrders();
      setChainOrders(list);
      found = list.find((order) => order.orderId === orderId) || null;
      if (found) return found;
    } catch (error) {
      const errorMsg = formatErrorMessage(error, t("schedule.002"));
      if (errorMsg.includes("not found") || errorMsg.includes("未找到")) {
        throw new Error("链上订单暂未索引完成，请稍后再试（通常需要等待3-10秒）");
      }
      throw new Error(errorMsg);
    }
    throw new Error("链上订单未找到，可能索引延迟较大，请稍后重试");
  };

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
          : "指定陪练当前不可接，已切换为系统匹配"
      );
    }
    setPrefillApplied(true);
  }, [players, playersLoading, prefillApplied, requestedPlayerId, requestedPlayerName]);

  // ─── Derived state ───

  const toggle = (name: string) => setChecked((p) => ({ ...p, [name]: !p[name] }));
  const pickedNames = Object.entries(checked)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const pickedPrice = sections
    .flatMap((s) => s.items)
    .filter((i) => checked[i.name])
    .reduce((sum, item) => {
      const numeric = parseFloat(item.price.replace(/[^\d.]/g, ""));
      const parsed =
        item.base ??
        (Number.isFinite(numeric)
          ? item.price.includes("钻石")
            ? numeric / DIAMOND_RATE
            : numeric
          : NaN);
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
  const pickedDiamonds = Math.ceil(pickedPrice * DIAMOND_RATE);

  const currentOrder = useMemo(() => {
    return orders.find((o) => !o.status.includes("取消") && !o.status.includes("完成")) || null;
  }, [orders]);

  const chainCurrentOrder = useMemo(() => {
    const addr = chainAddress;
    const list = addr ? chainOrders.filter((o) => o.user === addr) : chainOrders;
    const active = list.filter((o) => o.status !== 6);
    return active.length > 0 ? active[0] : null;
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

  const escrowFeeDisplay = currentOrder ? currentOrder.amount : locked.total;
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
  const requiredDiamonds = Math.ceil(locked.total * diamondRate);
  const hasEnoughDiamonds = Number(diamondBalance) >= requiredDiamonds;
  const disputePolicy = useMemo(() => resolveDisputePolicy(vipTier?.level), [vipTier]);

  // ─── Actions ───

  const cancelOrder = async () => {
    if (!currentOrder) return;
    const isChainOrder = isChainLocalOrder(currentOrder);
    if (isChainOrder) {
      const effectiveStatus =
        chainCurrentOrder && chainCurrentOrder.orderId === currentOrder.id
          ? (chainCurrentStatus ?? chainCurrentOrder.status)
          : chainCurrentOrder?.status;
      if (typeof effectiveStatus === "number" && effectiveStatus >= 2) {
        setToast("order.deposit_locked_no_cancel");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const ok = await runChainAction(
        `cancel-${currentOrder.id}`,
        () => cancelOrderOnChain(currentOrder.id),
        t("ui.schedule.656"),
        currentOrder.id
      );
      if (!ok) return;
      setMode("select");
      return;
    }
    await deleteOrder(currentOrder.id, getCurrentAddress());
    await refreshOrders();
    setMode("select");
  };

  const renderActionLabel = (key: string, label: string) => {
    if (chainAction !== key) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <span className="h-3.5 w-3.5 spin" />
        处理中
      </span>
    );
  };

  const openConfirm = (payload: {
    title: string;
    description?: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  }) => {
    setConfirmAction(payload);
  };

  const openPrompt = (payload: {
    title: string;
    description?: string;
    placeholder?: string;
    confirmLabel?: string;
    action: (value: string) => Promise<void>;
  }) => {
    setPromptValue("");
    setPromptAction(payload);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.action();
    } catch (error) {
      setChainToast(classifyChainError(error).title + "：" + classifyChainError(error).message);
      setTimeout(() => setChainToast(null), 3000);
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
    }
  };

  const runPromptAction = async () => {
    if (!promptAction) return;
    setPromptBusy(true);
    try {
      await promptAction.action(promptValue.trim());
    } catch (error) {
      setChainToast(classifyChainError(error).title + "：" + classifyChainError(error).message);
      setTimeout(() => setChainToast(null), 3000);
    } finally {
      setPromptBusy(false);
      setPromptAction(null);
    }
  };

  const runChainAction = async (
    key: string,
    action: () => Promise<{ digest: string }>,
    success: string,
    syncOrderId?: string
  ) => {
    try {
      setChainAction(key);
      const result = await action();
      const digest = result?.digest;
      const successMsg = digest
        ? `${success}（tx: ${digest.slice(0, 8)}…${digest.slice(-6)}）`
        : success;
      setChainToast(successMsg);
      await loadChain();
      if (syncOrderId) {
        try {
          await syncChainOrder(syncOrderId, getCurrentAddress(), digest);
          await refreshOrders();
        } catch (e) {
          const detail = extractErrorMessage(e);
          setChainToast(`订单已完成，但同步失败${detail ? `：${detail}` : ""}`);
        }
      }
      return true;
    } catch (e) {
      setChainToast(classifyChainError(e).title + "：" + classifyChainError(e).message);
      return false;
    } finally {
      setChainAction(null);
      setTimeout(() => setChainToast(null), 3000);
    }
  };

  useEffect(() => {
    if (!chainCurrentOrder) return;
    if (!currentOrder || currentOrder.id !== chainCurrentOrder.orderId) return;
    const effectiveStatus = chainCurrentStatus ?? chainCurrentOrder.status;
    const patch: Partial<LocalOrder> = {};
    if (effectiveStatus >= 1) patch.serviceFeePaid = true;
    if (effectiveStatus >= 2) patch.depositPaid = true;
    if (Object.keys(patch).length > 0) {
      patchOrder(currentOrder.id, { ...patch, userAddress: getCurrentAddress() });
      refreshOrders();
    }
  }, [chainCurrentOrder, chainCurrentStatus, currentOrder, refreshOrders]);

  const refreshBalance = async () => {
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
  };

  useEffect(() => {
    if (feeOpen) {
      redirectRef.current = false;
      setBalanceReady(false);
      refreshBalance();
      refreshVip();
    }
  }, [feeOpen]);

  useEffect(() => {
    if (!feeOpen) return;
    if (balanceLoading) return;
    if (!balanceReady) return;
    const addr = getCurrentAddress();
    if (!addr) {
      setToast("auth.login_for_diamond");
      return;
    }
    if (!hasEnoughDiamonds && !redirectRef.current) {
      redirectRef.current = true;
      setToast("diamond.insufficient_redirecting");
      setTimeout(() => {
        window.location.href = "/wallet";
      }, 1200);
    }
  }, [feeOpen, balanceLoading, balanceReady, hasEnoughDiamonds]);

  const submit = () => {
    if (pickedNames.length === 0) {
      setToast("form.select_service");
      return;
    }
    const originalTotal = pickedPrice || Math.max(pickedNames.length * 10, 10);
    const canDiscount = firstOrderEligible && originalTotal >= FIRST_ORDER_DISCOUNT.minSpend;
    const discount = canDiscount ? FIRST_ORDER_DISCOUNT.amount : 0;
    const total = Math.max(originalTotal - discount, 0);
    const service = Number((total * MATCH_RATE).toFixed(2));
    const player = Math.max(Number((total - service).toFixed(2)), 0);
    setLocked({ total, originalTotal, discount, service, player, items: pickedNames });
    trackEvent("order_intent", {
      source: "schedule",
      itemsCount: pickedNames.length,
      originalTotal,
      total,
      discount,
      eligible: firstOrderEligible,
    });
    setFeeOpen(true);
    setFeeChecked(false);
  };

  const callOrder = async () => {
    if (!feeChecked) {
      setToast("form.confirm_escrow_fee");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    if (!locked.items.length) {
      setToast("form.service_required");
      return;
    }
    setCalling(true);
    try {
      const requestedNote = selectedPlayer ? `指定陪练：${selectedPlayer.name}` : "";
      let chainOrderId: string | null = null;
      let chainDigest: string | null = null;
      if (isChainOrdersEnabled()) {
        const addr = getCurrentAddress();
        if (!addr) throw new Error("请先登录账号以便扣减钻石");
        if (!hasEnoughDiamonds) throw new Error("钻石余额不足");
        chainOrderId = createChainOrderId();
        const chainResult = await createOrderOnChain({
          orderId: chainOrderId,
          serviceFee: requiredDiamonds,
          deposit: 0,
          ruleSetId: disputePolicy.ruleSetId,
          autoPay: true,
          rawAmount: true,
        });
        chainDigest = chainResult.digest;
      }
      const gameProfile = loadGameProfile(getCurrentAddress());
      const result = await createOrder({
        id: chainOrderId || `${Date.now()}`,
        user: t("ui.schedule.571"),
        userAddress: getCurrentAddress(),
        item: locked.items.join("、"),
        amount: locked.total,
        status: t("ui.schedule.596"),
        time: new Date().toISOString(),
        chainDigest: chainDigest || undefined,
        serviceFee: locked.service,
        serviceFeePaid: true,
        playerDue: locked.player,
        depositPaid: false,
        playerPaid: true,
        note: [
          `来源：安排页呼叫服务。托管费用使用钻石支付(${requiredDiamonds}钻石)`,
          locked.discount > 0 ? `首单优惠减免 ¥${locked.discount}` : "",
          requestedNote,
        ]
          .filter(Boolean)
          .join("；"),
        meta: {
          disputeWindowHours: disputePolicy.hours,
          ruleSetId: disputePolicy.ruleSetId,
          vipTier: vipTier?.name || null,
          vipLevel: vipTier?.level ?? null,
          paymentMode: "diamond_escrow",
          diamondCharge: requiredDiamonds,
          diamondChargeCny: locked.total,
          firstOrderDiscount:
            locked.discount > 0
              ? {
                  amount: locked.discount,
                  minSpend: FIRST_ORDER_DISCOUNT.minSpend,
                  originalTotal: locked.originalTotal,
                }
              : null,
          requestedPlayerId: selectedPlayer?.id || null,
          requestedPlayerName: selectedPlayer?.name || null,
          requestedPlayerRole: selectedPlayer?.role || null,
          publicPool: true,
          gameProfile: gameProfile
            ? {
                gameName: gameProfile.gameName,
                gameId: gameProfile.gameId,
                updatedAt: gameProfile.updatedAt,
              }
            : null,
        },
      });
      if (chainOrderId) {
        const address = getCurrentAddress();
        const retrySync = async () => {
          const delays = [1000, 2000, 4000, 8000];
          setChainSyncing(true);
          for (let i = 0; i < delays.length; i += 1) {
            setChainSyncRetries(delays.length - i);
            setChainSyncLastAttemptAt(Date.now());
            try {
              await fetch(`/api/orders/${chainOrderId}/chain-sync?force=1&maxWaitMs=15000`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress: address, digest: chainDigest }),
              });
              setChainSyncing(false);
              setChainSyncRetries(0);
              return;
            } catch {
              /* retry */
            }
            await new Promise((resolve) => setTimeout(resolve, delays[i]));
          }
          setChainSyncing(false);
          setChainSyncRetries(0);
          setChainToast("chain.sync_timeout");
        };
        void retrySync();
      }
      await refreshOrders();
      if (locked.discount > 0) {
        markDiscountUsage(getCurrentAddress());
        trackEvent("first_order_discount_applied", {
          orderId: result.orderId,
          discount: locked.discount,
          originalTotal: locked.originalTotal,
        });
      }
      trackEvent("order_create_success", {
        orderId: result.orderId,
        total: locked.total,
        discount: locked.discount,
        paymentMode: "diamond_escrow",
        chain: Boolean(chainDigest),
      });
      setMode("notifying");
      setFeeOpen(false);
      if (result.sent === false) {
        setToast(result.error || "订单已创建，通知失败");
      } else {
        setToast(chainDigest ? t("ui.schedule.582") : t("schedule.015"));
      }
    } catch (e) {
      const message = formatErrorMessage(e, t("schedule.016"));
      trackEvent("order_create_failed", {
        error: message,
        total: locked.total,
        discount: locked.discount,
      });
      setToast(message);
    } finally {
      setTimeout(() => setToast(null), 3000);
      setCalling(false);
    }
  };

  // ─── Render ───

  if (mode === "await-user-pay" && currentOrder?.driver) {
    return (
      <AwaitUserPayView
        currentOrder={currentOrder}
        chainStatusHint={chainStatusHint}
        toast={toast}
        cancelOrder={cancelOrder}
        renderActionLabel={renderActionLabel}
        playerDue={playerDue}
        patchOrder={patchOrder}
        refreshOrders={refreshOrders}
        setMode={setMode}
        getCurrentAddress={getCurrentAddress}
      />
    );
  }

  if (mode === "enroute" && currentOrder?.driver) {
    return (
      <EnrouteView
        currentOrder={currentOrder}
        chainStatusHint={chainStatusHint}
        toast={toast}
        cancelOrder={cancelOrder}
        renderActionLabel={renderActionLabel}
        chainOrders={chainOrders}
        localChainStatus={localChainStatus}
        setToast={setToast}
        patchOrder={patchOrder}
        refreshOrders={refreshOrders}
        setMode={setMode}
        getCurrentAddress={getCurrentAddress}
        runChainAction={runChainAction}
        fetchOrSyncChainOrder={fetchOrSyncChainOrder}
        mergeChainStatus={mergeChainStatus}
        classifyChainError={classifyChainError}
        isChainLocalOrder={isChainLocalOrder}
        statusLabel={statusLabel}
        markCompletedOnChain={markCompletedOnChain}
      />
    );
  }

  if (mode === "pending-settlement" && currentOrder?.driver) {
    return (
      <PendingSettlementView
        currentOrder={currentOrder}
        chainStatusHint={chainStatusHint}
        toast={toast}
        cancelOrder={cancelOrder}
        renderActionLabel={renderActionLabel}
        chainOrders={chainOrders}
        localChainStatus={localChainStatus}
        setToast={setToast}
        runChainAction={runChainAction}
        mergeChainStatus={mergeChainStatus}
        openPrompt={openPrompt}
        openConfirm={openConfirm}
        raiseDisputeOnChain={raiseDisputeOnChain}
        finalizeNoDisputeOnChain={finalizeNoDisputeOnChain}
      />
    );
  }

  if (mode === "notifying" && currentOrder) {
    return <NotifyingView currentOrder={currentOrder} escrowFeeDisplay={escrowFeeDisplay} />;
  }

  return (
    <div className="ride-shell">
      {isChainOrdersEnabled() && (
        <ChainStatusPanel
          chainAddress={chainAddress}
          chainLoading={chainLoading}
          chainError={chainError}
          chainToast={chainToast}
          chainUpdatedAt={chainUpdatedAt}
          chainSyncing={chainSyncing}
          chainSyncRetries={chainSyncRetries}
          chainSyncLastAttemptAt={chainSyncLastAttemptAt}
          chainCurrentDisplay={chainCurrentDisplay}
          chainAction={chainAction}
          loadChain={loadChain}
          setDebugOpen={setDebugOpen}
          runChainAction={runChainAction}
          openPrompt={openPrompt}
          openConfirm={openConfirm}
          payServiceFeeOnChain={payServiceFeeOnChain}
          cancelOrderOnChain={cancelOrderOnChain}
          markCompletedOnChain={markCompletedOnChain}
          raiseDisputeOnChain={raiseDisputeOnChain}
          finalizeNoDisputeOnChain={finalizeNoDisputeOnChain}
        />
      )}

      {feeOpen && (
        <FeeModal
          locked={locked}
          requiredDiamonds={requiredDiamonds}
          diamondRate={diamondRate}
          diamondBalance={diamondBalance}
          balanceLoading={balanceLoading}
          balanceReady={balanceReady}
          hasEnoughDiamonds={hasEnoughDiamonds}
          feeChecked={feeChecked}
          setFeeChecked={setFeeChecked}
          calling={calling}
          vipLoading={vipLoading}
          vipTier={vipTier}
          disputePolicy={disputePolicy}
          selectedPlayer={selectedPlayer}
          refreshBalance={refreshBalance}
          callOrder={callOrder}
          onClose={() => setFeeOpen(false)}
        />
      )}

      {debugOpen && <DebugModal onClose={() => setDebugOpen(false)} />}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel}
        busy={confirmBusy}
        onConfirm={runConfirmAction}
        onClose={() => setConfirmAction(null)}
      />

      <PromptDialog
        open={!!promptAction}
        title={promptAction?.title ?? ""}
        description={promptAction?.description}
        placeholder={promptAction?.placeholder}
        confirmLabel={promptAction?.confirmLabel}
        value={promptValue}
        busy={promptBusy}
        onChange={setPromptValue}
        onConfirm={runPromptAction}
        onClose={() => setPromptAction(null)}
      />

      <div className="ride-tip" style={{ marginTop: 0 }}>
        本单含多种特惠计价，点击查看详情
      </div>

      <div className="ride-content">
        <div className="ride-side">
          <button
            className={`ride-side-tab ${active === PLAYER_SECTION_TITLE ? "is-active" : ""}`}
            onClick={() => {
              setActive(PLAYER_SECTION_TITLE);
              sectionRefs.current[PLAYER_SECTION_TITLE]?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          >
            可接陪练
          </button>
          {sections.map((s) => (
            <button
              key={s.title}
              className={`ride-side-tab ${active === s.title ? "is-active" : ""}`}
              onClick={() => {
                setActive(s.title);
                sectionRefs.current[s.title]?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="ride-main">
          <div className="ride-sections motion-stack">
            <div
              ref={(el) => {
                sectionRefs.current[PLAYER_SECTION_TITLE] = el;
              }}
              className="ride-block"
            >
              <PlayerList
                players={players}
                playersLoading={playersLoading}
                playersError={playersError}
                selectedPlayerId={selectedPlayerId}
                prefillHint={prefillHint}
                onSelectPlayer={(id) => {
                  setSelectedPlayerId(id);
                  setPrefillHint(null);
                }}
                onRefresh={loadPlayers}
              />
            </div>
            {sections.map((section) => (
              <div
                key={section.title}
                ref={(el) => {
                  sectionRefs.current[section.title] = el;
                }}
                className={`ride-block ${section.highlight ? "is-highlight" : ""}`}
              >
                <div className="ride-block-title">
                  <span>{section.title}</span>
                  {section.badge && <span className="ride-badge">{section.badge}</span>}
                </div>
                <div className="ride-items">
                  {section.items.map((item) => (
                    <div key={item.name} className="ride-row">
                      <div className="ride-row-main">
                        <div className="ride-row-title">
                          {item.name}
                          {item.tag && <span className="ride-tag">{item.tag}</span>}
                        </div>
                        <div className="ride-row-desc">{item.desc}</div>
                        <div className="ride-row-eta">
                          <Clock3 size={14} />
                          <span>{item.eta}</span>
                        </div>
                      </div>
                      <div className="ride-row-side">
                        <div className="ride-row-price">
                          <span className={item.bold ? "bold" : ""}>{item.price}</span>
                          {item.old && <span className="ride-old">{item.old}</span>}
                        </div>
                        {item.info && (
                          <div className="ride-info">
                            <button
                              type="button"
                              className="ride-info-dot"
                              onClick={() =>
                                setInfoOpen((prev) => (prev === item.name ? null : item.name))
                              }
                              onMouseEnter={() => setInfoOpen(item.name)}
                              onMouseLeave={() => setInfoOpen(null)}
                              aria-label={item.info}
                            >
                              !
                            </button>
                            {infoOpen === item.name && (
                              <div className="ride-tooltip">{item.info}</div>
                            )}
                          </div>
                        )}
                        <label className="ride-checkbox">
                          <input
                            type="checkbox"
                            checked={!!checked[item.name]}
                            onChange={() => toggle(item.name)}
                          />
                          <span className="ride-checkbox-box" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="ride-footer">
        <div className="ride-footer-left">
          <div className="ride-range">
            预估价 {pickedPrice ? pickedDiamonds.toFixed(0) : "40-90"} 钻石
          </div>
          <div className="ride-extra">{t("ui.schedule.043")}</div>
          {firstOrderEligible && (
            <div className="ride-discount-tag">{FIRST_ORDER_DISCOUNT.label}</div>
          )}
        </div>
        <button className="ride-call" onClick={submit}>
          <QrCode size={16} style={{ marginRight: 6 }} />
          先托管再呼叫
        </button>
      </footer>
      {toast && <div className="ride-toast">{toast}</div>}
    </div>
  );
}
