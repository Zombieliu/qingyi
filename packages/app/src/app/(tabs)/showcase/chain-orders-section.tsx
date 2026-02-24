"use client";
import { t } from "@/lib/i18n/t";
import {
  type ChainOrder,
  isChainOrdersEnabled,
  signAuthIntent,
  lockDepositOnChain,
  getCurrentAddress,
  payServiceFeeOnChain,
  cancelOrderOnChain,
  finalizeNoDisputeOnChain,
} from "@/lib/chain/qy-chain";
import { StateBlock } from "@/app/components/state-block";
import { ChainOrderCard } from "./chain-order-card";
import { formatErrorMessage } from "@/lib/shared/error-utils";
import { patchOrder } from "@/lib/services/order-service";

type Props = {
  chainAddress: string;
  chainUpdatedAt: number | null;
  chainLoading: boolean;
  chainError: string | null;
  chainToast: string | null;
  chainAction: string | null;
  showOrderSourceWarning: boolean;
  visibleChainOrders: ChainOrder[];
  orderMetaById: Map<string, Record<string, unknown>>;
  orderMetaLoading: Record<string, boolean>;
  copiedOrderId: string | null;
  resolveChainStatus: (order: ChainOrder) => number;
  resolveDisputeDeadline: (order: ChainOrder) => number;
  refreshAll: () => Promise<void>;
  refreshMyOrders: (force?: boolean) => Promise<boolean>;
  openConfirm: (payload: {
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<void>;
  }) => void;
  runChainAction: (
    key: string,
    action: () => Promise<{ digest: string }>,
    success: string,
    syncOrderId?: string
  ) => Promise<boolean>;
  confirmEndService: (orderId: string) => void;
  confirmMarkCompleted: (orderId: string) => void;
  hydrateOrderMeta: (orderId: string, options?: { toastOnError?: boolean }) => Promise<unknown>;
  copyGameProfile: (
    orderId: string,
    profile: { gameName?: string; gameId?: string }
  ) => Promise<void>;
  renderActionLabel: (key: string, label: string) => React.ReactNode;
  setDisputeOpen: (v: { orderId: string; evidence: string } | null) => void;
  setChainToast: (v: string | null) => void;
  setPendingScrollToAccepted: (v: boolean) => void;
};

export function ChainOrdersSection(props: Props) {
  const {
    chainAddress,
    chainUpdatedAt,
    chainLoading,
    chainError,
    chainToast,
    chainAction,
    showOrderSourceWarning,
    visibleChainOrders,
    orderMetaById,
    orderMetaLoading,
    copiedOrderId,
    resolveChainStatus,
    resolveDisputeDeadline,
    refreshAll,
    refreshMyOrders,
    openConfirm,
    runChainAction,
    confirmEndService,
    confirmMarkCompleted,
    hydrateOrderMeta,
    copyGameProfile,
    renderActionLabel,
    setDisputeOpen,
    setChainToast,
    setPendingScrollToAccepted,
  } = props;

  if (!isChainOrdersEnabled()) return null;

  const handleAcceptDeposit = (o: ChainOrder) => {
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
          const address = chainAddress || getCurrentAddress();
          if (address) {
            await patchOrder(o.orderId, {
              companionAddress: address,
              depositPaid: true,
              meta: { companionProfile: null },
            });
            await refreshMyOrders(true);
            setPendingScrollToAccepted(true);
          }
        } catch (error) {
          setChainToast(formatErrorMessage(error, t("showcase.033")));
        }
        await hydrateOrderMeta(o.orderId, { toastOnError: true });
        try {
          const address = chainAddress || getCurrentAddress();
          const creditBody = JSON.stringify({ orderId: o.orderId, address });
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
            if (!data?.duplicated) setChainToast(t("diamond.auto_converted"));
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
  };

  const handleFinalize = (
    o: ChainOrder,
    isUser: boolean,
    inDisputeWindow: boolean,
    deadline: number
  ) => {
    if (isUser && inDisputeWindow) {
      const hasDeadline = Number.isFinite(deadline) && deadline > 0;
      const deadlineText = hasDeadline && deadline ? new Date(deadline).toLocaleString() : "";
      openConfirm({
        title: t("tabs.showcase.i070"),
        description: deadlineText ? `争议截止：${deadlineText}` : t("tabs.showcase.i134"),
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
  };

  return (
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
                onAcceptDeposit={() => handleAcceptDeposit(o)}
                onEndService={() => confirmEndService(o.orderId)}
                onMarkCompleted={() => confirmMarkCompleted(o.orderId)}
                onPay={() => {
                  runChainAction(
                    `pay-${o.orderId}`,
                    () => payServiceFeeOnChain(o.orderId),
                    t("ui.showcase.614"),
                    o.orderId
                  );
                }}
                onCancel={() => {
                  runChainAction(
                    `cancel-${o.orderId}`,
                    () => cancelOrderOnChain(o.orderId),
                    t("ui.showcase.655"),
                    o.orderId
                  );
                }}
                onDispute={() => setDisputeOpen({ orderId: o.orderId, evidence: "" })}
                onFinalize={() => handleFinalize(o, isUser, inDisputeWindow, deadline)}
                onCopyGameProfile={(profile) => copyGameProfile(o.orderId, profile)}
                onHydrateMeta={() => hydrateOrderMeta(o.orderId, { toastOnError: true })}
                renderActionLabel={renderActionLabel}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
