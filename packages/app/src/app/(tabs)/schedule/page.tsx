"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock3, ShieldCheck, QrCode, Loader2, CheckCircle2 } from "lucide-react";
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
import {
  type ChainOrder,
  cancelOrderOnChain,
  createChainOrderId,
  createOrderOnChain,
  fetchChainOrders,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  getChainDebugInfo,
  isChainOrdersEnabled,
  isVisualTestMode,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
} from "@/lib/chain/qy-chain";
import { resolveDisputePolicy } from "@/lib/risk-policy";
import { StateBlock } from "@/app/components/state-block";
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
  formatAmount,
  formatTime,
  shortDigest,
  Step,
} from "./schedule-data";

export default function Schedule() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => ({}));
  const [active, setActive] = useState("推荐");
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
  }>({
    total: 0,
    originalTotal: 0,
    discount: 0,
    service: 0,
    player: 0,
    items: [],
  });
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
    baseMs: 20_000,
    maxMs: 120_000,
    onPoll: async () => refreshOrders(userAddress || getCurrentAddress(), true),
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
      // ignore vip errors
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

  const fetchOrSyncChainOrder = async (orderId: string) => {
    const digest = (() => {
      const order = currentOrder;
      if (!order || order.id !== orderId) return undefined;
      const meta = (order.meta || {}) as { chainDigest?: string; lastChainDigest?: string };
      return order.chainDigest || meta.lastChainDigest || meta.chainDigest || undefined;
    })();
    // 第一步：尝试从本地链上订单列表查找
    let list = await fetchChainOrders();
    let found = list.find((order) => order.orderId === orderId) || null;
    if (found) {
      setChainOrders(list);
      return found;
    }

    // 第二步：同步到服务端查询（服务端会自动重试3次，共等待3秒）
    try {
      const synced = await syncChainOrder(orderId, chainAddress || undefined, digest);

      // 第三步：重新获取链上订单列表
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

      // 第四步：如果还是找不到，等待1秒后再试一次（应对极端延迟）
      await new Promise((resolve) => setTimeout(resolve, 1000));
      list = await fetchChainOrders();
      setChainOrders(list);
      found = list.find((order) => order.orderId === orderId) || null;
      if (found) return found;
    } catch (error) {
      const errorMsg = formatErrorMessage(error, "链上订单同步失败");
      // 如果是 chain order not found 错误，提供更友好的提示
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
      if (!visualTest) {
        setChainLoading(true);
      }
      setChainError(null);
      setChainAddress(getCurrentAddress());
      const list = await fetchChainOrders();
      setChainOrders(list);
      setChainUpdatedAt(Date.now());
    } catch (e) {
      setChainError(classifyChainError(e).message);
    } finally {
      if (!visualTest) {
        setChainLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isChainOrdersEnabled()) return;
    loadChain();
  }, [loadChain]);

  const loadPlayers = async () => {
    setPlayersLoading(true);
    setPlayersError(null);
    const cacheKey = "cache:players:public";
    const cached = readCache<PublicPlayer[]>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setPlayers(Array.isArray(cached.value) ? cached.value : []);
    }
    try {
      const res = await fetch("/api/players");
      if (!res.ok) {
        throw new Error("加载失败");
      }
      const data = await res.json();
      const next = Array.isArray(data) ? data : [];
      setPlayers(next);
      writeCache(cacheKey, next);
    } catch (e) {
      setPlayersError(formatErrorMessage(e, "加载陪练失败"));
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
    const list = orders;
    return list.find((o) => !o.status.includes("取消") && !o.status.includes("完成")) || null;
  }, [orders]);
  const chainCurrentOrder = useMemo(() => {
    const addr = chainAddress;
    const list = addr ? chainOrders.filter((o) => o.user === addr) : chainOrders;
    const active = list.filter((o) => o.status !== 6);
    return active.length > 0 ? active[0] : null;
  }, [chainOrders, chainAddress]);
  const localChainStatus = useMemo(() => getLocalChainStatus(currentOrder), [currentOrder]);
  const chainCurrentStatus = useMemo(() => {
    if (currentOrder && chainCurrentOrder && chainCurrentOrder.orderId !== currentOrder.id) {
      return localChainStatus;
    }
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

  const cancelOrder = async () => {
    if (!currentOrder) return;
    const isChainOrder = isChainLocalOrder(currentOrder);
    if (isChainOrder) {
      const effectiveStatus =
        chainCurrentOrder && chainCurrentOrder.orderId === currentOrder.id
          ? (chainCurrentStatus ?? chainCurrentOrder.status)
          : chainCurrentOrder?.status;
      if (typeof effectiveStatus === "number" && effectiveStatus >= 2) {
        setToast("押金已锁定，无法取消，请走争议/客服处理");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const ok = await runChainAction(
        `cancel-${currentOrder.id}`,
        () => cancelOrderOnChain(currentOrder.id),
        "订单已取消，托管费已退回",
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

  const chainStatusHint = useMemo(() => {
    if (!isChainOrdersEnabled()) return null;
    if (!currentOrder) return null;
    const status = chainCurrentStatus ?? localChainStatus;
    if (typeof status !== "number") return "链上状态：未同步";
    return `链上状态：${statusLabel(status)}`;
  }, [chainCurrentStatus, localChainStatus, currentOrder]);

  const renderActionLabel = (key: string, label: string) => {
    if (chainAction !== key) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3.5 w-3.5 spin" />
        处理中
      </span>
    );
  };
  const renderLoadingLabel = (loading: boolean, label: string, loadingLabel = "处理中") => {
    if (!loading) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3.5 w-3.5 spin" />
        {loadingLabel}
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
      const successMsg = digest ? `${success}（tx: ${shortDigest(digest)}）` : success;
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

  const submit = () => {
    if (pickedNames.length === 0) {
      setToast("请先选择服务");
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

  const diamondRate = DIAMOND_RATE;
  const requiredDiamonds = Math.ceil(locked.total * diamondRate);
  const hasEnoughDiamonds = Number(diamondBalance) >= requiredDiamonds;
  const disputePolicy = useMemo(() => resolveDisputePolicy(vipTier?.level), [vipTier]);

  const refreshBalance = async () => {
    const addr = getCurrentAddress();
    if (!addr) return;
    const cacheKey = `cache:diamond-balance:${addr}`;
    const cached = readCache<string>(cacheKey, cacheTtlMs, true);
    if (cached) {
      setDiamondBalance(cached.value);
    }
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
      // ignore balance errors
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
      setToast("请先登录账号以便扣减钻石");
      return;
    }
    if (!hasEnoughDiamonds && !redirectRef.current) {
      redirectRef.current = true;
      setToast("钻石余额不足，正在跳转充值...");
      setTimeout(() => {
        window.location.href = "/wallet";
      }, 1200);
    }
  }, [feeOpen, balanceLoading, balanceReady, hasEnoughDiamonds]);

  if (mode === "await-user-pay" && currentOrder?.driver) {
    const companionProfile = (currentOrder.meta?.companionProfile || null) as {
      gameName?: string;
      gameId?: string;
    } | null;
    const hasCompanionProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
    const paymentMode = (currentOrder.meta as { paymentMode?: string } | undefined)?.paymentMode;
    const isEscrow = paymentMode === "diamond_escrow";
    return (
      <div className="ride-shell">
        <div className="ride-tip" style={{ marginTop: 0 }}>
          陪练已支付押金，平台将使用钻石托管陪练费用
        </div>

        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">
                {isEscrow ? "陪练费用已托管" : "等待支付陪练费用"}
              </div>
              {hasCompanionProfile ? (
                <>
                  <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
                  <div className="text-xs text-gray-500">
                    游戏名 {companionProfile?.gameName || "-"} · ID{" "}
                    {companionProfile?.gameId || "-"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
                  <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
                </>
              )}
            </div>
            <div className="ml-auto text-right">
              {hasCompanionProfile ? (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">已接单</div>
                  <div className="text-xs text-gray-500">请确认游戏信息</div>
                </>
              ) : (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">
                    {currentOrder.driver.eta}
                  </div>
                  {currentOrder.driver.price && (
                    <div className="text-xs text-gray-500">
                      一口价 {currentOrder.driver.price} 钻石
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>
              取消订单
            </button>
            <button className="dl-tab-btn accent">联系陪练</button>
          </div>
          {chainStatusHint && (
            <div className="text-xs text-gray-500 mt-2 text-right">{chainStatusHint}</div>
          )}
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>

        <div className="ride-pay-box">
          <div className="ride-pay-head">
            <div>
              <div className="ride-pay-title">托管陪练费用</div>
              <div className="ride-pay-sub">无需扫码，平台将从钻石托管后结算</div>
            </div>
            <div className="ride-pay-amount">¥{playerDue.toFixed(2)}</div>
          </div>
          <div className="ride-pay-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>
              取消订单
            </button>
            <button
              className="dl-tab-btn primary"
              onClick={async () => {
                if (!currentOrder) return;
                await patchOrder(currentOrder.id, {
                  playerPaid: true,
                  status: "陪练费已托管",
                  userAddress: getCurrentAddress(),
                });
                await refreshOrders();
                setMode("enroute");
              }}
            >
              进入服务
            </button>
          </div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
      </div>
    );
  }

  if (mode === "enroute" && currentOrder?.driver) {
    const companionProfile = (currentOrder.meta?.companionProfile || null) as {
      gameName?: string;
      gameId?: string;
    } | null;
    const hasCompanionProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
    const companionEndedAt = (
      currentOrder.meta as { companionEndedAt?: number | string } | undefined
    )?.companionEndedAt;
    const canConfirmCompletion = Boolean(companionEndedAt);
    return (
      <div className="ride-shell">
        <div className="ride-map-large">
          <StateBlock
            tone="loading"
            size="compact"
            align="center"
            title="地图加载中"
            description="正在定位服务区域"
          />
        </div>
        {canConfirmCompletion && (
          <div className="ride-tip" style={{ marginTop: 0 }}>
            陪练已结束服务，请确认完成后进入结算/争议期
            {chainStatusHint && <div className="mt-1 text-xs text-gray-500">{chainStatusHint}</div>}
          </div>
        )}
        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">服务已开始</div>
              {hasCompanionProfile ? (
                <>
                  <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
                  <div className="text-xs text-gray-500">
                    游戏名 {companionProfile?.gameName || "-"} · ID{" "}
                    {companionProfile?.gameId || "-"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
                  <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
                </>
              )}
            </div>
            <div className="ml-auto text-right">
              {hasCompanionProfile ? (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">服务已开始</div>
                  <div className="text-xs text-gray-500">请保持在线</div>
                </>
              ) : (
                <>
                  <div className="text-emerald-600 font-semibold text-sm">
                    {currentOrder.driver.eta}
                  </div>
                  {currentOrder.driver.price && (
                    <div className="text-xs text-gray-500">
                      一口价 {currentOrder.driver.price} 钻石
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>
              {currentOrder
                ? renderActionLabel(`cancel-${currentOrder.id}`, "取消订单")
                : "取消订单"}
            </button>
            <button className="dl-tab-btn">安全中心</button>
            {canConfirmCompletion && (
              <button
                className="dl-tab-btn"
                onClick={async () => {
                  if (!currentOrder) return;
                  const isChainOrder = isChainLocalOrder(currentOrder);
                  if (isChainOrder) {
                    let chainOrder =
                      chainOrders.find((order) => order.orderId === currentOrder.id) || null;
                    if (!chainOrder) {
                      try {
                        chainOrder = await fetchOrSyncChainOrder(currentOrder.id);
                      } catch (error) {
                        setToast(classifyChainError(error).message);
                        return;
                      }
                    }
                    const effectiveStatus = mergeChainStatus(localChainStatus, chainOrder?.status);
                    if (typeof effectiveStatus !== "number") {
                      setToast("链上订单未同步（已尝试服务端刷新）");
                      return;
                    }
                    if (effectiveStatus !== 2) {
                      setToast(
                        `当前链上状态：${statusLabel(effectiveStatus)}，需“押金已锁定”后才能确认完成`
                      );
                      return;
                    }
                    await runChainAction(
                      `complete-${currentOrder.id}`,
                      () => markCompletedOnChain(currentOrder.id),
                      "已确认完成",
                      currentOrder.id
                    );
                    return;
                  }
                  await patchOrder(currentOrder.id, {
                    status: "待结算",
                    userAddress: getCurrentAddress(),
                  });
                  await refreshOrders();
                  setMode("pending-settlement");
                }}
              >
                {currentOrder
                  ? renderActionLabel(`complete-${currentOrder.id}`, "确认完成")
                  : "确认完成"}
              </button>
            )}
            <button className="dl-tab-btn accent">联系陪练</button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
      </div>
    );
  }

  if (mode === "pending-settlement" && currentOrder?.driver) {
    const companionProfile = (currentOrder.meta?.companionProfile || null) as {
      gameName?: string;
      gameId?: string;
    } | null;
    const hasCompanionProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
    const chainOrder =
      currentOrder && chainOrders.length > 0
        ? chainOrders.find((order) => order.orderId === currentOrder.id) || null
        : null;
    const effectiveStatus = mergeChainStatus(localChainStatus, chainOrder?.status);
    const canSettle = effectiveStatus === 3;
    const localDeadline = (
      currentOrder.meta as { chain?: { disputeDeadline?: number | string } } | undefined
    )?.chain?.disputeDeadline;
    const deadlineRaw =
      typeof localDeadline === "string"
        ? Number(localDeadline)
        : Number(localDeadline ?? chainOrder?.disputeDeadline ?? 0);
    const disputeDeadline = Number.isFinite(deadlineRaw) && deadlineRaw > 0 ? deadlineRaw : null;
    const now = Date.now();
    const inDisputeWindow = disputeDeadline ? now <= disputeDeadline : false;
    const canDispute = Boolean(canSettle && inDisputeWindow);
    const canFinalize = Boolean(canSettle);
    return (
      <div className="ride-shell">
        <div className="ride-map-large">
          <StateBlock
            tone="loading"
            size="compact"
            align="center"
            title="地图加载中"
            description="正在定位服务区域"
          />
        </div>
        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">服务已完成</div>
              {hasCompanionProfile ? (
                <>
                  <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
                  <div className="text-xs text-gray-500">
                    游戏名 {companionProfile?.gameName || "-"} · ID{" "}
                    {companionProfile?.gameId || "-"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
                  <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
                </>
              )}
            </div>
            <div className="ml-auto text-right">
              <div className="text-emerald-600 font-semibold text-sm">待结算</div>
              <div className="text-xs text-gray-500">
                {inDisputeWindow ? "可发起争议" : "争议期已结束"}
              </div>
            </div>
          </div>
          <div className="ride-driver-actions">
            <button
              className="dl-tab-btn"
              onClick={() => {
                if (!currentOrder) return;
                if (!canDispute) {
                  if (!disputeDeadline) {
                    setToast("争议截止时间未同步，请稍后刷新");
                  } else if (!inDisputeWindow) {
                    setToast("争议期已结束，无法发起争议");
                  } else {
                    setToast("当前状态无法发起争议");
                  }
                  return;
                }
                openPrompt({
                  title: "发起争议",
                  description: "请填写争议说明或证据哈希（可留空）",
                  confirmLabel: "提交争议",
                  action: async (value) => {
                    await runChainAction(
                      `dispute-${currentOrder.id}`,
                      () => raiseDisputeOnChain(currentOrder.id, value),
                      "已提交争议",
                      currentOrder.id
                    );
                  },
                });
              }}
            >
              {currentOrder
                ? renderActionLabel(`dispute-${currentOrder.id}`, "发起争议")
                : "发起争议"}
            </button>
            <button
              className="dl-tab-btn primary"
              onClick={() => {
                if (!currentOrder) return;
                if (!canFinalize) {
                  setToast("当前状态无法结算");
                  return;
                }
                if (inDisputeWindow) {
                  const deadlineText = disputeDeadline
                    ? new Date(disputeDeadline).toLocaleString()
                    : "";
                  openConfirm({
                    title: "确认放弃争议期并立即结算？",
                    description: deadlineText
                      ? `争议截止：${deadlineText}`
                      : "争议期内放弃争议将立即结算。",
                    confirmLabel: "确认结算",
                    action: async () => {
                      await runChainAction(
                        `finalize-${currentOrder.id}`,
                        () => finalizeNoDisputeOnChain(currentOrder.id),
                        "订单已结算",
                        currentOrder.id
                      );
                    },
                  });
                  return;
                }
                runChainAction(
                  `finalize-${currentOrder.id}`,
                  () => finalizeNoDisputeOnChain(currentOrder.id),
                  "订单已结算",
                  currentOrder.id
                );
              }}
            >
              {currentOrder
                ? renderActionLabel(`finalize-${currentOrder.id}`, "无争议结算")
                : "无争议结算"}
            </button>
            <button className="dl-tab-btn accent">联系陪练</button>
          </div>
          {disputeDeadline && (
            <div className="text-xs text-gray-500 mt-2 text-right">
              争议截止：{new Date(disputeDeadline).toLocaleString()}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>
        {toast && <div className="ride-toast">{toast}</div>}
      </div>
    );
  }

  if (mode === "notifying" && currentOrder) {
    return (
      <div className="ride-shell">
        <div className="ride-tip" style={{ marginTop: 0 }}>
          正在通知陪练，需陪练支付押金后才能接单
        </div>
        <div className="ride-stepper">
          <Step
            label={`托管费 ¥${escrowFeeDisplay.toFixed(2)} 已收`}
            done={!!currentOrder.serviceFeePaid}
          />
          <Step label="陪练支付押金" done={!!currentOrder.depositPaid} />
          <Step label="派单匹配" done={!!currentOrder.driver} />
        </div>
        <div className="ride-notify-illu" />
        <div className="dl-card" style={{ padding: 16 }}>
          <div className="text-sm font-semibold text-gray-900 mb-2">已选服务</div>
          <div className="flex justify-between text-sm">
            <span>{currentOrder.item}</span>
            <span className="text-amber-600 font-bold">¥{currentOrder.amount}</span>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {new Date(currentOrder.time).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-3">
            押金未付前不会进入服务阶段，费用已由钻石托管。
          </div>
        </div>
      </div>
    );
  }

  const callOrder = async () => {
    if (!feeChecked) {
      setToast("请先确认使用钻石托管费用");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    if (!locked.items.length) {
      setToast("请选择服务");
      return;
    }
    setCalling(true);
    try {
      const requestedNote = selectedPlayer ? `指定陪练：${selectedPlayer.name}` : "";
      let chainOrderId: string | null = null;
      let chainDigest: string | null = null;
      if (isChainOrdersEnabled()) {
        const addr = getCurrentAddress();
        if (!addr) {
          throw new Error("请先登录账号以便扣减钻石");
        }
        if (!hasEnoughDiamonds) {
          throw new Error("钻石余额不足");
        }
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
        user: "安排页面",
        userAddress: getCurrentAddress(),
        item: locked.items.join("、"),
        amount: locked.total,
        status: "待派单",
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
            const delay = delays[i];
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
              // ignore and retry
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          setChainSyncing(false);
          setChainSyncRetries(0);
          setChainToast("链上同步超时，请稍后手动刷新");
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
        setToast(chainDigest ? "已提交并派单" : "托管费用已记录，正在派单");
      }
    } catch (e) {
      const message = formatErrorMessage(e, "创建订单失败");
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

  return (
    <div className="ride-shell">
      {isChainOrdersEnabled() && (
        <div className="dl-card" style={{ marginBottom: 12 }}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">订单状态</div>
            <button
              className="dl-tab-btn"
              style={{ padding: "6px 10px" }}
              onClick={loadChain}
              disabled={chainLoading}
            >
              {renderLoadingLabel(chainLoading, "刷新", "刷新中")}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            当前账号：{chainAddress ? "已登录" : "未登录"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            上次刷新：{chainUpdatedAt ? new Date(chainUpdatedAt).toLocaleTimeString() : "-"}
          </div>
          {chainSyncLastAttemptAt ? (
            <div className={`text-xs mt-1 ${chainSyncing ? "text-amber-600" : "text-gray-500"}`}>
              {chainSyncing
                ? `链上同步中：剩余重试 ${chainSyncRetries ?? 0} 次，最后尝试 ${new Date(chainSyncLastAttemptAt).toLocaleTimeString()}`
                : `链上同步最后尝试：${new Date(chainSyncLastAttemptAt).toLocaleTimeString()}`}
            </div>
          ) : null}
          <div className="mt-2 flex justify-end">
            <button
              className="dl-tab-btn"
              style={{ padding: "6px 10px" }}
              onClick={() => setDebugOpen(true)}
            >
              链上调试信息
            </button>
          </div>
          {chainError && <div className="mt-2 text-xs text-rose-500">{chainError}</div>}
          {chainToast && <div className="mt-2 text-xs text-emerald-600">{chainToast}</div>}
          {!chainCurrentDisplay ? (
            <StateBlock
              tone={chainLoading ? "loading" : chainError ? "danger" : "empty"}
              size="compact"
              title={chainLoading ? "同步中" : chainError ? "加载失败" : "暂无订单"}
              description={chainLoading ? "正在刷新链上订单" : chainError || "点击刷新获取最新状态"}
              actions={
                chainLoading ? null : (
                  <button className="dl-tab-btn" onClick={loadChain} disabled={chainLoading}>
                    {renderLoadingLabel(chainLoading, "刷新", "刷新中")}
                  </button>
                )
              }
            />
          ) : (
            <div className="mt-3 text-xs text-gray-600">
              <div>订单号：{chainCurrentDisplay.orderId}</div>
              <div>状态：{statusLabel(chainCurrentDisplay.status)}</div>
              <div>托管费：¥{formatAmount(chainCurrentDisplay.serviceFee)}</div>
              <div>押金：¥{formatAmount(chainCurrentDisplay.deposit)}</div>
              <div>争议截止：{formatTime(chainCurrentDisplay.disputeDeadline)}</div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {chainCurrentDisplay.status === 0 && (
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={chainAction === `pay-${chainCurrentDisplay.orderId}`}
                    onClick={() =>
                      runChainAction(
                        `pay-${chainCurrentDisplay.orderId}`,
                        () => payServiceFeeOnChain(chainCurrentDisplay.orderId),
                        "托管费已提交",
                        chainCurrentDisplay.orderId
                      )
                    }
                  >
                    {renderActionLabel(`pay-${chainCurrentDisplay.orderId}`, "支付托管费")}
                  </button>
                )}
                {(chainCurrentDisplay.status === 0 || chainCurrentDisplay.status === 1) && (
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={chainAction === `cancel-${chainCurrentDisplay.orderId}`}
                    onClick={() =>
                      runChainAction(
                        `cancel-${chainCurrentDisplay.orderId}`,
                        () => cancelOrderOnChain(chainCurrentDisplay.orderId),
                        "订单已取消",
                        chainCurrentDisplay.orderId
                      )
                    }
                  >
                    {renderActionLabel(`cancel-${chainCurrentDisplay.orderId}`, "取消订单")}
                  </button>
                )}
                {chainCurrentDisplay.status === 2 && (
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={chainAction === `complete-${chainCurrentDisplay.orderId}`}
                    onClick={() =>
                      runChainAction(
                        `complete-${chainCurrentDisplay.orderId}`,
                        () => markCompletedOnChain(chainCurrentDisplay.orderId),
                        "已确认完成",
                        chainCurrentDisplay.orderId
                      )
                    }
                  >
                    {renderActionLabel(`complete-${chainCurrentDisplay.orderId}`, "确认完成")}
                  </button>
                )}
                {chainCurrentDisplay.status === 3 && (
                  <>
                    <button
                      className="dl-tab-btn"
                      style={{ padding: "6px 10px" }}
                      disabled={chainAction === `dispute-${chainCurrentDisplay.orderId}`}
                      onClick={() => {
                        openPrompt({
                          title: "发起争议",
                          description: "请填写争议说明或证据哈希（可留空）",
                          confirmLabel: "提交争议",
                          action: async (value) => {
                            await runChainAction(
                              `dispute-${chainCurrentDisplay.orderId}`,
                              () => raiseDisputeOnChain(chainCurrentDisplay.orderId, value),
                              "已提交争议",
                              chainCurrentDisplay.orderId
                            );
                          },
                        });
                      }}
                    >
                      {renderActionLabel(`dispute-${chainCurrentDisplay.orderId}`, "发起争议")}
                    </button>
                    <button
                      className="dl-tab-btn"
                      style={{ padding: "6px 10px" }}
                      disabled={chainAction === `finalize-${chainCurrentDisplay.orderId}`}
                      onClick={() => {
                        const deadline = Number(chainCurrentDisplay.disputeDeadline);
                        if (Number.isFinite(deadline) && deadline > Date.now()) {
                          openConfirm({
                            title: "确认放弃争议期并立即结算？",
                            description: `争议截止：${new Date(deadline).toLocaleString()}`,
                            confirmLabel: "确认结算",
                            action: async () => {
                              await runChainAction(
                                `finalize-${chainCurrentDisplay.orderId}`,
                                () => finalizeNoDisputeOnChain(chainCurrentDisplay.orderId),
                                "订单已结算",
                                chainCurrentDisplay.orderId
                              );
                            },
                          });
                          return;
                        }
                        runChainAction(
                          `finalize-${chainCurrentDisplay.orderId}`,
                          () => finalizeNoDisputeOnChain(chainCurrentDisplay.orderId),
                          "订单已结算",
                          chainCurrentDisplay.orderId
                        );
                      }}
                    >
                      {renderActionLabel(`finalize-${chainCurrentDisplay.orderId}`, "无争议结算")}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {feeOpen && (
        <div className="ride-modal-mask" role="dialog" aria-modal="true">
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">使用钻石托管费用</div>
                <div className="ride-modal-sub">按订单金额计算，1元=10钻石</div>
              </div>
              <div className="ride-modal-amount">{requiredDiamonds} 钻石</div>
            </div>
            <div className="ride-qr-inline">
              <div className="ride-qr-text">
                <div className="text-sm font-semibold text-gray-900">托管费用（钻石）</div>
                <div className="text-xs text-gray-500">
                  订单 ¥{locked.total.toFixed(2)} × {diamondRate} = {requiredDiamonds} 钻石
                </div>
                {locked.discount > 0 && (
                  <div className="ride-price-stack">
                    <div className="ride-price-line">
                      <span>原价</span>
                      <span>¥{locked.originalTotal.toFixed(2)}</span>
                    </div>
                    <div className="ride-price-line discount">
                      <span>{FIRST_ORDER_DISCOUNT.label}</span>
                      <span>-¥{locked.discount.toFixed(2)}</span>
                    </div>
                    <div className="ride-price-line total">
                      <span>应付</span>
                      <span>¥{locked.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  撮合费 ¥{locked.service.toFixed(2)} / 陪练费用 ¥{locked.player.toFixed(2)}
                </div>
                <div className="ride-chip">陪练费用由平台托管，服务完成后结算</div>
                <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  仲裁时效：{vipLoading ? "查询中..." : `${disputePolicy.hours}小时`}
                  {vipTier?.name ? `（会员：${vipTier.name}）` : ""}
                </div>
                <div className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  已选陪练：
                  {selectedPlayer
                    ? `${selectedPlayer.name}${selectedPlayer.role ? `（${selectedPlayer.role}）` : ""}`
                    : "系统匹配"}
                </div>
                <div className="text-xs text-gray-500" style={{ marginTop: 6 }}>
                  当前余额：
                  {balanceLoading
                    ? "查询中..."
                    : balanceReady
                      ? `${diamondBalance} 钻石`
                      : "查询失败，请刷新"}
                </div>
                {balanceReady && !hasEnoughDiamonds && (
                  <div className="text-xs text-rose-500" style={{ marginTop: 4 }}>
                    钻石余额不足，请先充值
                  </div>
                )}
                <button
                  className="dl-tab-btn"
                  style={{ marginTop: 8 }}
                  onClick={refreshBalance}
                  disabled={balanceLoading}
                >
                  {renderLoadingLabel(balanceLoading, "刷新余额", "刷新中")}
                </button>
                <label className="ride-status-toggle" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={feeChecked}
                    onChange={(e) => setFeeChecked(e.target.checked)}
                    aria-label="已确认托管费用"
                  />
                  <span>使用钻石托管费用</span>
                  {feeChecked && <CheckCircle2 size={16} color="#22c55e" />}
                </label>
              </div>
            </div>
            <div className="ride-modal-actions">
              <button className="dl-tab-btn" onClick={() => setFeeOpen(false)}>
                取消
              </button>
              <button
                className="dl-tab-btn primary"
                onClick={callOrder}
                disabled={calling || !hasEnoughDiamonds}
              >
                {calling ? <Loader2 size={16} className="spin" /> : null}
                <span style={{ marginLeft: calling ? 6 : 0 }}>扣减钻石并派单</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {debugOpen && (
        <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label="链上调试信息">
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">链上调试信息</div>
                <div className="ride-modal-sub">用于排查未同步、链上配置不一致等问题</div>
              </div>
              <div className="ride-modal-amount">Debug</div>
            </div>
            <div className="ride-qr-inline">
              <pre
                className="admin-input"
                style={{ width: "100%", minHeight: 140, whiteSpace: "pre-wrap", fontSize: 12 }}
              >
                {JSON.stringify(getChainDebugInfo(), null, 2)}
              </pre>
            </div>
            <div className="ride-modal-actions">
              <button className="dl-tab-btn" onClick={() => setDebugOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="ride-block-title">
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <span>可接陪练</span>
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "4px 8px" }}
                    onClick={loadPlayers}
                    type="button"
                    disabled={playersLoading}
                  >
                    {renderLoadingLabel(playersLoading, "刷新", "加载中")}
                  </button>
                </div>
              </div>
              <div className="ride-items">
                {playersLoading && players.length === 0 ? (
                  <StateBlock
                    tone="loading"
                    size="compact"
                    title="加载中"
                    description="正在获取可接陪练"
                  />
                ) : playersError && players.length === 0 ? (
                  <StateBlock
                    tone="danger"
                    size="compact"
                    title="陪练列表加载失败"
                    description={playersError}
                    actions={
                      <button
                        className="dl-tab-btn"
                        onClick={loadPlayers}
                        type="button"
                        disabled={playersLoading}
                      >
                        {renderLoadingLabel(playersLoading, "重新加载", "加载中")}
                      </button>
                    }
                  />
                ) : players.length === 0 ? (
                  <StateBlock
                    tone="empty"
                    size="compact"
                    title="暂无可接陪练"
                    description="稍后刷新或切换时间段试试"
                  />
                ) : (
                  players.map((player) => (
                    <div
                      key={player.id}
                      className="ride-row"
                      onClick={() => {
                        setSelectedPlayerId(player.id);
                        setPrefillHint(null);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelectedPlayerId(player.id);
                          setPrefillHint(null);
                        }
                      }}
                    >
                      <div className="ride-row-main">
                        <div className="ride-row-title">{player.name}</div>
                        <div className="ride-row-desc">{player.role || "擅长位置待完善"}</div>
                      </div>
                      <div className="ride-row-side">
                        <label
                          className="ride-checkbox"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="radio"
                            name="selected-player"
                            checked={selectedPlayerId === player.id}
                            onChange={() => {
                              setSelectedPlayerId(player.id);
                              setPrefillHint(null);
                            }}
                          />
                          <span className="ride-checkbox-box" />
                        </label>
                      </div>
                    </div>
                  ))
                )}
                {playersError && players.length > 0 && (
                  <div className="px-4 pb-2 text-xs text-rose-500">
                    陪练列表更新失败：{playersError}
                  </div>
                )}
              </div>
              <div className="px-4 pb-2 text-[11px] text-slate-400">
                {prefillHint || "未选择将由系统匹配陪练"}
              </div>
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
          <div className="ride-extra">动态调价</div>
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
