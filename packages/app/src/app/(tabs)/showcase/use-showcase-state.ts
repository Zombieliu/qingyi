import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/t";
import { type LocalOrder } from "@/lib/services/order-store";
import { shortDigest } from "./showcase-utils";
import { useMantouBalance } from "@/lib/atoms/mantou-atom";
import {
  deleteOrder,
  fetchOrderDetail,
  fetchOrdersWithMeta,
  fetchPublicOrders,
  fetchPublicOrdersWithMeta,
  patchOrder,
  syncChainOrder,
} from "@/lib/services/order-service";
import {
  fetchDuoOrders,
  claimDuoSlot as claimDuoSlotApi,
  releaseDuoSlot as releaseDuoSlotApi,
} from "@/lib/services/duo-order-service";
import {
  claimDuoSlotOnChain,
  lockDuoDepositOnChain,
  releaseDuoSlotOnChain,
} from "@/lib/chain/duo-chain";
import type { DuoOrder } from "@/lib/admin/admin-types";
import { useAutoToast } from "@/app/components/use-auto-toast";
import {
  type ChainOrder,
  claimOrderOnChain,
  cancelOrderOnChain,
  fetchChainOrders,
  fetchChainOrderById,
  getCurrentAddress,
  isChainOrdersEnabled,
  isVisualTestMode,
  lockDepositOnChain,
  markCompletedOnChain,
  getDefaultCompanionAddress,
  signAuthIntent,
} from "@/lib/chain/qy-chain";
import { useBackoffPoll } from "@/app/components/use-backoff-poll";
import { useOrderEvents } from "@/app/components/use-order-events";
import { useGuardianStatus } from "@/app/components/guardian-role";
import { GAME_PROFILE_KEY } from "@/lib/shared/constants";
import { getLocalChainStatus, mergeChainStatus } from "@/lib/chain/chain-status";
import { extractErrorMessage, formatErrorMessage } from "@/lib/shared/error-utils";

type GameProfile = {
  gameName: string;
  gameId: string;
  updatedAt: number;
  userAddress?: string;
};
type StoredProfiles = Record<string, GameProfile>;

function loadGameProfile(address: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GAME_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfiles;
    return parsed[address] || parsed.local || null;
  } catch {
    return null;
  }
}

