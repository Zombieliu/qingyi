"use client";
import { t } from "@/lib/i18n/t";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LocalOrder } from "@/lib/services/order-store";
import { createOrder, deleteOrder, patchOrder, syncChainOrder } from "@/lib/services/order-service";
import { trackEvent } from "@/lib/services/analytics";
import { DIAMOND_RATE } from "@/lib/shared/constants";
import { mergeChainStatus } from "@/lib/chain/chain-status";
import {
  cancelOrderOnChain,
  createChainOrderId,
  createOrderOnChain,
  fetchChainOrders,
  fetchChainOrderById,
  finalizeNoDisputeOnChain,
  getCurrentAddress,
  isChainOrdersEnabled,
  markCompletedOnChain,
  payServiceFeeOnChain,
  raiseDisputeOnChain,
} from "@/lib/chain/qy-chain";
import { ConfirmDialog, PromptDialog } from "@/app/components/confirm-dialog";
import { extractErrorMessage, formatErrorMessage } from "@/lib/shared/error-utils";
import { classifyChainError } from "@/lib/chain/chain-error";
import {
  sections,
  FIRST_ORDER_DISCOUNT,
  MATCH_RATE,
  markDiscountUsage,
  loadGameProfile,
  statusLabel,
} from "./schedule-data";
import { NotifyingView } from "./notifying-view";
import { AwaitUserPayView, EnrouteView, PendingSettlementView } from "./order-views";
import { ChainStatusPanel } from "./chain-status-panel";
import { FeeModal } from "./fee-modal";
import { DebugModal } from "./debug-modal";
import { ScheduleSelectView } from "./schedule-select-view";
import { useScheduleOrders } from "./use-schedule-orders";

