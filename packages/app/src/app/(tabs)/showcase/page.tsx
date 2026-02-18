"use client";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { type LocalOrder } from "@/app/components/order-store";
import {
  deleteOrder,
  fetchOrderDetail,
  fetchOrdersWithMeta,
  fetchPublicOrders,
  fetchPublicOrdersWithMeta,
  patchOrder,
  syncChainOrder,
} from "@/app/components/order-service";
import { Activity, Clock3, Car, MapPin, Loader2 } from "lucide-react";
import {
  type ChainOrder,
  claimOrderOnChain,
  cancelOrderOnChain,
  fetchChainOrders,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
  lockDepositOnChain,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
  signAuthIntent,
  getChainDebugInfo,
  getDefaultCompanionAddress,
} from "@/lib/chain/qy-chain";
import { useBackoffPoll } from "@/app/components/use-backoff-poll";
import { MotionCard } from "@/components/ui/motion";
import { StateBlock } from "@/app/components/state-block";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { extractErrorMessage, formatErrorMessage } from "@/app/components/error-utils";
import { useGuardianStatus } from "@/app/components/guardian-role";

function getLocalChainStatus(order?: LocalOrder | null) {
  if (!order) return undefined;
  const meta = (order.meta || {}) as { chain?: { status?: number } };
  const status = order.chainStatus ?? meta.chain?.status;
  return typeof status === "number" ? status : undefined;
}

function mergeChainStatus(local?: number, remote?: number) {
  if (typeof local === "number" && typeof remote === "number") {
    return Math.max(local, remote);
  }
  return typeof local === "number" ? local : remote;
}

