"use client";
import { t } from "@/lib/i18n/t";
import { Activity, Loader2 } from "lucide-react";
import { isChainOrdersEnabled, raiseDisputeOnChain } from "@/lib/chain/qy-chain";
import { StateBlock } from "@/app/components/state-block";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { AcceptedOrderCard } from "./accepted-order-card";
import { PublicOrderCard } from "./public-order-card";
import { DisputeModal } from "./dispute-modal";
import { DebugModal } from "./debug-modal";
import { ChainOrdersSection } from "./chain-orders-section";
import { useShowcaseState } from "./use-showcase-state";

export default function Showcase() {
  const {
    guardianState,
    canAccessShowcase,
    chainLoading,
    chainError,
    chainToast,
    chainAction,
    chainAddress,
    chainUpdatedAt,
    showOrderSourceWarning,
    visibleChainOrders,
    visibleOrders,
    orderMetaById,
    orderMetaLoading,
    copiedOrderId,
    myAcceptedOrders,
    myOrdersLoading,
    confirmAction,
    confirmBusy,
    disputeOpen,
    disputeOrder,
    disputeDeadline,
    debugOpen,
    publicCursor,
    publicLoading,
    // Refs
    acceptedRef,
    loadMoreRef,
    // Actions
    refreshAll,
    refreshOrders,
    loadMoreOrders,
    clearAll,
    cancel,
    complete,
    confirmDepositAccept,
    openConfirm,
    runConfirmAction,
    runChainAction,
    confirmEndService,
    confirmMarkCompleted,
    markCompanionServiceEnded,
    hydrateOrderMeta,
    copyGameProfile,
    resolveChainStatus,
    resolveDisputeDeadline,
    setDisputeOpen,
    setDebugOpen,
    setChainToast,
    setConfirmAction,
    setPendingScrollToAccepted,
  } = useShowcaseState();

  const renderActionLabel = (key: string, label: string) => {
    if (chainAction !== key) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3.5 w-3.5 spin" />
        处理中
      </span>
    );
  };

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

      <ChainOrdersSection
        chainAddress={chainAddress}
        chainUpdatedAt={chainUpdatedAt}
        chainLoading={chainLoading}
        chainError={chainError}
        chainToast={chainToast}
        chainAction={chainAction}
        showOrderSourceWarning={showOrderSourceWarning}
        visibleChainOrders={visibleChainOrders}
        orderMetaById={orderMetaById}
        orderMetaLoading={orderMetaLoading}
        copiedOrderId={copiedOrderId}
        resolveChainStatus={resolveChainStatus}
        resolveDisputeDeadline={resolveDisputeDeadline}
        refreshAll={refreshAll}
        refreshMyOrders={async (force) => {
          await refreshOrders(force);
          return true;
        }}
        openConfirm={openConfirm}
        runChainAction={runChainAction}
        confirmEndService={confirmEndService}
        confirmMarkCompleted={confirmMarkCompleted}
        hydrateOrderMeta={hydrateOrderMeta}
        copyGameProfile={copyGameProfile}
        renderActionLabel={renderActionLabel}
        setDisputeOpen={setDisputeOpen}
        setChainToast={setChainToast}
        setPendingScrollToAccepted={setPendingScrollToAccepted}
      />

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

      <div className="text-xs text-gray-500 mt-6">{t("ui.showcase.176")}</div>
    </div>
  );
}