export default function Schedule() {
  const schedule = useScheduleOrders();
  const {
    toast,
    setToast,
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
  } = schedule;

  const {
    chainOrders,
    setChainOrders,
    chainLoading,
    chainError,
    chainToast,
    setChainToast,
    chainAction,
    setChainAction,
    chainAddress,
    chainUpdatedAt,
    chainSyncRetries,
    setChainSyncRetries,
    chainSyncLastAttemptAt,
    setChainSyncLastAttemptAt,
    chainSyncing,
    setChainSyncing,
  } = chainState;

  const [checked, setChecked] = useState<Record<string, boolean>>(() => ({}));
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeChecked, setFeeChecked] = useState(false);
  const [locked, setLocked] = useState<{
    total: number;
    originalTotal: number;
    discount: number;
    service: number;
    player: number;
    items: string[];
  }>({ total: 0, originalTotal: 0, discount: 0, service: 0, player: 0, items: [] });
  const [calling, setCalling] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const redirectRef = useRef(false);
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
        } as import("@/lib/chain/qy-chain").ChainOrder;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      list = await fetchChainOrders();
      setChainOrders(list);
      found = list.find((order) => order.orderId === orderId) || null;
      if (found) return found;
    } catch {
      // sync may fail (e.g. 403 permission) — fallback to direct chain query
      const direct = await fetchChainOrderById(orderId);
      if (direct) return direct;
    }
    const precise = await fetchChainOrderById(orderId);
    if (precise) return precise;
    throw new Error("链上订单未找到，可能索引延迟较大，请稍后重试");
  };

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
          ? item.price.includes(t("tabs.schedule.i109"))
            ? numeric / DIAMOND_RATE
            : numeric
          : NaN);
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
  const pickedDiamonds = Math.ceil(pickedPrice * DIAMOND_RATE);

  const requiredDiamonds = Math.ceil(locked.total * diamondRate);
  const hasEnoughDiamonds = Number(diamondBalance) >= requiredDiamonds;

  // ─── Actions ───

  const cancelOrder = async () => {
    if (!currentOrder) return;
    const isChain = isChainLocalOrder(currentOrder);
    if (isChain) {
      const effectiveStatus =
        chainCurrentOrder && chainCurrentOrder.orderId === currentOrder.id
          ? (chainCurrentStatus ?? chainCurrentOrder.status)
          : chainCurrentOrder?.status;
      if (typeof effectiveStatus === "number" && effectiveStatus >= 2) {
        setToast(t("order.deposit_locked_no_cancel"));
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
    }
  };

  useEffect(() => {
    if (feeOpen) {
      redirectRef.current = false;
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
      setToast(t("auth.login_for_diamond"));
      return;
    }
    if (!hasEnoughDiamonds && !redirectRef.current) {
      redirectRef.current = true;
      setToast(t("diamond.insufficient_redirecting"));
      setTimeout(() => {
        window.location.href = "/wallet";
      }, 1200);
    }
  }, [feeOpen, balanceLoading, balanceReady, hasEnoughDiamonds, setToast]);

  const submit = () => {
    if (pickedNames.length === 0) {
      setToast(t("form.select_service"));
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
      setToast(t("form.confirm_escrow_fee"));
      return;
    }
    if (!locked.items.length) {
      setToast(t("form.service_required"));
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
        status: selectedPlayer ? t("ui.showcase.168") : t("ui.schedule.596"),
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
        setToast(result.error || t("tabs.schedule.i112"));
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
      setCalling(false);
    }
  };

  // ─── Render ───

  // Dialogs must render in ALL modes (they use portal-like fixed positioning)
  const dialogs = (
    <>
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
    </>
  );

  if (mode === "await-user-pay" && currentOrder?.driver) {
    return (
      <>
        {dialogs}
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
      </>
    );
  }

  if (mode === "enroute" && currentOrder?.driver) {
    return (
      <>
        {dialogs}
        <EnrouteView
          currentOrder={currentOrder}
          chainStatusHint={chainStatusHint}
          toast={toast}
          cancelOrder={cancelOrder}
          renderActionLabel={renderActionLabel}
          chainAction={chainAction}
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
      </>
    );
  }

  if (mode === "pending-settlement" && currentOrder?.driver) {
    return (
      <>
        {dialogs}
        <PendingSettlementView
          currentOrder={currentOrder}
          chainStatusHint={chainStatusHint}
          toast={toast}
          cancelOrder={cancelOrder}
          renderActionLabel={renderActionLabel}
          chainAction={chainAction}
          chainOrders={chainOrders}
          localChainStatus={localChainStatus}
          setToast={setToast}
          patchOrder={patchOrder}
          refreshOrders={refreshOrders}
          setMode={setMode}
          getCurrentAddress={getCurrentAddress}
          isChainLocalOrder={isChainLocalOrder}
          runChainAction={runChainAction}
          mergeChainStatus={mergeChainStatus}
          openPrompt={openPrompt}
          openConfirm={openConfirm}
          raiseDisputeOnChain={raiseDisputeOnChain}
          finalizeNoDisputeOnChain={finalizeNoDisputeOnChain}
        />
      </>
    );
  }

  if (mode === "notifying" && currentOrder) {
    return (
      <>
        {dialogs}
        <NotifyingView currentOrder={currentOrder} escrowFeeDisplay={escrowFeeDisplay} />
      </>
    );
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

      {dialogs}

      <ScheduleSelectView
        checked={checked}
        active={active}
        infoOpen={infoOpen}
        toast={toast}
        pickedPrice={pickedPrice}
        pickedDiamonds={pickedDiamonds}
        firstOrderEligible={firstOrderEligible}
        players={players}
        playersLoading={playersLoading}
        playersError={playersError}
        selectedPlayerId={selectedPlayerId}
        prefillHint={prefillHint}
        onSectionRef={(key, el) => {
          sectionRefs.current[key] = el;
        }}
        onToggle={toggle}
        onSetActive={setActive}
        onSetInfoOpen={setInfoOpen}
        onSelectPlayer={(id) => {
          setSelectedPlayerId(id);
          setPrefillHint(null);
        }}
        onRefreshPlayers={loadPlayers}
        onSubmit={submit}
        onScrollToSection={(key) => {
          sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
    </div>
  );
}
