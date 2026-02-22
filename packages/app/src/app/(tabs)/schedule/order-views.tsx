"use client";

import type { LocalOrder } from "@/lib/services/order-store";
import type { ChainOrder } from "@/lib/chain/qy-chain";
import type { Mode } from "./schedule-data";
import { t } from "@/lib/i18n/i18n-client";
import { StateBlock } from "@/app/components/state-block";

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
            <div className="text-lg font-bold text-gray-900">陪玩游戏设置</div>
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

  return (
    <div className="ride-shell">
      <div className="ride-tip" style={{ marginTop: 0 }}>
        陪练已支付押金，平台将使用钻石托管陪练费用
      </div>
      <div className="ride-driver-card dl-card">
        <CompanionCard
          currentOrder={currentOrder}
          companionProfile={companionProfile}
          statusLabel={isEscrow ? "陪练费用已托管" : t("schedule.005")}
          statusSub="请确认游戏信息"
        />
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

// ─── Enroute ────────────────────────────────────────────────

export type EnrouteViewProps = OrderViewProps & {
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
          陪练已结束服务，请确认完成后进入结算/争议期
          {chainStatusHint && <div className="mt-1 text-xs text-gray-500">{chainStatusHint}</div>}
        </div>
      )}
      <div className="ride-driver-card dl-card">
        <CompanionCard
          currentOrder={currentOrder}
          companionProfile={companionProfile}
          statusLabel="服务已开始"
          statusSub="请保持在线"
        />
        <div className="ride-driver-actions">
          <button className="dl-tab-btn" onClick={cancelOrder}>
            {renderActionLabel(`cancel-${currentOrder.id}`, t("schedule.008"))}
          </button>
          <button className="dl-tab-btn">安全中心</button>
          {canConfirmCompletion && (
            <button
              className="dl-tab-btn"
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
                    setToast("chain.order_not_synced");
                    return;
                  }
                  if (effectiveStatus !== 2) {
                    setToast(
                      `当前链上状态：${statusLabel(effectiveStatus)}，需"押金已锁定"后才能确认完成`
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
              {renderActionLabel(`complete-${currentOrder.id}`, t("schedule.009"))}
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

// ─── PendingSettlement ──────────────────────────────────────

export type PendingSettlementProps = OrderViewProps & {
  chainOrders: ChainOrder[];
  localChainStatus: number | undefined;
  setToast: (msg: string) => void;
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
  chainOrders,
  localChainStatus,
  setToast,
  runChainAction,
  mergeChainStatus,
  openPrompt,
  openConfirm,
  raiseDisputeOnChain,
  finalizeNoDisputeOnChain,
}: PendingSettlementProps) {
  const companionProfile = getCompanionProfile(currentOrder);
  const chainOrder = chainOrders.find((o) => o.orderId === currentOrder.id) || null;
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
  // eslint-disable-next-line react-hooks/purity -- deadline check needs current time
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
          title={t("schedule.010")}
          description={t("schedule.011")}
        />
      </div>
      <div className="ride-driver-card dl-card">
        <CompanionCard
          currentOrder={currentOrder}
          companionProfile={companionProfile}
          statusLabel="服务已完成"
        />
        <div className="ml-auto text-right">
          <div className="text-emerald-600 font-semibold text-sm">待结算</div>
          <div className="text-xs text-gray-500">
            {inDisputeWindow ? "可发起争议" : t("schedule.012")}
          </div>
        </div>
        <div className="ride-driver-actions">
          <button
            className="dl-tab-btn"
            onClick={() => {
              if (!canDispute) {
                if (!disputeDeadline) {
                  setToast("chain.dispute_deadline_not_synced");
                } else if (!inDisputeWindow) {
                  setToast("dispute.period_ended");
                } else {
                  setToast("dispute.invalid_status");
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
            {renderActionLabel(`dispute-${currentOrder.id}`, t("schedule.013"))}
          </button>
          <button
            className="dl-tab-btn primary"
            onClick={() => {
              if (!canFinalize) {
                setToast("dispute.cannot_settle");
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
            {renderActionLabel(`finalize-${currentOrder.id}`, t("schedule.014"))}
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
