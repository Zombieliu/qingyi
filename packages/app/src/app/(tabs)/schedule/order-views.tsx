"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { LocalOrder } from "@/lib/services/order-store";
import type { ChainOrder } from "@/lib/chain/qy-chain";
import { createDisputeTicket } from "@/lib/services/dispute-ticket-client";
import { fetchChainOrderById } from "@/lib/chain/qy-chain";
import type { Mode } from "./schedule-data";
import { t } from "@/lib/i18n/t";
import { StateBlock } from "@/app/components/state-block";

const KOOK_INVITE_URL = process.env.NEXT_PUBLIC_KOOK_INVITE_URL || "";

type CompanionProfile = { gameName?: string; gameId?: string } | null;

/** Shared props for all order mode views */
export type OrderViewProps = {
  currentOrder: LocalOrder;
  chainStatusHint: string | null;
  toast: string | null;
  cancelOrder: () => void;
  renderActionLabel: (key: string, label: string) => string | React.ReactNode;
};

function CompanionCard({
  currentOrder,
  companionProfile,
  statusLabel,
  statusSub,
}: {
  currentOrder: LocalOrder;
  companionProfile: CompanionProfile;
  statusLabel: string;
  statusSub?: string;
}) {
  const hasProfile = Boolean(companionProfile?.gameName || companionProfile?.gameId);
  return (
    <div className="flex items-center gap-3">
      <div className="ride-driver-avatar" />
      <div>
        <div className="text-sm text-amber-600 font-semibold">{statusLabel}</div>
        {hasProfile ? (
          <>
            <div className="text-lg font-bold text-gray-900">{t("ui.order-views.031")}</div>
            <div className="text-xs text-gray-500">
              游戏名 {companionProfile?.gameName || "-"} · ID {companionProfile?.gameId || "-"}
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-bold text-gray-900">{currentOrder.driver?.name}</div>
            <div className="text-xs text-gray-500">{currentOrder.driver?.car}</div>
          </>
        )}
      </div>
      <div className="ml-auto text-right">
        {hasProfile ? (
          <>
            <div className="text-emerald-600 font-semibold text-sm">{statusLabel}</div>
            {statusSub && <div className="text-xs text-gray-500">{statusSub}</div>}
          </>
        ) : (
          <>
            <div className="text-emerald-600 font-semibold text-sm">{currentOrder.driver?.eta}</div>
            {currentOrder.driver?.price && (
              <div className="text-xs text-gray-500">一口价 {currentOrder.driver.price} 钻石</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getCompanionProfile(order: LocalOrder): CompanionProfile {
  return (order.meta?.companionProfile || null) as CompanionProfile;
}

// ─── AwaitUserPay ───────────────────────────────────────────

export type AwaitUserPayProps = OrderViewProps & {
  playerDue: number;
  patchOrder: (id: string, data: Record<string, unknown>) => Promise<void>;
  refreshOrders: (addr?: string, force?: boolean) => Promise<boolean>;
  setMode: (mode: Mode) => void;
  getCurrentAddress: () => string | undefined;
};

export function AwaitUserPayView({
  currentOrder,
  chainStatusHint,
  toast,
  cancelOrder,
  playerDue,
  patchOrder,
  refreshOrders,
  setMode,
  getCurrentAddress,
}: AwaitUserPayProps) {
  const companionProfile = getCompanionProfile(currentOrder);
  const paymentMode = (currentOrder.meta as { paymentMode?: string } | undefined)?.paymentMode;
  const isEscrow = paymentMode === "diamond_escrow";
  const [entering, setEntering] = useState(false);

  return (
    <div className="ride-shell">
      <div className="ride-tip" style={{ marginTop: 0 }}>
        陪练已支付押金，平台将使用钻石托管陪练费用
      </div>
      <div className="ride-driver-card dl-card">
        <CompanionCard
          currentOrder={currentOrder}
          companionProfile={companionProfile}
          statusLabel={isEscrow ? t("tabs.schedule.order_views.i103") : t("schedule.005")}
          statusSub={t("ui.order-views.032")}
        />
        <div className="ride-driver-actions">
          <button className="dl-tab-btn" onClick={cancelOrder}>
            取消订单
          </button>
          <button
            className="dl-tab-btn accent"
            onClick={() => {
              if (KOOK_INVITE_URL) window.open(KOOK_INVITE_URL, "_blank");
            }}
          >
            联系客服
          </button>
        </div>
        {chainStatusHint && (
          <div className="text-xs text-gray-500 mt-2 text-right">{chainStatusHint}</div>
        )}
        <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
      </div>

      <div className="ride-pay-box">
        <div className="ride-pay-head">
          <div>
            <div className="ride-pay-title">{t("ui.order-views.034")}</div>
            <div className="ride-pay-sub">{t("ui.order-views.035")}</div>
          </div>
          <div className="ride-pay-amount">¥{playerDue.toFixed(2)}</div>
        </div>
        <div className="ride-pay-actions">
          <button className="dl-tab-btn" onClick={cancelOrder}>
            取消订单
          </button>
          <button
            className="dl-tab-btn primary"
            disabled={entering}
            onClick={async () => {
              setEntering(true);
              try {
                await patchOrder(currentOrder.id, {
                  playerPaid: true,
                  status: t("ui.order-views.701"),
                  userAddress: getCurrentAddress(),
                });
                await refreshOrders();
                setMode("enroute");
              } finally {
                setEntering(false);
              }
            }}
          >
            {entering ? (
              <>
                <Loader2 size={14} className="spin" /> 处理中...
              </>
            ) : (
              "进入服务"
            )}
          </button>
        </div>
      </div>
      {toast && <div className="ride-toast">{toast}</div>}
    </div>
  );
}

// ─── Enroute ────────────────────────────────────────────────

export type EnrouteViewProps = OrderViewProps & {
  chainAction: string | null;
  chainOrders: ChainOrder[];
  localChainStatus: number | undefined;
  setToast: (msg: string) => void;
  patchOrder: (id: string, data: Record<string, unknown>) => Promise<void>;
  refreshOrders: (addr?: string, force?: boolean) => Promise<boolean>;
  setMode: (mode: Mode) => void;
  getCurrentAddress: () => string | undefined;
  runChainAction: (
    key: string,
    fn: () => Promise<{ digest: string }>,
    successMsg: string,
    orderId?: string
  ) => Promise<boolean>;
  fetchOrSyncChainOrder: (orderId: string) => Promise<ChainOrder | null>;
  mergeChainStatus: (local: number | undefined, remote: number | undefined) => number | undefined;
  classifyChainError: (error: unknown) => { message: string };
  isChainLocalOrder: (order: LocalOrder) => boolean;
  statusLabel: (status: number) => string;
  markCompletedOnChain: (orderId: string) => Promise<{ digest: string }>;
};

export function EnrouteView({
  currentOrder,
  chainStatusHint,
  toast,
  cancelOrder,
  renderActionLabel,
  chainAction,
  chainOrders,
  localChainStatus,
  setToast,
  patchOrder,
  refreshOrders,
  setMode,
  getCurrentAddress,
  runChainAction,
  fetchOrSyncChainOrder,
  mergeChainStatus,
  classifyChainError,
  isChainLocalOrder,
  statusLabel,
  markCompletedOnChain,
}: EnrouteViewProps) {
  const companionProfile = getCompanionProfile(currentOrder);
  const companionEndedAt = (currentOrder.meta as { companionEndedAt?: number | string } | undefined)
    ?.companionEndedAt;
  const canConfirmCompletion = Boolean(companionEndedAt);
  const [completing, setCompleting] = useState(false);

  return (
    <div className="ride-shell">
      <div className="ride-map-large">
        <StateBlock
          tone="loading"
          size="compact"
          align="center"
          title={t("schedule.006")}
          description={t("schedule.007")}
        />
      </div>
      {canConfirmCompletion && (
        <div className="ride-tip" style={{ marginTop: 0 }}>
          陪练已结束服务，系统正在处理中。如长时间未更新，请手动确认完成。
          {chainStatusHint && <div className="mt-1 text-xs text-gray-500">{chainStatusHint}</div>}
        </div>
      )}
      <div className="ride-driver-card dl-card">
        <CompanionCard
          currentOrder={currentOrder}
          companionProfile={companionProfile}
          statusLabel={t("ui.order-views.036")}
          statusSub={t("ui.order-views.037")}
        />
        <div className="ride-driver-actions">
          <button
            className="dl-tab-btn"
            disabled={chainAction === `cancel-${currentOrder.id}`}
            onClick={cancelOrder}
          >
            {renderActionLabel(`cancel-${currentOrder.id}`, t("schedule.008"))}
          </button>
          <button className="dl-tab-btn">{t("ui.order-views.038")}</button>
          {canConfirmCompletion && (
            <button
              className="dl-tab-btn"
              disabled={completing || chainAction === `complete-${currentOrder.id}`}
              onClick={async () => {
                const isChainOrder = isChainLocalOrder(currentOrder);
                if (isChainOrder) {
                  let chainOrder = chainOrders.find((o) => o.orderId === currentOrder.id) || null;
                  if (!chainOrder) {
                    try {
                      chainOrder = await fetchOrSyncChainOrder(currentOrder.id);
                    } catch (error) {
                      setToast(classifyChainError(error).message);
                      return;
                    }
                  }
                  const effectiveStatus = mergeChainStatus(localChainStatus, chainOrder?.status);
                  if (effectiveStatus === undefined) {
                    setToast(t("chain.order_not_synced"));
                    return;
                  }
                  if (effectiveStatus !== 2) {
                    setToast(
                      `当前链上状态：${statusLabel(effectiveStatus)}，需t("tabs.schedule.order_views.i104")后才能确认完成`
                    );
                    return;
                  }
                  await runChainAction(
                    `complete-${currentOrder.id}`,
                    () => markCompletedOnChain(currentOrder.id),
                    t("ui.order-views.587"),
                    currentOrder.id
                  );
                  return;
                }
                setCompleting(true);
                try {
                  await patchOrder(currentOrder.id, {
                    status: t("tabs.schedule.order_views.i045"),
                    userAddress: getCurrentAddress(),
                  });
                  await refreshOrders();
                  setMode("pending-settlement");
                } finally {
                  setCompleting(false);
                }
              }}
            >
              {completing ? (
                <>
                  <Loader2 size={14} className="spin" /> 处理中...
                </>
              ) : (
                renderActionLabel(`complete-${currentOrder.id}`, t("schedule.009"))
              )}
            </button>
          )}
          <button
            className="dl-tab-btn accent"
            onClick={() => {
              if (KOOK_INVITE_URL) window.open(KOOK_INVITE_URL, "_blank");
            }}
          >
            联系客服
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
      </div>
      {toast && <div className="ride-toast">{toast}</div>}
    </div>
  );
}

// ─── PendingSettlement ──────────────────────────────────────

export type PendingSettlementProps = OrderViewProps & {
  chainAction: string | null;
  chainOrders: ChainOrder[];
  localChainStatus: number | undefined;
  setToast: (msg: string) => void;
  patchOrder: (id: string, data: Record<string, unknown>) => Promise<void>;
  refreshOrders: (addr?: string, force?: boolean) => Promise<boolean>;
  setMode: (mode: Mode) => void;
  getCurrentAddress: () => string | undefined;
  isChainLocalOrder: (order: LocalOrder) => boolean;
  runChainAction: (
    key: string,
    fn: () => Promise<{ digest: string }>,
    successMsg: string,
    orderId?: string
  ) => Promise<boolean>;
  mergeChainStatus: (local: number | undefined, remote: number | undefined) => number | undefined;
  openPrompt: (opts: {
    title: string;
    description: string;
    confirmLabel: string;
    action: (value: string) => Promise<void>;
  }) => void;
  openConfirm: (opts: {
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<void>;
  }) => void;
  raiseDisputeOnChain: (orderId: string, evidence: string) => Promise<{ digest: string }>;
  finalizeNoDisputeOnChain: (orderId: string) => Promise<{ digest: string }>;
};

export function PendingSettlementView({
  currentOrder,
  toast,
  renderActionLabel,
  chainAction,
  chainOrders,
  localChainStatus,
  setToast,
  patchOrder,
  refreshOrders,
  setMode,
  getCurrentAddress,
  isChainLocalOrder,
  runChainAction,
  mergeChainStatus,
  openPrompt,
  openConfirm,
  raiseDisputeOnChain,
  finalizeNoDisputeOnChain,
}: PendingSettlementProps) {
  const companionProfile = getCompanionProfile(currentOrder);
  const isChainOrder = isChainLocalOrder(currentOrder);
  const chainOrderFromList = chainOrders.find((o) => o.orderId === currentOrder.id) || null;

  // Long-term fix: if chain order not found in event scan (truncation),
  // fetch it precisely by orderId via devInspect
  const [fallbackChainOrder, setFallbackChainOrder] = useState<ChainOrder | null>(null);
  useEffect(() => {
    if (isChainOrder && !chainOrderFromList) {
      fetchChainOrderById(currentOrder.id).then((o) => {
        if (o) setFallbackChainOrder(o);
      });
    }
  }, [isChainOrder, chainOrderFromList, currentOrder.id]);

  const chainOrder = chainOrderFromList || fallbackChainOrder;
  const effectiveStatus = mergeChainStatus(localChainStatus, chainOrder?.status);
  // Short-term fix: if we're already in PendingSettlementView (backend says "待结算")
  // but chainOrder wasn't found in event scan (truncation), trust the backend stage.
  const canSettle = isChainOrder
    ? effectiveStatus === 3 || (!chainOrder && effectiveStatus === undefined)
    : true;
  const [settling, setSettling] = useState(false);
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
  const isDisputing = effectiveStatus === 4;
  const canDispute = Boolean(canSettle && inDisputeWindow && !isDisputing);
  const canFinalize = Boolean(canSettle && !isDisputing);

  if (isDisputing) {
    return (
      <div className="ride-shell">
        <div className="ride-map-large">
          <StateBlock
            tone="warning"
            size="compact"
            align="center"
            title="争议处理中"
            description="您的申诉已提交，平台正在审核中，请耐心等待处理结果"
          />
        </div>
        <div className="ride-driver-card dl-card">
          <CompanionCard
            currentOrder={currentOrder}
            companionProfile={companionProfile}
            statusLabel="争议中"
          />
          <div className="ml-auto text-right">
            <div className="text-amber-600 font-semibold text-sm">申诉进行中</div>
            <div className="text-xs text-gray-500">等待平台处理</div>
          </div>
          <div className="ride-driver-actions">
            <a href="/me/support" className="dl-tab-btn">
              查看工单
            </a>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
          {toast && <div className="mt-2 text-xs text-emerald-600">{toast}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="ride-shell">
      <div className="ride-map-large">
        <StateBlock
          tone="loading"
          size="compact"
          align="center"
          title={t("schedule.010")}
          description={t("schedule.011")}
        />
      </div>
      <div className="ride-driver-card dl-card">
        <CompanionCard
          currentOrder={currentOrder}
          companionProfile={companionProfile}
          statusLabel={t("ui.order-views.040")}
        />
        <div className="ml-auto text-right">
          <div className="text-emerald-600 font-semibold text-sm">{t("ui.order-views.041")}</div>
          <div className="text-xs text-gray-500">
            {!disputeDeadline
              ? "争议截止时间同步中…"
              : inDisputeWindow
                ? t("tabs.schedule.order_views.i105")
                : t("schedule.012")}
          </div>
        </div>
        <div className="ride-driver-actions">
          <button
            className="dl-tab-btn"
            disabled={chainAction === `dispute-${currentOrder.id}`}
            onClick={() => {
              if (!canDispute) {
                if (!disputeDeadline) {
                  setToast(t("chain.dispute_deadline_not_synced"));
                } else if (!inDisputeWindow) {
                  setToast(t("dispute.period_ended"));
                } else {
                  setToast(t("dispute.invalid_status"));
                }
                return;
              }
              openPrompt({
                title: t("tabs.schedule.order_views.i046"),
                description: t("tabs.schedule.order_views.i047"),
                confirmLabel: t("tabs.schedule.order_views.i048"),
                action: async (value) => {
                  const ok = await runChainAction(
                    `dispute-${currentOrder.id}`,
                    () => raiseDisputeOnChain(currentOrder.id, value),
                    t("ui.order-views.578"),
                    currentOrder.id
                  );
                  if (ok) {
                    createDisputeTicket({
                      orderId: currentOrder.id,
                      evidence: value,
                      userAddress: getCurrentAddress(),
                      orderItem: currentOrder.item,
                    });
                  }
                },
              });
            }}
          >
            {renderActionLabel(`dispute-${currentOrder.id}`, t("schedule.013"))}
          </button>
          <button
            className="dl-tab-btn primary"
            disabled={settling || chainAction === `finalize-${currentOrder.id}`}
            onClick={async () => {
              if (!canFinalize) {
                setToast(t("dispute.cannot_settle"));
                return;
              }
              // 非链上订单：直接 patchOrder 完成结算
              if (!isChainOrder) {
                setSettling(true);
                try {
                  await patchOrder(currentOrder.id, {
                    status: "已完成",
                    userAddress: getCurrentAddress(),
                  });
                  await refreshOrders();
                  setMode("select");
                } finally {
                  setSettling(false);
                }
                return;
              }
              if (inDisputeWindow) {
                const deadlineText = disputeDeadline
                  ? new Date(disputeDeadline).toLocaleString()
                  : "";
                openConfirm({
                  title: t("tabs.schedule.order_views.i049"),
                  description: deadlineText
                    ? `争议截止：${deadlineText}`
                    : t("tabs.schedule.order_views.i106"),
                  confirmLabel: t("tabs.schedule.order_views.i050"),
                  action: async () => {
                    await runChainAction(
                      `finalize-${currentOrder.id}`,
                      () => finalizeNoDisputeOnChain(currentOrder.id),
                      t("ui.order-views.658"),
                      currentOrder.id
                    );
                  },
                });
                return;
              }
              runChainAction(
                `finalize-${currentOrder.id}`,
                () => finalizeNoDisputeOnChain(currentOrder.id),
                t("ui.order-views.659"),
                currentOrder.id
              );
            }}
          >
            {settling ? (
              <>
                <Loader2 size={14} className="spin" /> 结算中...
              </>
            ) : (
              renderActionLabel(`finalize-${currentOrder.id}`, t("schedule.014"))
            )}
          </button>
          <button
            className="dl-tab-btn accent"
            onClick={() => {
              if (KOOK_INVITE_URL) window.open(KOOK_INVITE_URL, "_blank");
            }}
          >
            联系客服
          </button>
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
