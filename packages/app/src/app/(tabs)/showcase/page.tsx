"use client";
import { t } from "@/lib/i18n/t";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { type LocalOrder } from "@/lib/services/order-store";
import {
  chainStatusLabel as statusLabel,
  formatChainAmount as formatAmount,
  shortDigest,
} from "./showcase-utils";
import {
  deleteOrder,
  fetchOrderDetail,
  fetchOrdersWithMeta,
  fetchPublicOrders,
  fetchPublicOrdersWithMeta,
  patchOrder,
  syncChainOrder,
} from "@/lib/services/order-service";
import { Activity, Loader2 } from "lucide-react";
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
import { StateBlock } from "@/app/components/state-block";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { extractErrorMessage, formatErrorMessage } from "@/lib/shared/error-utils";
import { useGuardianStatus } from "@/app/components/guardian-role";
import { GAME_PROFILE_KEY } from "@/lib/shared/constants";
import { getLocalChainStatus, mergeChainStatus } from "@/lib/chain/chain-status";
import { ChainOrderCard } from "./chain-order-card";
import { AcceptedOrderCard } from "./accepted-order-card";
import { PublicOrderCard } from "./public-order-card";
import { DisputeModal } from "./dispute-modal";

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
  const [disputeOpen, setDisputeOpen] = useState<{ orderId: string; evidence: string } | null>(
    null
  );
  const [debugOpen, setDebugOpen] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [publicCursor, setPublicCursor] = useState<string | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [myOrders, setMyOrders] = useState<LocalOrder[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);
  const [orderMetaOverrides, setOrderMetaOverrides] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [orderMetaLoading, setOrderMetaLoading] = useState<Record<string, boolean>>({});
  const [pendingScrollToAccepted, setPendingScrollToAccepted] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const acceptedRef = useRef<HTMLDivElement | null>(null);
  const ORDER_SOURCE =
    process.env.NEXT_PUBLIC_ORDER_SOURCE ||
    (process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1" ? "server" : "local");
  const showOrderSourceWarning = isChainOrdersEnabled() && ORDER_SOURCE !== "server";
  const myAcceptedOrders = useMemo(() => {
    const address = chainAddress || getCurrentAddress();
    return myOrders.filter((order) => {
      if (!address || !order.companionAddress) return false;
      if (order.companionAddress !== address) return false;
      return (
        !order.status.includes(t("tabs.showcase.i119")) &&
        !order.status.includes(t("tabs.showcase.i120"))
      );
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
      if (
        local !== undefined &&
        Number.isFinite(local) &&
        local > 0 &&
        Number.isFinite(remote) &&
        remote > 0
      ) {
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

  const refreshOrders = useCallback(
    async (force = false) => {
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
    },
    [canAccessShowcase]
  );

  const refreshMyOrders = useCallback(
    async (force = false) => {
      if (!canAccessShowcase) return true;
      setMyOrdersLoading(true);
      try {
        const result = await fetchOrdersWithMeta({ force });
        setMyOrders(result.items);
        return !result.meta.error;
      } finally {
        setMyOrdersLoading(false);
      }
    },
    [canAccessShowcase]
  );

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
  }, [canAccessShowcase, refreshOrders]);

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
      setChainError(formatErrorMessage(e, t("showcase.001")));
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
      setChainToast(formatErrorMessage(error, t("showcase.002")));
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
      const errorMsg = formatErrorMessage(error, t("showcase.003"));
      // 如果是 chain order not found 错误，提供更友好的提示
      if (errorMsg.includes("not found") || errorMsg.includes(t("tabs.showcase.i121"))) {
        throw new Error("链上订单暂未索引完成，请稍后再试（通常需要等待3-10秒）");
      }
      throw new Error(errorMsg);
    }
    throw new Error("链上订单未找到，可能索引延迟较大，请稍后重试");
  };

  const accept = async (id: string) => {
    const address = getCurrentAddress();
    if (!address) {
      setChainToast("auth.login_before_accept");
      setTimeout(() => setChainToast(null), 3000);
      return;
    }
    const localOrder = orders.find((order) => order.id === id);
    const digest =
      localOrder?.chainDigest ||
      (localOrder?.meta as { lastChainDigest?: string; chainDigest?: string } | undefined)
        ?.lastChainDigest ||
      (localOrder?.meta as { chainDigest?: string } | undefined)?.chainDigest;
    const hasChainMarker =
      Boolean(localOrder?.chainDigest) ||
      localOrder?.chainStatus !== undefined ||
      (localOrder?.meta as { chain?: { status?: number } } | undefined)?.chain?.status !==
        undefined;
    const needsChain = isChainOrdersEnabled() && !isVisualTestMode() && hasChainMarker;
    let chainOrder: ChainOrder | null = null;
    if (needsChain) {
      chainOrder = chainOrders.find((order) => order.orderId === id) || null;
      if (!chainOrder) {
        try {
          chainOrder = await fetchOrSyncChainOrder(id, digest);
        } catch (e) {
          setChainToast(formatErrorMessage(e, t("showcase.004")));
          setTimeout(() => setChainToast(null), 3000);
          return;
        }
      }
      if (!chainOrder) {
        setChainToast("chain.order_not_found");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      const effectiveStatus = resolveChainStatus(chainOrder);
      if (effectiveStatus === 0) {
        setChainToast("order.no_escrow_fee");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      if (effectiveStatus >= 2) {
        setChainToast("order.deposit_locked_taken");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      if (chainOrder.companion !== address) {
        const ok = await runChainAction(
          `claim-${id}`,
          () => claimOrderOnChain(id),
          t("tabs.showcase.i122"),
          id
        );
        if (!ok) return;
      }
      if (effectiveStatus === 1) {
        const ok = await runChainAction(
          `deposit-${id}`,
          () => lockDepositOnChain(id),
          t("tabs.showcase.i123"),
          id
        );
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
      status: needsChain ? undefined : t("showcase.005"),
      depositPaid: true,
      driver: {
        name: t("ui.showcase.695"),
        car: t("ui.showcase.638"),
        eta: t("ui.showcase.507"),
        plate: t("ui.showcase.649"),
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
    setChainToast("order.accepted_moved");
    setTimeout(() => setChainToast(null), 3000);
  };

  const confirmDepositAccept = async (orderId: string, depositLabel?: string) => {
    // Fetch customer tags for the order's user
    const order = orders.find((o) => o.id === orderId);
    let tagWarning = "";
    if (order?.userAddress) {
      try {
        const res = await fetch(`/api/companion/customer-tags?userAddress=${order.userAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data.tagCount > 0) {
            const tagLabels = data.tags.map((t: { tag: string; note?: string }) => {
              const label =
                t.tag === "difficult"
                  ? "⚠️ 事多/难伺候"
                  : t.tag === "slow_pay"
                    ? "⏳ 拖延付款"
                    : t.tag === "rude"
                      ? "😤 态度差"
                      : t.tag === "no_show"
                        ? "👻 放鸽子"
                        : t.tag === "frequent_dispute"
                          ? "⚖️ 频繁争议"
                          : t.tag === "vip_treat"
                            ? "👑 VIP 优待"
                            : `📌 ${t.note || "其他"}`;
              return label;
            });
            const severity =
              data.maxSeverity >= 3 ? "🚨 高危客户" : data.maxSeverity >= 2 ? "⚠️ 注意" : "💡 提示";
            tagWarning = `\n\n${severity}：该老板有 ${data.tagCount} 条内部标记：\n${tagLabels.join("、")}`;
          }
        }
      } catch {
        /* ignore */
      }
    }

    openConfirm({
      title: t("tabs.showcase.i059"),
      description:
        (depositLabel
          ? `将锁定押金 ${depositLabel} 并认领订单。押金锁定后如需取消请走争议/客服流程。`
          : t("tabs.showcase.i124")) + tagWarning,
      confirmLabel: t("tabs.showcase.i060"),
      action: async () => {
        await accept(orderId);
      },
    });
  };

  const confirmMarkCompleted = (orderId: string) => {
    openConfirm({
      title: t("tabs.showcase.i061"),
      description: t("tabs.showcase.i062"),
      confirmLabel: t("tabs.showcase.i063"),
      action: async () => {
        await runChainAction(
          `complete-${orderId}`,
          () => markCompletedOnChain(orderId),
          t("ui.showcase.589"),
          orderId
        );
      },
    });
  };

  const confirmEndService = (orderId: string) => {
    openConfirm({
      title: t("tabs.showcase.i064"),
      description: t("tabs.showcase.i065"),
      confirmLabel: t("tabs.showcase.i066"),
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
        setChainToast("order.deposit_locked_no_cancel");
        setTimeout(() => setChainToast(null), 3000);
        return;
      }
      const ok = await runChainAction(
        `cancel-${id}`,
        () => cancelOrderOnChain(id),
        t("ui.showcase.657"),
        id
      );
      if (!ok) return;
      return;
    }
    await patchOrder(id, {
      status: t("ui.showcase.561"),
      driver: undefined,
      time: new Date().toISOString(),
      userAddress: getCurrentAddress(),
    });
    await deleteOrder(id, getCurrentAddress());
    await refreshOrders();
  };

  const complete = async (id: string) => {
    await patchOrder(id, {
      status: t("ui.showcase.577"),
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
          setOrderMetaOverrides((prev) => ({
            ...prev,
            [orderId]: detail.meta as Record<string, unknown>,
          }));
        }
        return detail;
      } catch (error) {
        if (options.toastOnError) {
          setChainToast(formatErrorMessage(error, t("showcase.013")));
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

  const copyGameProfile = async (
    orderId: string,
    profile: { gameName?: string; gameId?: string }
  ) => {
    const text = [
      profile.gameName ? `游戏名 ${profile.gameName}` : "",
      profile.gameId ? `ID ${profile.gameId}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setChainToast("clipboard.game_id_copied");
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
        setChainToast("clipboard.game_id_copied");
        setCopiedOrderId(orderId);
      } catch {
        setChainToast("clipboard.copy_failed_manual");
      } finally {
        document.body.removeChild(input);
      }
    } finally {
      setTimeout(() => setChainToast(null), 3000);
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
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
      setChainToast(formatErrorMessage(e, t("showcase.014")));
      return false;
    } finally {
      setChainAction(null);
      setTimeout(() => setChainToast(null), 3000);
    }
  };

  const markCompanionServiceEnded = async (orderId: string, isChain: boolean) => {
    const address = getCurrentAddress();
    if (!address) {
      setChainToast("auth.login_before_end");
      setTimeout(() => setChainToast(null), 3000);
      return;
    }
    const endedAt = Date.now();
    try {
      await patchOrder(orderId, {
        companionAddress: address,
        status: isChain ? undefined : t("showcase.015"),
        meta: { companionEndedAt: endedAt },
      });
      setOrderMetaOverrides((prev) => ({
        ...prev,
        [orderId]: { ...(prev[orderId] || {}), companionEndedAt: endedAt },
      }));
      if (!isChain) {
        await refreshMyOrders(true);
      }
      setChainToast(isChain ? t("tabs.showcase.i125") : t("showcase.016"));
    } catch (error) {
      setChainToast(formatErrorMessage(error, t("showcase.017")));
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

  const visibleOrders = orders.filter(
    (o) =>
      !o.status.includes(t("tabs.showcase.i126")) && !o.status.includes(t("tabs.showcase.i127"))
  );

  if (guardianState === "checking") {
    return (
      <div className="dl-main">
        <StateBlock
          tone="loading"
          size="compact"
          title={t("showcase.018")}
          description={t("showcase.019")}
        />
      </div>
    );
  }

  if (!canAccessShowcase) {
    return (
      <div className="dl-main">
        <StateBlock
          tone="empty"
          size="compact"
          title={t("showcase.020")}
          description={t("showcase.021")}
        />
      </div>
    );
  }

  return (
    <div className="dl-shell">
      <header className="dl-topbar">
        <div className="dl-time">
          <span className="dl-time-text">{t("ui.showcase.158")}</span>
          {isChainOrdersEnabled() ? (
            <span className="dl-chip">{t("ui.showcase.159")}</span>
          ) : (
            <span className="dl-chip">{t("ui.showcase.160")}</span>
          )}
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Activity size={16} />
          </span>
          {isChainOrdersEnabled() && (
            <button
              className="dl-icon-circle"
              onClick={refreshAll}
              aria-label={t("showcase.022")}
              disabled={chainLoading}
              title={chainLoading ? t("ui.showcase.548") : t("showcase.023")}
            >
              {chainLoading ? (
                <Loader2 className="h-4 w-4 spin" />
              ) : (
                <span style={{ fontSize: 12 }}>链</span>
              )}
            </button>
          )}
          <button
            className="dl-icon-circle"
            onClick={() => refreshOrders(true)}
            aria-label={t("showcase.024")}
            disabled={publicLoading}
            title={publicLoading ? t("ui.showcase.549") : t("showcase.025")}
          >
            {publicLoading ? (
              <Loader2 className="h-4 w-4 spin" />
            ) : (
              <span style={{ fontSize: 12 }}>公</span>
            )}
          </button>
          <button className="dl-icon-circle" onClick={clearAll} aria-label={t("showcase.026")}>
            <span style={{ fontSize: 12 }}>清</span>
          </button>
        </div>
      </header>

      {isChainOrdersEnabled() && (
        <div className="space-y-3 mb-6">
          <div className="dl-card text-xs text-gray-500">
            <div>未接单的公开链单（{chainAddress ? t("ui.showcase.586") : t("showcase.027")}）</div>
            <div className="mt-1">
              上次刷新：{chainUpdatedAt ? new Date(chainUpdatedAt).toLocaleTimeString() : "-"}
            </div>
            {chainLoading && <div className="mt-1 text-amber-600">{t("ui.showcase.161")}</div>}
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
              title={
                chainLoading
                  ? t("showcase.028")
                  : chainError
                    ? t("showcase.029")
                    : t("tabs.showcase.i128")
              }
              description={
                chainLoading ? t("tabs.showcase.i129") : chainError || t("tabs.showcase.i130")
              }
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
                const isUser = Boolean(chainAddress && o.user === chainAddress);
                const isCompanion = Boolean(chainAddress && o.companion === chainAddress);
                const now = Date.now();
                const deadline = resolveDisputeDeadline(o);
                const effectiveStatus = resolveChainStatus(o);
                const hasDeadline = Number.isFinite(deadline) && deadline > 0;
                const inDisputeWindow = hasDeadline && now <= deadline;
                const canDispute = effectiveStatus === 3 && inDisputeWindow;
                const canFinalize =
                  effectiveStatus === 3 && (isUser ? true : hasDeadline && !inDisputeWindow);
                const meta = orderMetaById.get(o.orderId) || null;
                const companionEndedAt = (meta as { companionEndedAt?: number | string } | null)
                  ?.companionEndedAt;
                const companionEnded = Boolean(companionEndedAt);
                const metaLoading = Boolean(orderMetaLoading[o.orderId]);
                return (
                  <ChainOrderCard
                    key={`chain-${o.orderId}`}
                    order={o}
                    chainAddress={chainAddress}
                    effectiveStatus={effectiveStatus}
                    deadline={deadline}
                    meta={meta}
                    metaLoading={metaLoading}
                    copiedOrderId={copiedOrderId}
                    chainAction={chainAction}
                    isUser={isUser}
                    isCompanion={isCompanion}
                    companionEnded={companionEnded}
                    canDispute={canDispute}
                    canFinalize={canFinalize}
                    inDisputeWindow={inDisputeWindow}
                    onAcceptDeposit={() => {
                      openConfirm({
                        title: t("tabs.showcase.i067"),
                        description: t("tabs.showcase.i068"),
                        confirmLabel: t("tabs.showcase.i069"),
                        action: async () => {
                          if (!orderMetaById.get(o.orderId)?.gameProfile) {
                            await hydrateOrderMeta(o.orderId);
                          }
                          const ok = await runChainAction(
                            `deposit-${o.orderId}`,
                            () => lockDepositOnChain(o.orderId),
                            t("tabs.showcase.i131"),
                            o.orderId
                          );
                          if (!ok) return;
                          try {
                            const companionProfile = chainAddress
                              ? loadGameProfile(chainAddress)
                              : null;
                            const profilePayload =
                              companionProfile &&
                              (companionProfile.gameName || companionProfile.gameId)
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
                            setChainToast(formatErrorMessage(error, t("showcase.033")));
                          }
                          await hydrateOrderMeta(o.orderId, { toastOnError: true });
                          try {
                            const creditBody = JSON.stringify({
                              orderId: o.orderId,
                              address: chainAddress,
                            });
                            const auth = await signAuthIntent(
                              `mantou:credit:${o.orderId}`,
                              creditBody
                            );
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
                                setChainToast("diamond.auto_converted");
                              }
                            } else {
                              setChainToast(data?.error || t("tabs.showcase.i132"));
                            }
                          } catch (error) {
                            setChainToast(formatErrorMessage(error, t("showcase.034")));
                          } finally {
                            setTimeout(() => setChainToast(null), 3000);
                          }
                        },
                      });
                    }}
                    onEndService={() => confirmEndService(o.orderId)}
                    onMarkCompleted={() => confirmMarkCompleted(o.orderId)}
                    onPay={() =>
                      runChainAction(
                        `pay-${o.orderId}`,
                        () => payServiceFeeOnChain(o.orderId),
                        t("ui.showcase.614"),
                        o.orderId
                      )
                    }
                    onCancel={() =>
                      runChainAction(
                        `cancel-${o.orderId}`,
                        () => cancelOrderOnChain(o.orderId),
                        t("ui.showcase.655"),
                        o.orderId
                      )
                    }
                    onDispute={() => setDisputeOpen({ orderId: o.orderId, evidence: "" })}
                    onFinalize={() => {
                      if (isUser && inDisputeWindow) {
                        const deadlineText =
                          hasDeadline && deadline ? new Date(deadline).toLocaleString() : "";
                        openConfirm({
                          title: t("tabs.showcase.i070"),
                          description: deadlineText
                            ? `争议截止：${deadlineText}`
                            : t("tabs.showcase.i134"),
                          confirmLabel: t("tabs.showcase.i071"),
                          action: async () => {
                            await runChainAction(
                              `finalize-${o.orderId}`,
                              () => finalizeNoDisputeOnChain(o.orderId),
                              t("ui.showcase.662"),
                              o.orderId
                            );
                          },
                        });
                        return;
                      }
                      runChainAction(
                        `finalize-${o.orderId}`,
                        () => finalizeNoDisputeOnChain(o.orderId),
                        t("ui.showcase.663"),
                        o.orderId
                      );
                    }}
                    onCopyGameProfile={(profile) => copyGameProfile(o.orderId, profile)}
                    onHydrateMeta={() => hydrateOrderMeta(o.orderId, { toastOnError: true })}
                    renderActionLabel={renderActionLabel}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {myAcceptedOrders.length > 0 || myOrdersLoading ? (
        <div ref={acceptedRef} className="space-y-3 mb-6 motion-stack">
          <div className="dl-card text-xs text-gray-500">
            <div>{t("ui.showcase.162")}</div>
            {myOrdersLoading && <div className="mt-1 text-amber-600">{t("ui.showcase.163")}</div>}
          </div>
          {myAcceptedOrders.map((order) => {
            const companionEndedAt = (
              order.meta as { companionEndedAt?: number | string } | undefined
            )?.companionEndedAt;
            return (
              <AcceptedOrderCard
                key={`accepted-${order.id}`}
                order={order}
                companionEnded={Boolean(companionEndedAt)}
                onEndService={(id) => markCompanionServiceEnded(id, false)}
              />
            );
          })}
        </div>
      ) : null}

      {visibleOrders.length === 0 ? (
        <StateBlock
          tone="empty"
          title={t("showcase.041")}
          description={t("showcase.042")}
          actions={
            <a className="dl-tab-btn" href="/schedule">
              立即下单
            </a>
          }
        />
      ) : (
        <div className="space-y-3 motion-stack">
          {visibleOrders.map((o, idx) => (
            <PublicOrderCard
              key={`${o.id}-${idx}`}
              order={o}
              chainAddress={chainAddress}
              onCancel={cancel}
              onComplete={complete}
              onConfirmDepositAccept={confirmDepositAccept}
            />
          ))}
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
            {publicLoading ? t("ui.showcase.552") : t("showcase.045")}
          </button>
        ) : (
          <div className="text-xs text-gray-400">{t("ui.showcase.171")}</div>
        )}
      </div>
      <div className="mt-3 flex justify-center">
        <button
          className="dl-tab-btn"
          style={{ padding: "6px 12px" }}
          onClick={() => setDebugOpen(true)}
        >
          链上调试信息
        </button>
      </div>
      {disputeOpen && (
        <DisputeModal
          disputeOpen={disputeOpen}
          disputeOrder={disputeOrder}
          disputeDeadline={disputeDeadline}
          onClose={() => setDisputeOpen(null)}
          onSubmit={(orderId, evidence) => {
            setDisputeOpen(null);
            runChainAction(
              `dispute-${orderId}`,
              () => raiseDisputeOnChain(orderId, evidence),
              t("ui.showcase.580"),
              orderId
            );
          }}
          onChangeEvidence={(evidence) =>
            setDisputeOpen({ orderId: disputeOpen.orderId, evidence })
          }
        />
      )}
      {debugOpen && (
        <div
          className="ride-modal-mask"
          role="dialog"
          aria-modal="true"
          aria-label={t("showcase.048")}
        >
          <div className="ride-modal">
            <div className="ride-modal-head">
              <div>
                <div className="ride-modal-title">{t("ui.showcase.174")}</div>
                <div className="ride-modal-sub">{t("ui.showcase.175")}</div>
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
      <div className="text-xs text-gray-500 mt-6">{t("ui.showcase.176")}</div>
    </div>
  );
}