export default function Showcase() {
  const router = useRouter();
  const { state: guardianState, isGuardian } = useGuardianStatus();
  const canAccessShowcase = isGuardian;
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [chainAction, setChainAction] = useState<string | null>(null);
  const [chainAddress, setChainAddress] = useState("");
  const [chainUpdatedAt, setChainUpdatedAt] = useState<number | null>(null);
  const [disputeOpen, setDisputeOpen] = useState<{ orderId: string; evidence: string } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [publicCursor, setPublicCursor] = useState<string | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [myOrders, setMyOrders] = useState<LocalOrder[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);
  const [orderMetaOverrides, setOrderMetaOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [orderMetaLoading, setOrderMetaLoading] = useState<Record<string, boolean>>({});
  const [pendingScrollToAccepted, setPendingScrollToAccepted] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const acceptedRef = useRef<HTMLDivElement | null>(null);
  const GAME_PROFILE_KEY = "qy_game_profile_v1";
  const ORDER_SOURCE =
    process.env.NEXT_PUBLIC_ORDER_SOURCE || (process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1" ? "server" : "local");
  const showOrderSourceWarning = isChainOrdersEnabled() && ORDER_SOURCE !== "server";
  const myAcceptedOrders = useMemo(() => {
    const address = chainAddress || getCurrentAddress();
    return myOrders.filter((order) => {
      if (!address || !order.companionAddress) return false;
      if (order.companionAddress !== address) return false;
      return !order.status.includes("完成") && !order.status.includes("取消");
    });
  }, [chainAddress, myOrders]);
  const localChainStatusById = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of [...orders, ...myOrders]) {
      const status = getLocalChainStatus(order);
      if (typeof status !== "number") continue;
      const prev = map.get(order.id);
      map.set(order.id, typeof prev === "number" ? Math.max(prev, status) : status);
    }
    return map;
  }, [orders, myOrders]);
  const localDisputeDeadlineById = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of [...orders, ...myOrders]) {
      const meta = (order.meta || {}) as { chain?: { disputeDeadline?: number | string } };
      const raw = meta.chain?.disputeDeadline;
      const deadline = typeof raw === "string" ? Number(raw) : Number(raw ?? 0);
      if (!Number.isFinite(deadline) || deadline <= 0) continue;
      const prev = map.get(order.id);
      map.set(order.id, typeof prev === "number" ? Math.max(prev, deadline) : deadline);
    }
    return map;
  }, [orders, myOrders]);
  const resolveChainStatus = useCallback(
    (order: ChainOrder) => {
      const local = localChainStatusById.get(order.orderId);
      const merged = mergeChainStatus(local, order.status);
      return typeof merged === "number" ? merged : order.status;
    },
    [localChainStatusById]
  );
  const resolveDisputeDeadline = useCallback(
    (order: ChainOrder) => {
      const local = localDisputeDeadlineById.get(order.orderId);
      const remote = Number(order.disputeDeadline);
      if (local !== undefined && Number.isFinite(local) && local > 0 && Number.isFinite(remote) && remote > 0) {
        return Math.max(local, remote);
      }
      if (local !== undefined && Number.isFinite(local) && local > 0) return local;
      if (Number.isFinite(remote) && remote > 0) return remote;
      return 0;
    },
    [localDisputeDeadlineById]
  );

  type GameProfile = {
    gameName: string;
    gameId: string;
    updatedAt: number;
    userAddress?: string;
  };

  type StoredProfiles = Record<string, GameProfile>;

  const loadGameProfile = (address: string) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(GAME_PROFILE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredProfiles;
      return parsed[address] || parsed.local || null;
    } catch {
      return null;
    }
  };

  const refreshOrders = async (force = false) => {
    if (!canAccessShowcase) return true;
    setPublicLoading(true);
    try {
      const result = await fetchPublicOrdersWithMeta(undefined, { force });
      setOrders(result.items);
      setPublicCursor(result.nextCursor || null);
      return !result.meta.error;
    } finally {
      setPublicLoading(false);
    }
  };

  const refreshMyOrders = useCallback(async (force = false) => {
    if (!canAccessShowcase) return true;
    setMyOrdersLoading(true);
    try {
      const result = await fetchOrdersWithMeta({ force });
      setMyOrders(result.items);
      return !result.meta.error;
    } finally {
      setMyOrdersLoading(false);
    }
  }, [canAccessShowcase]);

  const loadMoreOrders = useCallback(async () => {
    if (!canAccessShowcase) return;
    if (!publicCursor || publicLoading) return;
    setPublicLoading(true);
    try {
      const result = await fetchPublicOrders(publicCursor);
      setOrders((prev) => [...prev, ...result.items]);
      setPublicCursor(result.nextCursor || null);
    } finally {
      setPublicLoading(false);
    }
  }, [canAccessShowcase, publicCursor, publicLoading]);

  useEffect(() => {
    if (!canAccessShowcase) return;
    refreshOrders();
  }, [canAccessShowcase]);

  useEffect(() => {
    if (!canAccessShowcase) return;
    refreshMyOrders();
  }, [canAccessShowcase, refreshMyOrders]);

  useBackoffPoll({
    enabled: canAccessShowcase,
    baseMs: 20_000,
    maxMs: 120_000,
    onPoll: async () => {
      const [okPublic, okMine] = await Promise.all([refreshOrders(true), refreshMyOrders(true)]);
      return okPublic && okMine;
    },
  });

  useEffect(() => {
    if (guardianState === "checking") return;
    if (!canAccessShowcase) {
      router.replace("/home");
    }
  }, [guardianState, canAccessShowcase, router]);

  useEffect(() => {
    if (!pendingScrollToAccepted) return;
    if (myAcceptedOrders.length === 0) return;
    setPendingScrollToAccepted(false);
    if (acceptedRef.current) {
      acceptedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pendingScrollToAccepted, myAcceptedOrders.length]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (!publicCursor) return;
    const target = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          loadMoreOrders();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [publicCursor, loadMoreOrders]);

  const loadChain = useCallback(async () => {
    if (!canAccessShowcase) return;
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
      setChainError(formatErrorMessage(e, "链上订单加载失败，请检查链上配置"));
    } finally {
      if (!visualTest) {
        setChainLoading(false);
      }
    }
  }, [canAccessShowcase]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshOrders(true), refreshMyOrders(true)]);
    await loadChain();
  }, [loadChain, refreshMyOrders, refreshOrders]);

  useEffect(() => {
    if (!isChainOrdersEnabled()) return;
    loadChain();
  }, [loadChain]);

  const openConfirm = (payload: {
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<void>;
  }) => {
    setConfirmAction(payload);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.action();
    } catch (error) {
      setChainToast(formatErrorMessage(error, "操作失败"));
      setTimeout(() => setChainToast(null), 3000);
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
    }
  };

  const fetchOrSyncChainOrder = async (orderId: string, digest?: string) => {
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
        const serviceFeeCny = typeof synced.order.serviceFee === "number" ? synced.order.serviceFee : 0;
        const depositCny = typeof synced.order.deposit === "number" ? synced.order.deposit : 0;
        return {
          orderId,
          user: synced.order.userAddress || "0x0",
          companion: synced.order.companionAddress || "0x0",
          ruleSetId: String(
            (synced.order.meta as { chain?: { ruleSetId?: string | number } } | undefined)?.chain?.ruleSetId ?? "0"
          ),
          serviceFee: String(Math.round(serviceFeeCny * 100)),
          deposit: String(Math.round(depositCny * 100)),
          platformFeeBps: "0",
          status: synced.chainStatus,
          createdAt: String(synced.order.createdAt || Date.now()),
          finishAt: "0",
          disputeDeadline: String(
            (synced.order.meta as { chain?: { disputeDeadline?: string | number } } | undefined)?.chain
              ?.disputeDeadline ?? "0"
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

  const accept = async (id: string) => {
    const address = getCurrentAddress();
    if (!address) {
      setChainToast("请先登录账号再接单");
      setTimeout(() => setChainToast(null), 3000);
      return;
    }
    const localOrder = orders.find((order) => order.id === id);
    const digest =
      localOrder?.chainDigest ||
      (localOrder?.meta as { lastChainDigest?: string; chainDigest?: string } | undefined)?.lastChainDigest ||
      (localOrder?.meta as { chainDigest?: string } | undefined)?.chainDigest;
    const hasChainMarker =
      Boolean(localOrder?.chainDigest) ||
      localOrder?.chainStatus !== undefined ||
      (localOrder?.meta as { chain?: { status?: number } } | undefined)?.chain?.status !== undefined;
    const needsChain = isChainOrdersEnabled() && !isVisualTestMode() && hasChainMarker;
    let chainOrder: ChainOrder | null = null;
    if (needsChain) {
      chainOrder = chainOrders.find((order) => order.orderId === id) || null;
      if (!chainOrder) {
        try {
          chainOrder = await fetchOrSyncChainOrder(id, digest);
        } catch (e) {
          setChainToast(formatErrorMessage(e, "链上订单加载失败，请检查链上配置"));
          setTimeout(() => setChainToast(null), 3000);
          return;
        }
      }
      if (!chainOrder) {
        setChainToast("未找到链上订单（已尝试服务端刷新）");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      const effectiveStatus = resolveChainStatus(chainOrder);
      if (effectiveStatus === 0) {
        setChainToast("链上订单未托管费用，无法接单");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      if (effectiveStatus >= 2) {
        setChainToast("押金已锁定，订单已被接走");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      if (chainOrder.companion !== address) {
        const ok = await runChainAction(`claim-${id}`, () => claimOrderOnChain(id), "已认领订单", id);
        if (!ok) return;
      }
      if (effectiveStatus === 1) {
        const ok = await runChainAction(`deposit-${id}`, () => lockDepositOnChain(id), "押金已锁定", id);
        if (!ok) return;
      }
    }
    const companionProfile = address ? loadGameProfile(address) : null;
    const profilePayload =
      companionProfile && (companionProfile.gameName || companionProfile.gameId)
        ? {
            gameName: companionProfile.gameName,
            gameId: companionProfile.gameId,
            updatedAt: companionProfile.updatedAt,
          }
        : null;
    await patchOrder(id, {
      status: needsChain ? undefined : "已接单",
      depositPaid: true,
      driver: {
        name: "陪练·刘师傅",
        car: "白色新能源汽车",
        eta: "2.7公里 · 5分钟",
        plate: "苏RF M9358",
        phone: "138****0000",
        price: 63,
      },
      companionAddress: address,
      meta: {
        companionProfile: profilePayload,
      },
    });
    await refreshOrders(true);
    await refreshMyOrders(true);
    setPendingScrollToAccepted(true);
    setChainToast("接单成功，已移至「我已接的订单」");
    setTimeout(() => setChainToast(null), 3000);
  };

  const confirmDepositAccept = (orderId: string, depositLabel?: string) => {
    openConfirm({
      title: "确认付押金并接单？",
      description: depositLabel
        ? `将锁定押金 ${depositLabel} 并认领订单。押金锁定后如需取消请走争议/客服流程。`
        : "将锁定押金并认领订单。押金锁定后如需取消请走争议/客服流程。",
      confirmLabel: "确认接单",
      action: async () => {
        await accept(orderId);
      },
    });
  };

  const confirmMarkCompleted = (orderId: string) => {
    openConfirm({
      title: "确认服务已完成？",
      description: "确认后将进入结算/争议期，如有问题请先发起争议。",
      confirmLabel: "确认完成",
      action: async () => {
        await runChainAction(
          `complete-${orderId}`,
          () => markCompletedOnChain(orderId),
          "已确认完成",
          orderId
        );
      },
    });
  };

  const confirmEndService = (orderId: string) => {
    openConfirm({
      title: "确认结束服务？",
      description: "结束后等待用户确认完成，若有争议可发起争议处理。",
      confirmLabel: "结束服务",
      action: async () => {
        await markCompanionServiceEnded(orderId, true);
      },
    });
  };

  const cancel = async (id: string) => {
    const hasChain = chainOrders.some((order) => order.orderId === id);
    const isChainOrder = isChainOrdersEnabled() && hasChain;
    if (isChainOrder) {
      const chainOrder = chainOrders.find((order) => order.orderId === id) || null;
      const effectiveStatus = chainOrder ? resolveChainStatus(chainOrder) : undefined;
      if (typeof effectiveStatus === "number" && effectiveStatus >= 2) {
        setChainToast("押金已锁定，无法取消，请走争议/客服处理");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      const ok = await runChainAction(
        `cancel-${id}`,
        () => cancelOrderOnChain(id),
        "订单已取消，托管费已退回",
        id
      );
      if (!ok) return;
      return;
    }
    await patchOrder(id, {
      status: "取消",
      driver: undefined,
      time: new Date().toISOString(),
      userAddress: getCurrentAddress(),
    });
    await deleteOrder(id, getCurrentAddress());
    await refreshOrders();
  };

  const complete = async (id: string) => {
    await patchOrder(id, {
      status: "已完成",
      driver: undefined,
      time: new Date().toISOString(),
      userAddress: getCurrentAddress(),
    });
    await refreshOrders();
  };

  const clearAll = async () => {
    if (!orders.length) return;
    for (const order of orders) {
      if (order.chainDigest) continue;
      await deleteOrder(order.id, getCurrentAddress());
    }
    await refreshOrders();
  };

  const statusLabel = (status: number) => {
    switch (status) {
      case 0:
        return "已创建";
      case 1:
        return "已托管费用";
      case 2:
        return "押金已锁定";
      case 3:
        return "已完成待结算";
      case 4:
        return "争议中";
      case 5:
        return "已结算";
      case 6:
        return "已取消";
      default:
        return `未知状态(${status})`;
    }
  };

  const formatAmount = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return (num / 100).toFixed(2);
  };

  const formatTime = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "-";
    return new Date(num).toLocaleString();
  };

  const formatRemaining = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "-";
    const diff = num - Date.now();
    if (diff <= 0) return "已到期";
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins} 分钟`;
    const hours = Math.floor(mins / 60);
    const remain = mins % 60;
    return remain ? `${hours} 小时 ${remain} 分钟` : `${hours} 小时`;
  };

  const disputeOrderId = disputeOpen?.orderId || "";
  const disputeEvidence = disputeOpen?.evidence || "";
  const disputeOrder = useMemo(
    () => chainOrders.find((o) => o.orderId === disputeOrderId) || null,
    [chainOrders, disputeOrderId]
  );
  const disputeDeadline = disputeOrder ? resolveDisputeDeadline(disputeOrder) : 0;

  const hydrateOrderMeta = useCallback(
    async (orderId: string, options: { toastOnError?: boolean } = {}) => {
      if (!orderId || orderMetaLoading[orderId]) return;
      setOrderMetaLoading((prev) => ({ ...prev, [orderId]: true }));
      try {
        const detail = await fetchOrderDetail(orderId);
        if (detail?.meta && typeof detail.meta === "object") {
          setOrderMetaOverrides((prev) => ({ ...prev, [orderId]: detail.meta as Record<string, unknown> }));
        }
        return detail;
      } catch (error) {
        if (options.toastOnError) {
          setChainToast(formatErrorMessage(error, "加载用户信息失败"));
          setTimeout(() => setChainToast(null), 3000);
        }
      } finally {
        setOrderMetaLoading((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    },
    [orderMetaLoading]
  );

  const orderMetaById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const order of orders) {
      if (order.meta && typeof order.meta === "object") {
        map.set(order.id, order.meta as Record<string, unknown>);
      }
    }
    Object.entries(orderMetaOverrides).forEach(([orderId, meta]) => {
      if (meta && typeof meta === "object") {
        map.set(orderId, meta);
      }
    });
    return map;
  }, [orders, orderMetaOverrides]);

  const copyGameProfile = async (orderId: string, profile: { gameName?: string; gameId?: string }) => {
    const text = [profile.gameName ? `游戏名 ${profile.gameName}` : "", profile.gameId ? `ID ${profile.gameId}` : ""]
      .filter(Boolean)
      .join(" · ");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setChainToast("已复制游戏名/ID");
      setCopiedOrderId(orderId);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      try {
        document.execCommand("copy");
        setChainToast("已复制游戏名/ID");
        setCopiedOrderId(orderId);
      } catch {
        setChainToast("复制失败，请手动复制");
      } finally {
        document.body.removeChild(input);
      }
    } finally {
      setTimeout(() => setChainToast(null), 3000);
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

  const shortAddr = (addr: string) => {
    if (!addr) return "-";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };
  const shortDigest = (digest?: string | null) => {
    if (!digest) return "";
    if (digest.length <= 12) return digest;
    return `${digest.slice(0, 6)}...${digest.slice(-4)}`;
  };
  const renderActionLabel = (key: string, label: string) => {
    if (chainAction !== key) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3.5 w-3.5 spin" />
        处理中
      </span>
    );
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
      setChainToast(formatErrorMessage(e, "操作失败"));
      return false;
    } finally {
      setChainAction(null);
      setTimeout(() => setChainToast(null), 3000);
    }
  };

  const markCompanionServiceEnded = async (orderId: string, isChain: boolean) => {
    const address = getCurrentAddress();
    if (!address) {
      setChainToast("请先登录账号再结束服务");
      setTimeout(() => setChainToast(null), 3000);
      return;
    }
    const endedAt = Date.now();
    try {
      await patchOrder(orderId, {
        companionAddress: address,
        status: isChain ? undefined : "待结算",
        meta: { companionEndedAt: endedAt },
      });
      setOrderMetaOverrides((prev) => ({
        ...prev,
        [orderId]: { ...(prev[orderId] || {}), companionEndedAt: endedAt },
      }));
      if (!isChain) {
        await refreshMyOrders(true);
      }
      setChainToast(isChain ? "已标记服务完成，等待用户确认" : "已结束服务，等待结算");
    } catch (error) {
      setChainToast(formatErrorMessage(error, "结束服务失败"));
    } finally {
      setTimeout(() => setChainToast(null), 3000);
    }
  };

  let defaultCompanion = "";
  if (isChainOrdersEnabled()) {
    try {
      defaultCompanion = getDefaultCompanionAddress();
    } catch {
      defaultCompanion = "";
    }
  }
  const visibleChainOrders = chainOrders.filter((order) => {
    const effectiveStatus = resolveChainStatus(order);
    if (effectiveStatus === 6) return false;
    if (!defaultCompanion) return true;
    return order.companion === defaultCompanion;
  });

  const visibleOrders = orders.filter((o) => !o.status.includes("完成") && !o.status.includes("取消"));

  if (guardianState === "checking") {
    return (
      <div className="dl-main">
        <StateBlock tone="loading" size="compact" title="权限校验中" description="正在确认访问权限" />
      </div>
    );
  }

  if (!canAccessShowcase) {
    return (
      <div className="dl-main">
        <StateBlock tone="empty" size="compact" title="暂无权限访问" description="请使用陪练账号访问接单大厅" />
      </div>
    );
  }

  return (
    <div className="dl-shell">
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">接单大厅</span>
          {isChainOrdersEnabled() ? <span className="dl-chip">系统 + 客户端</span> : <span className="dl-chip">客户端缓存</span>}
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Activity size={16} />
          </span>
          {isChainOrdersEnabled() && (
            <button
              className="dl-icon-circle"
              onClick={refreshAll}
              aria-label="刷新订单"
              disabled={chainLoading}
              title={chainLoading ? "刷新中..." : "刷新订单"}
            >
              {chainLoading ? <Loader2 className="h-4 w-4 spin" /> : <span style={{ fontSize: 12 }}>链</span>}
            </button>
          )}
          <button
            className="dl-icon-circle"
            onClick={() => refreshOrders(true)}
            aria-label="刷新公开订单"
            disabled={publicLoading}
            title={publicLoading ? "刷新中..." : "刷新公开订单"}
          >
            {publicLoading ? <Loader2 className="h-4 w-4 spin" /> : <span style={{ fontSize: 12 }}>公</span>}
          </button>
          <button className="dl-icon-circle" onClick={clearAll} aria-label="清空订单">
            <span style={{ fontSize: 12 }}>清</span>
          </button>
        </div>
      </header>

      {isChainOrdersEnabled() && (
        <div className="space-y-3 mb-6">
          <div className="dl-card text-xs text-gray-500">
            <div>未接单的公开链单（{chainAddress ? "已登录" : "未登录"}）</div>
            <div className="mt-1">上次刷新：{chainUpdatedAt ? new Date(chainUpdatedAt).toLocaleTimeString() : "-"}</div>
            {chainLoading && <div className="mt-1 text-amber-600">加载中…</div>}
            {chainError && <div className="mt-1 text-rose-500">{chainError}</div>}
            {chainToast && <div className="mt-1 text-emerald-600">{chainToast}</div>}
            {showOrderSourceWarning && (
              <div className="mt-1 text-rose-500">
                订单来源配置为 local，公开订单不会从服务端拉取，请改为 server。
              </div>
            )}
          </div>
          {visibleChainOrders.length === 0 ? (
            <StateBlock
              tone={chainLoading ? "loading" : chainError ? "danger" : "empty"}
              title={chainLoading ? "正在同步链上订单" : chainError ? "链上订单加载失败" : "暂时没有可接订单"}
              description={chainLoading ? "索引刷新中，请稍等片刻" : chainError || "点击刷新获取最新订单"}
              actions={
                chainLoading ? null : (
                  <button className="dl-tab-btn" onClick={refreshAll} disabled={chainLoading}>
                    刷新订单
                  </button>
                )
              }
            />
          ) : (
            <div className="space-y-3 motion-stack">
                {visibleChainOrders.map((o) => {
                const isUser = chainAddress && o.user === chainAddress;
                const isCompanion = chainAddress && o.companion === chainAddress;
                const now = Date.now();
                const deadline = resolveDisputeDeadline(o);
                const effectiveStatus = resolveChainStatus(o);
                const hasDeadline = Number.isFinite(deadline) && deadline > 0;
                const inDisputeWindow = hasDeadline && now <= deadline;
                const canDispute = effectiveStatus === 3 && inDisputeWindow;
                const canFinalize = effectiveStatus === 3 && (isUser ? true : hasDeadline && !inDisputeWindow);
                const meta = orderMetaById.get(o.orderId) || null;
                const gameProfile = (meta?.gameProfile || null) as { gameName?: string; gameId?: string } | null;
                const companionEndedAt = (meta as { companionEndedAt?: number | string } | null)?.companionEndedAt;
                const companionEnded = Boolean(companionEndedAt);
                const metaLoading = Boolean(orderMetaLoading[o.orderId]);
                  return (
                    <MotionCard key={`chain-${o.orderId}`} className="dl-card" style={{ padding: 14 }}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">订单 #{o.orderId}</div>
                      <div className="text-sm font-bold text-amber-600">¥{formatAmount(o.serviceFee)}</div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      用户 {shortAddr(o.user)} · 陪玩 {shortAddr(o.companion)}
                    </div>
                    {isCompanion && effectiveStatus >= 2 && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-emerald-700">
                        <span>
                          {gameProfile?.gameName && gameProfile?.gameId
                            ? `游戏名 ${gameProfile.gameName} · ID ${gameProfile.gameId}`
                            : "用户未填写游戏名/ID"}
                        </span>
                        <div className="flex items-center gap-2">
                          {gameProfile?.gameName && gameProfile?.gameId ? (
                            <>
                              {copiedOrderId === o.orderId && (
                                <span className="text-[11px] text-emerald-600" aria-live="polite">
                                  已复制
                                </span>
                              )}
                              <button
                                type="button"
                                className="dl-tab-btn"
                                style={{
                                  padding: "4px 10px",
                                  borderColor: "#34d399",
                                  background: "#ecfdf5",
                                  color: "#059669",
                                }}
                                onClick={() => copyGameProfile(o.orderId, gameProfile)}
                              >
                                复制
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="dl-tab-btn"
                              style={{
                                padding: "4px 10px",
                                borderColor: "#fde68a",
                                background: "#fffbeb",
                                color: "#b45309",
                              }}
                              onClick={() => hydrateOrderMeta(o.orderId, { toastOnError: true })}
                              disabled={metaLoading}
                            >
                              {metaLoading ? "加载中..." : "加载用户信息"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      状态：{statusLabel(effectiveStatus)} · 押金 ¥{formatAmount(o.deposit)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      创建时间：{formatTime(o.createdAt)} · 争议截止：{formatTime(String(deadline || 0))}
                    </div>
                    {effectiveStatus === 3 && (
                      <div className="mt-1 text-xs text-amber-700">
                        争议剩余：{formatRemaining(String(deadline || 0))}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {isUser && effectiveStatus === 0 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `pay-${o.orderId}`}
                          onClick={() =>
                            runChainAction(
                              `pay-${o.orderId}`,
                              () => payServiceFeeOnChain(o.orderId),
                              "撮合费已提交",
                              o.orderId
                            )
                          }
                        >
                          {renderActionLabel(`pay-${o.orderId}`, "支付撮合费")}
                        </button>
                      )}
                      {isUser && (effectiveStatus === 0 || effectiveStatus === 1) && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `cancel-${o.orderId}`}
                          onClick={() =>
                            runChainAction(
                              `cancel-${o.orderId}`,
                              () => cancelOrderOnChain(o.orderId),
                              "订单已取消",
                              o.orderId
                            )
                          }
                        >
                          {renderActionLabel(`cancel-${o.orderId}`, "取消订单")}
                        </button>
                      )}
                      {isCompanion && effectiveStatus === 1 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `deposit-${o.orderId}`}
                          onClick={async () => {
                            openConfirm({
                              title: "确认付押金并接单？",
                              description: "押金锁定后如需取消请走争议/客服流程。",
                              confirmLabel: "确认接单",
                              action: async () => {
                                if (!orderMetaById.get(o.orderId)?.gameProfile) {
                                  await hydrateOrderMeta(o.orderId);
                                }
                                const ok = await runChainAction(
                                  `deposit-${o.orderId}`,
                                  () => lockDepositOnChain(o.orderId),
                                  "押金已锁定",
                                  o.orderId
                                );
                                if (!ok) return;
                                try {
                                  const companionProfile = chainAddress ? loadGameProfile(chainAddress) : null;
                                  const profilePayload =
                                    companionProfile && (companionProfile.gameName || companionProfile.gameId)
                                      ? {
                                          gameName: companionProfile.gameName,
                                          gameId: companionProfile.gameId,
                                          updatedAt: companionProfile.updatedAt,
                                        }
                                      : null;
                                  if (chainAddress) {
                                    await patchOrder(o.orderId, {
                                      companionAddress: chainAddress,
                                      depositPaid: true,
                                      meta: {
                                        companionProfile: profilePayload,
                                      },
                                    });
                                    await refreshMyOrders(true);
                                    setPendingScrollToAccepted(true);
                                  }
                                } catch (error) {
                                  setChainToast(formatErrorMessage(error, "接单信息同步失败"));
                                }
                                await hydrateOrderMeta(o.orderId, { toastOnError: true });
                                try {
                                  const creditBody = JSON.stringify({ orderId: o.orderId, address: chainAddress });
                                  const auth = await signAuthIntent(`mantou:credit:${o.orderId}`, creditBody);
                                  const res = await fetch("/api/mantou/credit", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-auth-address": auth.address,
                                      "x-auth-signature": auth.signature,
                                      "x-auth-timestamp": String(auth.timestamp),
                                      "x-auth-nonce": auth.nonce,
                                      "x-auth-body-sha256": auth.bodyHash,
                                    },
                                    body: creditBody,
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (res.ok) {
                                    if (!data?.duplicated) {
                                      setChainToast("已自动转换为馒头");
                                    }
                                  } else {
                                    setChainToast(data?.error || "馒头转换失败");
                                  }
                                } catch (error) {
                                  setChainToast(formatErrorMessage(error, "馒头转换失败"));
                                } finally {
                                  setTimeout(() => setChainToast(null), 3000);
                                }
                              },
                            });
                          }}
                        >
                          {renderActionLabel(`deposit-${o.orderId}`, "付押金接单")}
                        </button>
                      )}
                      {isCompanion && effectiveStatus === 2 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={companionEnded}
                          onClick={() => confirmEndService(o.orderId)}
                        >
                          {companionEnded ? "已结束服务" : "结束服务"}
                        </button>
                      )}
                      {isUser && effectiveStatus === 2 && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `complete-${o.orderId}`}
                          onClick={() => {
                            confirmMarkCompleted(o.orderId);
                          }}
                        >
                          {renderActionLabel(`complete-${o.orderId}`, "确认完成")}
                        </button>
                      )}
                      {(isUser || isCompanion) && canDispute && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `dispute-${o.orderId}`}
                          onClick={() => setDisputeOpen({ orderId: o.orderId, evidence: "" })}
                        >
                          {renderActionLabel(`dispute-${o.orderId}`, "发起争议")}
                        </button>
                      )}
                      {(isUser || isCompanion) && canFinalize && (
                        <button
                          className="dl-tab-btn"
                          style={{ padding: "8px 10px" }}
                          disabled={chainAction === `finalize-${o.orderId}`}
                        onClick={() => {
                            if (isUser && inDisputeWindow) {
                              const deadlineText = hasDeadline && deadline ? new Date(deadline).toLocaleString() : "";
                              openConfirm({
                                title: "确认放弃争议期并立即结算？",
                                description: deadlineText ? `争议截止：${deadlineText}` : "争议期内放弃争议将立即结算。",
                                confirmLabel: "确认结算",
                                action: async () => {
                                  await runChainAction(
                                    `finalize-${o.orderId}`,
                                    () => finalizeNoDisputeOnChain(o.orderId),
                                    "订单已结算",
                                    o.orderId
                                  );
                                },
                              });
                              return;
                            }
                            runChainAction(
                              `finalize-${o.orderId}`,
                              () => finalizeNoDisputeOnChain(o.orderId),
                              "订单已结算",
                              o.orderId
                            );
                          }}
                        >
                          {renderActionLabel(`finalize-${o.orderId}`, "无争议结算")}
                        </button>
                      )}
                    </div>
                    </MotionCard>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {myAcceptedOrders.length > 0 || myOrdersLoading ? (
        <div ref={acceptedRef} className="space-y-3 mb-6 motion-stack">
          <div className="dl-card text-xs text-gray-500">
            <div>我已接的订单</div>
            {myOrdersLoading && <div className="mt-1 text-amber-600">加载中…</div>}
          </div>
          {myAcceptedOrders.map((order) => {
            const gameProfile = (order.meta?.gameProfile || null) as { gameName?: string; gameId?: string } | null;
            const companionEndedAt = (order.meta as { companionEndedAt?: number | string } | undefined)
              ?.companionEndedAt;
            const companionEnded = Boolean(companionEndedAt);
            return (
              <MotionCard key={`accepted-${order.id}`} className="dl-card" style={{ padding: 14 }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{order.item}</div>
                  <div className="text-sm font-bold text-amber-600">¥{order.amount}</div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  状态：{order.status} · 订单号：{order.id}
                </div>
                {order.userAddress ? (
                  <div className="mt-2 text-xs text-gray-500">用户地址：{shortAddr(order.userAddress)}</div>
                ) : null}
                <div className="mt-2 text-xs text-gray-500">{new Date(order.time).toLocaleString()}</div>
                {gameProfile?.gameName || gameProfile?.gameId ? (
                  <div className="mt-2 text-xs text-emerald-700">
                    游戏名 {gameProfile?.gameName || "-"} · ID {gameProfile?.gameId || "-"}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "6px 10px" }}
                    disabled={companionEnded}
                    onClick={() => markCompanionServiceEnded(order.id, false)}
                  >
                    {companionEnded ? "已结束服务" : "结束服务"}
                  </button>
                </div>
              </MotionCard>
            );
          })}
        </div>
      ) : null}

      {visibleOrders.length === 0 ? (
        <StateBlock
          tone="empty"
          title="暂无呼叫记录"
          description="去首页/安排页选择服务吧"
          actions={
            <a className="dl-tab-btn" href="/schedule">
              立即下单
            </a>
          }
        />
      ) : (
        <div className="space-y-3 motion-stack">
          {visibleOrders.map((o, idx) =>
            o.driver ? (
              <MotionCard key={`${o.id}-${idx}`} className="dl-card" style={{ padding: 14, borderColor: "#fed7aa", background: "#fff7ed" }}>
                {(() => {
                  const profile = (o.meta?.gameProfile || null) as { gameName?: string; gameId?: string } | null;
                  const hasProfile = Boolean(profile?.gameName || profile?.gameId);
                  return (
                    <>
                <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold">
                  <Car size={16} />
                  陪练已接单
                </div>
                {hasProfile ? (
                  <div className="mt-2 text-sm text-gray-900">
                    <div className="font-bold">下单人游戏设置</div>
                    <div className="text-xs text-gray-500">
                      游戏名 {profile?.gameName || "-"} · ID {profile?.gameId || "-"}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-6 text-sm text-gray-900">
                    <div>
                      <div className="font-bold">{o.driver.name}</div>
                      <div className="text-xs text-gray-500">{o.driver.car}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-emerald-600">{o.driver.eta}</div>
                      {o.driver.price && <div className="text-xs text-gray-500">一口价 {o.driver.price} 钻石</div>}
                    </div>
                  </div>
                )}
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  <MapPin size={14} />
                  服务信息
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-emerald-600 font-semibold mr-2">押金已付</span>
                  {o.playerPaid ? (
                    <span className="text-emerald-700 font-semibold">陪练费已付，进行中</span>
                  ) : (
                    <span className="text-red-500 font-semibold">等待用户支付陪练费</span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-10 text-sm">
                  <div>
                    <div className="text-gray-900">{o.item}</div>
                    <div className="text-xs text-gray-500">订单号：{o.id}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(o.time).toLocaleString()}</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => cancel(o.id)}>
                    取消订单
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => complete(o.id)}>
                    完成
                  </button>
                  <button className="dl-tab-btn accent" style={{ padding: "8px 10px" }}>
                    联系陪练
                  </button>
                </div>
                    </>
                  );
                })()}
              </MotionCard>
            ) : (
              <MotionCard key={`${o.id}-${idx}`} className="dl-card" style={{ padding: 14 }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{o.item}</div>
                  <div className="text-sm font-bold text-amber-600">¥{o.amount}</div>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  <Clock3 size={14} />
                  <span>{new Date(o.time).toLocaleString()}</span>
                  <span className="text-amber-600 font-semibold">等待支付押金后接单</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  状态：{o.status} · 撮合费{typeof o.serviceFee === "number" ? ` ¥${o.serviceFee.toFixed(2)}` : "已付"}
                </div>
                {o.userAddress && o.userAddress === chainAddress ? (
                  <div className="mt-2 text-xs text-rose-500">不能接自己发的单</div>
                ) : (
                  <div className="mt-2 text-xs text-orange-600">需先付押金再接单</div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    className="dl-tab-btn"
                    style={{ padding: "8px 10px" }}
                    onClick={() =>
                      confirmDepositAccept(o.id, typeof o.deposit === "number" ? `¥${formatAmount(String(o.deposit))}` : undefined)
                    }
                    disabled={Boolean(o.userAddress && o.userAddress === chainAddress)}
                    title={o.userAddress && o.userAddress === chainAddress ? "不能接自己发的单" : undefined}
                  >
                    付押金并接单
                  </button>
                  <button className="dl-tab-btn" style={{ padding: "8px 10px" }} onClick={() => cancel(o.id)}>
                    取消
                  </button>
                </div>
              </MotionCard>
            )
          )}
        </div>
      )}
        <div className="mt-4 flex justify-center" ref={loadMoreRef}>
          {publicCursor ? (
          <button
            className="dl-tab-btn"
            style={{ padding: "8px 12px" }}
            onClick={loadMoreOrders}
            disabled={publicLoading}
          >
            {publicLoading ? "加载中..." : "加载更多"}
          </button>
        ) : (
          <div className="text-xs text-gray-400">没有更多了</div>
        )}
      </div>
      <div className="mt-3 flex justify-center">
        <button className="dl-tab-btn" style={{ padding: "6px 12px" }} onClick={() => setDebugOpen(true)}>
          链上调试信息
        </button>
      </div>
      {disputeOpen && (
        <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label="发起争议">
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">发起争议</div>
                <div className="ride-modal-sub">请填写争议说明或证据哈希（可留空）</div>
              </div>
              <div className="ride-modal-amount">#{disputeOpen.orderId}</div>
            </div>
            <div className="ride-modal-body">
              <textarea
                className="dl-textarea"
                placeholder="请输入争议说明或证据哈希"
                value={disputeEvidence}
                onChange={(e) => setDisputeOpen({ orderId: disputeOpen.orderId, evidence: e.target.value })}
              />
              {disputeOrder?.disputeDeadline ? (
                <div className="text-xs text-gray-500">
                  争议截止：{formatTime(String(disputeDeadline || 0))}（剩余 {formatRemaining(String(disputeDeadline || 0))}）
                </div>
              ) : null}
            </div>
            <div className="ride-modal-actions">
              <button className="dl-tab-btn" onClick={() => setDisputeOpen(null)}>
                取消
              </button>
              <button
                className="dl-tab-btn primary"
                onClick={() => {
                  const orderId = disputeOpen.orderId;
                  const evidence = disputeOpen.evidence.trim();
                  setDisputeOpen(null);
                  runChainAction(
                    `dispute-${orderId}`,
                    () => raiseDisputeOnChain(orderId, evidence),
                    "已提交争议",
                    orderId
                  );
                }}
              >
                提交争议
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
      <div className="text-xs text-gray-500 mt-6">
        订单来自服务端；可执行押金/结算流程。
      </div>
    </div>
  );
}