export function useShowcaseState() {
  const router = useRouter();
  const { state: guardianState, isGuardian } = useGuardianStatus();
  const canAccessShowcase = isGuardian;
  const { refresh: refreshMantou } = useMantouBalance();

  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [chainOrders, setChainOrders] = useState<ChainOrder[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainToast, setChainToast] = useAutoToast(3000);
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
  const [duoOrders, setDuoOrders] = useState<DuoOrder[]>([]);
  const [duoPublicCursor, setDuoPublicCursor] = useState<string | null>(null);
  const [duoLoading, setDuoLoading] = useState(false);
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

  // --- Data fetching ---

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

  const refreshDuoOrders = useCallback(
    async (force = false) => {
      void force;
      if (!canAccessShowcase) return;
      setDuoLoading(true);
      try {
        const result = await fetchDuoOrders({ public: true });
        const items: DuoOrder[] = result?.items ?? result?.orders ?? [];
        setDuoOrders(items);
        setDuoPublicCursor(result?.nextCursor || null);
      } catch {
        // silent — duo orders are supplementary
      } finally {
        setDuoLoading(false);
      }
    },
    [canAccessShowcase]
  );

  const loadMoreDuoOrders = useCallback(async () => {
    if (!canAccessShowcase || !duoPublicCursor || duoLoading) return;
    setDuoLoading(true);
    try {
      const result = await fetchDuoOrders({ public: true, cursor: duoPublicCursor });
      const items: DuoOrder[] = result?.items ?? result?.orders ?? [];
      setDuoOrders((prev) => [...prev, ...items]);
      setDuoPublicCursor(result?.nextCursor || null);
    } finally {
      setDuoLoading(false);
    }
  }, [canAccessShowcase, duoPublicCursor, duoLoading]);

  const claimDuoSlot = async (orderId: string) => {
    const address = getCurrentAddress();
    if (!address) {
      showToast("请先登录");
      return;
    }
    // Chain claim + lock deposit
    if (isChainOrdersEnabled()) {
      const ok = await runChainAction(
        `duo-claim-${orderId}`,
        () => claimDuoSlotOnChain(orderId),
        "链上认领成功"
      );
      if (!ok) return;
      // Lock deposit after claiming
      await runChainAction(
        `duo-deposit-${orderId}`,
        () => lockDuoDepositOnChain(orderId),
        "押金已锁定"
      );
    }
    // Server-side claim
    try {
      await claimDuoSlotApi(orderId, address);
      showToast("认领成功");
      await refreshDuoOrders(true);
    } catch (e) {
      showToast(formatErrorMessage(e, "认领失败"));
    }
  };

  const releaseDuoSlot = async (orderId: string) => {
    const address = getCurrentAddress();
    if (!address) {
      showToast("请先登录");
      return;
    }
    openConfirm({
      title: "释放槽位",
      description: "确定要释放此槽位吗？如已缴押金将自动退还。",
      confirmLabel: "确认释放",
      action: async () => {
        let chainDigest: string | undefined;
        // Chain release
        if (isChainOrdersEnabled()) {
          try {
            setChainAction(`duo-release-${orderId}`);
            const result = await releaseDuoSlotOnChain(orderId);
            chainDigest = result?.digest;
            showToast(
              chainDigest ? `链上释放成功（tx: ${chainDigest.slice(0, 8)}…）` : "链上释放成功"
            );
          } catch (e) {
            showToast(formatErrorMessage(e, "链上释放失败"));
            return;
          } finally {
            setChainAction(null);
          }
        }
        // Server-side release
        try {
          await releaseDuoSlotApi(orderId, address, chainDigest);
          showToast("槽位已释放");
          await refreshDuoOrders(true);
        } catch (e) {
          showToast(formatErrorMessage(e, "释放失败"));
        }
      },
    });
  };

  const loadChain = useCallback(async () => {
    if (!canAccessShowcase) return;
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
      setChainError(formatErrorMessage(e, t("showcase.001")));
    } finally {
      if (!visualTest) setChainLoading(false);
    }
  }, [canAccessShowcase]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshOrders(true), refreshMyOrders(true), refreshDuoOrders(true)]);
    await loadChain();
  }, [loadChain, refreshMyOrders, refreshOrders, refreshDuoOrders]);

  // --- Effects ---

  useEffect(() => {
    if (!canAccessShowcase) return;
    refreshOrders();
  }, [canAccessShowcase, refreshOrders]);

  useEffect(() => {
    if (!canAccessShowcase) return;
    refreshMyOrders();
  }, [canAccessShowcase, refreshMyOrders]);

  useEffect(() => {
    if (!canAccessShowcase) return;
    refreshDuoOrders();
  }, [canAccessShowcase, refreshDuoOrders]);

  // SSE: listen for order events targeting this companion's address
  const companionAddr = chainAddress || getCurrentAddress() || "";
  const { connected: sseConnected } = useOrderEvents({
    address: companionAddr,
    enabled: canAccessShowcase && Boolean(companionAddr),
    onEvent: () => {
      refreshOrders(true);
      refreshMyOrders(true);
      refreshDuoOrders(true);
      refreshMantou({ force: true });
    },
  });

  useBackoffPoll({
    enabled: canAccessShowcase && !sseConnected,
    baseMs: 20_000,
    maxMs: 120_000,
    onPoll: async () => {
      const [okPublic, okMine] = await Promise.all([refreshOrders(true), refreshMyOrders(true)]);
      return okPublic && okMine;
    },
  });

  useEffect(() => {
    if (guardianState === "checking") return;
    if (!canAccessShowcase) router.replace("/home");
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
        if (first && first.isIntersecting) loadMoreOrders();
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [publicCursor, loadMoreOrders]);

  useEffect(() => {
    if (!isChainOrdersEnabled()) return;
    loadChain();
  }, [loadChain]);

  // --- Chain actions ---

  const showToast = useCallback(
    (msg: string, duration?: number) => {
      setChainToast(msg, duration);
    },
    [setChainToast]
  );

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
      showToast(formatErrorMessage(error, t("showcase.002")));
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
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
      setChainToast(formatErrorMessage(e, t("showcase.014")));
      return false;
    } finally {
      setChainAction(null);
    }
  };

  const fetchOrSyncChainOrder = async (orderId: string, digest?: string) => {
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
    } catch {
      // sync may fail (e.g. 403 when companion views another user's order)
      // Fallback: query chain directly without server permission check
      const direct = await fetchChainOrderById(orderId);
      if (direct) return direct;
    }
    throw new Error("链上订单未找到，可能索引延迟较大，请稍后重试");
  };

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
          showToast(formatErrorMessage(error, t("showcase.013")));
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
    [orderMetaLoading, showToast]
  );

  const orderMetaById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const order of orders) {
      if (order.meta && typeof order.meta === "object") {
        map.set(order.id, order.meta as Record<string, unknown>);
      }
    }
    Object.entries(orderMetaOverrides).forEach(([orderId, meta]) => {
      if (meta && typeof meta === "object") map.set(orderId, meta);
    });
    return map;
  }, [orders, orderMetaOverrides]);

  const accept = async (id: string) => {
    const address = getCurrentAddress();
    if (!address) {
      showToast(t("auth.login_before_accept"));
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
          showToast(formatErrorMessage(e, t("showcase.004")));
          return;
        }
      }
      if (!chainOrder) {
        showToast(t("chain.order_not_found"));
        return;
      }
      const effectiveStatus = resolveChainStatus(chainOrder);
      if (effectiveStatus === 0) {
        showToast(t("order.no_escrow_fee"));
        return;
      }
      if (effectiveStatus >= 2) {
        showToast(t("order.deposit_locked_taken"));
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
      meta: { companionProfile: profilePayload },
    });
    await refreshOrders(true);
    await refreshMyOrders(true);
    setPendingScrollToAccepted(true);
    showToast(t("order.accepted_moved"));
  };

  const markCompanionServiceEnded = async (orderId: string, isChain: boolean) => {
    const address = getCurrentAddress();
    if (!address) {
      showToast(t("auth.login_before_end"));
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
        setChainToast(t("showcase.016"));
        return;
      }
      // Chain order: best-effort push status to 3 (completed) via admin API
      try {
        const body = JSON.stringify({ orderId, address });
        const auth = await signAuthIntent(`chain:mark-completed:${orderId}`, body);
        const res = await fetch("/api/chain/mark-completed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-auth-address": auth.address,
            "x-auth-signature": auth.signature,
            "x-auth-timestamp": String(auth.timestamp),
            "x-auth-nonce": auth.nonce,
            "x-auth-body-sha256": auth.bodyHash,
          },
          body,
        });
        if (res.ok) {
          setChainToast("服务已结束，订单已进入结算期");
          await loadChain();
        } else {
          setChainToast("服务已结束，链上状态将由系统自动推进");
        }
      } catch {
        setChainToast("服务已结束，链上状态将由系统自动推进");
      }
    } catch (error) {
      setChainToast(formatErrorMessage(error, t("showcase.017")));
    }
  };

  const cancel = async (id: string) => {
    const hasChain = chainOrders.some((order) => order.orderId === id);
    const isChainOrder = isChainOrdersEnabled() && hasChain;
    if (isChainOrder) {
      const chainOrder = chainOrders.find((order) => order.orderId === id) || null;
      const effectiveStatus = chainOrder ? resolveChainStatus(chainOrder) : undefined;
      if (typeof effectiveStatus === "number" && effectiveStatus >= 2) {
        showToast(t("order.deposit_locked_no_cancel"));
        return;
      }
      await runChainAction(`cancel-${id}`, () => cancelOrderOnChain(id), t("ui.showcase.657"), id);
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
      showToast(t("clipboard.game_id_copied"));
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
        showToast(t("clipboard.game_id_copied"));
        setCopiedOrderId(orderId);
      } catch {
        showToast(t("clipboard.copy_failed_manual"));
      } finally {
        document.body.removeChild(input);
      }
    } finally {
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

  const confirmDepositAccept = async (orderId: string, depositLabel?: string) => {
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

  // --- Derived data ---

  const disputeOrderId = disputeOpen?.orderId || "";
  const disputeOrder = useMemo(
    () => chainOrders.find((o) => o.orderId === disputeOrderId) || null,
    [chainOrders, disputeOrderId]
  );
  const disputeDeadline = disputeOrder ? resolveDisputeDeadline(disputeOrder) : 0;

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

  return {
    // State
    guardianState,
    canAccessShowcase,
    orders,
    chainOrders,
    chainLoading,
    chainError,
    chainToast,
    chainAction,
    chainAddress,
    chainUpdatedAt,
    confirmAction,
    confirmBusy,
    disputeOpen,
    debugOpen,
    copiedOrderId,
    publicCursor,
    publicLoading,
    myOrders,
    myOrdersLoading,
    myAcceptedOrders,
    orderMetaById,
    orderMetaLoading,
    showOrderSourceWarning,
    visibleChainOrders,
    visibleOrders,
    duoOrders,
    duoPublicCursor,
    duoLoading,
    disputeOrder,
    disputeDeadline,
    // Refs
    loadMoreRef,
    acceptedRef,
    // Setters
    setDisputeOpen,
    setDebugOpen,
    setChainToast,
    setPendingScrollToAccepted,
    setConfirmAction,
    // Actions
    refreshAll,
    refreshOrders,
    loadMoreOrders,
    loadChain,
    accept,
    cancel,
    complete,
    clearAll,
    claimDuoSlot,
    releaseDuoSlot,
    refreshDuoOrders,
    loadMoreDuoOrders,
    openConfirm,
    runConfirmAction,
    runChainAction,
    confirmDepositAccept,
    confirmMarkCompleted,
    confirmEndService,
    markCompanionServiceEnded,
    hydrateOrderMeta,
    copyGameProfile,
    resolveChainStatus,
    resolveDisputeDeadline,
    showToast,
  };
}
